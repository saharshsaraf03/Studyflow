import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Sparkles, Loader2, FileX, Wand2 } from 'lucide-react';
import GenerateNotesModal from './GenerateNotesModal';
import MoveModal from './MoveModal';
import DocCard from './DocCard';
import NotesEditor from './NotesEditor';
import UploadModal from './UploadModal';
import AnalysisPanel from './AnalysisPanel';
import DocumentViewer from '../DocumentViewer';
import { listSDocs, saveSDoc, deleteSDoc, analyzeSDoc, loadSNote, getSDoc } from '../../utils/api';

/**
 * SubjectContent — right content area when a subject is selected
 * but no chapter is selected.
 *
 * Shows subject-level documents and notes.
 * Documents here are not tied to any chapter.
 * User can upload freely and assign to chapters later.
 */
const SubjectContent = ({ subject }) => {
  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);

  const [showUpload, setShowUpload] = useState(false);
  const [analyzingDocId, setAnalyzingDocId] = useState(null);
  const [analysisPanelDoc, setAnalysisPanelDoc] = useState(null);
  const [analysisPanelResults, setAnalysisPanelResults] = useState(null);
  const [viewerDoc, setViewerDoc] = useState(null);
  const [viewerFile, setViewerFile] = useState(null);
  const fileCache = React.useRef({});
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [moveDoc_, setMoveDoc] = useState(null);
  const notesEditorRef = React.useRef(null);

  useEffect(() => {
    if (!subject) return;
    setDocs([]);
    setNoteContent('');

    setDocsLoading(true);
    listSDocs(subject.subjectId)
      .then(r => setDocs(r.docs || []))
      .catch(() => {})
      .finally(() => setDocsLoading(false));

    setNoteLoading(true);
    loadSNote(subject.subjectId)
      .then(r => setNoteContent(r.content || ''))
      .catch(() => {})
      .finally(() => setNoteLoading(false));
  }, [subject?.subjectId]);

  const handleUpload = useCallback(async ({ file, extractedText }) => {
    const result = await saveSDoc({
      subjectId: subject.subjectId,
      fileName: file.name,
      fileSize: file.size,
      extractedText,
      aiResults: null,
    });
    fileCache.current[result.docId] = file;
    setDocs(prev => [...prev, {
      docId: result.docId,
      subjectId: subject.subjectId,
      fileName: file.name,
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
      hasAiResults: false,
    }]);
    setShowUpload(false);
  }, [subject]);

  const handleAnalyze = useCallback(async (doc) => {
    setAnalyzingDocId(doc.docId);
    try {
      const result = await analyzeSDoc({ subjectId: subject.subjectId, docId: doc.docId });
      setDocs(prev => prev.map(d => d.docId === doc.docId ? { ...d, hasAiResults: true } : d));
      setAnalysisPanelDoc({ ...doc, hasAiResults: true });
      setAnalysisPanelResults(result.aiResults);
    } catch (err) {
      alert(`Analysis failed: ${err.message}`);
    } finally {
      setAnalyzingDocId(null);
    }
  }, [subject]);

  const handleAnalyzeAll = useCallback(async () => {
    for (const doc of docs.filter(d => !d.hasAiResults)) {
      await handleAnalyze(doc);
    }
  }, [docs, handleAnalyze]);

  const handleDelete = useCallback(async (doc) => {
    if (!window.confirm(`Delete "${doc.fileName}"?`)) return;
    await deleteSDoc(subject.subjectId, doc.docId);
    setDocs(prev => prev.filter(d => d.docId !== doc.docId));
    if (analysisPanelDoc?.docId === doc.docId) {
      setAnalysisPanelDoc(null);
      setAnalysisPanelResults(null);
    }
  }, [subject, analysisPanelDoc]);

  const handleViewDoc = useCallback(async (doc) => {
    try {
      const result = await getSDoc(subject.subjectId, doc.docId);
      setViewerDoc(result.doc || doc);
    } catch {
      setViewerDoc(doc);
    }
    setViewerFile(fileCache.current[doc.docId] || null);
  }, [subject]);

  const handleViewSummary = useCallback(async (doc) => {
    try {
      const result = await getSDoc(subject.subjectId, doc.docId);
      const fullDoc = result.doc || doc;
      setAnalysisPanelDoc(fullDoc);
      setAnalysisPanelResults(fullDoc.aiResults || null);
    } catch {
      setAnalysisPanelDoc(doc);
      setAnalysisPanelResults(null);
    }
  }, [subject]);

  const handleMove = (doc) => setMoveDoc(doc);

  const handleMoved = (docId) => {
    setDocs(prev => prev.filter(d => d.docId !== docId));
    setMoveDoc(null);
  };

  const handleInsertNotes = (html, mode) => {
    setShowGenerateModal(false);
    if (notesEditorRef.current) {
      notesEditorRef.current.insertHtml(html, mode);
    }
  };

  if (!subject) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#9CA3AF' }}>
        <FileX size={40} />
        <p style={{ fontSize: 14 }}>Select a subject to get started</p>
      </div>
    );
  }

  const unanalyzedCount = docs.filter(d => !d.hasAiResults).length;

  return (
    <>
      <main style={{
        flex: 1, minWidth: 0, padding: '22px 28px 28px',
        overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 8 }}>
          <span style={{ color: '#6C5CE7', fontWeight: 500 }}>Library</span>
          <span style={{ margin: '0 8px' }}>/</span>
          <span>{subject.name}</span>
        </div>

        {/* Subject header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: subject.color, flexShrink: 0 }} />
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1D2E', margin: 0, letterSpacing: '-0.02em' }}>
                {subject.name}
              </h1>
            </div>
            <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
              {docs.length} document{docs.length !== 1 ? 's' : ''} · Subject level
              {unanalyzedCount > 0 ? ` · ${unanalyzedCount} not yet analyzed` : ''}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button
              onClick={() => setShowUpload(true)}
              className="btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', fontSize: 13 }}
            >
              <Upload size={14} /> Upload PDF
            </button>
            {unanalyzedCount > 0 && (
              <button
                onClick={handleAnalyzeAll}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 36, padding: '0 14px', fontSize: 13, fontWeight: 500,
                  borderRadius: 9, border: '1.5px solid #6C5CE7', background: '#fff',
                  color: '#6C5CE7', cursor: 'pointer',
                }}
              >
                <Sparkles size={14} /> Analyze All
              </button>
            )}
          </div>
        </div>

        {/* Info banner */}
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 20,
          background: 'rgba(108,92,231,0.06)', border: '1px solid rgba(108,92,231,0.15)',
          fontSize: 13, color: '#6C5CE7',
        }}>
          Documents uploaded here are stored at the subject level. Select a chapter from the left panel to organize documents by chapter.
        </div>

        {/* Documents */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1A1D2E', margin: 0 }}>Documents</h2>
            <span style={{
              marginLeft: 10, padding: '2px 8px', borderRadius: 99,
              background: '#F5F5F7', color: '#6B7280', fontSize: 12, fontWeight: 500,
            }}>{docs.length} file{docs.length !== 1 ? 's' : ''}</span>
          </div>

          {docsLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16, color: '#9CA3AF', fontSize: 13 }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Loading documents...
            </div>
          ) : docs.length === 0 ? (
            <div style={{
              padding: 24, textAlign: 'center', borderRadius: 12,
              border: '2px dashed #E5E7EB', background: '#FAFAFA',
            }}>
              <Upload size={24} style={{ color: '#D1D5DB', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>
                No documents yet. Upload a PDF to store it under this subject.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {docs.map(doc => (
                <DocCard
                  key={doc.docId}
                  doc={doc}
                  isAnalyzing={analyzingDocId === doc.docId}
                  onAnalyze={handleAnalyze}
                  onDelete={handleDelete}
                  onView={handleViewDoc}
                  onViewSummary={handleViewSummary}
                />
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1A1D2E', margin: 0 }}>
              Notes & Key Points
            </h2>
            {docs.length > 0 && (
              <button
                onClick={() => setShowGenerateModal(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 32, padding: '0 12px', borderRadius: 8, marginLeft: 10,
                  border: '1.5px solid #6C5CE7', background: 'rgba(108,92,231,0.06)',
                  color: '#6C5CE7', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Wand2 size={13} /> Generate Notes
              </button>
            )}
          </div>
          {noteLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16, color: '#9CA3AF', fontSize: 13 }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Loading notes...
            </div>
          ) : (
            <NotesEditor
              ref={notesEditorRef}
              key={`subject-${subject.subjectId}`}
              chapterId={`subject-${subject.subjectId}`}
              initialContent={noteContent}
              saveOverride={async (content) => {
                const { saveSNote } = await import('../../utils/api');
                return saveSNote({ subjectId: subject.subjectId, content });
              }}
            />
          )}
        </div>
      </main>

      {moveDoc_ && (
        <MoveModal
          doc={moveDoc_}
          sourceType="subject"
          sourceId={subject.subjectId}
          onMoved={handleMoved}
          onClose={() => setMoveDoc(null)}
        />
      )}

      {showGenerateModal && docs.length > 0 && (
        <GenerateNotesModal
          docs={docs}
          chapterId={null}
          subjectId={subject.subjectId}
          onInsert={handleInsertNotes}
          onClose={() => setShowGenerateModal(false)}
        />
      )}

      {showUpload && (
        <UploadModal
          chapterName={subject.name}
          onUpload={handleUpload}
          onClose={() => setShowUpload(false)}
        />
      )}

      {analysisPanelDoc && analysisPanelResults && (
        <AnalysisPanel
          doc={analysisPanelDoc}
          aiResults={analysisPanelResults}
          extractedText={analysisPanelDoc.extractedText || ''}
          onClose={() => { setAnalysisPanelDoc(null); setAnalysisPanelResults(null); }}
        />
      )}

      {viewerDoc && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 80,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }} onClick={() => { setViewerDoc(null); setViewerFile(null); }}>
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 760, maxHeight: '85vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #E5E7EB' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1A1D2E', flex: 1 }}>{viewerDoc.fileName}</span>
              <button onClick={() => { setViewerDoc(null); setViewerFile(null); }} style={{ width: 28, height: 28, borderRadius: 7, background: '#F5F5F7', border: 'none', color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <DocumentViewer
                file={viewerFile}
                fileName={viewerDoc.fileName}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SubjectContent;
