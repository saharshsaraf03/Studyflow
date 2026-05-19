import os
import json
import re
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

app = FastAPI()

# CORS — allow the StudyFlow frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request model ─────────────────────────────────────────────
class RequestBody(BaseModel):
    extractedText: str
    action: str  # "generate_plan" or "chat"
    question: Optional[str] = None

# ── RAG core ──────────────────────────────────────────────────
def build_faiss_index(text: str):
    """Chunk text and build a FAISS vector index using HuggingFace embeddings."""
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
    """Retrieve top-k most relevant chunks for a given query."""
    docs = vectorstore.similarity_search(query, k=k)
    return "\n\n".join([doc.page_content for doc in docs])

# ── Route ─────────────────────────────────────────────────────
@app.post("/")
async def handle(body: RequestBody):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {"error": "OPENAI_API_KEY not configured"}

    if not body.extractedText or len(body.extractedText) < 10:
        return {"error": "Extracted text is too short."}

    # Build FAISS index from the uploaded PDF text
    vectorstore = build_faiss_index(body.extractedText)

    llm = ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0.3,
        max_tokens=4000,
        api_key=api_key
    )

    # ── generate_plan ─────────────────────────────────────────
    if body.action == "generate_plan":
        # Retrieve most relevant chunks for planning
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

    # ── chat ──────────────────────────────────────────────────
    elif body.action == "chat":
        if not body.question:
            return {"error": "Missing question field."}

        # Retrieve chunks most relevant to the user's question
        context = retrieve_relevant_chunks(
            vectorstore,
            query=body.question,
            k=6
        )

        messages = [
            SystemMessage(content="You are a helpful study assistant. Answer questions based ONLY on the provided study material. If the answer is not in the material, say so. Be concise but thorough. Include relevant formulas, definitions, or examples when applicable."),
            HumanMessage(content=f"Study material (retrieved via RAG):\n\n{context}\n\nQuestion: {body.question}")
        ]

        response = llm.invoke(messages)
        return {"success": True, "answer": response.content}

    return {"error": "Invalid action. Use 'generate_plan' or 'chat'."}

# ── Health check ──────────────────────────────────────────────
@app.get("/")
async def health():
    return {"status": "StudyFlow RAG backend running"}