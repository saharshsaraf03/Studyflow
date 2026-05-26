import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Sparkles, Loader2, FileX, Wand2 } from 'lucide-react';
import GenerateNotesModal from './GenerateNotesModal';
import MoveModal from './MoveModal';
import DocCard from './DocCard';
import NotesEditor from './NotesEditor';
import UploadModal from './UploadModal';
import AnalysisPanel from './AnalysisPanel';
import { listCDocs, saveCDoc, deleteCDoc, analyzeCDoc, loadCNote, getCDoc, uploadPdfToS3 } from '../../utils/api';

/**
 * ChapterContent — right content area matching Claude Design
 * Shows: breadcrumb, chapter title + meta, action buttons,
 * Documents section (DocCards), Notes & Key Points (rich editor)
 * Also handles: upload modal, analysis panel, doc viewer modal
 */
const ChapterContent = ({ subject, chapter, chapterIndex, onDocCountChange }) => {
  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);

  const [showUpload, setShowUpload] = useState(false);
  const [analyzingDocId, setAnalyzingDocId] = useState(null);
  const [analysisPanelDoc, setAnalysisPanelDoc] = useState(null);
  const [analysisPanelResults, setAnalysisPanelResults] = useState(null);
  const [viewerDoc, setViewerDoc] = useState(null); // kept for compatibility
  const fileCache = React.useRef({}); // docId -> File blob cache
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [moveDoc_, setMoveDoc] = useState(null); // doc being moved
  const notesEditorRef = React.useRef(null);

  // Load docs + notes whenever chapter changes
  useEffect(() => {
    if (!chapter) return;
    setDocs([]);
    setNoteContent('');

    setDocsLoading(true);
    listCDocs(chapter.chapterId)
      .then(r => setDocs(r.docs || []))
      .catch(() => {})
      .finally(() => setDocsLoading(false));

    setNoteLoading(true);
    loadCNote(chapter.chapterId)
      .then(r => setNoteContent(r.content || ''))
      .catch(() => {})
      .finally(() => setNoteLoading(false));
  }, [chapter?.chapterId]);

  const handleUpload = useCallback(async ({ file, extractedText }) => {
    // Step 1: Upload PDF to S3
    const s3Result = await uploadPdfToS3({ file });
    const { pdfUrl, s3Key, docId: s3DocId } = s3Result;

    // Step 2: Save metadata + pdfUrl to DynamoDB
    const result = await saveCDoc({
      docId: s3DocId,
      chapterId: chapter.chapterId,
      fileName: file.name,
      fileSize: file.size,
      extractedText,
      aiResults: null,
      pdfUrl,
      s3Key,
    });

    // Cache the file blob for same-session viewing
    fileCache.current[result.docId] = file;
    setDocs(prev => [...prev, {
      docId: result.docId,
      chapterId: chapter.chapterId,
      fileName: file.name,
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
      hasAiResults: false,
      pdfUrl,
    }]);
    if (onDocCountChange) onDocCountChange(chapter.chapterId, 1);
    setShowUpload(false);
  }, [chapter]);

  const handleAnalyze = useCallback(async (doc) => {
    setAnalyzingDocId(doc.docId);
    try {
      const result = await analyzeCDoc({ docId: doc.docId, chapterId: chapter.chapterId });
      setDocs(prev => prev.map(d => d.docId === doc.docId ? { ...d, hasAiResults: true } : d));
      setAnalysisPanelDoc({ ...doc, hasAiResults: true });
      setAnalysisPanelResults(result.aiResults);
    } catch (err) {
      alert(`Analysis failed: ${err.message}`);
    } finally {
      setAnalyzingDocId(null);
    }
  }, [chapter]);

  const handleAnalyzeAll = useCallback(async () => {
    const unanalyzed = docs.filter(d => !d.hasAiResults);
    for (const doc of unanalyzed) {
      await handleAnalyze(doc);
    }
  }, [docs, handleAnalyze]);

  const handleDelete = useCallback(async (doc) => {
    if (!window.confirm(`Delete "${doc.fileName}"?`)) return;
    await deleteCDoc(chapter.chapterId, doc.docId);
    setDocs(prev => prev.filter(d => d.docId !== doc.docId));
    if (onDocCountChange) onDocCountChange(chapter.chapterId, -1);
    if (analysisPanelDoc?.docId === doc.docId) { setAnalysisPanelDoc(null); setAnalysisPanelResults(null); }
  }, [chapter, analysisPanelDoc]);

  const handleViewDoc = useCallback(async (doc) => {
    // If we have a cached file blob from this session, create object URL and open
    const cachedFile = fileCache.current[doc.docId];
    if (cachedFile) {
      const url = URL.createObjectURL(cachedFile);
      window.open(url, '_blank');
      return;
    }
    // Use pdfUrl from S3 — open directly in new tab
    if (doc.pdfUrl) {
      window.open(doc.pdfUrl, '_blank');
      return;
    }
    // Fall back to full fetch
    try {
      const result = await getCDoc(chapter.chapterId, doc.docId);
      const fullDoc = result.doc || doc;
      if (fullDoc.pdfUrl) {
        window.open(fullDoc.pdfUrl, '_blank');
      } else {
        alert('No PDF available for this document. Please re-upload it.');
      }
    } catch {
      alert('Failed to open document.');
    }
  }, [chapter]);

  const handleViewSummary = useCallback(async (doc) => {
    try {
      const result = await getCDoc(chapter.chapterId, doc.docId);
      const fullDoc = result.doc || doc;
      setAnalysisPanelDoc(fullDoc);
      setAnalysisPanelResults(fullDoc.aiResults || null);
    } catch {
      setAnalysisPanelDoc(doc);
      setAnalysisPanelResults(null);
    }
  }, [chapter]);



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

  if (!chapter || !subject) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#9CA3AF' }}>
        <FileX size={40} />
        <p style={{ fontSize: 14 }}>Select a subject and chapter to get started</p>
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
          <span style={{ color: '#6C5CE7', fontWeight: 500 }}>{subject.name}</span>
          <span style={{ margin: '0 8px' }}>/</span>
          <span>Ch {chapterIndex + 1}: {chapter.name}</span>
        </div>

        {/* Chapter header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1D2E', margin: 0, letterSpacing: '-0.02em' }}>
              Ch {chapterIndex + 1}: {chapter.name}
            </h1>
            <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0 0' }}>
              {docs.length} document{docs.length !== 1 ? 's' : ''}
              {unanalyzedCount > 0 ? ` · ${unanalyzedCount} not yet analyzed` : ''}
            </p>
          </div>

          {/* Action buttons */}
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

        {/* Documents section */}
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
                No documents yet. Upload a PDF to get started.
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
                  onMove={handleMove}
                />
              ))}
            </div>
          )}
        </div>

        {/* Notes & Key Points */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1A1D2E', margin: 0, flex: 1 }}>
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
              key={chapter.chapterId}
              chapterId={chapter.chapterId}
              initialContent={noteContent}
            />
          )}
        </div>
      </main>

      {/* Upload modal */}
      {moveDoc_ && (
        <MoveModal
          doc={moveDoc_}
          sourceType="chapter"
          sourceId={chapter.chapterId}
          onMoved={handleMoved}
          onClose={() => setMoveDoc(null)}
        />
      )}

      {showGenerateModal && docs.length > 0 && (
        <GenerateNotesModal
          docs={docs}
          chapterId={chapter.chapterId}
          subjectId={null}
          onInsert={handleInsertNotes}
          onClose={() => setShowGenerateModal(false)}
        />
      )}

      {showUpload && (
        <UploadModal
          chapterName={`${subject.name} — Ch ${chapterIndex + 1}: ${chapter.name}`}
          onUpload={handleUpload}
          onClose={() => setShowUpload(false)}
        />
      )}

      {/* Analysis panel */}
      {analysisPanelDoc && analysisPanelResults && (
        <AnalysisPanel
          doc={analysisPanelDoc}
          aiResults={analysisPanelResults}
          extractedText={analysisPanelDoc.extractedText || ''}
          onClose={() => { setAnalysisPanelDoc(null); setAnalysisPanelResults(null); }}
        />
      )}

      {/* Document viewer modal */}
      {viewerDoc && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 80,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 24px',
        }} onClick={() => { setViewerDoc(null); setViewerFile(null); setViewerPdfUrl(null); }}>
          <div style={{
            background: '#fff', borderRadius: 16, width: '100%', maxWidth: 1100, height: '92vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #E5E7EB' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#1A1D2E', flex: 1 }}>{viewerDoc.fileName}</span>
              <button onClick={() => { setViewerDoc(null); setViewerFile(null); setViewerPdfUrl(null); }} style={{ width: 28, height: 28, borderRadius: 7, background: '#F5F5F7', border: 'none', color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <DocumentViewer
                file={viewerFile}
                pdfUrl={viewerPdfUrl}
                fileName={viewerDoc.fileName}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChapterContent;
