import hashlib
import os
from datetime import datetime
from typing import List, Optional

import boto3


VECTOR_REGION = os.environ.get("S3_VECTOR_REGION", "ap-south-1")
VECTOR_BUCKET = os.environ.get("S3_VECTOR_BUCKET", "")
VECTOR_INDEX = os.environ.get("S3_VECTOR_INDEX", "")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIMENSIONS = int(os.environ.get("EMBEDDING_DIMENSIONS", "1536"))
EMBEDDING_VERSION = int(os.environ.get("EMBEDDING_VERSION", "1"))
VECTOR_RAG_ENABLED = os.environ.get("VECTOR_RAG_ENABLED", "false").lower() == "true"
VECTOR_INDEXING_ENABLED = os.environ.get("VECTOR_INDEXING_ENABLED", "true").lower() == "true"

_s3vectors = None


def is_configured() -> bool:
    return bool(VECTOR_BUCKET and VECTOR_INDEX)


def should_index() -> bool:
    return VECTOR_INDEXING_ENABLED and is_configured()


def should_query() -> bool:
    return VECTOR_RAG_ENABLED and is_configured()


def get_vector_client():
    global _s3vectors
    if _s3vectors is None:
        _s3vectors = boto3.client(
            "s3vectors",
            region_name=VECTOR_REGION,
            aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        )
    return _s3vectors


def content_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def chunk_text(text: str, target_words: int = 400, overlap_words: int = 60) -> List[dict]:
    words = (text or "").split()
    if not words:
        return []

    chunks = []
    start = 0
    while start < len(words):
        end = min(start + target_words, len(words))
        chunk = " ".join(words[start:end]).strip()
        if len(chunk) > 40:
            chunks.append({"chunkIndex": len(chunks), "text": chunk})
        if end == len(words):
            break
        start = max(end - overlap_words, start + 1)
    return chunks


def embed_texts(openai_client, texts: List[str], batch_size: int = 100) -> List[List[float]]:
    vectors = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start:start + batch_size]
        response = openai_client.embeddings.create(
            model=EMBEDDING_MODEL,
            dimensions=EMBEDDING_DIMENSIONS,
            input=batch,
        )
        vectors.extend([item.embedding for item in response.data])
    return vectors


def vector_key(user_id: str, doc_id: str, chunk_index: int, version: int = EMBEDDING_VERSION) -> str:
    user_hash = hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:16]
    return f"u{user_hash}:d{doc_id}:v{version}:c{chunk_index:06d}"


def vector_keys(user_id: str, doc_id: str, chunk_count: int, version: int = EMBEDDING_VERSION) -> List[str]:
    return [vector_key(user_id, doc_id, i, version) for i in range(max(int(chunk_count or 0), 0))]


def _index_args() -> dict:
    return {"vectorBucketName": VECTOR_BUCKET, "indexName": VECTOR_INDEX}


def _put_batches(vectors: List[dict], batch_size: int = 500):
    client = get_vector_client()
    for start in range(0, len(vectors), batch_size):
        client.put_vectors(**_index_args(), vectors=vectors[start:start + batch_size])


def delete_document_vectors(
    user_id: str,
    doc_id: str,
    chunk_count: int,
    version: int = EMBEDDING_VERSION,
):
    if not is_configured() or not chunk_count:
        return
    client = get_vector_client()
    keys = vector_keys(user_id, doc_id, int(chunk_count or 0), int(version or EMBEDDING_VERSION))
    for start in range(0, len(keys), 500):
        client.delete_vectors(**_index_args(), keys=keys[start:start + 500])


