import os
import json
import re
import time
import base64
import numpy as np
from datetime import datetime
from typing import Optional, List

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from openai import OpenAI

# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── OpenAI client ──────────────────────────────────────────────────────────────

def get_openai_client():
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")
    return OpenAI(api_key=api_key)

# ── AWS / DynamoDB ─────────────────────────────────────────────────────────────

AWS_REGION = os.environ.get("AWS_REGION", "ap-south-1")
TABLE_NAME = "studyflow-data"

dynamodb = boto3.resource(
    "dynamodb",
    region_name=AWS_REGION,
    aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
)
table = dynamodb.Table(TABLE_NAME)

# ── JWT Auth (stdlib only) ─────────────────────────────────────────────────────

COGNITO_USER_POOL_ID = "ap-south-1_5qo8gZ9cS"
COGNITO_ISSUER = f"https://cognito-idp.ap-south-1.amazonaws.com/{COGNITO_USER_POOL_ID}"

security = HTTPBearer()


def decode_jwt_payload(token: str) -> dict:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT format")
    payload_b64 = parts[1]
    payload_b64 += "=" * (4 - len(payload_b64) % 4)
    return json.loads(base64.urlsafe_b64decode(payload_b64).decode("utf-8"))


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    token = credentials.credentials
    try:
        payload = decode_jwt_payload(token)
        if COGNITO_ISSUER not in payload.get("iss", ""):
            raise HTTPException(status_code=401, detail="Invalid token issuer")
        if payload.get("exp", 0) < time.time():
            raise HTTPException(status_code=401, detail="Token expired")
        user_sub = payload.get("sub")
        if not user_sub:
            raise HTTPException(status_code=401, detail="Invalid token: missing sub")
        return {"sub": user_sub, "email": payload.get("email", "")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


# ── RAG Pipeline (OpenAI Embeddings + numpy cosine similarity) ─────────────────
#
# Analogy: Previously we had a forklift (FAISS + PyTorch + HuggingFace) to
# move semantic similarity search. Now we use a hand truck (numpy dot products)
# — same job, same results for our text sizes, 400MB lighter.
#
# How it works:
# 1. Split text into ~500-char chunks with overlap
# 2. Embed all chunks using OpenAI text-embedding-3-small (fast, cheap)
# 3. Embed the query the same way
# 4. Compute cosine similarity between query vector and all chunk vectors
# 5. Return top-k chunks by similarity score

def split_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """Split text into overlapping chunks."""
    chunks = []
    separators = ["\n\n", "\n", ". ", " "]

    # Try splitting by each separator in order of preference
    remaining = text
    while len(remaining) > chunk_size:
        split_pos = -1
        for sep in separators:
            pos = remaining.rfind(sep, 0, chunk_size)
            if pos > chunk_size // 2:  # Only use if split is past halfway
                split_pos = pos + len(sep)
                break

        if split_pos == -1:
            split_pos = chunk_size  # Hard cut if no separator found

        chunks.append(remaining[:split_pos].strip())
        remaining = remaining[split_pos - overlap:]  # Overlap for context continuity

    if remaining.strip():
        chunks.append(remaining.strip())

    return [c for c in chunks if len(c) > 20]  # Filter trivially short chunks


def embed_texts(client: OpenAI, texts: List[str]) -> np.ndarray:
    """
    Get embeddings for a list of texts.
    Returns a 2D numpy array of shape (len(texts), embedding_dim).
    text-embedding-3-small produces 1536-dimensional vectors.
    """
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=texts,
    )
    vectors = [item.embedding for item in response.data]
    return np.array(vectors, dtype=np.float32)


def cosine_similarity(query_vec: np.ndarray, chunk_vecs: np.ndarray) -> np.ndarray:
    """
    Compute cosine similarity between a query vector and all chunk vectors.
    Cosine similarity = dot product of unit vectors.
    Returns array of similarity scores, one per chunk.
    """
    # Normalize to unit vectors
    query_norm = query_vec / (np.linalg.norm(query_vec) + 1e-10)
    chunk_norms = chunk_vecs / (np.linalg.norm(chunk_vecs, axis=1, keepdims=True) + 1e-10)
    return chunk_norms @ query_norm  # Matrix-vector dot product


