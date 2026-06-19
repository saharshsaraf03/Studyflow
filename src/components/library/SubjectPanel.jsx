import React, { useState } from 'react';
import { Plus, Search, Trash2, X, Check } from 'lucide-react';

/**
 * SubjectPanel — left panel (296px white)
 * Matches Claude Design exactly:
 * - "My Subjects" header + "+ Add" button
 * - Subject search bar
 * - Subject list with colored dots, active indicator
 * - Divider → CHAPTERS section
 * - Chapter list with Ch{N} badge, doc count pill
 * - "+ Add Chapter" button
 */

const SubjectPanel = ({
  subjects, chapters, selectedSubjectId, selectedChapterId,
  onSelectSubject, onSelectChapter, onSelectSubjectLevel,
  onAddSubject, onAddChapter,
  onDeleteSubject, onDeleteChapter,
}) => {
  const [subjectSearch, setSubjectSearch] = useState('');
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [addingChapter, setAddingChapter] = useState(false);
  const [newChapterName, setNewChapterName] = useState('');
  const [hoveredSubject, setHoveredSubject] = useState(null);
  const [hoveredChapter, setHoveredChapter] = useState(null);

  const filteredSubjects = subjects.filter(s =>
    s.name.toLowerCase().includes(subjectSearch.toLowerCase())
  );

  const handleAddSubject = async () => {
    if (!newSubjectName.trim()) return;
    await onAddSubject(newSubjectName.trim());
    setNewSubjectName('');
    setAddingSubject(false);
  };

  const handleAddChapter = async () => {
    if (!newChapterName.trim() || !selectedSubjectId) return;
    await onAddChapter(newChapterName.trim());
    setNewChapterName('');
    setAddingChapter(false);
  };

  return (
    <aside style={{
      width: 252, height: '100%', flexShrink: 0,
      background: '#FFFFFF', borderRight: '1px solid #E5E7EB',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1A1D2E', margin: 0, flex: 1 }}>
            My Subjects
          </h3>
          <button
            onClick={() => setAddingSubject(true)}
            style={{
              fontSize: 12, fontWeight: 600, color: '#6C5CE7',
              padding: '4px 10px', background: 'rgba(108,92,231,0.10)', borderRadius: 6,
              display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
              border: 'none',
            }}
          >
            <Plus size={12} /> Add
          </button>
        </div>

        {/* Add subject inline input */}
        {addingSubject && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input
              autoFocus
              value={newSubjectName}
              onChange={e => setNewSubjectName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddSubject();
                if (e.key === 'Escape') { setAddingSubject(false); setNewSubjectName(''); }
              }}
              placeholder="Subject name..."
              style={{
                flex: 1, height: 32, padding: '0 10px', borderRadius: 7,
                border: '1.5px solid #6C5CE7', fontSize: 13, color: '#1A1D2E',
                outline: 'none',
              }}
            />
            <button onClick={handleAddSubject}
              style={{ width: 32, height: 32, borderRadius: 7, background: '#6C5CE7', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <Check size={14} />
            </button>
            <button onClick={() => { setAddingSubject(false); setNewSubjectName(''); }}
              style={{ width: 32, height: 32, borderRadius: 7, background: '#F5F5F7', border: 'none', color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Search */}
        <div style={{
          height: 36, padding: '0 12px', background: '#F5F5F7', borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 8, border: '1px solid transparent',
        }}>
          <Search size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
          <input
            value={subjectSearch}
            onChange={e => setSubjectSearch(e.target.value)}
            placeholder="Search subjects..."
            style={{ flex: 1, fontSize: 13, color: '#1A1D2E', background: 'transparent', border: 'none', outline: 'none' }}
          />
        </div>
      </div>

      {/* Subject list */}
      <div style={{ padding: '0 8px', flexShrink: 0 }}>
        {filteredSubjects.map(s => {
          const loadedChapterCount = chapters.filter(c => c.subjectId === s.subjectId).length;
          const chapterCount = loadedChapterCount || s.chapterCount || 0;
          return (
          <div
            key={s.subjectId}
            onClick={() => onSelectSubjectLevel(s.subjectId)}
            onMouseEnter={() => setHoveredSubject(s.subjectId)}
            onMouseLeave={() => setHoveredSubject(null)}
            style={{
              position: 'relative',
              height: 56, padding: '0 12px 0 14px', borderRadius: 10,
              background: selectedSubjectId === s.subjectId ? 'rgba(108,92,231,0.06)' : hoveredSubject === s.subjectId ? '#F9F9FB' : 'transparent',
              display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0', cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {selectedSubjectId === s.subjectId && (
              <div style={{
                position: 'absolute', left: 0, top: 12, bottom: 12, width: 3,
                background: '#6C5CE7', borderRadius: '0 3px 3px 0',
              }} />
            )}
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: selectedSubjectId === s.subjectId ? 600 : 500, color: selectedSubjectId === s.subjectId ? '#1A1D2E' : '#4B5563', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.name}
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>
                {chapterCount} chapters
              </div>
            </div>
            {hoveredSubject === s.subjectId && (
              <button
                onClick={e => { e.stopPropagation(); onDeleteSubject(s.subjectId); }}
                style={{ width: 22, height: 22, borderRadius: 5, background: 'transparent', border: 'none', color: '#FF6B6B', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        );})}

        {filteredSubjects.length === 0 && !addingSubject && (
          <div style={{ padding: '12px 14px', fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
            {subjects.length === 0 ? 'No subjects yet. Click + Add to start.' : 'No matches'}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#F0F0F2', margin: '12px 20px' }} />

      {/* Chapters section */}
      <div style={{ padding: '0 20px 8px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.1em' }}>
          CHAPTERS
        </div>
      </div>

      <div style={{ padding: '0 12px', flex: 1, overflowY: 'auto' }}>
        {!selectedSubjectId ? (
          <div style={{ padding: '12px 14px', fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
            Select a subject to view chapters
          </div>
        ) : (
          <>
            {chapters.filter(c => c.subjectId === selectedSubjectId).map((c, idx) => (
              <div
                key={c.chapterId}
                onClick={() => onSelectChapter(c.chapterId)}
                onMouseEnter={() => setHoveredChapter(c.chapterId)}
                onMouseLeave={() => setHoveredChapter(null)}
                style={{
                  height: 42, padding: '0 12px', borderRadius: 8,
                  background: selectedChapterId === c.chapterId ? '#F5F5F7' : hoveredChapter === c.chapterId ? '#FAFAFA' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0', cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: selectedChapterId === c.chapterId ? '#6C5CE7' : '#9CA3AF',
                  width: 28, height: 22, borderRadius: 6,
                  background: selectedChapterId === c.chapterId ? 'rgba(108,92,231,0.10)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>Ch{idx + 1}</div>
                <div style={{
                  flex: 1, fontSize: 13,
                  fontWeight: selectedChapterId === c.chapterId ? 600 : 500,
                  color: selectedChapterId === c.chapterId ? '#1A1D2E' : '#6B7280',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{c.name}</div>
                {hoveredChapter === c.chapterId ? (
                  <button
                    onClick={e => { e.stopPropagation(); onDeleteChapter(c.subjectId, c.chapterId); }}
                    style={{ width: 20, height: 20, borderRadius: 4, background: 'transparent', border: 'none', color: '#FF6B6B', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                  >
                    <Trash2 size={11} />
                  </button>
                ) : (
                  <div style={{
                    minWidth: 22, height: 20, padding: '0 6px', borderRadius: 99,
                    background: selectedChapterId === c.chapterId ? '#fff' : '#F0F0F2',
                    border: selectedChapterId === c.chapterId ? '1px solid #E5E7EB' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 600, color: '#6B7280', flexShrink: 0,
                  }}>
                    {c.docCount || 0}
                  </div>
                )}
              </div>
            ))}

            {/* Add chapter inline */}
            {addingChapter ? (
              <div style={{ padding: '6px 4px', display: 'flex', gap: 6 }}>
                <input
                  autoFocus
                  value={newChapterName}
                  onChange={e => setNewChapterName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddChapter();
                    if (e.key === 'Escape') { setAddingChapter(false); setNewChapterName(''); }
                  }}
                  placeholder="Chapter name..."
                  style={{
                    flex: 1, height: 30, padding: '0 8px', borderRadius: 6,
                    border: '1.5px solid #6C5CE7', fontSize: 12, outline: 'none',
                  }}
                />
                <button onClick={handleAddChapter}
                  style={{ width: 30, height: 30, borderRadius: 6, background: '#6C5CE7', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Check size={12} />
                </button>
                <button onClick={() => { setAddingChapter(false); setNewChapterName(''); }}
                  style={{ width: 30, height: 30, borderRadius: 6, background: '#F5F5F7', border: 'none', color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingChapter(true)}
                style={{
                  padding: '10px 12px', fontSize: 13, fontWeight: 500, color: '#6C5CE7',
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  background: 'transparent', border: 'none', width: '100%',
                }}
              >
                <Plus size={14} /> Add Chapter
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
};

export default SubjectPanel;