def index_document(
    openai_client,
    *,
    user_id: str,
    doc_id: str,
    file_name: str,
    extracted_text: str,
    location_type: str,
    subject_id: Optional[str] = None,
    chapter_id: Optional[str] = None,
    previous_chunk_count: int = 0,
    previous_version: int = EMBEDDING_VERSION,
) -> dict:
    if not should_index():
        return {"embeddingStatus": "disabled"}

    chunks = chunk_text(extracted_text)
    if not chunks:
        return {
            "embeddingStatus": "skipped",
            "embeddingModel": EMBEDDING_MODEL,
            "embeddingDimensions": EMBEDDING_DIMENSIONS,
            "embeddingVersion": EMBEDDING_VERSION,
            "chunkCount": 0,
            "contentHash": content_hash(extracted_text),
            "indexedAt": datetime.utcnow().isoformat(),
        }

    embeddings = embed_texts(openai_client, [chunk["text"] for chunk in chunks])
    records = []
    for chunk, embedding in zip(chunks, embeddings):
        metadata = {
            "userId": user_id,
            "docId": doc_id,
            "locationType": location_type,
            "chunkIndex": chunk["chunkIndex"],
            "embeddingVersion": EMBEDDING_VERSION,
            "fileName": file_name or "Untitled document",
            "text": chunk["text"],
        }
        if subject_id:
            metadata["subjectId"] = subject_id
        if chapter_id:
            metadata["chapterId"] = chapter_id

        records.append({
            "key": vector_key(user_id, doc_id, chunk["chunkIndex"], EMBEDDING_VERSION),
            "data": {"float32": embedding},
            "metadata": metadata,
        })

    _put_batches(records)

    if previous_version and int(previous_version) != EMBEDDING_VERSION:
        delete_document_vectors(user_id, doc_id, previous_chunk_count, int(previous_version))
    elif previous_chunk_count and int(previous_chunk_count) > len(chunks):
        stale_keys = [
            vector_key(user_id, doc_id, i, EMBEDDING_VERSION)
            for i in range(len(chunks), int(previous_chunk_count))
        ]
        client = get_vector_client()
        for start in range(0, len(stale_keys), 500):
            client.delete_vectors(**_index_args(), keys=stale_keys[start:start + 500])

    return {
        "embeddingStatus": "ready",
        "embeddingModel": EMBEDDING_MODEL,
        "embeddingDimensions": EMBEDDING_DIMENSIONS,
        "embeddingVersion": EMBEDDING_VERSION,
        "chunkCount": len(chunks),
        "contentHash": content_hash(extracted_text),
        "indexedAt": datetime.utcnow().isoformat(),
        "embeddingError": "",
    }


def _metadata_filter(user_id: str, doc_id: Optional[str] = None) -> dict:
    clauses = [
        {"userId": {"$eq": user_id}},
        {"embeddingVersion": {"$eq": EMBEDDING_VERSION}},
    ]
    if doc_id:
        clauses.append({"docId": {"$eq": doc_id}})
    return {"$and": clauses} if len(clauses) > 1 else clauses[0]


def query_document_chunks(
    openai_client,
    *,
    user_id: str,
    question: str,
    doc_id: Optional[str] = None,
    top_k: int = 8,
) -> List[dict]:
    if not should_query():
        return []
    query_vector = embed_texts(openai_client, [question], batch_size=1)[0]
    response = get_vector_client().query_vectors(
        **_index_args(),
        topK=top_k,
        queryVector={"float32": query_vector},
        filter=_metadata_filter(user_id, doc_id),
        returnMetadata=True,
        returnDistance=True,
    )
    matches = []
    for item in response.get("vectors", []) or []:
        metadata = item.get("metadata") or {}
        if metadata.get("userId") != user_id:
            continue
        matches.append({
            "key": item.get("key"),
            "distance": item.get("distance"),
            "text": metadata.get("text", ""),
            "fileName": metadata.get("fileName", "Unknown"),
            "docId": metadata.get("docId"),
            "subjectId": metadata.get("subjectId"),
            "chapterId": metadata.get("chapterId"),
            "locationType": metadata.get("locationType"),
            "chunkIndex": metadata.get("chunkIndex"),
        })
    return matches


def update_document_location(
    *,
    user_id: str,
    doc_id: str,
    chunk_count: int,
    location_type: str,
    subject_id: Optional[str] = None,
    chapter_id: Optional[str] = None,
    version: int = EMBEDDING_VERSION,
):
    if not is_configured() or not chunk_count:
        return
    client = get_vector_client()
    keys = vector_keys(user_id, doc_id, int(chunk_count or 0), int(version or EMBEDDING_VERSION))
    updated_records = []
    for start in range(0, len(keys), 100):
        response = client.get_vectors(
            **_index_args(),
            keys=keys[start:start + 100],
            returnData=True,
            returnMetadata=True,
        )
        for vector in response.get("vectors", []) or []:
            metadata = dict(vector.get("metadata") or {})
            metadata["locationType"] = location_type
            metadata.pop("subjectId", None)
            metadata.pop("chapterId", None)
            if subject_id:
                metadata["subjectId"] = subject_id
            if chapter_id:
                metadata["chapterId"] = chapter_id
            updated_records.append({
                "key": vector["key"],
                "data": vector["data"],
                "metadata": metadata,
            })
    if updated_records:
        _put_batches(updated_records)