def retrieve_relevant_chunks(
    client: OpenAI,
    chunks: List[str],
    chunk_embeddings: np.ndarray,
    query: str,
    k: int = 6
) -> str:
    """
    Embed the query and find the k most similar chunks using cosine similarity.
    """
    query_embedding = embed_texts(client, [query])[0]
    scores = cosine_similarity(query_embedding, chunk_embeddings)
    top_k_indices = np.argsort(scores)[::-1][:k]
    return "\n\n".join([chunks[i] for i in top_k_indices])


# ── Request Models ─────────────────────────────────────────────────────────────

class RAGRequestBody(BaseModel):
    extractedText: str
    action: str  # "generate_plan" or "chat"
    question: Optional[str] = None


class SavePlannerRequest(BaseModel):
    planData: dict


class SaveDocumentRequest(BaseModel):
    docId: str
    fileName: str
    extractedText: str
    aiResults: Optional[dict] = None


class SaveChatRequest(BaseModel):
    docId: Optional[str] = None
    messages: List[dict]


class MigrationRequest(BaseModel):
    planData: Optional[dict] = None
    documents: Optional[List[dict]] = None


# ── DynamoDB Helpers ───────────────────────────────────────────────────────────

def db_put(pk: str, sk: str, data: dict):
    item = {"PK": pk, "SK": sk, "updatedAt": datetime.utcnow().isoformat(), **data}
    table.put_item(Item=item)


def db_get(pk: str, sk: str) -> Optional[dict]:
    try:
        resp = table.get_item(Key={"PK": pk, "SK": sk})
        return resp.get("Item")
    except ClientError:
        return None


def db_query(pk: str, sk_prefix: str) -> list:
    try:
        resp = table.query(
            KeyConditionExpression=Key("PK").eq(pk) & Key("SK").begins_with(sk_prefix)
        )
        return resp.get("Items", [])
    except ClientError:
        return []


def db_delete(pk: str, sk: str):
    table.delete_item(Key={"PK": pk, "SK": sk})


# ── RAG Route (v1 compatible path, now using OpenAI embeddings) ────────────────

@app.post("/")
async def handle(body: RAGRequestBody):
    if not body.extractedText or len(body.extractedText) < 10:
        return {"error": "Extracted text is too short."}

    client = get_openai_client()

    # Step 1: Chunk the text
    chunks = split_text(body.extractedText, chunk_size=500, overlap=50)
    if not chunks:
        return {"error": "Could not extract usable chunks from the text."}

    # Step 2: Embed all chunks in one API call (batched)
    chunk_embeddings = embed_texts(client, chunks)

    # Step 3: Route to generate_plan or chat
    llm_system_prompt = ""
    context = ""

    if body.action == "generate_plan":
        context = retrieve_relevant_chunks(
            client, chunks, chunk_embeddings,
            query="main topics chapters concepts definitions formulas",
            k=8
        )
        llm_system_prompt = """You are an expert academic study planner. Given study material, produce:

1. A STRUCTURED STUDY PLAN — break content into topics with estimated hours, priority levels, and study order.
2. An EXAM-READY SUMMARY — exhaustive coverage of every concept, definition, formula, theorem, and example. Be thorough — a student should be able to study entirely from this summary.

Respond ONLY with valid JSON in this exact format (no markdown, no backticks):
{
  "studyPlan": {
    "title": "Subject name",
    "totalEstimatedHours": 10,
    "topics": [
      {
        "name": "Topic name",
        "estimatedHours": 2,
        "priority": "high",
        "keyPoints": ["point1", "point2"],
        "order": 1
      }
    ]
  },
  "examSummary": {
    "title": "Subject name",
    "sections": [
      {
        "heading": "Section heading",
        "content": "Detailed content with concepts, definitions, formulas.",
        "keyTerms": ["term1", "term2"],
        "importantFormulas": ["formula1"],
        "examTips": ["tip1"]
      }
    ]
  }
}"""
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            max_tokens=4000,
            messages=[
                {"role": "system", "content": llm_system_prompt},
                {"role": "user", "content": f"Study material (retrieved via RAG):\n\n{context}"}
            ]
        )
        raw = response.choices[0].message.content
        try:
            json_match = re.search(r'\{[\s\S]*\}', raw)
            parsed = json.loads(json_match.group(0))
        except Exception:
            parsed = {"raw": raw}
        return {"success": True, "data": parsed}

    elif body.action == "chat":
        if not body.question:
            return {"error": "Missing question field."}

        context = retrieve_relevant_chunks(
            client, chunks, chunk_embeddings,
            query=body.question,
            k=6
        )
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            max_tokens=2000,
            messages=[
                {"role": "system", "content": "You are a helpful study assistant. Answer questions based ONLY on the provided study material. If the answer is not in the material, say so. Be concise but thorough. Include relevant formulas, definitions, or examples when applicable."},
                {"role": "user", "content": f"Study material (retrieved via RAG):\n\n{context}\n\nQuestion: {body.question}"}
            ]
        )
        return {"success": True, "answer": response.choices[0].message.content}

    return {"error": "Invalid action. Use 'generate_plan' or 'chat'."}


