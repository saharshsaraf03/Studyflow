/**
 * =====================================================
 * api.js — Centralized API Client
 * =====================================================
 * All calls to the Render backend go through this file.
 * Automatically attaches the Cognito JWT to every request.
 */

const BASE_URL = 'https://studyflow-rag-backend.onrender.com';

let _getToken = null;

export function initApi(getTokenFn) {
  _getToken = getTokenFn;
}

async function apiFetch(path, options = {}) {
  const token = _getToken ? await _getToken() : null;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || body.error || `Server error (${response.status})`);
  }
  return response.json();
}

// ── Planner ───────────────────────────────────────────────────────────────────

export async function savePlanner(planData) {
  return apiFetch('/api/planner/save', {
    method: 'POST',
    body: JSON.stringify({ planData }),
  });
}

export async function loadPlanner() {
  return apiFetch('/api/planner/load');
}

export async function deletePlanner() {
  return apiFetch('/api/planner', { method: 'DELETE' });
}

// ── Documents ─────────────────────────────────────────────────────────────────

export async function saveDocument({ docId, fileName, extractedText, aiResults }) {
  return apiFetch('/api/documents/save', {
    method: 'POST',
    body: JSON.stringify({ docId, fileName, extractedText, aiResults }),
  });
}

export async function listDocuments() {
  return apiFetch('/api/documents/list');
}

export async function getDocument(docId) {
  return apiFetch(`/api/documents/${docId}`);
}

export async function deleteDocument(docId) {
  return apiFetch(`/api/documents/${docId}`, { method: 'DELETE' });
}

// ── Chat History ──────────────────────────────────────────────────────────────

export async function saveChat({ docId, messages }) {
  return apiFetch('/api/chat/save', {
    method: 'POST',
    body: JSON.stringify({ docId: docId || null, messages }),
  });
}

export async function loadChat(docId = null) {
  const query = docId ? `?doc_id=${docId}` : '';
  return apiFetch(`/api/chat/load${query}`);
}

// ── RAG — with robust cold-start handling ─────────────────────────────────────

async function waitForBackend(maxWaitMs = 60000) {
  const start = Date.now();
  const delays = [2000, 3000, 5000, 8000, 10000, 15000, 17000];
  for (const delay of delays) {
    try {
      const res = await fetch(`${BASE_URL}/`, { method: 'GET' });
      if (res.ok) {
        await new Promise(r => setTimeout(r, 1500));
        return;
      }
    } catch { /* server still waking */ }
    if (Date.now() - start + delay > maxWaitMs) break;
    await new Promise(r => setTimeout(r, delay));
  }
}

export async function callRAG({ extractedText, action, question }) {
  await waitForBackend();
  return apiFetch('/', {
    method: 'POST',
    body: JSON.stringify({ extractedText, action, question }),
  });
}

export async function documentChat({ docId, sourceType, sourceId, question, history }) {
  await waitForBackend();
  return apiFetch('/api/document-chat', {
    method: 'POST',
    body: JSON.stringify({ docId, sourceType, sourceId, question, history }),
  });
}

export async function retryVectorIndex({ docId, sourceType, sourceId }) {
  return apiFetch('/api/vectors/reindex', {
    method: 'POST',
    body: JSON.stringify({ docId, sourceType, sourceId }),
  });
}

export async function migrateVectors({ limit = 10 } = {}) {
  return apiFetch('/api/vectors/migrate', {
    method: 'POST',
    body: JSON.stringify({ limit }),
  });
}

// ── Migration ─────────────────────────────────────────────────────────────────

