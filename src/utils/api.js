/**
 * =====================================================
 * api.js — Centralized API Client
 * =====================================================
 * All calls to the Render backend go through this file.
 * Automatically attaches the Cognito JWT to every request.
 *
 * Think of this like a post office clerk who always stamps
 * "Return address: USER#{sub}" on every envelope before
 * sending it — no endpoint has to think about auth itself.
 */

const BASE_URL = 'https://studyflow-rag-backend.onrender.com';

// getToken is injected at app startup from AuthContext
// This avoids circular imports (api.js can't import React hooks)
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

// ── RAG (existing v1 endpoint — unchanged) ────────────────────────────────────

export async function callRAG({ extractedText, action, question }) {
  // This endpoint does NOT require auth (v1 compatible)
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