# ── Planner Endpoints ──────────────────────────────────────────────────────────

@app.post("/api/planner/save")
async def save_planner(
    request: Request,
    body: SavePlannerRequest,
    user=Depends(get_current_user)
):
    try:
        db_put(pk=f"USER#{user['sub']}", sk="PLANNER", data={"planData": body.planData})
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/planner/load")
async def load_planner(request: Request, user=Depends(get_current_user)):
    item = db_get(pk=f"USER#{user['sub']}", sk="PLANNER")
    if not item:
        return {"success": True, "planData": None}
    return {"success": True, "planData": item.get("planData")}


# ── Document Endpoints ─────────────────────────────────────────────────────────

@app.post("/api/documents/save")
async def save_document(
    request: Request,
    body: SaveDocumentRequest,
    user=Depends(get_current_user)
):
    try:
        db_put(
            pk=f"USER#{user['sub']}",
            sk=f"DOC#{body.docId}",
            data={
                "docId": body.docId,
                "fileName": body.fileName,
                "extractedText": body.extractedText,
                "aiResults": body.aiResults or {},
            }
        )
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/documents/list")
async def list_documents(request: Request, user=Depends(get_current_user)):
    items = db_query(pk=f"USER#{user['sub']}", sk_prefix="DOC#")
    docs = [
        {
            "docId": item.get("docId"),
            "fileName": item.get("fileName"),
            "updatedAt": item.get("updatedAt"),
            "hasAiResults": bool(item.get("aiResults")),
        }
        for item in items
    ]
    return {"success": True, "documents": docs}


@app.get("/api/documents/{doc_id}")
async def get_document(request: Request, doc_id: str, user=Depends(get_current_user)):
    item = db_get(pk=f"USER#{user['sub']}", sk=f"DOC#{doc_id}")
    if not item:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"success": True, "document": item}


@app.delete("/api/documents/{doc_id}")
async def delete_document(request: Request, doc_id: str, user=Depends(get_current_user)):
    try:
        db_delete(pk=f"USER#{user['sub']}", sk=f"DOC#{doc_id}")
        db_delete(pk=f"USER#{user['sub']}", sk=f"CHAT#DOC#{doc_id}")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Chat History Endpoints ─────────────────────────────────────────────────────

@app.post("/api/chat/save")
async def save_chat(
    request: Request,
    body: SaveChatRequest,
    user=Depends(get_current_user)
):
    try:
        sk = f"CHAT#DOC#{body.docId}" if body.docId else "CHAT#GLOBAL"
        db_put(pk=f"USER#{user['sub']}", sk=sk, data={"messages": body.messages, "docId": body.docId})
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/chat/load")
async def load_chat(
    request: Request,
    doc_id: Optional[str] = None,
    user=Depends(get_current_user)
):
    sk = f"CHAT#DOC#{doc_id}" if doc_id else "CHAT#GLOBAL"
    item = db_get(pk=f"USER#{user['sub']}", sk=sk)
    if not item:
        return {"success": True, "messages": []}
    return {"success": True, "messages": item.get("messages", [])}


# ── Migration Endpoint ─────────────────────────────────────────────────────────

