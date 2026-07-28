import os
import json
import re
import time
import base64
import urllib.request
import numpy as np
from datetime import datetime
from typing import Optional, List, Any
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from openai import OpenAI
import jwt
from jwt import PyJWKClient
import vector_store

# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.environ.get(
            "ALLOWED_ORIGINS",
            "http://localhost:3000,http://localhost:5173,https://ddr1k3uxkbzvy.cloudfront.net",
        ).split(",")
        if origin.strip()
    ],
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

# ── S3 Setup ─────────────────────────────────────────────────────────────────
S3_BUCKET = "studyflow-documents"
S3_REGION = "ap-south-1"
s3 = boto3.client(
    "s3",
    region_name=S3_REGION,
    aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
)


def upload_pdf_to_s3(file_bytes: bytes, key: str, content_type: str = "application/pdf") -> str:
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
    )
    return create_s3_presigned_url(key)


def create_s3_presigned_url(key: str, expires_in: int = 3600) -> str:
    if not key:
        return ""
    try:
        return s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET, "Key": key},
            ExpiresIn=expires_in,
        )
    except Exception:
        return f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{key}"


def delete_s3_object(key: Optional[str]):
    if not key:
        return
    try:
        s3.delete_object(Bucket=S3_BUCKET, Key=key)
    except Exception:
        pass


def attach_fresh_pdf_url(item: Optional[dict]) -> Optional[dict]:
    if not item:
        return item
    if item.get("s3Key"):
        item = {**item, "pdfUrl": create_s3_presigned_url(item.get("s3Key"))}
    return item


# ── Input guards ────────────────────────────────────────────────────────────

# Client-side extraction is capped at 50k chars; allow some headroom but reject
# anything unreasonably large to protect embedding cost and the 400KB DynamoDB
# item limit.
MAX_EXTRACTED_TEXT_CHARS = 100_000

# For note generation we feed the document directly (no RAG filtering) so notes
# cover the whole document. gpt-4o-mini has a 128k-token context window, so this
# bound stays comfortably within it.
NOTES_CONTEXT_CHARS = 60_000

# Full-document budgets for quiz and analysis so both cover the whole document
# instead of a narrow RAG slice (kept well within gpt-4o-mini's context window).
QUIZ_CONTEXT_CHARS = 45_000
ANALYSIS_CONTEXT_CHARS = 45_000

# Shared adaptive persona so chat, analysis, and quizzes work well for ANY kind
# of document, not just study material.
DOC_ADAPTIVE_PREAMBLE = (
    "The document may be of any kind - academic notes, a textbook, a research "
    "paper, a legal contract, a business or financial report, technical "
    "documentation, meeting notes, a manual, a resume, or general prose. First "
    "infer the document's type and purpose, then adapt your terminology, "
    "structure, and depth to fit it."
)

# Shared grounding discipline to reduce hallucination across features.
GROUNDING_RULES = (
    "Base every statement strictly on the provided excerpts. Preserve important "
    "specifics exactly (numbers, dates, names, formulas, clauses, definitions). "
    "If the excerpts do not contain the answer, say so plainly instead of "
    "guessing."
)


def parse_json_response(raw: Optional[str]) -> dict:
    """Parse a model JSON response robustly.

    Handles clean output from response_format=json_object and falls back to
    extracting the first {...} block for unconstrained responses.
    """
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        pass
    try:
        match = re.search(r'\{[\s\S]*\}', raw)
        if match:
            return json.loads(match.group(0))
    except Exception:
        pass
    return {}


def enforce_text_limit(text: Optional[str]):
    if text and len(text) > MAX_EXTRACTED_TEXT_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"Document text exceeds the {MAX_EXTRACTED_TEXT_CHARS:,}-character limit.",
        )


def validate_user_s3_key(user_sub: str, s3_key: Optional[str]):
    """Ensure a client-supplied S3 key belongs to the requesting user.

    Prevents an IDOR where a user could point a document record at another
    user's object and receive a presigned URL for it.
    """
    if not s3_key:
        return
    if not s3_key.startswith(f"documents/{user_sub}/"):
        raise HTTPException(status_code=403, detail="Invalid document storage key.")


# ── JWT Auth (stdlib only) ─────────────────────────────────────────────────────

COGNITO_USER_POOL_ID = "ap-south-1_5qo8gZ9cS"
COGNITO_ISSUER = f"https://cognito-idp.ap-south-1.amazonaws.com/{COGNITO_USER_POOL_ID}"
COGNITO_APP_CLIENT_ID = os.environ.get("COGNITO_APP_CLIENT_ID", "5e14397oapv9ubug1p2um2c3ie")
COGNITO_JWKS_URL = f"{COGNITO_ISSUER}/.well-known/jwks.json"
jwk_client = PyJWKClient(COGNITO_JWKS_URL)

security = HTTPBearer()


