import React, { useState, useRef, useEffect } from 'react';
import { Search, Loader2, X, FileText } from 'lucide-react';
import { searchLibrary } from '../../utils/api';

/**
 * LibrarySearch — slim semantic-search bar above the Library content area.
 * Calls POST /api/search on Enter (or the search button) rather than on every
 * keystroke, because each search counts against the user's AI quota.
 * Clicking a result calls onSelectResult(result) so LibraryPage can jump to
 * the subject or chapter that holds the document.
 */
const LibrarySearch = ({ onSelectResult }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState('');
  const containerRef = useRef(null);
  const requestIdRef = useRef(0);

  // Close the dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2 || loading) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    setOpen(true);
    try {
      const res = await searchLibrary({ query: q, topK: 8 });
      if (requestId !== requestIdRef.current) return;
      setResults(res.results || []);
      setSearchedQuery(q);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setResults([]);
      setError(err.status === 429
        ? (err.message || 'Too many requests. Please wait a moment and try again.')
        : 'Search failed. Please try again.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  const clear = () => {
    requestIdRef.current += 1;
    setQuery('');
    setResults([]);
    setError('');
    setSearchedQuery('');
    setLoading(false);
    setOpen(false);
  };

  const handleSelect = (result) => {
    setOpen(false);
    if (onSelectResult) onSelectResult(result);
  };

  const formatScore = (score) => (typeof score === 'number' ? `${Math.round(score * 100)}%` : '');

  return (
    <div ref={containerRef} style={{
      position: 'relative', flexShrink: 0,
      padding: '12px 28px', borderBottom: '1px solid var(--border-light)',
      background: 'var(--bg-card)',
    }}>
      <div style={{
        height: 38, padding: '0 6px 0 12px', borderRadius: 9,
        background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
        display: 'flex', alignItems: 'center', gap: 8, maxWidth: 640,
      }}>
        <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
            if (e.key === 'Escape') setOpen(false);
          }}
          onFocus={() => { if (searchedQuery || error) setOpen(true); }}
          placeholder="Search across all your documents... (press Enter)"
          aria-label="Search library"
          style={{
            flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-primary)',
            background: 'transparent', border: 'none', outline: 'none',
          }}
        />
        {query && !loading && (
          <button onClick={clear} title="Clear" style={{
            width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent',
            color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <X size={13} />
          </button>
        )}
        <button
          onClick={runSearch}
          disabled={loading || query.trim().length < 2}
          className="btn-primary"
          style={{
            height: 28, padding: '0 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6,
            opacity: (loading || query.trim().length < 2) ? 0.5 : 1,
          }}
        >
          {loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={12} />}
          Search
        </button>
      </div>

      {open && (
        <div style={{
          position: 'absolute', left: 28, top: 'calc(100% - 4px)', zIndex: 30,
          width: 'min(640px, calc(100% - 56px))', maxHeight: 420, overflowY: 'auto',
          background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 12,
          boxShadow: 'var(--shadow-elevated)',
        }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Searching your library...
            </div>
          ) : error ? (
            <div style={{ padding: 16, fontSize: 13, color: '#FF6B6B' }}>{error}</div>
          ) : results.length === 0 ? (
            <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>
              No matching passages for "{searchedQuery}".
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 14px 6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                {results.length} RESULT{results.length !== 1 ? 'S' : ''}
              </div>
              {results.map((r, i) => (
                <button
                  key={`${r.docId}-${r.chunkIndex}-${i}`}
                  onClick={() => handleSelect(r)}
                  style={{
                    width: '100%', textAlign: 'left', display: 'flex', gap: 10,
                    padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
                    borderTop: i === 0 ? 'none' : '1px solid var(--border-light)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-primary)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <FileText size={15} style={{ color: '#6C5CE7', flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{r.fileName || 'Untitled document'}</span>
                      {formatScore(r.score) && (
                        <span style={{
                          fontSize: 11, fontWeight: 600, color: '#6C5CE7', flexShrink: 0,
                          padding: '1px 7px', borderRadius: 99, background: 'rgba(108,92,231,0.10)',
                        }}>{formatScore(r.score)}</span>
                      )}
                    </div>
                    <div style={{
                      fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.45,
                      display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>{r.snippet}</div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default LibrarySearch;