@app.post("/api/migrate")
async def migrate_from_localstorage(
    request: Request,
    body: MigrationRequest,
    user=Depends(get_current_user)
):
    try:
        existing = db_get(pk=f"USER#{user['sub']}", sk="PLANNER")
        if existing:
            return {"success": False, "reason": "Cloud data already exists. Migration skipped."}
        if body.planData:
            db_put(pk=f"USER#{user['sub']}", sk="PLANNER", data={"planData": body.planData})
        return {"success": True, "migrated": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ── Notes Endpoints ────────────────────────────────────────────────────────────

class SaveNotesRequest(BaseModel):
    subjectName: str
    content: str


@app.post("/api/notes/save")
async def save_notes(
    request: Request,
    body: SaveNotesRequest,
    user=Depends(get_current_user)
):
    try:
        safe_name = body.subjectName.strip().replace("#", "").replace(" ", "_")
        db_put(
            pk=f"USER#{user['sub']}",
            sk=f"NOTE#SUBJECT#{safe_name}",
            data={"subjectName": body.subjectName, "content": body.content}
        )
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/notes/load")
async def load_notes(
    request: Request,
    user=Depends(get_current_user)
):
    try:
        items = db_query(pk=f"USER#{user['sub']}", sk_prefix="NOTE#SUBJECT#")
        notes = {}
        for item in items:
            notes[item.get("subjectName", "")] = item.get("content", "")
        return {"success": True, "notes": notes}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Explain Endpoint ───────────────────────────────────────────────────────────

@app.post("/api/explain")
async def explain_text(
    request: Request,
    user=Depends(get_current_user)
):
    try:
        body = await request.json()
        selected_text = body.get("selectedText", "").strip()
        context = body.get("context", "").strip()

        if not selected_text or len(selected_text) < 3:
            raise HTTPException(status_code=400, detail="Selected text too short")

        client = get_openai_client()
        prompt = f"""A student is reading study material and selected this text:

"{selected_text}"

Surrounding context:
{context[:800] if context else "Not provided"}

Give a clear, concise explanation in 3-5 sentences. Focus on clarity for a student.
If it contains a formula, explain each variable. If it's a concept, give a simple analogy."""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            max_tokens=300,
            messages=[
                {"role": "system", "content": "You are a helpful study assistant that explains academic concepts clearly and concisely."},
                {"role": "user", "content": prompt}
            ]
        )
        return {"success": True, "explanation": response.choices[0].message.content}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ── Subject / Chapter / Document (Library) Endpoints ──────────────────────────
# Key patterns:
#   SUBJECT#{subjectId}
#   CHAPTER#{subjectId}#{chapterId}
#   CDOC#{chapterId}#{docId}
#   CNOTE#{chapterId}

import uuid as uuid_lib

SUBJECT_COLORS = [
    '#00D2A0', '#4FACFE', '#6C5CE7', '#FECA57',
    '#FF6B6B', '#22c55e', '#ec4899', '#06b6d4',
]


class SaveSubjectRequest(BaseModel):
    subjectId: Optional[str] = None   # None = create new
    name: str
    order: Optional[int] = 0


class SaveChapterRequest(BaseModel):
    chapterId: Optional[str] = None   # None = create new
    subjectId: str
    name: str
    order: Optional[int] = 0


class SaveCDocRequest(BaseModel):
    docId: Optional[str] = None
    chapterId: str
    fileName: str
    fileSize: Optional[int] = 0
    extractedText: Optional[str] = ""
    aiResults: Optional[dict] = None


class SaveCNoteRequest(BaseModel):
    chapterId: str
    content: str


class AnalyzeDocRequest(BaseModel):
    docId: str
    chapterId: str


# ── Subjects ──────────────────────────────────────────────────────────────────

@app.post("/api/subjects/save")
async def save_subject(
    request: Request,
    body: SaveSubjectRequest,
    user=Depends(get_current_user)
):
    try:
        pk = f"USER#{user['sub']}"
        # Auto-assign color based on existing subject count
        existing = db_query(pk=pk, sk_prefix="SUBJECT#")
        color_idx = len(existing) % len(SUBJECT_COLORS)
        color = SUBJECT_COLORS[color_idx]

        subject_id = body.subjectId or str(uuid_lib.uuid4())[:8]
        db_put(
            pk=pk,
            sk=f"SUBJECT#{subject_id}",
            data={
                "subjectId": subject_id,
                "name": body.name,
                "color": color,
                "order": body.order,
            }
        )
        return {"success": True, "subjectId": subject_id, "color": color}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/subjects/list")
async def list_subjects(request: Request, user=Depends(get_current_user)):
    try:
        items = db_query(pk=f"USER#{user['sub']}", sk_prefix="SUBJECT#")
        subjects = sorted(items, key=lambda x: x.get("order", 0))
        return {"success": True, "subjects": subjects}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/subjects/{subject_id}")
