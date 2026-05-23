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

/**
 * Core fetch wrapper — attaches auth header and handles errors uniformly.
 */
async function apiFetch(path, options = {}) {
  const token = _getToken ? await _getToken() : null;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

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

// ── RAG — with cold-start warmup ──────────────────────────────────────────────
/**
 * Render free tier spins down after 15 min inactivity.
 * On a cold start the first request gets a 502 while the server wakes up.
 * Strategy: ping the health endpoint first (fast, lightweight).
 * If it fails, wait 8 seconds and retry once before giving up.
 * This way the user sees the loading spinner instead of an error.
 */
async function warmBackendIfNeeded() {
  try {
    const res = await fetch(`${BASE_URL}/`, { method: 'GET' });
    if (res.ok) return; // already warm
    // 502 or 503 — server is waking up, wait and retry
    await new Promise(r => setTimeout(r, 8000));
    await fetch(`${BASE_URL}/`, { method: 'GET' });
  } catch {
    // Network error — also wait and retry
    await new Promise(r => setTimeout(r, 8000));
    try { await fetch(`${BASE_URL}/`, { method: 'GET' }); } catch { /* ignore */ }
  }
}

export async function callRAG({ extractedText, action, question }) {
  // Warm the backend before the heavy RAG request
  await warmBackendIfNeeded();

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