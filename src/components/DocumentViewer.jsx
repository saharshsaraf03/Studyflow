import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import useTextSelection from '../hooks/useTextSelection';
import ExplainPopover from './ExplainPopover';

/**
 * DocumentViewer — renders extractedText with:
 * 1. Topic search: Option C layout (excerpt list left + full text right with highlights)
 * 2. Text selection → ExplainPopover ("Ask AI About This")
 */

const MAX_DISPLAY_CHARS = 50000;
const EXCERPT_CONTEXT_CHARS = 300;
const MAX_EXCERPTS = 5;

/** Score a paragraph by how many query terms it contains */
function scoreChunk(chunk, queryTerms) {
  const lower = chunk.toLowerCase();
  return queryTerms.reduce((acc, term) => {
    const regex = new RegExp(term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    return acc + (lower.match(regex) || []).length;
  }, 0);
}

/** Split raw text into searchable paragraphs */
function splitIntoParagraphs(text) {
  const byDouble = text.split(/\n\n+/);
  if (byDouble.length > 3) return byDouble.filter(p => p.trim().length > 20);
  // Fallback: split into 300-char windows
  const chunks = [];
  for (let i = 0; i < text.length; i += 250) {
    chunks.push(text.slice(i, i + 300));
  }
  return chunks;
}

/** Wrap query terms in <mark> tags for highlighting */
function highlightText(text, queryTerms) {
  if (!queryTerms.length) return text;
  let result = text;
  queryTerms.forEach(term => {
    if (!term) return;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(
      new RegExp(`(${escaped})`, 'gi'),
      '<mark class="bg-yellow-200 text-yellow-900 rounded px-0.5">$1</mark>'
    );
  });
  return result;
}

const DocumentViewer = ({ extractedText }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeExcerptIdx, setActiveExcerptIdx] = useState(null);

  const textRef = useRef(null);
  const fullTextRef = useRef(null);
  const excerptRefs = useRef([]);

  const { selectedText, position, clearSelection } = useTextSelection(textRef);

  const displayText = extractedText
    ? extractedText.slice(0, MAX_DISPLAY_CHARS)
    : '';

  const isTruncated = extractedText && extractedText.length > MAX_DISPLAY_CHARS;

  // ── Search logic ──────────────────────────────────────────
  const queryTerms = useMemo(() =>
    searchQuery.trim().length > 1
      ? searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)
      : [],
    [searchQuery]
  );

  const excerpts = useMemo(() => {
    if (!queryTerms.length || !displayText) return [];
    const paragraphs = splitIntoParagraphs(displayText);
    return paragraphs
      .map(p => ({ text: p, score: scoreChunk(p, queryTerms) }))
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_EXCERPTS)
      .map(p => p.text);
  }, [queryTerms, displayText]);

  // ── Scroll full text to excerpt ───────────────────────────
  const handleExcerptClick = (excerpt, idx) => {
    setActiveExcerptIdx(idx);
    if (!fullTextRef.current) return;
    const firstLine = excerpt.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const container = fullTextRef.current;
    const html = container.innerHTML;
    const pos = html.toLowerCase().indexOf(firstLine.toLowerCase());
    if (pos !== -1) {
      // Estimate scroll position based on character position ratio
      const ratio = pos / html.length;
      container.scrollTop = ratio * container.scrollHeight;
    }
  };

  const highlightedHtml = useMemo(() =>
    queryTerms.length ? highlightText(displayText, queryTerms) : displayText,
    [displayText, queryTerms]
  );

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setActiveExcerptIdx(null); }}
          placeholder="Search topics in this document..."
          className="sf-input pl-9 pr-8 w-full text-sm"
        />
        {searchQuery && (
          <button onClick={() => { setSearchQuery(''); setActiveExcerptIdx(null); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Results count */}
      {queryTerms.length > 0 && (
        <p className="text-xs text-surface-400">
          {excerpts.length > 0
            ? `${excerpts.length} relevant section${excerpts.length > 1 ? 's' : ''} found`
            : 'No matching sections found'}
        </p>
      )}

      {/* Option C: two-panel layout when search active */}
      <div className={`${queryTerms.length > 0 ? 'grid grid-cols-5 gap-4' : ''}`}>

        {/* Left panel: excerpt list */}
        {queryTerms.length > 0 && (
          <div className="col-span-2 space-y-2">
            <p className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">Results</p>
            {excerpts.length === 0 ? (
              <div className="sf-card p-4 text-center">
                <p className="text-xs text-surface-400">No matches found</p>
              </div>
            ) : (
              excerpts.map((excerpt, idx) => (
                <button
                  key={idx}
                  ref={el => excerptRefs.current[idx] = el}
                  onClick={() => handleExcerptClick(excerpt, idx)}
                  className={`w-full text-left p-3 rounded-xl border text-xs leading-relaxed transition-all ${
                    activeExcerptIdx === idx
                      ? 'border-primary-300 bg-primary-50 text-surface-800'
                      : 'border-surface-200 bg-white text-surface-600 hover:border-primary-200 hover:bg-primary-50/50'
                  }`}
                >
                  <span className="line-clamp-4">
                    {excerpt.slice(0, EXCERPT_CONTEXT_CHARS)}
                    {excerpt.length > EXCERPT_CONTEXT_CHARS ? '...' : ''}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {/* Right panel (or full width): full text */}
        <div className={queryTerms.length > 0 ? 'col-span-3' : 'col-span-5'}>
          {queryTerms.length > 0 && (
            <p className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-2">Full Text</p>
          )}
          <div
            ref={el => { textRef.current = el; fullTextRef.current = el; }}
            className="relative rounded-xl border border-surface-200 bg-surface-50 p-4 overflow-y-auto text-xs leading-relaxed text-surface-700 font-mono select-text"
            style={{ maxHeight: '420px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
          {isTruncated && (
            <p className="mt-2 text-xs text-surface-400 text-center">
              Document truncated for display (showing first 50,000 characters)
            </p>
          )}
        </div>
      </div>

      {/* ExplainPopover — rendered outside panels to avoid clipping */}
      <ExplainPopover
        selectedText={selectedText}
        position={position}
        extractedText={displayText}
        onClose={clearSelection}
      />
    </div>
  );
};

export default DocumentViewer;