export async function migrateToCloud(planData) {
  return apiFetch('/api/migrate', {
    method: 'POST',
    body: JSON.stringify({ planData }),
  });
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function saveNotes({ subjectName, content }) {
  return apiFetch('/api/notes/save', {
    method: 'POST',
    body: JSON.stringify({ subjectName, content }),
  });
}

export async function loadNotes() {
  return apiFetch('/api/notes/load');
}

// ── Explain ───────────────────────────────────────────────────────────────────

export async function explainText({ selectedText, context }) {
  return apiFetch('/api/explain', {
    method: 'POST',
    body: JSON.stringify({ selectedText, context }),
  });
}

// ── Library: Subjects ─────────────────────────────────────────────────────────

export async function saveSubject({ subjectId, name, order }) {
  return apiFetch('/api/subjects/save', {
    method: 'POST',
    body: JSON.stringify({ subjectId, name, order }),
  });
}

export async function listSubjects() {
  return apiFetch('/api/subjects/list');
}

export async function deleteSubject(subjectId) {
  return apiFetch(`/api/subjects/${subjectId}`, { method: 'DELETE' });
}

// ── Library: Chapters ─────────────────────────────────────────────────────────

export async function saveChapter({ chapterId, subjectId, name, order }) {
  return apiFetch('/api/chapters/save', {
    method: 'POST',
    body: JSON.stringify({ chapterId, subjectId, name, order }),
  });
}

export async function listChapters(subjectId) {
  return apiFetch(`/api/chapters/${subjectId}`);
}

export async function deleteChapter(subjectId, chapterId) {
  return apiFetch(`/api/chapters/${subjectId}/${chapterId}`, { method: 'DELETE' });
}

// ── Library: Chapter Documents ────────────────────────────────────────────────

export async function saveCDoc({ docId, chapterId, fileName, fileSize, extractedText, aiResults, pdfUrl, s3Key }) {
  return apiFetch('/api/cdocs/save', {
    method: 'POST',
    body: JSON.stringify({ docId, chapterId, fileName, fileSize, extractedText, aiResults, pdfUrl, s3Key }),
  });
}

export async function listCDocs(chapterId) {
  return apiFetch(`/api/cdocs/${chapterId}`);
}

export async function getCDoc(chapterId, docId) {
  return apiFetch(`/api/cdocs/${chapterId}/${docId}`);
}

export async function deleteCDoc(chapterId, docId) {
  return apiFetch(`/api/cdocs/${chapterId}/${docId}`, { method: 'DELETE' });
}

export async function analyzeCDoc({ docId, chapterId }) {
  return apiFetch('/api/cdocs/analyze', {
    method: 'POST',
    body: JSON.stringify({ docId, chapterId }),
  });
}

// ── Library: Chapter Notes ────────────────────────────────────────────────────

export async function saveCNote({ chapterId, content }) {
  return apiFetch('/api/cnotes/save', {
    method: 'POST',
    body: JSON.stringify({ chapterId, content }),
  });
}

export async function loadCNote(chapterId) {
  return apiFetch(`/api/cnotes/${chapterId}`);
}

// ── Subject-level Documents (SDOC) ────────────────────────────────────────────

export async function saveSDoc({ docId, subjectId, fileName, fileSize, extractedText, aiResults, pdfUrl, s3Key }) {
  return apiFetch('/api/sdocs/save', {
    method: 'POST',
    body: JSON.stringify({ docId, subjectId, fileName, fileSize, extractedText, aiResults, pdfUrl, s3Key }),
  });
}

export async function listSDocs(subjectId) {
  return apiFetch(`/api/sdocs/${subjectId}`);
}

export async function getSDoc(subjectId, docId) {
  return apiFetch(`/api/sdocs/${subjectId}/${docId}`);
}

export async function deleteSDoc(subjectId, docId) {
  return apiFetch(`/api/sdocs/${subjectId}/${docId}`, { method: 'DELETE' });
}

export async function analyzeSDoc({ subjectId, docId }) {
  return apiFetch('/api/sdocs/analyze', {
    method: 'POST',
    body: JSON.stringify({ subjectId, docId }),
  });
}

// ── Subject-level Notes (SNOTE) ───────────────────────────────────────────────

export async function saveSNote({ subjectId, content }) {
  return apiFetch('/api/snotes/save', {
    method: 'POST',
    body: JSON.stringify({ subjectId, content }),
  });
}

export async function loadSNote(subjectId) {
  return apiFetch(`/api/snotes/${subjectId}`);
}

// ── Generate Notes ────────────────────────────────────────────────────────────

export async function generateNotes({ extractedText, fileName }) {
  return apiFetch('/api/generate-notes', {
    method: 'POST',
    body: JSON.stringify({ extractedText, fileName }),
  });
}

export async function generateQuiz({ extractedText, fileName, count = 8 }) {
  return apiFetch('/api/generate-quiz', {
    method: 'POST',
    body: JSON.stringify({ extractedText, fileName, count }),
  });
}

// ── Move Document ─────────────────────────────────────────────────────────────

export async function moveDoc({ docId, sourceType, sourceId, destType, destId, destSubjectId }) {
  return apiFetch('/api/docs/move', {
    method: 'POST',
    body: JSON.stringify({ docId, sourceType, sourceId, destType, destId, destSubjectId }),
  });
}

// ── Global Chatbot ────────────────────────────────────────────────────────────

export async function globalChat({ question, history }) {
  return apiFetch('/api/global-chat', {
    method: 'POST',
    body: JSON.stringify({ question, history }),
  });
}

export async function saveGlobalChat(messages) {
  return apiFetch('/api/chat/save', {
    method: 'POST',
    body: JSON.stringify({ docId: null, messages }),
  });
}

export async function loadGlobalChat() {
  return apiFetch('/api/chat/load');
}

// ── PDF Upload to S3 ─────────────────────────────────────────────────────────

export async function uploadPdfToS3({ file, docId }) {
  // Convert File to base64
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  return apiFetch('/api/docs/upload-pdf', {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      fileBase64: base64,
      docId,
      contentType: file.type || 'application/octet-stream',
    }),
  });
}

// ── Usage & Stats ─────────────────────────────────────────────────────────────

export async function getUsage() {
  return apiFetch('/api/usage');
}
