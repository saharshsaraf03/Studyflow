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
  const response = await fetch(`${BASE_URL}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extractedText, action, question }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Server error (${response.status})`);
  }
  return response.json();
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

export async function saveCDoc({ docId, chapterId, fileName, fileSize, extractedText, aiResults }) {
  return apiFetch('/api/cdocs/save', {
    method: 'POST',
    body: JSON.stringify({ docId, chapterId, fileName, fileSize, extractedText, aiResults }),
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

export async function saveSDoc({ docId, subjectId, fileName, fileSize, extractedText, aiResults }) {
  return apiFetch('/api/sdocs/save', {
    method: 'POST',
    body: JSON.stringify({ docId, subjectId, fileName, fileSize, extractedText, aiResults }),
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

// ── Move Document ─────────────────────────────────────────────────────────────

export async function moveDoc({ docId, sourceType, sourceId, destType, destId, destSubjectId }) {
  return apiFetch('/api/docs/move', {
    method: 'POST',
    body: JSON.stringify({ docId, sourceType, sourceId, destType, destId, destSubjectId }),
  });
}
