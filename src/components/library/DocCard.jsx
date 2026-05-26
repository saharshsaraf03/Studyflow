import React, { useState } from 'react';
import { FileText, MoreHorizontal, Trash2, Sparkles, Check, Loader2, BookOpen, BarChart2, FolderInput } from 'lucide-react';

/**
 * DocCard — document row matching Claude Design
 * ⋯ menu actions:
 *   - If hasAiResults: "View AI Summary", "View Document", Delete
 *   - If !hasAiResults: "Analyze with AI", "View Document", Delete
 */
const DocCard = ({ doc, onAnalyze, onDelete, onView, onViewSummary, onMove, isAnalyzing }) => {
  const [showMenu, setShowMenu] = useState(false);

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Uploaded today';
    if (diff === 1) return 'Uploaded yesterday';
    if (diff < 7) return `Uploaded ${diff} days ago`;
    return `Uploaded ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  const hasAI = doc.hasAiResults;

  return (
    <div className="sf-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 14, position: 'relative', background: 'var(--bg-card)' }}>
      {/* File icon */}
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: 'rgba(108,92,231,0.10)', color: '#6C5CE7',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <FileText size={20} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {doc.fileName}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
          {formatSize(doc.fileSize)}{doc.fileSize ? ' · ' : ''}{formatDate(doc.uploadedAt)}
        </div>
      </div>

      {/* Status pill — clickable if AI results exist */}
      {isAnalyzing ? (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 99,
          background: 'rgba(79,172,254,0.12)', color: '#4FACFE',
          fontSize: 12, fontWeight: 500, flexShrink: 0,
        }}>
          <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
          Analyzing...
        </div>
      ) : hasAI ? (
        <button
          onClick={() => onViewSummary(doc)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 99, cursor: 'pointer',
            background: 'rgba(0,210,160,0.12)', color: '#00B488',
            fontSize: 12, fontWeight: 500, flexShrink: 0,
            border: 'none', transition: 'all 0.15s',
          }}
          title="View AI Summary"
        >
          <Check size={12} />
          AI Summary Available
        </button>
      ) : (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 99,
          background: 'var(--bg-primary)', color: 'var(--text-secondary)',
          fontSize: 12, fontWeight: 500, flexShrink: 0,
        }}>
          Not yet analyzed
        </div>
      )}

      {/* ⋯ menu */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setShowMenu(v => !v)}
          style={{
            width: 28, height: 28, borderRadius: 7, background: '#F5F5F7',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#6B7280', border: 'none', cursor: 'pointer',
          }}
        >
          <MoreHorizontal size={14} />
        </button>

        {showMenu && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setShowMenu(false)} />
            <div style={{
              position: 'absolute', right: 0, top: 34, zIndex: 20,
              background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 180, overflow: 'hidden',
            }}>
              {hasAI ? (
                <button
                  onClick={() => { setShowMenu(false); onViewSummary(doc); }}
                  style={{ width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6C5CE7', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <BarChart2 size={14} /> View AI Summary
                </button>
              ) : (
                <button
                  onClick={() => { setShowMenu(false); onAnalyze(doc); }}
                  style={{ width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#6C5CE7', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <Sparkles size={14} /> Analyze with AI
                </button>
              )}
              <button
                onClick={() => { setShowMenu(false); onView(doc); }}
                style={{ width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <BookOpen size={14} /> View Document
              </button>
              <button
                onClick={() => { setShowMenu(false); onMove(doc); }}
                style={{ width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <FolderInput size={14} /> Move to...
              </button>
              <div style={{ height: 1, background: '#F0F0F2', margin: '2px 0' }} />
              <button
                onClick={() => { setShowMenu(false); onDelete(doc); }}
                style={{ width: '100%', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#FF6B6B', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DocCard;
