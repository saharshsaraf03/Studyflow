import React, { useState, useEffect } from 'react';
import { X, FolderOpen, Loader2, ArrowRight } from 'lucide-react';
import { listSubjects, listChapters, moveDoc } from '../../utils/api';

/**
 * MoveModal — lets user pick a destination (subject or chapter) for a document
 *
 * Flow:
 * 1. Load all subjects on mount
 * 2. User selects a subject → chapters load
 * 3. User picks either the subject itself or a specific chapter
 * 4. Confirm → calls moveDoc API → onMoved callback
 */
const MoveModal = ({ doc, sourceType, sourceId, onMoved, onClose }) => {
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedDestType, setSelectedDestType] = useState(''); // 'subject' | 'chapter'
  const [selectedDestId, setSelectedDestId] = useState('');
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState('');

  // Load subjects on mount
  useEffect(() => {
    listSubjects()
      .then(r => setSubjects(r.subjects || []))
      .catch(() => setError('Failed to load subjects.'));
  }, []);

  // Load chapters when subject selected
  useEffect(() => {
    if (!selectedSubjectId) { setChapters([]); return; }
    setChaptersLoading(true);
    setSelectedDestType('subject');
    setSelectedDestId(selectedSubjectId);
    listChapters(selectedSubjectId)
      .then(r => setChapters(r.chapters || []))
      .catch(() => {})
      .finally(() => setChaptersLoading(false));
  }, [selectedSubjectId]);

  const handleMove = async () => {
    if (!selectedDestType || !selectedDestId) return;

    // Prevent moving to same location
    if (selectedDestType === sourceType && selectedDestId === sourceId) {
      setError('Document is already in this location.');
      return;
    }

    setIsMoving(true);
    setError('');
    try {
      const moveRequest = {
        docId: doc.docId,
        sourceType,
        sourceId,
        destType: selectedDestType,
        destId: selectedDestId,
        destSubjectId: selectedSubjectId,
      };
      const result = await moveDoc(moveRequest);
      onMoved(doc.docId, result, moveRequest);
    } catch (err) {
      setError(err.message || 'Move failed. Please try again.');
      setIsMoving(false);
    }
  };

  const selectedSubject = subjects.find(s => s.subjectId === selectedSubjectId);
  const canConfirm = selectedDestType && selectedDestId && !isMoving;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', padding: 16,
    }}>
      <div className="sf-card" style={{ width: '100%', maxWidth: 460, padding: 0, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: '1px solid #E5E7EB' }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FolderOpen size={16} style={{ color: '#fff' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A1D2E', margin: 0 }}>Move Document</h3>
            <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {doc.fileName}
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 7, background: '#F5F5F7',
            border: 'none', color: '#6B7280', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20 }}>

          {/* Step 1 — Pick subject */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>
              Select subject
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
              {subjects.map(s => (
                <button
                  key={s.subjectId}
                  onClick={() => {
                    setSelectedSubjectId(s.subjectId);
                    setSelectedDestType('subject');
                    setSelectedDestId(s.subjectId);
                    setError('');
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                    border: selectedSubjectId === s.subjectId
                      ? '1.5px solid #6C5CE7' : '1px solid #E5E7EB',
                    background: selectedSubjectId === s.subjectId
                      ? 'rgba(108,92,231,0.06)' : '#FAFAFA',
                    transition: 'all 0.15s', textAlign: 'left',
                  }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1D2E', flex: 1 }}>{s.name}</span>
                  {selectedSubjectId === s.subjectId && selectedDestType === 'subject' && selectedDestId === s.subjectId && (
                    <span style={{ fontSize: 11, color: '#6C5CE7', fontWeight: 600 }}>Subject level</span>
                  )}
                </button>
              ))}
              {subjects.length === 0 && (
                <p style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: 12 }}>No subjects found</p>
              )}
            </div>
          </div>

          {/* Step 2 — Pick chapter (optional) */}
          {selectedSubjectId && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>
                Select chapter <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(optional — leave subject selected to move to subject level)</span>
              </label>
              {chaptersLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, color: '#9CA3AF', fontSize: 13 }}>
                  <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading chapters...
                </div>
              ) : chapters.length === 0 ? (
                <p style={{ fontSize: 12, color: '#9CA3AF', padding: '8px 0' }}>
                  No chapters in {selectedSubject?.name}. Document will be moved to subject level.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {chapters.map((ch, idx) => (
                    <button
                      key={ch.chapterId}
                      onClick={() => {
                        setSelectedDestType('chapter');
                        setSelectedDestId(ch.chapterId);
                        setError('');
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                        border: selectedDestType === 'chapter' && selectedDestId === ch.chapterId
                          ? '1.5px solid #6C5CE7' : '1px solid #E5E7EB',
                        background: selectedDestType === 'chapter' && selectedDestId === ch.chapterId
                          ? 'rgba(108,92,231,0.06)' : '#FAFAFA',
                        transition: 'all 0.15s', textAlign: 'left',
                      }}
                    >
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: selectedDestType === 'chapter' && selectedDestId === ch.chapterId ? '#6C5CE7' : '#9CA3AF',
                        width: 28,
                      }}>Ch{idx + 1}</span>
                      <span style={{ fontSize: 13, color: '#374151', flex: 1 }}>{ch.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Destination summary */}
          {selectedDestType && selectedDestId && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              borderRadius: 10, background: 'rgba(108,92,231,0.06)',
              border: '1px solid rgba(108,92,231,0.15)', marginBottom: 16,
              fontSize: 12, color: '#6C5CE7',
            }}>
              <ArrowRight size={13} />
              Moving to: <strong>
                {selectedDestType === 'subject'
                  ? `${selectedSubject?.name} (subject level)`
                  : `${selectedSubject?.name} → ${chapters.find(c => c.chapterId === selectedDestId)?.name}`
                }
              </strong>
            </div>
          )}

          {error && (
            <p style={{ fontSize: 12, color: '#FF6B6B', marginBottom: 12 }}>{error}</p>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} disabled={isMoving} style={{
              flex: 1, height: 40, borderRadius: 10, border: '1px solid #E5E7EB',
              background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500,
              cursor: isMoving ? 'not-allowed' : 'pointer', opacity: isMoving ? 0.5 : 1,
            }}>Cancel</button>
            <button
              onClick={handleMove}
              disabled={!canConfirm}
              className="btn-primary"
              style={{
                flex: 1, height: 40, borderRadius: 10, fontSize: 13, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: !canConfirm ? 0.5 : 1, cursor: !canConfirm ? 'not-allowed' : 'pointer',
              }}
            >
              {isMoving ? (
                <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Moving...</>
              ) : (
                <><ArrowRight size={13} /> Move Here</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MoveModal;