def decode_jwt_payload(token: str) -> dict:
    signing_key = jwk_client.get_signing_key_from_jwt(token)
    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        issuer=COGNITO_ISSUER,
        options={"verify_aud": False},
    )
    token_use = payload.get("token_use")
    client_id = payload.get("aud") if token_use == "id" else payload.get("client_id")
    if client_id != COGNITO_APP_CLIENT_ID:
        raise ValueError("Invalid token audience")
    return payload


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    token = credentials.credentials
    try:
        payload = decode_jwt_payload(token)
        user_sub = payload.get("sub")
        if not user_sub:
            raise HTTPException(status_code=401, detail="Invalid token: missing sub")
        return {"sub": user_sub, "email": payload.get("email", "")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


# ── Rate limiting & per-user AI quota ─────────────────────────────────────────
#
# Protects the expensive OpenAI/embedding endpoints from cost-based abuse:
#   * a short in-memory burst limiter (per process) blocks rapid loops
#   * a DynamoDB daily counter enforces a hard per-user daily cap that survives
#     restarts and works across instances
# Both are tunable via environment variables.

AI_DAILY_QUOTA = int(os.environ.get("AI_DAILY_QUOTA", "200"))
AI_BURST_MAX = int(os.environ.get("AI_BURST_MAX", "15"))
AI_BURST_WINDOW_SECONDS = int(os.environ.get("AI_BURST_WINDOW_SECONDS", "60"))

_burst_hits: dict = {}


def _check_burst_limit(user_sub: str):
    now = time.time()
    window_start = now - AI_BURST_WINDOW_SECONDS
    hits = [t for t in _burst_hits.get(user_sub, []) if t > window_start]
    if len(hits) >= AI_BURST_MAX:
        raise HTTPException(
            status_code=429,
            detail="Too many requests in a short time. Please slow down and try again shortly.",
        )
    hits.append(now)
    _burst_hits[user_sub] = hits
    # Opportunistic cleanup so the map does not grow without bound.
    if len(_burst_hits) > 5000:
        for key in [k for k, v in _burst_hits.items() if not any(t > window_start for t in v)]:
            _burst_hits.pop(key, None)


def _enforce_daily_quota(user_sub: str):
    today = datetime.utcnow().strftime("%Y-%m-%d")
    try:
        resp = table.update_item(
            Key={"PK": f"USER#{user_sub}", "SK": f"USAGE#AI#{today}"},
            UpdateExpression="SET #ua = :now, #exp = :exp ADD #c :one",
            ExpressionAttributeNames={"#c": "count", "#ua": "updatedAt", "#exp": "expiresAt"},
            ExpressionAttributeValues={
                ":one": 1,
                ":now": datetime.utcnow().isoformat(),
                ":exp": int(time.time()) + 172800,  # auto-expire after 48h if TTL is enabled
            },
            ReturnValues="UPDATED_NEW",
        )
        count = int(resp.get("Attributes", {}).get("count", 0))
    except Exception:
        # Fail open: never block a legitimate user because metering hiccuped.
        return
    if count > AI_DAILY_QUOTA:
        raise HTTPException(
            status_code=429,
            detail="You've reached today's AI usage limit. It resets tomorrow (UTC).",
        )


async def enforce_ai_limits(user=Depends(get_current_user)):
    """Auth + rate-limit dependency for the expensive AI endpoints."""
    _check_burst_limit(user["sub"])
    _enforce_daily_quota(user["sub"])
    return user


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
    Uses the same model/dimensions as the vector store (text-embedding-3-large
    at 1536 dims) so the legacy in-memory path stays consistent with S3 Vectors.
    """
    response = client.embeddings.create(
        model=vector_store.EMBEDDING_MODEL,
        dimensions=vector_store.EMBEDDING_DIMENSIONS,
        input=texts,
    )
    vectors = [item.embedding for item in response.data]
    return np.array(vectors, dtype=np.float32)


# In-memory cache of per-document chunk embeddings for the global chatbot's
# legacy (non-vector) path. Re-embedding every document on every question is the
# single most expensive operation in the app; caching by (user, doc, content
# hash) means an unchanged document is embedded only once per process lifetime.
_LIB_EMBED_CACHE: dict = {}
_LIB_EMBED_CACHE_MAX = 512


def _lib_cache_get_or_embed(client: OpenAI, user_sub: str, doc_id: str, text: str):
    """Return (chunks, embeddings) for a library document, using a cache keyed on
    the document's content hash so edits invalidate stale embeddings."""
    key = f"{user_sub}:{doc_id}:{vector_store.content_hash(text)}"
    cached = _LIB_EMBED_CACHE.get(key)
    if cached is not None:
        # Refresh recency for simple LRU-ish eviction.
        _LIB_EMBED_CACHE.pop(key, None)
        _LIB_EMBED_CACHE[key] = cached
        return cached["chunks"], cached["embeddings"]
    chunks = split_text(text, chunk_size=900, overlap=150)
    if not chunks:
        return [], None
    embeddings = embed_texts(client, chunks)
    if len(_LIB_EMBED_CACHE) >= _LIB_EMBED_CACHE_MAX:
        try:
            _LIB_EMBED_CACHE.pop(next(iter(_LIB_EMBED_CACHE)))
        except StopIteration:
            pass
    _LIB_EMBED_CACHE[key] = {"chunks": chunks, "embeddings": embeddings}
    return chunks, embeddings


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
    planData: Any  # Can be dict or list


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

def float_to_decimal(obj):
    """Recursively convert floats to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: float_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [float_to_decimal(i) for i in obj]
    return obj


def decimal_to_python(obj):
    """Recursively convert Decimal to float/int for JSON serialization."""
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    elif isinstance(obj, dict):
        return {k: decimal_to_python(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [decimal_to_python(i) for i in obj]
    return obj


def db_put(pk: str, sk: str, data: dict):
    item = {"PK": pk, "SK": sk, "updatedAt": datetime.utcnow().isoformat(), **data}
    item = float_to_decimal(item)
    table.put_item(Item=item)


def db_get(pk: str, sk: str) -> Optional[dict]:
    try:
        resp = table.get_item(Key={"PK": pk, "SK": sk})
        item = resp.get("Item")
        return decimal_to_python(item) if item else None
    except ClientError:
        return None


def db_query(pk: str, sk_prefix: str) -> list:
    try:
        items = []
        query_args = {
            "KeyConditionExpression": Key("PK").eq(pk) & Key("SK").begins_with(sk_prefix)
        }
        while True:
            resp = table.query(**query_args)
            items.extend(resp.get("Items", []))
            last_key = resp.get("LastEvaluatedKey")
            if not last_key:
                break
            query_args["ExclusiveStartKey"] = last_key
        return [decimal_to_python(item) for item in items]
    except ClientError:
        return []


def db_delete(pk: str, sk: str):
    table.delete_item(Key={"PK": pk, "SK": sk})


def strip_dynamo_keys(item: dict) -> dict:
    return {k: v for k, v in (item or {}).items() if k not in {"PK", "SK", "updatedAt"}}


def doc_embedding_fields(item: dict) -> dict:
    return {
        "embeddingStatus": item.get("embeddingStatus", "not_indexed"),
        "embeddingModel": item.get("embeddingModel", ""),
        "embeddingDimensions": item.get("embeddingDimensions"),
        "embeddingVersion": item.get("embeddingVersion"),
        "chunkCount": item.get("chunkCount", 0),
        "contentHash": item.get("contentHash", ""),
        "indexedAt": item.get("indexedAt", ""),
        "embeddingError": item.get("embeddingError", ""),
    }


def find_subject_for_chapter(pk: str, chapter_id: str) -> Optional[str]:
    for chapter in db_query(pk=pk, sk_prefix="CHAPTER#"):
        if chapter.get("chapterId") == chapter_id:
            return chapter.get("subjectId")
    return None


def format_vector_context(matches: List[dict]) -> str:
    parts = []
    for match in matches:
        text = match.get("text", "")
        if text:
            parts.append(f"[From: {match.get('fileName', 'Unknown')} | chunk {match.get('chunkIndex', '')}]\n{text}")
    return "\n\n---\n\n".join(parts)


def vector_sources(matches: List[dict]) -> List[str]:
    seen = set()
    sources = []
    for match in matches:
        doc_id = match.get("docId")
        if not doc_id or doc_id in seen:
            continue
        seen.add(doc_id)
        sources.append(match.get("fileName", "Unknown"))
    return sources


def index_document_item(
    pk: str,
    user_id: str,
    sk: str,
    item: dict,
    location_type: str,
    subject_id: Optional[str] = None,
    chapter_id: Optional[str] = None,
) -> dict:
    if not vector_store.should_index():
        return {"embeddingStatus": "disabled"}

    extracted_text = item.get("extractedText", "")
    if not extracted_text or len(extracted_text) < 10:
        status = {
            "embeddingStatus": "skipped",
            "chunkCount": 0,
            "contentHash": vector_store.content_hash(extracted_text),
            "embeddingError": "Document has no extractable text.",
        }
        db_put(pk=pk, sk=sk, data={**strip_dynamo_keys(item), **status})
        return status

    current_hash = vector_store.content_hash(extracted_text)
    if (
        item.get("embeddingStatus") == "ready"
        and item.get("contentHash") == current_hash
        and int(item.get("embeddingVersion") or 0) == vector_store.EMBEDDING_VERSION
    ):
        return doc_embedding_fields(item)

    db_put(
        pk=pk,
        sk=sk,
        data={**strip_dynamo_keys(item), "embeddingStatus": "processing", "embeddingError": ""},
    )
    try:
        status = vector_store.index_document(
            get_openai_client(),
            user_id=user_id,
            doc_id=item.get("docId"),
            file_name=item.get("fileName", "Untitled document"),
            extracted_text=extracted_text,
            location_type=location_type,
            subject_id=subject_id,
            chapter_id=chapter_id,
            previous_chunk_count=int(item.get("chunkCount") or 0),
            previous_version=int(item.get("embeddingVersion") or vector_store.EMBEDDING_VERSION),
        )
    except Exception as e:
        status = {
            "embeddingStatus": "failed",
            "embeddingError": str(e)[:500],
            "chunkCount": int(item.get("chunkCount") or 0),
            "contentHash": current_hash,
        }
    db_put(pk=pk, sk=sk, data={**strip_dynamo_keys(item), **status})
    return status


def delete_doc_vectors(user_id: str, item: Optional[dict]):
    if not item:
        return
    try:
        vector_store.delete_document_vectors(
            user_id,
            item.get("docId"),
            int(item.get("chunkCount") or 0),
            int(item.get("embeddingVersion") or vector_store.EMBEDDING_VERSION),
        )
    except Exception:
        pass


def legacy_context_for_document(client: OpenAI, extracted_text: str, query: str, k: int = 10) -> str:
    chunks = split_text(extracted_text, chunk_size=1000, overlap=150)
    if not chunks:
        return ""
    chunk_embeddings = embed_texts(client, chunks)
    return retrieve_relevant_chunks(client, chunks, chunk_embeddings, query=query, k=k)


# ── RAG Route (v1 compatible path, now using OpenAI embeddings) ────────────────

@app.post("/")
async def handle(body: RAGRequestBody, user=Depends(enforce_ai_limits)):
    if not body.extractedText or len(body.extractedText) < 10:
        return {"error": "Extracted text is too short."}

    enforce_text_limit(body.extractedText)
    client = get_openai_client()

    # Step 1: Chunk the text
    chunks = split_text(body.extractedText, chunk_size=1000, overlap=150)
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
            max_tokens=8000,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": llm_system_prompt},
                {"role": "user", "content": f"Study material (retrieved via RAG):\n\n{context}"}
            ]
        )
        raw = response.choices[0].message.content
        parsed = parse_json_response(raw) or {"raw": raw}
        return {"success": True, "data": parsed}

    elif body.action == "chat":
        if not body.question:
            return {"error": "Missing question field."}

        context = retrieve_relevant_chunks(
            client, chunks, chunk_embeddings,
            query=body.question,
            k=10
        )
        chat_system = (
            "You are a precise, helpful document assistant. "
            + DOC_ADAPTIVE_PREAMBLE
            + " Answer using ONLY the provided excerpts. Be clear and as detailed "
            "as the question warrants; use bullet points, steps, or short headings "
            "when they aid clarity. " + GROUNDING_RULES
        )
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            max_tokens=2000,
            messages=[
                {"role": "system", "content": chat_system},
                {"role": "user", "content": f"Document excerpts:\n\n{context}\n\nQuestion: {body.question}"}
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
        plan_data = body.planData
        pk = f"USER#{user['sub']}"
        if isinstance(plan_data, dict) and isinstance(plan_data.get("plan"), list):
            plan_days = plan_data.get("plan", [])
            metadata = {key: value for key, value in plan_data.items() if key != "plan"}
            chunk_size = 30
            chunks = [plan_days[i:i + chunk_size] for i in range(0, len(plan_days), chunk_size)]

            for index, chunk in enumerate(chunks):
                db_put(
                    pk=pk,
                    sk=f"PLANNER#CHUNK#{index:04d}",
                    data={"days": chunk, "index": index},
                )
            # Commit metadata last so readers only see a new version after all
            # chunks have been written successfully.
            db_put(
                pk=pk,
                sk="PLANNER",
                data={"planData": metadata, "chunkCount": len(chunks), "storageVersion": 2},
            )

            existing_chunks = db_query(pk=pk, sk_prefix="PLANNER#CHUNK#")
            for item in existing_chunks:
                if int(item.get("index", -1)) >= len(chunks):
                    db_delete(pk=pk, sk=item.get("SK"))
        else:
            db_put(pk=pk, sk="PLANNER", data={"planData": plan_data})
        return {"success": True}
    except Exception as e:
        import traceback
        print(f"save_planner error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/planner/load")
async def load_planner(request: Request, user=Depends(get_current_user)):
    pk = f"USER#{user['sub']}"
    item = db_get(pk=pk, sk="PLANNER")
    if not item:
        return {"success": True, "planData": None}
    plan_data = item.get("planData")
    if item.get("storageVersion") == 2 and isinstance(plan_data, dict):
        chunk_count = int(item.get("chunkCount", 0))
        chunks = sorted(
            [
                chunk for chunk in db_query(pk=pk, sk_prefix="PLANNER#CHUNK#")
                if 0 <= int(chunk.get("index", -1)) < chunk_count
            ],
            key=lambda chunk: chunk.get("index", 0),
        )
        days = [day for chunk in chunks for day in chunk.get("days", [])]
        plan_data = {**plan_data, "plan": days}
    return {"success": True, "planData": plan_data}


@app.delete("/api/planner")
async def delete_planner(request: Request, user=Depends(get_current_user)):
    try:
        pk = f"USER#{user['sub']}"
        db_delete(pk=pk, sk="PLANNER")
        for chunk in db_query(pk=pk, sk_prefix="PLANNER#CHUNK#"):
            db_delete(pk=pk, sk=chunk.get("SK"))
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
    pdfUrl: Optional[str] = None
    s3Key: Optional[str] = None


class SaveCNoteRequest(BaseModel):
    chapterId: str
    content: str


class AnalyzeDocRequest(BaseModel):
    docId: str
    chapterId: str


class DocumentChatRequest(BaseModel):
    docId: str
    sourceType: str
    sourceId: str
    question: str
    history: Optional[List[dict]] = []


class VectorReindexRequest(BaseModel):
    docId: str
    sourceType: str
    sourceId: str


class VectorMigrationRequest(BaseModel):
    limit: Optional[int] = 10


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
        pk = f"USER#{user['sub']}"
        items = db_query(pk=pk, sk_prefix="SUBJECT#")
        subjects = sorted(items, key=lambda x: x.get("order", 0))
        for subject in subjects:
            subject_id = subject.get("subjectId")
            subject["chapterCount"] = len(db_query(pk=pk, sk_prefix=f"CHAPTER#{subject_id}#"))
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
        subject_item = db_get(pk=pk, sk=f"SUBJECT#{subject_id}")
        # Delete subject
        db_delete(pk=pk, sk=f"SUBJECT#{subject_id}")
        # Delete subject-level documents and note
        sdocs = db_query(pk=pk, sk_prefix=f"SDOC#{subject_id}#")
        for doc in sdocs:
            delete_doc_vectors(user["sub"], doc)
            delete_s3_object(doc.get("s3Key"))
            db_delete(pk=pk, sk=f"SDOC#{subject_id}#{doc.get('docId')}")
            db_delete(pk=pk, sk=f"CHAT#DOC#{doc.get('docId')}")
        db_delete(pk=pk, sk=f"SNOTE#{subject_id}")
        if subject_item and subject_item.get("name"):
            safe_name = subject_item["name"].strip().replace("#", "").replace(" ", "_")
            db_delete(pk=pk, sk=f"NOTE#SUBJECT#{safe_name}")
        # Delete all chapters under this subject
        chapters = db_query(pk=pk, sk_prefix=f"CHAPTER#{subject_id}#")
        for ch in chapters:
            ch_id = ch.get("chapterId")
            db_delete(pk=pk, sk=f"CHAPTER#{subject_id}#{ch_id}")
            # Delete all docs in each chapter
            docs = db_query(pk=pk, sk_prefix=f"CDOC#{ch_id}#")
            for doc in docs:
                delete_doc_vectors(user["sub"], doc)
                delete_s3_object(doc.get("s3Key"))
                db_delete(pk=pk, sk=f"CDOC#{ch_id}#{doc.get('docId')}")
                db_delete(pk=pk, sk=f"CHAT#DOC#{doc.get('docId')}")
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
        pk = f"USER#{user['sub']}"
        items = db_query(pk=pk, sk_prefix=f"CHAPTER#{subject_id}#")
        chapters = sorted(items, key=lambda x: x.get("order", 0))
        # Attach doc count for each chapter
        for ch in chapters:
            ch_id = ch.get("chapterId")
            cdocs = db_query(pk=pk, sk_prefix=f"CDOC#{ch_id}#")
            ch["docCount"] = len(cdocs)
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
            delete_doc_vectors(user["sub"], doc)
            delete_s3_object(doc.get("s3Key"))
            db_delete(pk=pk, sk=f"CDOC#{chapter_id}#{doc.get('docId')}")
            db_delete(pk=pk, sk=f"CHAT#DOC#{doc.get('docId')}")
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
        validate_user_s3_key(user["sub"], body.s3Key)
        enforce_text_limit(body.extractedText)
        doc_id = body.docId or str(uuid_lib.uuid4())[:8]
        sk = f"CDOC#{body.chapterId}#{doc_id}"
        subject_id = find_subject_for_chapter(pk, body.chapterId)
        data = {
            "docId": doc_id,
            "chapterId": body.chapterId,
            "fileName": body.fileName,
            "fileSize": body.fileSize,
            "extractedText": body.extractedText or "",
            "aiResults": body.aiResults or {},
            "pdfUrl": body.pdfUrl or "",
            "s3Key": body.s3Key or "",
            "uploadedAt": datetime.utcnow().isoformat(),
            "embeddingStatus": "pending" if vector_store.should_index() else "disabled",
        }
        db_put(pk=pk, sk=sk, data=data)
        status = index_document_item(
            pk, user["sub"], sk, data,
            location_type="chapter",
            subject_id=subject_id,
            chapter_id=body.chapterId,
        )
        return {"success": True, "docId": doc_id, **status}
    except HTTPException:
        raise
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
        docs = []
        for item in sorted(items, key=lambda x: x.get("uploadedAt", "")):
            docs.append({
                "docId": item.get("docId"),
                "chapterId": item.get("chapterId"),
                "fileName": item.get("fileName"),
                "fileSize": item.get("fileSize"),
                "uploadedAt": item.get("uploadedAt"),
                "updatedAt": item.get("updatedAt"),
                "hasAiResults": bool(item.get("aiResults")),
                "pdfUrl": create_s3_presigned_url(item.get("s3Key")) if item.get("s3Key") else item.get("pdfUrl", ""),
                "s3Key": item.get("s3Key", ""),
                **doc_embedding_fields(item),
            })
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
        return {"success": True, "doc": attach_fresh_pdf_url(item)}
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
        pk = f"USER#{user['sub']}"
        item = db_get(pk=pk, sk=f"CDOC#{chapter_id}#{doc_id}")
        delete_doc_vectors(user["sub"], item)
        delete_s3_object(item.get("s3Key") if item else None)
        db_delete(pk=pk, sk=f"CDOC#{chapter_id}#{doc_id}")
        db_delete(pk=pk, sk=f"CHAT#DOC#{doc_id}")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/cdocs/analyze")
async def analyze_cdoc(
    request: Request,
    body: AnalyzeDocRequest,
    user=Depends(enforce_ai_limits)
):
    try:
        pk = f"USER#{user['sub']}"
        item = db_get(pk=pk, sk=f"CDOC#{body.chapterId}#{body.docId}")
        if not item:
            raise HTTPException(status_code=404, detail="Document not found")

        extracted_text = item.get("extractedText", "")
        if not extracted_text or len(extracted_text) < 10:
            raise HTTPException(status_code=400, detail="Document has no extractable text")

        client = get_openai_client()
        matches = []
        if vector_store.should_query() and item.get("embeddingStatus") == "ready":
            matches = vector_store.query_document_chunks(
                client, user_id=user["sub"], doc_id=body.docId,
                question="main topics chapters concepts definitions formulas", top_k=8
            )
        context = format_vector_context(matches) if matches else extracted_text[:ANALYSIS_CONTEXT_CHARS]

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
            max_tokens=8000,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Study material:\n\n{context}"}
            ]
        )
        raw = response.choices[0].message.content
        ai_results = parse_json_response(raw) or {"raw": raw}

        db_put(pk=pk, sk=f"CDOC#{body.chapterId}#{body.docId}", data={**strip_dynamo_keys(item), "aiResults": ai_results})
        return {"success": True, "aiResults": ai_results, "retrieval": "vector" if matches else "legacy"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Chapter Notes

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
    pdfUrl: Optional[str] = None
    s3Key: Optional[str] = None


@app.post("/api/sdocs/save")
async def save_sdoc(
    request: Request,
    body: SaveSDocRequest,
    user=Depends(get_current_user)
):
    try:
        pk = f"USER#{user['sub']}"
        validate_user_s3_key(user["sub"], body.s3Key)
        enforce_text_limit(body.extractedText)
        doc_id = body.docId or str(uuid_lib.uuid4())[:8]
        sk = f"SDOC#{body.subjectId}#{doc_id}"
        data = {
            "docId": doc_id,
            "subjectId": body.subjectId,
            "fileName": body.fileName,
            "fileSize": body.fileSize,
            "extractedText": body.extractedText or "",
            "aiResults": body.aiResults or {},
            "pdfUrl": body.pdfUrl or "",
            "s3Key": body.s3Key or "",
            "uploadedAt": datetime.utcnow().isoformat(),
            "embeddingStatus": "pending" if vector_store.should_index() else "disabled",
        }
        db_put(pk=pk, sk=sk, data=data)
        status = index_document_item(
            pk, user["sub"], sk, data,
            location_type="subject",
            subject_id=body.subjectId,
        )
        return {"success": True, "docId": doc_id, **status}
    except HTTPException:
        raise
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
        docs = []
        for item in sorted(items, key=lambda x: x.get("uploadedAt", "")):
            docs.append({
                "docId": item.get("docId"),
                "subjectId": item.get("subjectId"),
                "fileName": item.get("fileName"),
                "fileSize": item.get("fileSize"),
                "uploadedAt": item.get("uploadedAt"),
                "updatedAt": item.get("updatedAt"),
                "hasAiResults": bool(item.get("aiResults")),
                "pdfUrl": create_s3_presigned_url(item.get("s3Key")) if item.get("s3Key") else item.get("pdfUrl", ""),
                "s3Key": item.get("s3Key", ""),
                **doc_embedding_fields(item),
            })
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
        return {"success": True, "doc": attach_fresh_pdf_url(item)}
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
        pk = f"USER#{user['sub']}"
        item = db_get(pk=pk, sk=f"SDOC#{subject_id}#{doc_id}")
        delete_doc_vectors(user["sub"], item)
        delete_s3_object(item.get("s3Key") if item else None)
        db_delete(pk=pk, sk=f"SDOC#{subject_id}#{doc_id}")
        db_delete(pk=pk, sk=f"CHAT#DOC#{doc_id}")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sdocs/analyze")
async def analyze_sdoc(
    request: Request,
    user=Depends(enforce_ai_limits)
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
        matches = []
        if vector_store.should_query() and item.get("embeddingStatus") == "ready":
            matches = vector_store.query_document_chunks(
                client, user_id=user["sub"], doc_id=doc_id,
                question="main topics chapters concepts definitions formulas", top_k=8
            )
        context = format_vector_context(matches) if matches else extracted_text[:ANALYSIS_CONTEXT_CHARS]
        system_prompt = """You are an expert academic study planner. Respond ONLY with valid JSON (no markdown):
{
  "studyPlan": {"title":"","totalEstimatedHours":10,"topics":[{"name":"","estimatedHours":2,"priority":"high","keyPoints":[],"order":1}]},
  "examSummary": {"title":"","sections":[{"heading":"","content":"","keyTerms":[],"importantFormulas":[],"examTips":[]}]}
}"""
        response = client.chat.completions.create(
            model="gpt-4o-mini", temperature=0.3, max_tokens=8000,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Study material:\n\n{context}"}
            ]
        )
        raw = response.choices[0].message.content
        ai_results = parse_json_response(raw) or {"raw": raw}
        db_put(pk=pk, sk=f"SDOC#{subject_id}#{doc_id}", data={**strip_dynamo_keys(item), "aiResults": ai_results})
        return {"success": True, "aiResults": ai_results, "retrieval": "vector" if matches else "legacy"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Subject Notes

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



# ── Generate Notes Endpoint ───────────────────────────────────────────────────

class GenerateNotesRequest(BaseModel):
    extractedText: str
    fileName: str


class GenerateQuizRequest(BaseModel):
    extractedText: str
    fileName: Optional[str] = "document"
    count: Optional[int] = 8


@app.post("/api/generate-notes")
async def generate_notes(
    request: Request,
    body: GenerateNotesRequest,
    user=Depends(enforce_ai_limits)
):
    """
    Generate structured study notes from document text.
    Returns HTML string ready to inject into contentEditable editor.
    Format: H3 headings per topic + UL bullet points under each.
    """
    try:
        if not body.extractedText or len(body.extractedText) < 10:
            raise HTTPException(status_code=400, detail="Document text too short")

        enforce_text_limit(body.extractedText)
        client = get_openai_client()

        # For notes we want COMPLETE, faithful coverage of the document rather
        # than a query-filtered RAG subset (which drops content the query didn't
        # match). gpt-4o-mini's 128k-token window comfortably fits the full text,
        # so feed it directly, bounded by NOTES_CONTEXT_CHARS.
        context = body.extractedText.strip()[:NOTES_CONTEXT_CHARS]
        truncated = len(body.extractedText.strip()) > NOTES_CONTEXT_CHARS

        system_prompt = """You are an expert academic note-taker. Produce detailed, exam-ready study notes from the provided study material.

Format your response as valid HTML using ONLY these tags:
- <h3> for topic/section headings
- <ul> and <li> for bullet points under each heading
- <strong> for key terms, names, and important words within bullets
- <em> for light emphasis

Accuracy and coverage rules (critical):
- Cover the ENTIRE document. Work through it top to bottom and create a heading for every major topic or section present — do not skip material.
- Follow the document's own logical order.
- Be FAITHFUL to the source. Only include facts, definitions, and formulas that appear in or directly follow from the material. Never invent facts, numbers, dates, or citations.
- Reproduce every formula, equation, and definition EXACTLY as written; do not simplify or paraphrase symbols. For each formula, add a bullet explaining what each variable means.
- Preserve important numbers, units, conditions, and edge cases.
- Prefer specific, complete sentences over vague fragments. Each bullet should stand on its own for revision.

Structure rules:
- Create as many <h3> sections as the content needs (typically 5-12 for a full document).
- Each section should have 4-10 detailed bullet points.
- Do NOT include markdown, backticks, code fences, or any text outside the HTML.
- Start directly with the first <h3> tag.

Example format:
<h3>Topic Name</h3>
<ul>
<li><strong>Key Term:</strong> Detailed explanation of the concept with context.</li>
<li>Another important point with enough detail to be useful for revision.</li>
</ul>"""

        user_prompt = (
            f"Generate comprehensive, faithful study notes from this material "
            f"({body.fileName}). Cover every section in order.\n\n"
        )
        if truncated:
            user_prompt += (
                "NOTE: The material is long and has been truncated; summarize the "
                "portion provided as completely as possible.\n\n"
            )
        user_prompt += context

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            max_tokens=4000,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]
        )

        html_notes = response.choices[0].message.content.strip()

        # Safety: ensure we only have valid HTML, strip any markdown fences
        import re as re_module
        html_notes = re_module.sub(r'```[\w]*\n?', '', html_notes).strip()

        return {"success": True, "html": html_notes, "truncated": truncated}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate-quiz")
async def generate_quiz(
    request: Request,
    body: GenerateQuizRequest,
    user=Depends(enforce_ai_limits)
):
    try:
        if not body.extractedText or len(body.extractedText) < 10:
            raise HTTPException(status_code=400, detail="Document text too short")

        client = get_openai_client()
        # Feed the whole document (bounded) so the quiz can cover all of it,
        # instead of a narrow RAG slice that misses most sections.
        context = body.extractedText.strip()[:QUIZ_CONTEXT_CHARS]
        count = max(3, min(15, body.count or 8))
        system_prompt = (
            "You are an expert assessment writer. Create a high-quality quiz that "
            "tests genuine understanding of the provided document.\n"
            + DOC_ADAPTIVE_PREAMBLE + "\n" + GROUNDING_RULES + "\n"
            "Guidelines:\n"
            "- Vary the question styles: definitions, conceptual understanding, "
            "application/scenario, and analysis. Where multiple choice fits, embed "
            "the options (A, B, C, D) directly in the question text and put the "
            "correct option in the answer field.\n"
            "- Spread difficulty roughly evenly across easy, medium, and hard.\n"
            "- Every answer must be fully supported by the document. Give a clear, "
            "self-contained answer plus a short explanation grounded in the text.\n"
            "- Do not ask about trivia, page numbers, or formatting.\n"
            "Respond ONLY with valid JSON in this exact shape:\n"
            "{\n"
            '  "questions": [\n'
            "    {\n"
            '      "type": "short_answer | mcq | true_false | conceptual",\n'
            '      "question": "Question text (include A/B/C/D options here if mcq)",\n'
            '      "answer": "Correct, self-contained answer",\n'
            '      "explanation": "Why this is correct, grounded in the document",\n'
            '      "difficulty": "easy | medium | hard"\n'
            "    }\n"
            "  ]\n"
            "}"
        )
        user_prompt = f'Create {count} questions from the document "{body.fileName}".\n\n{context}'
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.35,
            max_tokens=4000,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]
        )
        raw = response.choices[0].message.content
        quiz = parse_json_response(raw) or {"questions": [], "raw": raw}
        if not isinstance(quiz.get("questions"), list):
            quiz["questions"] = []
        return {"success": True, "quiz": quiz}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ── Move Document Endpoint ────────────────────────────────────────────────────


# Document chat and vector indexing

@app.post("/api/document-chat")
async def document_chat(
    request: Request,
    body: DocumentChatRequest,
    user=Depends(enforce_ai_limits)
):
    try:
        if not body.question or len(body.question.strip()) < 2:
            raise HTTPException(status_code=400, detail="Question too short")
        if body.sourceType not in {"subject", "chapter"}:
            raise HTTPException(status_code=400, detail="Invalid source type")

        pk = f"USER#{user['sub']}"
        sk = (
            f"SDOC#{body.sourceId}#{body.docId}"
            if body.sourceType == "subject"
            else f"CDOC#{body.sourceId}#{body.docId}"
        )
        item = db_get(pk=pk, sk=sk)
        if not item:
            raise HTTPException(status_code=404, detail="Document not found")

        extracted_text = item.get("extractedText", "")
        if not extracted_text or len(extracted_text) < 10:
            raise HTTPException(status_code=400, detail="Document has no extractable text")

        client = get_openai_client()
        matches = []
        if vector_store.should_query() and item.get("embeddingStatus") == "ready":
            matches = vector_store.query_document_chunks(
                client,
                user_id=user["sub"],
                doc_id=body.docId,
                question=body.question,
                top_k=10,
            )
        context = format_vector_context(matches) if matches else legacy_context_for_document(
            client, extracted_text[:ANALYSIS_CONTEXT_CHARS], body.question, k=10
        )
        if not context:
            context = extracted_text[:20000]

        system_content = (
            "You are a precise, helpful document assistant. "
            + DOC_ADAPTIVE_PREAMBLE
            + " Answer the user's question using ONLY the provided excerpts. Be as "
            "detailed as the question warrants and use headings, bullet points, or "
            "steps when they aid clarity. " + GROUNDING_RULES
        )
        messages = [
            {
                "role": "system",
                "content": system_content,
            }
        ]
        for msg in (body.history or [])[-6:]:
            role = msg.get("role")
            if role == "ai":
                role = "assistant"
            if role in {"user", "assistant"} and msg.get("content"):
                messages.append({"role": role, "content": msg["content"]})
        messages.append({
            "role": "user",
            "content": f"Document: {item.get('fileName', 'Unknown')}\n\nRelevant excerpts:\n\n{context}\n\nQuestion: {body.question}"
        })

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            max_tokens=1400,
            messages=messages,
        )
        return {
            "success": True,
            "answer": response.choices[0].message.content,
            "sources": vector_sources(matches),
            "retrieval": "vector" if matches else "legacy",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/vectors/reindex")
async def reindex_document(
    request: Request,
    body: VectorReindexRequest,
    user=Depends(get_current_user)
):
    try:
        if body.sourceType not in {"subject", "chapter"}:
            raise HTTPException(status_code=400, detail="Invalid source type")
        pk = f"USER#{user['sub']}"
        sk = (
            f"SDOC#{body.sourceId}#{body.docId}"
            if body.sourceType == "subject"
            else f"CDOC#{body.sourceId}#{body.docId}"
        )
        item = db_get(pk=pk, sk=sk)
        if not item:
            raise HTTPException(status_code=404, detail="Document not found")
        subject_id = body.sourceId if body.sourceType == "subject" else find_subject_for_chapter(pk, body.sourceId)
        status = index_document_item(
            pk,
            user["sub"],
            sk,
            item,
            location_type=body.sourceType,
            subject_id=subject_id,
            chapter_id=body.sourceId if body.sourceType == "chapter" else None,
        )
        return {"success": True, "docId": body.docId, **status}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/vectors/migrate")
async def migrate_vectors(
    request: Request,
    body: VectorMigrationRequest,
    user=Depends(get_current_user)
):
    try:
        if not vector_store.should_index():
            return {"success": False, "reason": "S3 Vectors indexing is not configured or is disabled."}

        pk = f"USER#{user['sub']}"
        limit = max(1, min(int(body.limit or 10), 25))
        candidates = []
        for item in db_query(pk=pk, sk_prefix="SDOC#"):
            candidates.append(("subject", item.get("subjectId"), None, f"SDOC#{item.get('subjectId')}#{item.get('docId')}", item))
        for item in db_query(pk=pk, sk_prefix="CDOC#"):
            candidates.append((
                "chapter",
                find_subject_for_chapter(pk, item.get("chapterId")),
                item.get("chapterId"),
                f"CDOC#{item.get('chapterId')}#{item.get('docId')}",
                item,
            ))

        processed = []
        failed = []
        for location_type, subject_id, chapter_id, sk, item in candidates:
            if len(processed) >= limit:
                break
            if item.get("embeddingStatus") == "ready" and item.get("contentHash") == vector_store.content_hash(item.get("extractedText", "")):
                continue
            status = index_document_item(
                pk,
                user["sub"],
                sk,
                item,
                location_type=location_type,
                subject_id=subject_id,
                chapter_id=chapter_id,
            )
            record = {"docId": item.get("docId"), "fileName": item.get("fileName"), **status}
            processed.append(record)
            if status.get("embeddingStatus") == "failed":
                failed.append(record)

        return {
            "success": True,
            "processed": processed,
            "failed": failed,
            "limit": limit,
            "remainingHint": max(len(candidates) - len(processed), 0),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class MoveDocRequest(BaseModel):
    docId: str
    # Source
    sourceType: str        # "subject" or "chapter"
    sourceId: str          # subjectId or chapterId
    # Destination
    destType: str          # "subject" or "chapter"
    destId: str            # subjectId or chapterId
    # Needed to reconstruct dest subjectId for chapters
    destSubjectId: Optional[str] = None


@app.post("/api/docs/move")
async def move_doc(
    request: Request,
    body: MoveDocRequest,
    user=Depends(get_current_user)
):
    """
    Move a document from one location to another.
    Copies the full document item to the new key, then deletes the old key.
    Works for: subject→subject, subject→chapter, chapter→subject, chapter→chapter
    """
    try:
        pk = f"USER#{user['sub']}"
        if body.sourceType not in {"subject", "chapter"} or body.destType not in {"subject", "chapter"}:
            raise HTTPException(status_code=400, detail="Invalid source or destination type")
        if body.sourceType == body.destType and body.sourceId == body.destId:
            raise HTTPException(status_code=400, detail="Document is already in this location")

        if body.destType == "subject":
            if not db_get(pk=pk, sk=f"SUBJECT#{body.destId}"):
                raise HTTPException(status_code=404, detail="Destination subject not found")
        else:
            if not body.destSubjectId:
                raise HTTPException(status_code=400, detail="Destination subject is required")
            if not db_get(pk=pk, sk=f"CHAPTER#{body.destSubjectId}#{body.destId}"):
                raise HTTPException(status_code=404, detail="Destination chapter not found")

        # Read source document
        if body.sourceType == "subject":
            src_sk = f"SDOC#{body.sourceId}#{body.docId}"
        else:
            src_sk = f"CDOC#{body.sourceId}#{body.docId}"

        item = db_get(pk=pk, sk=src_sk)
        if not item:
            raise HTTPException(status_code=404, detail="Source document not found")

        # Write to destination
        new_doc_id = body.docId  # Keep same docId
        if body.destType == "subject":
            dest_sk = f"SDOC#{body.destId}#{new_doc_id}"
            new_data = {**item, "subjectId": body.destId, "chapterId": None}
            # Remove chapterId key if present
            new_data.pop("chapterId", None)
            vector_location = {"location_type": "subject", "subject_id": body.destId, "chapter_id": None}
        else:
            dest_sk = f"CDOC#{body.destId}#{new_doc_id}"
            new_data = {**item, "chapterId": body.destId}
            new_data.pop("subjectId", None)
            vector_location = {"location_type": "chapter", "subject_id": body.destSubjectId, "chapter_id": body.destId}

        # Remove PK/SK from data dict before putting
        new_data.pop("PK", None)
        new_data.pop("SK", None)
        new_data.pop("updatedAt", None)

        if item.get("chunkCount"):
            vector_store.update_document_location(
                user_id=user["sub"],
                doc_id=new_doc_id,
                chunk_count=int(item.get("chunkCount") or 0),
                version=int(item.get("embeddingVersion") or vector_store.EMBEDDING_VERSION),
                **vector_location,
            )

        db_put(pk=pk, sk=dest_sk, data=new_data)

        # Delete source
        db_delete(pk=pk, sk=src_sk)

        return {"success": True, "docId": new_doc_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ── Global Chatbot ────────────────────────────────────────────────────────────

class GlobalChatRequest(BaseModel):
    question: str
    history: Optional[List[dict]] = []  # [{role, content}] for context


@app.post("/api/global-chat")
async def global_chat(
    request: Request,
    body: GlobalChatRequest,
    user=Depends(enforce_ai_limits)
):
    """
    Global chatbot — searches across ALL documents in the user's library.
    
    Strategy:
    1. Load all subject-level docs (SDOC#) and chapter-level docs (CDOC#)
    2. Embed the question
    3. For each doc that has extractedText, compute cosine similarity
    4. Take top chunks across all docs (cross-document RAG)
    5. Pass to GPT-4o mini with source attribution
    """
    try:
        if not body.question or len(body.question.strip()) < 2:
            raise HTTPException(status_code=400, detail="Question too short")

        pk = f"USER#{user['sub']}"
        client = get_openai_client()

        if vector_store.should_query():
            matches = vector_store.query_document_chunks(
                client,
                user_id=user["sub"],
                question=body.question,
                top_k=12,
            )
            context = format_vector_context(matches)
            if context:
                messages = [
                    {
                        "role": "system",
                        "content": (
                            "You are a precise, helpful assistant with access to the "
                            "user's entire document library. " + DOC_ADAPTIVE_PREAMBLE
                            + " Answer using ONLY the provided excerpts and always name "
                            "the document(s) your answer draws from. If the answer spans "
                            "multiple documents, synthesize them clearly. " + GROUNDING_RULES
                        ),
                    }
                ]
                for msg in (body.history or [])[-6:]:
                    if msg.get("role") in ("user", "assistant"):
                        messages.append({"role": msg["role"], "content": msg["content"]})
                messages.append({
                    "role": "user",
                    "content": f"Document excerpts from my library:\n\n{context}\n\nQuestion: {body.question}"
                })
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    temperature=0.3,
                    max_tokens=1400,
                    messages=messages
                )
                return {
                    "success": True,
                    "answer": response.choices[0].message.content,
                    "sources": vector_sources(matches),
                    "retrieval": "vector",
                }

        # Load all documents across the library
        all_docs = []

        # Subject-level docs
        sdoc_items = db_query(pk=pk, sk_prefix="SDOC#")
        for item in sdoc_items:
            text = item.get("extractedText", "")
            if text and len(text) > 50:
                all_docs.append({
                    "docId": item.get("docId", "unknown"),
                    "fileName": item.get("fileName", "Unknown"),
                    "text": text[:12000],  # cap per doc
                })

        # Chapter-level docs
        cdoc_items = db_query(pk=pk, sk_prefix="CDOC#")
        for item in cdoc_items:
            text = item.get("extractedText", "")
            if text and len(text) > 50:
                all_docs.append({
                    "docId": item.get("docId", "unknown"),
                    "fileName": item.get("fileName", "Unknown"),
                    "text": text[:12000],
                })

        if not all_docs:
            return {
                "success": True,
                "answer": "I don't have any documents to search through yet. Upload some PDFs to your Library first, then I can answer questions about them.",
                "sources": []
            }

        # Embed question
        q_embedding = embed_texts(client, [body.question])[0]

        # For each doc, reuse cached chunk embeddings and keep its top chunks
        best_chunks = []
        for doc in all_docs:
            try:
                chunks, embeddings = _lib_cache_get_or_embed(
                    client, user["sub"], doc["docId"], doc["text"]
                )
                if not chunks or embeddings is None:
                    continue
                scores = cosine_similarity(q_embedding, embeddings)
                # keep this document's top few chunks, not just the single best
                order = np.argsort(scores)[::-1][:3]
                for idx in order:
                    best_chunks.append({
                        "fileName": doc["fileName"],
                        "chunk": chunks[int(idx)],
                        "score": float(scores[int(idx)]),
                    })
            except Exception:
                continue

        # Sort by relevance across the whole library, keep the strongest excerpts
        best_chunks.sort(key=lambda x: x["score"], reverse=True)
        top_chunks = best_chunks[:10]

        if not top_chunks:
            return {
                "success": True,
                "answer": "I couldn't find relevant information for your question in your library.",
                "sources": []
            }

        # Build context with source attribution
        context_parts = []
        sources = []
        for ch in top_chunks:
            context_parts.append(f"[From: {ch['fileName']}]\n{ch['chunk']}")
            if ch["fileName"] not in sources:
                sources.append(ch["fileName"])

        context = "\n\n---\n\n".join(context_parts)

        # Build message history for multi-turn context
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a precise, helpful assistant with access to the "
                    "user's entire document library. " + DOC_ADAPTIVE_PREAMBLE
                    + " Answer using ONLY the provided excerpts and always name "
                    "the document(s) your answer draws from. If the answer spans "
                    "multiple documents, synthesize them clearly. " + GROUNDING_RULES
                ),
            }
        ]

        # Add recent history (last 6 messages for context)
        for msg in (body.history or [])[-6:]:
            if msg.get("role") in ("user", "assistant"):
                messages.append({"role": msg["role"], "content": msg["content"]})

        messages.append({
            "role": "user",
            "content": f"Document excerpts from my library:\n\n{context}\n\nQuestion: {body.question}"
        })

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            max_tokens=1400,
            messages=messages
        )

        answer = response.choices[0].message.content
        return {"success": True, "answer": answer, "sources": sources}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ── Semantic Search ───────────────────────────────────────────────────────────

class SemanticSearchRequest(BaseModel):
    query: str
    topK: Optional[int] = 8
    docId: Optional[str] = None  # optional: restrict to a single document


@app.post("/api/search")
async def semantic_search(
    request: Request,
    body: SemanticSearchRequest,
    user=Depends(enforce_ai_limits),
):
    """Semantic search across the user's library (or a single document).

    Returns ranked passages with a snippet, source document, and score.
    Uses the S3 Vectors index when available and falls back to the cached
    in-memory cosine path otherwise.
    """
    try:
        query = (body.query or "").strip()
        if len(query) < 2:
            raise HTTPException(status_code=400, detail="Query too short")
        top_k = max(1, min(20, body.topK or 8))
        pk = f"USER#{user['sub']}"
        client = get_openai_client()

        # Preferred path: S3 Vectors semantic index.
        if vector_store.should_query():
            matches = vector_store.query_document_chunks(
                client,
                user_id=user["sub"],
                question=query,
                doc_id=body.docId,
                top_k=top_k,
            )
            if matches:
                results = []
                for m in matches:
                    distance = m.get("distance")
                    results.append({
                        "fileName": m.get("fileName", "Unknown"),
                        "docId": m.get("docId"),
                        "chunkIndex": m.get("chunkIndex"),
                        "snippet": (m.get("text", "") or "")[:400],
                        "score": round(1.0 - float(distance), 4) if distance is not None else None,
                    })
                return {"success": True, "results": results, "retrieval": "vector"}

        # Fallback: cached in-memory cosine over stored document text.
        docs = []
        for prefix in ("SDOC#", "CDOC#"):
            for item in db_query(pk=pk, sk_prefix=prefix):
                if body.docId and item.get("docId") != body.docId:
                    continue
                text = item.get("extractedText", "")
                if text and len(text) > 50:
                    docs.append({
                        "docId": item.get("docId", "unknown"),
                        "fileName": item.get("fileName", "Unknown"),
                        "text": text[:12000],
                    })
        if not docs:
            return {"success": True, "results": [], "retrieval": "legacy"}

        q_vec = embed_texts(client, [query])[0]
        scored = []
        for d in docs:
            chunks, embeddings = _lib_cache_get_or_embed(client, user["sub"], d["docId"], d["text"])
            if not chunks or embeddings is None:
                continue
            sims = cosine_similarity(q_vec, embeddings)
            order = np.argsort(sims)[::-1][:3]
            for idx in order:
                scored.append({
                    "fileName": d["fileName"],
                    "docId": d["docId"],
                    "chunkIndex": int(idx),
                    "snippet": chunks[int(idx)][:400],
                    "score": round(float(sims[int(idx)]), 4),
                })
        scored.sort(key=lambda x: x["score"], reverse=True)
        return {"success": True, "results": scored[:top_k], "retrieval": "legacy"}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Search failed")


# ── Usage & Library Stats ─────────────────────────────────────────────────────

@app.get("/api/usage")
async def usage_stats(request: Request, user=Depends(get_current_user)):
    """Per-user AI usage (against the daily quota) plus library counts, for a
    stats/observability dashboard."""
    try:
        from datetime import timedelta

        pk = f"USER#{user['sub']}"

        # AI usage for the last 7 days (UTC), oldest first.
        days = []
        week_total = 0
        for i in range(6, -1, -1):
            day = (datetime.utcnow() - timedelta(days=i)).strftime("%Y-%m-%d")
            item = db_get(pk=pk, sk=f"USAGE#AI#{day}")
            count = int(item.get("count", 0)) if item else 0
            week_total += count
            days.append({"date": day, "count": count})
        today_count = days[-1]["count"] if days else 0

        subjects = db_query(pk=pk, sk_prefix="SUBJECT#")
        chapters = db_query(pk=pk, sk_prefix="CHAPTER#")
        sdocs = db_query(pk=pk, sk_prefix="SDOC#")
        cdocs = db_query(pk=pk, sk_prefix="CDOC#")
        indexed = sum(1 for d in (sdocs + cdocs) if d.get("embeddingStatus") == "ready")

        return {
            "success": True,
            "ai": {
                "today": today_count,
                "dailyQuota": AI_DAILY_QUOTA,
                "remainingToday": max(0, AI_DAILY_QUOTA - today_count),
                "weekTotal": week_total,
                "last7Days": days,
            },
            "library": {
                "subjects": len(subjects),
                "chapters": len(chapters),
                "documents": len(sdocs) + len(cdocs),
                "indexedDocuments": indexed,
            },
        }
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load usage stats")


# ── Export All Data ───────────────────────────────────────────────────────────

@app.get("/api/export")
async def export_all_data(
    request: Request,
    user=Depends(get_current_user)
):
    """
    Export all user data as a structured JSON payload.
    Frontend converts this to a formatted PDF using jsPDF.
    Returns: subjects, chapters, docs (with aiResults), notes.
    """
    try:
        pk = f"USER#{user['sub']}"

        # Load subjects
        subjects = db_query(pk=pk, sk_prefix="SUBJECT#")
        subjects = sorted(subjects, key=lambda x: x.get("order", 0))

        # Load all chapters
        all_chapters = db_query(pk=pk, sk_prefix="CHAPTER#")

        # Load all chapter docs (with full content)
        all_cdocs = db_query(pk=pk, sk_prefix="CDOC#")

        # Load all subject docs
        all_sdocs = db_query(pk=pk, sk_prefix="SDOC#")

        # Load all notes
        cnotes = db_query(pk=pk, sk_prefix="CNOTE#")
        snotes = db_query(pk=pk, sk_prefix="SNOTE#")

        # Build structured export
        export_data = []
        for subject in subjects:
            sid = subject.get("subjectId")

            # Subject-level docs
            sdocs = [d for d in all_sdocs if d.get("subjectId") == sid]

            # Subject-level note
            snote = next((n for n in snotes if n.get("subjectId") == sid), None)

            # Chapters under this subject
            chapters = sorted(
                [c for c in all_chapters if c.get("subjectId") == sid],
                key=lambda x: x.get("order", 0)
            )

            chapter_data = []
            for ch in chapters:
                cid = ch.get("chapterId")
                cdocs = [d for d in all_cdocs if d.get("chapterId") == cid]
                cnote = next((n for n in cnotes if n.get("chapterId") == cid), None)
                chapter_data.append({
                    "name": ch.get("name"),
                    "docs": [
                        {
                            "fileName": d.get("fileName"),
                            "uploadedAt": d.get("uploadedAt"),
                            "hasAiResults": bool(d.get("aiResults")),
                            "aiResults": d.get("aiResults") or {},
                        }
                        for d in cdocs
                    ],
                    "notes": cnote.get("content", "") if cnote else "",
                })

            export_data.append({
                "name": subject.get("name"),
                "color": subject.get("color"),
                "subjectDocs": [
                    {
                        "fileName": d.get("fileName"),
                        "uploadedAt": d.get("uploadedAt"),
                        "hasAiResults": bool(d.get("aiResults")),
                        "aiResults": d.get("aiResults") or {},
                    }
                    for d in sdocs
                ],
                "subjectNotes": snote.get("content", "") if snote else "",
                "chapters": chapter_data,
            })

        return {
            "success": True,
            "exportedAt": datetime.utcnow().isoformat(),
            "userEmail": user.get("email", ""),
            "data": export_data,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ── PDF Upload to S3 ──────────────────────────────────────────────────────────

class UploadPDFRequest(BaseModel):
    fileName: str
    fileBase64: str  # base64-encoded file bytes
    docId: Optional[str] = None
    contentType: Optional[str] = "application/pdf"


@app.post("/api/docs/upload-pdf")
async def upload_pdf(
    request: Request,
    body: UploadPDFRequest,
    user=Depends(get_current_user)
):
    """
    Upload a study document to S3 and return a short-lived view URL.
    Called during document upload flow before saving to DynamoDB.
    """
    try:
        import base64
        try:
            file_bytes = base64.b64decode(body.fileBase64, validate=True)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid file encoding")
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        if len(file_bytes) > 20 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")
        extension = body.fileName.rsplit(".", 1)[-1].lower() if "." in body.fileName else ""
        if extension not in {"pdf", "docx", "txt", "md", "markdown", "png", "jpg", "jpeg", "webp"}:
            raise HTTPException(status_code=400, detail="Unsupported file type")

        # Generate unique S3 key
        doc_id = body.docId or str(uuid_lib.uuid4())[:8]
        safe_name = body.fileName.replace(" ", "_").replace("/", "_")
        s3_key = f"documents/{user['sub']}/{doc_id}/{safe_name}"

        pdf_url = upload_pdf_to_s3(file_bytes, s3_key, body.contentType or "application/octet-stream")

        return {"success": True, "pdfUrl": pdf_url, "docId": doc_id, "s3Key": s3_key}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"PDF upload error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def health():
    return {"status": "StudyFlow RAG backend running", "version": "2.0"}