async def delete_subject(
    request: Request,
    subject_id: str,
    user=Depends(get_current_user)
):
    try:
        pk = f"USER#{user['sub']}"
        # Delete subject
        db_delete(pk=pk, sk=f"SUBJECT#{subject_id}")
        # Delete all chapters under this subject
        chapters = db_query(pk=pk, sk_prefix=f"CHAPTER#{subject_id}#")
        for ch in chapters:
            ch_id = ch.get("chapterId")
            db_delete(pk=pk, sk=f"CHAPTER#{subject_id}#{ch_id}")
            # Delete all docs in each chapter
            docs = db_query(pk=pk, sk_prefix=f"CDOC#{ch_id}#")
            for doc in docs:
                db_delete(pk=pk, sk=f"CDOC#{ch_id}#{doc.get('docId')}")
            # Delete chapter notes
            db_delete(pk=pk, sk=f"CNOTE#{ch_id}")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Chapters ──────────────────────────────────────────────────────────────────

@app.post("/api/chapters/save")
async def save_chapter(
    request: Request,
    body: SaveChapterRequest,
    user=Depends(get_current_user)
):
    try:
        pk = f"USER#{user['sub']}"
        chapter_id = body.chapterId or str(uuid_lib.uuid4())[:8]
        db_put(
            pk=pk,
            sk=f"CHAPTER#{body.subjectId}#{chapter_id}",
            data={
                "chapterId": chapter_id,
                "subjectId": body.subjectId,
                "name": body.name,
                "order": body.order,
            }
        )
        return {"success": True, "chapterId": chapter_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/chapters/{subject_id}")
async def list_chapters(
    request: Request,
    subject_id: str,
    user=Depends(get_current_user)
):
    try:
        items = db_query(pk=f"USER#{user['sub']}", sk_prefix=f"CHAPTER#{subject_id}#")
        chapters = sorted(items, key=lambda x: x.get("order", 0))
        return {"success": True, "chapters": chapters}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/chapters/{subject_id}/{chapter_id}")
async def delete_chapter(
    request: Request,
    subject_id: str,
    chapter_id: str,
    user=Depends(get_current_user)
):
    try:
        pk = f"USER#{user['sub']}"
        db_delete(pk=pk, sk=f"CHAPTER#{subject_id}#{chapter_id}")
        # Delete all docs in chapter
        docs = db_query(pk=pk, sk_prefix=f"CDOC#{chapter_id}#")
        for doc in docs:
            db_delete(pk=pk, sk=f"CDOC#{chapter_id}#{doc.get('docId')}")
        db_delete(pk=pk, sk=f"CNOTE#{chapter_id}")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Chapter Documents ─────────────────────────────────────────────────────────

@app.post("/api/cdocs/save")
async def save_cdoc(
    request: Request,
    body: SaveCDocRequest,
    user=Depends(get_current_user)
):
    try:
        pk = f"USER#{user['sub']}"
        doc_id = body.docId or str(uuid_lib.uuid4())[:8]
        db_put(
            pk=pk,
            sk=f"CDOC#{body.chapterId}#{doc_id}",
            data={
                "docId": doc_id,
                "chapterId": body.chapterId,
                "fileName": body.fileName,
                "fileSize": body.fileSize,
                "extractedText": body.extractedText or "",
                "aiResults": body.aiResults or {},
                "uploadedAt": datetime.utcnow().isoformat(),
            }
        )
        return {"success": True, "docId": doc_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/cdocs/{chapter_id}")
async def list_cdocs(
    request: Request,
    chapter_id: str,
    user=Depends(get_current_user)
):
    try:
        items = db_query(pk=f"USER#{user['sub']}", sk_prefix=f"CDOC#{chapter_id}#")
        # Return metadata only — no extractedText (too large for list)
        docs = [
            {
                "docId": item.get("docId"),
                "chapterId": item.get("chapterId"),
                "fileName": item.get("fileName"),
                "fileSize": item.get("fileSize"),
                "uploadedAt": item.get("uploadedAt"),
                "updatedAt": item.get("updatedAt"),
                "hasAiResults": bool(item.get("aiResults")),
            }
            for item in sorted(items, key=lambda x: x.get("uploadedAt", ""))
        ]
        return {"success": True, "docs": docs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/cdocs/{chapter_id}/{doc_id}")
async def get_cdoc(
    request: Request,
    chapter_id: str,
    doc_id: str,
    user=Depends(get_current_user)
):
    try:
        item = db_get(pk=f"USER#{user['sub']}", sk=f"CDOC#{chapter_id}#{doc_id}")
        if not item:
            raise HTTPException(status_code=404, detail="Document not found")
        return {"success": True, "doc": item}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/cdocs/{chapter_id}/{doc_id}")
async def delete_cdoc(
    request: Request,
    chapter_id: str,
    doc_id: str,
    user=Depends(get_current_user)
):
    try:
        db_delete(pk=f"USER#{user['sub']}", sk=f"CDOC#{chapter_id}#{doc_id}")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/cdocs/analyze")
async def analyze_cdoc(
    request: Request,
    body: AnalyzeDocRequest,
    user=Depends(get_current_user)
):
    """
    Run AI analysis on a document already stored in DynamoDB.
    Fetches extractedText, runs RAG pipeline, saves aiResults back.
    """
    try:
        pk = f"USER#{user['sub']}"
        item = db_get(pk=pk, sk=f"CDOC#{body.chapterId}#{body.docId}")
        if not item:
            raise HTTPException(status_code=404, detail="Document not found")

        extracted_text = item.get("extractedText", "")
        if not extracted_text or len(extracted_text) < 10:
            raise HTTPException(status_code=400, detail="Document has no extractable text")

        client = get_openai_client()
        chunks = split_text(extracted_text, chunk_size=500, overlap=50)
        chunk_embeddings = embed_texts(client, chunks)

        context = retrieve_relevant_chunks(
            client, chunks, chunk_embeddings,
            query="main topics chapters concepts definitions formulas",
            k=8
        )

        system_prompt = """You are an expert academic study planner. Given study material, produce:
1. A STRUCTURED STUDY PLAN
2. An EXAM-READY SUMMARY

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "studyPlan": {
    "title": "Subject name",
    "totalEstimatedHours": 10,
    "topics": [{"name":"","estimatedHours":2,"priority":"high","keyPoints":[],"order":1}]
  },
  "examSummary": {
    "title": "Subject name",
    "sections": [{"heading":"","content":"","keyTerms":[],"importantFormulas":[],"examTips":[]}]
  }
}"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            max_tokens=4000,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Study material:\n\n{context}"}
            ]
        )
        raw = response.choices[0].message.content
        try:
            json_match = re.search(r'\{[\s\S]*\}', raw)
            ai_results = json.loads(json_match.group(0))
        except Exception:
            ai_results = {"raw": raw}

        # Update the document record with AI results
        db_put(
            pk=pk,
            sk=f"CDOC#{body.chapterId}#{body.docId}",
            data={**item, "aiResults": ai_results}
        )
        return {"success": True, "aiResults": ai_results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Chapter Notes ─────────────────────────────────────────────────────────────

@app.post("/api/cnotes/save")
async def save_cnote(
    request: Request,
    body: SaveCNoteRequest,
    user=Depends(get_current_user)
):
    try:
        db_put(
            pk=f"USER#{user['sub']}",
            sk=f"CNOTE#{body.chapterId}",
            data={"chapterId": body.chapterId, "content": body.content}
        )
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/cnotes/{chapter_id}")
async def load_cnote(
    request: Request,
    chapter_id: str,
    user=Depends(get_current_user)
):
    try:
        item = db_get(pk=f"USER#{user['sub']}", sk=f"CNOTE#{chapter_id}")
        return {"success": True, "content": item.get("content", "") if item else ""}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ── Subject-level Documents (SDOC) ────────────────────────────────────────────

class SaveSDocRequest(BaseModel):
    docId: Optional[str] = None
    subjectId: str
    fileName: str
    fileSize: Optional[int] = 0
    extractedText: Optional[str] = ""
    aiResults: Optional[dict] = None


@app.post("/api/sdocs/save")
async def save_sdoc(
    request: Request,
    body: SaveSDocRequest,
    user=Depends(get_current_user)
):
    try:
        pk = f"USER#{user['sub']}"
        doc_id = body.docId or str(uuid_lib.uuid4())[:8]
        db_put(
            pk=pk,
            sk=f"SDOC#{body.subjectId}#{doc_id}",
            data={
                "docId": doc_id,
                "subjectId": body.subjectId,
                "fileName": body.fileName,
                "fileSize": body.fileSize,
                "extractedText": body.extractedText or "",
                "aiResults": body.aiResults or {},
                "uploadedAt": datetime.utcnow().isoformat(),
            }
        )
        return {"success": True, "docId": doc_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sdocs/{subject_id}")
async def list_sdocs(
    request: Request,
    subject_id: str,
    user=Depends(get_current_user)
):
    try:
        items = db_query(pk=f"USER#{user['sub']}", sk_prefix=f"SDOC#{subject_id}#")
        docs = [
            {
                "docId": item.get("docId"),
                "subjectId": item.get("subjectId"),
                "fileName": item.get("fileName"),
                "fileSize": item.get("fileSize"),
                "uploadedAt": item.get("uploadedAt"),
                "updatedAt": item.get("updatedAt"),
                "hasAiResults": bool(item.get("aiResults")),
            }
            for item in sorted(items, key=lambda x: x.get("uploadedAt", ""))
        ]
        return {"success": True, "docs": docs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sdocs/{subject_id}/{doc_id}")
async def get_sdoc(
    request: Request,
    subject_id: str,
    doc_id: str,
    user=Depends(get_current_user)
):
    try:
        item = db_get(pk=f"USER#{user['sub']}", sk=f"SDOC#{subject_id}#{doc_id}")
        if not item:
            raise HTTPException(status_code=404, detail="Document not found")
        return {"success": True, "doc": item}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/sdocs/{subject_id}/{doc_id}")
async def delete_sdoc(
    request: Request,
    subject_id: str,
    doc_id: str,
    user=Depends(get_current_user)
):
    try:
        db_delete(pk=f"USER#{user['sub']}", sk=f"SDOC#{subject_id}#{doc_id}")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sdocs/analyze")
async def analyze_sdoc(
    request: Request,
    user=Depends(get_current_user)
):
    try:
        body = await request.json()
        subject_id = body.get("subjectId")
        doc_id = body.get("docId")
        pk = f"USER#{user['sub']}"
        item = db_get(pk=pk, sk=f"SDOC#{subject_id}#{doc_id}")
        if not item:
            raise HTTPException(status_code=404, detail="Document not found")
        extracted_text = item.get("extractedText", "")
        if not extracted_text or len(extracted_text) < 10:
            raise HTTPException(status_code=400, detail="Document has no extractable text")
        client = get_openai_client()
        chunks = split_text(extracted_text, chunk_size=500, overlap=50)
        chunk_embeddings = embed_texts(client, chunks)
        context = retrieve_relevant_chunks(
            client, chunks, chunk_embeddings,
            query="main topics chapters concepts definitions formulas", k=8
        )
        system_prompt = """You are an expert academic study planner. Respond ONLY with valid JSON (no markdown):
{
  "studyPlan": {"title":"","totalEstimatedHours":10,"topics":[{"name":"","estimatedHours":2,"priority":"high","keyPoints":[],"order":1}]},
  "examSummary": {"title":"","sections":[{"heading":"","content":"","keyTerms":[],"importantFormulas":[],"examTips":[]}]}
}"""
        response = client.chat.completions.create(
            model="gpt-4o-mini", temperature=0.3, max_tokens=4000,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Study material:\n\n{context}"}
            ]
        )
        raw = response.choices[0].message.content
        try:
            json_match = re.search(r'\{[\s\S]*\}', raw)
            ai_results = json.loads(json_match.group(0))
        except Exception:
            ai_results = {"raw": raw}
        db_put(pk=pk, sk=f"SDOC#{subject_id}#{doc_id}", data={**item, "aiResults": ai_results})
        return {"success": True, "aiResults": ai_results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Subject-level Notes (SNOTE) ───────────────────────────────────────────────

class SaveSNoteRequest(BaseModel):
    subjectId: str
    content: str


@app.post("/api/snotes/save")
async def save_snote(
    request: Request,
    body: SaveSNoteRequest,
    user=Depends(get_current_user)
):
    try:
        db_put(
            pk=f"USER#{user['sub']}",
            sk=f"SNOTE#{body.subjectId}",
            data={"subjectId": body.subjectId, "content": body.content}
        )
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/snotes/{subject_id}")
async def load_snote(
    request: Request,
    subject_id: str,
    user=Depends(get_current_user)
):
    try:
        item = db_get(pk=f"USER#{user['sub']}", sk=f"SNOTE#{subject_id}")
        return {"success": True, "content": item.get("content", "") if item else ""}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def health():
    return {"status": "StudyFlow RAG backend running", "version": "2.0"}

