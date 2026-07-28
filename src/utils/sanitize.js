/**
 * =====================================================
 * sanitize.js — HTML sanitization for notes content
 * =====================================================
 * Notes HTML comes from two untrusted-ish sources:
 *   1. AI-generated notes (derived from arbitrary uploaded documents)
 *   2. User-edited contentEditable HTML persisted in DynamoDB
 * Both are rendered via innerHTML / dangerouslySetInnerHTML, so they must be
 * sanitized to prevent stored XSS.
 */

import DOMPurify from 'dompurify';

// Allowlist matching the tags the notes editor produces and accepts.
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'p', 'br',
  'ul', 'ol', 'li',
  'strong', 'b', 'em', 'i', 'u',
  'a', 'pre', 'code', 'blockquote', 'span',
];

const ALLOWED_ATTR = ['href', 'target', 'rel'];

// Force external links to be safe (no reverse-tabnabbing, no javascript: URLs —
// DOMPurify already strips dangerous protocols).
if (typeof DOMPurify.addHook === 'function') {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

/**
 * Sanitize notes HTML against the allowlist above.
 * @param {string} dirty - Untrusted HTML string
 * @returns {string} Safe HTML string
 */
export function sanitizeNotesHtml(dirty) {
  if (!dirty) return '';
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}
