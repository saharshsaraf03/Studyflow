import os
import json
import re
import time
from datetime import datetime
from typing import Optional, List

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import jwt as pyjwt
import httpx

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# ── Cognito JWT Validation ─────────────────────────────────────────────────────

COGNITO_USER_POOL_ID = "ap-south-1_5qo8gZ9cS"
COGNITO_REGION = "ap-south-1"
COGNITO_JWKS_URL = (
    f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com"
    f"/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
)

_jwks_cache = None
_jwks_cache_time = 0
JWKS_CACHE_TTL = 3600


async def get_jwks():
    global _jwks_cache, _jwks_cache_time
    now = time.time()
    if _jwks_cache and (now - _jwks_cache_time) < JWKS_CACHE_TTL:
        return _jwks_cache
    async with httpx.AsyncClient() as client:
        resp = await client.get(COGNITO_JWKS_URL)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_cache_time = now
        return _jwks_cache


security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    token = credentials.credentials
    try:
        unverified_header = pyjwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        jwks = await get_jwks()
        public_key = None
        for key in jwks.get("keys", []):
            if key["kid"] == kid:
                public_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key))
                break
        if not public_key:
            raise HTTPException(status_code=401, detail="Invalid token: key not found")
        payload = pyjwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        user_sub = payload.get("sub")
        if not user_sub:
            raise HTTPException(status_code=401, detail="Invalid token: missing sub")
        return {"sub": user_sub, "email": payload.get("email", "")}
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


# ── Request Models ─────────────────────────────────────────────────────────────

class RAGRequestBody(BaseModel):
    extractedText: str
    action: str
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


# ── RAG Helpers (lazy-loaded inside route to avoid import-time crash) ──────────

def build_faiss_index(text: str):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50,
        separators=["\n\n", "\n", ".", " "]
    )
    chunks = splitter.split_text(text)
    embeddings = HuggingFaceEmbeddings(
        model_name="all-MiniLM-L6-v2",
        model_kwargs={"device": "cpu"}
    )
    vectorstore = FAISS.from_texts(chunks, embeddings)
    return vectorstore


def retrieve_relevant_chunks(vectorstore, query: str, k: int = 6) -> str:
    docs = vectorstore.similarity_search(query, k=k)
    return "\n\n".join([doc.page_content for doc in docs])


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


# ── Existing RAG Route (v1 compatible) ────────────────────────────────────────

@app.post("/")
async def handle(request: Request, body: RAGRequestBody):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {"error": "OPENAI_API_KEY not configured"}
    if not body.extractedText or len(body.extractedText) < 10:
        return {"error": "Extracted text is too short."}

    vectorstore = build_faiss_index(body.extractedText)
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0.3,
        max_tokens=4000,
        api_key=api_key
    )

    if body.action == "generate_plan":
        context = retrieve_relevant_chunks(
            vectorstore,
            query="main topics chapters concepts definitions formulas",
            k=8
        )
        system_prompt = """You are an expert academic study planner. Given study material, produce:

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
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Study material (retrieved via RAG):\n\n{context}")
        ]
        response = llm.invoke(messages)
        raw = response.content
        try:
            json_match = re.search(r'\{[\s\S]*\}', raw)
            parsed = json.loads(json_match.group(0))
        except Exception:
            parsed = {"raw": raw}
        return {"success": True, "data": parsed}

    elif body.action == "chat":
        if not body.question:
            return {"error": "Missing question field."}
        context = retrieve_relevant_chunks(vectorstore, query=body.question, k=6)
        messages = [
            SystemMessage(content="You are a helpful study assistant. Answer questions based ONLY on the provided study material. If the answer is not in the material, say so. Be concise but thorough. Include relevant formulas, definitions, or examples when applicable."),
            HumanMessage(content=f"Study material (retrieved via RAG):\n\n{context}\n\nQuestion: {body.question}")
        ]
        response = llm.invoke(messages)
        return {"success": True, "answer": response.content}

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


# ── Health Check ───────────────────────────────────────────────────────────────

@app.get("/")
async def health():
    return {"status": "StudyFlow RAG backend running", "version": "2.0"}