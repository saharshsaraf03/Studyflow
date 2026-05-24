import React, { useState, useEffect, useCallback } from 'react';
import SubjectPanel from '../components/library/SubjectPanel';
import SubjectContent from '../components/library/SubjectContent';
import GlobalChatbot from '../components/library/GlobalChatbot';
import ChapterContent from '../components/library/ChapterContent';
import { listSubjects, listChapters, saveSubject, saveChapter, deleteSubject, deleteChapter } from '../utils/api';

/**
 * LibraryPage — route: /library
 * Three-panel layout matching Claude Design exactly:
 *   App Sidebar (from App.jsx) | SubjectPanel (296px) | ChapterContent (flex 1)
 *
 * State owned here:
 *   subjects[]  — all subjects for this user
 *   chapters[]  — all chapters (loaded per subject on demand, cached)
 *   selectedSubjectId / selectedChapterId
 */
const LibraryPage = () => {
  const [subjects, setSubjects] = useState([]);
  const [chapters, setChapters] = useState([]); // flat list, filtered by subjectId
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [selectedChapterId, setSelectedChapterId] = useState(null);
  const [loadedSubjectIds, setLoadedSubjectIds] = useState(new Set());

  // Load all subjects on mount
  useEffect(() => {
    listSubjects()
      .then(r => {
        const subs = r.subjects || [];
        setSubjects(subs);
        // Auto-select first subject if exists
        if (subs.length > 0) handleSelectSubjectLevel(subs[0].subjectId);
      })
      .catch(() => {});
  }, []);

  // Load chapters for a subject (cached — only fetches once per subject)
  const loadChaptersForSubject = useCallback(async (subjectId) => {
    if (loadedSubjectIds.has(subjectId)) return;
    try {
      const r = await listChapters(subjectId);
      const newChapters = r.chapters || [];
      setChapters(prev => {
        const existing = prev.filter(c => c.subjectId !== subjectId);
        return [...existing, ...newChapters];
      });
      setLoadedSubjectIds(prev => new Set([...prev, subjectId]));
    } catch {}
  }, [loadedSubjectIds]);

  const handleSelectSubject = useCallback(async (subjectId) => {
    setSelectedSubjectId(subjectId);
    setSelectedChapterId(null);
    await loadChaptersForSubject(subjectId);
    // Auto-select first chapter if available
    setChapters(prev => {
      const subChapters = prev.filter(c => c.subjectId === subjectId);
      if (subChapters.length > 0) setSelectedChapterId(subChapters[0].chapterId);
      return prev;
    });
  }, [loadChaptersForSubject]);

  const handleSelectSubjectLevel = useCallback(async (subjectId) => {
    setSelectedSubjectId(subjectId);
    setSelectedChapterId(null); // show subject-level view
    await loadChaptersForSubject(subjectId); // load chapters in background for panel
  }, [loadChaptersForSubject]);

  const handleSelectChapter = useCallback((chapterId) => {
    setSelectedChapterId(chapterId);
  }, []);

  const handleAddSubject = useCallback(async (name) => {
    const result = await saveSubject({ name, order: subjects.length });
    const newSubject = {
      subjectId: result.subjectId,
      name,
      color: result.color,
      order: subjects.length,
    };
    setSubjects(prev => [...prev, newSubject]);
    handleSelectSubject(result.subjectId);
  }, [subjects.length, handleSelectSubject]);

  const handleAddChapter = useCallback(async (name) => {
    if (!selectedSubjectId) return;
    const subChapters = chapters.filter(c => c.subjectId === selectedSubjectId);
    const result = await saveChapter({
      subjectId: selectedSubjectId,
      name,
      order: subChapters.length,
    });
    const newChapter = {
      chapterId: result.chapterId,
      subjectId: selectedSubjectId,
      name,
      order: subChapters.length,
      docCount: 0,
    };
    setChapters(prev => [...prev, newChapter]);
    setSelectedChapterId(result.chapterId);
  }, [selectedSubjectId, chapters]);

  const handleDeleteSubject = useCallback(async (subjectId) => {
    if (!window.confirm('Delete this subject and all its chapters and documents?')) return;
    await deleteSubject(subjectId);
    setSubjects(prev => prev.filter(s => s.subjectId !== subjectId));
    setChapters(prev => prev.filter(c => c.subjectId !== subjectId));
    if (selectedSubjectId === subjectId) {
      setSelectedSubjectId(null);
      setSelectedChapterId(null);
    }
  }, [selectedSubjectId]);

  const handleDeleteChapter = useCallback(async (subjectId, chapterId) => {
    if (!window.confirm('Delete this chapter and all its documents?')) return;
    await deleteChapter(subjectId, chapterId);
    setChapters(prev => prev.filter(c => c.chapterId !== chapterId));
    if (selectedChapterId === chapterId) setSelectedChapterId(null);
  }, [selectedChapterId]);

  // Derive current subject/chapter objects
  const selectedSubject = subjects.find(s => s.subjectId === selectedSubjectId) || null;
  const selectedChapter = chapters.find(c => c.chapterId === selectedChapterId) || null;
  const chapterIndex = chapters
    .filter(c => c.subjectId === selectedSubjectId)
    .findIndex(c => c.chapterId === selectedChapterId);

  return (
    <>
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
    }}>
      <SubjectPanel
        subjects={subjects}
        chapters={chapters}
        selectedSubjectId={selectedSubjectId}
        selectedChapterId={selectedChapterId}
        onSelectSubject={handleSelectSubject}
        onSelectSubjectLevel={handleSelectSubjectLevel}
        onSelectChapter={handleSelectChapter}
        onAddSubject={handleAddSubject}
        onAddChapter={handleAddChapter}
        onDeleteSubject={handleDeleteSubject}
        onDeleteChapter={handleDeleteChapter}
      />
      {selectedChapterId ? (
        <ChapterContent
          subject={selectedSubject}
          chapter={selectedChapter}
          chapterIndex={chapterIndex >= 0 ? chapterIndex : 0}
        />
      ) : (
        <SubjectContent subject={selectedSubject} />
      )}
    </div>

    <GlobalChatbot />
  </>
  );
};

export default LibraryPage;
