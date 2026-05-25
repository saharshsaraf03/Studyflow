import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Upload, Loader2, FileText } from 'lucide-react';

/**
 * DocumentViewer — renders a PDF file visually using pdf.js canvas rendering
 * Looks like Google Drive / browser PDF viewer
 *
 * Props:
 *   file: File object (if available from current session)
 *   fileName: string (shown when file not available)
 *   onRequestFile: () => void (called when user needs to re-select file)
 */
const DocumentViewer = ({ file, fileName, onRequestFile }) => {
  const [pdf, setPdf] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsFile, setNeedsFile] = useState(!file);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const fileInputRef = useRef(null);

  const loadPDF = useCallback(async (fileOrUrl) => {
    setIsLoading(true);
    setError('');
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs', import.meta.url,
      ).toString();

      let source;
      if (fileOrUrl instanceof File) {
        const arrayBuffer = await fileOrUrl.arrayBuffer();
        source = { data: arrayBuffer };
      } else {
        source = { url: fileOrUrl };
      }

      const loadedPdf = await pdfjsLib.getDocument(source).promise;
      setPdf(loadedPdf);
      setTotalPages(loadedPdf.numPages);
      setCurrentPage(1);
      setNeedsFile(false);
    } catch (err) {
      setError('Failed to load PDF. Please try re-selecting the file.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load if file provided
  useEffect(() => {
    if (file) loadPDF(file);
  }, [file]);

  // Render current page to canvas
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    const renderPage = async () => {
      // Cancel any ongoing render
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }

      const page = await pdf.getPage(currentPage);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const ctx = canvas.getContext('2d');
      const renderContext = { canvasContext: ctx, viewport };
      renderTaskRef.current = page.render(renderContext);

      try {
        await renderTaskRef.current.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Render error:', err);
        }
      }
    };

    renderPage();
  }, [pdf, currentPage, scale]);

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (f && f.type === 'application/pdf') loadPDF(f);
  };

  const goToPrev = () => setCurrentPage(p => Math.max(1, p - 1));
  const goToNext = () => setCurrentPage(p => Math.min(totalPages, p + 1));
  const zoomIn = () => setScale(s => Math.min(3, s + 0.2));
  const zoomOut = () => setScale(s => Math.max(0.5, s - 0.2));

  if (needsFile) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 16, padding: 40, textAlign: 'center',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16,
          background: 'rgba(108,92,231,0.10)', color: '#6C5CE7',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <FileText size={32} />
        </div>
        <div>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#1A1D2E', margin: '0 0 6px' }}>
            {fileName || 'Select PDF to view'}
          </p>
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>
            Re-select the PDF file to render it visually
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn-primary"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            height: 40, padding: '0 20px', fontSize: 13,
          }}
        >
          <Upload size={15} /> Select PDF File
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', background: '#2D2D2D',
        borderBottom: '1px solid #404040', flexShrink: 0,
        borderRadius: '12px 12px 0 0',
      }}>
        {/* Page navigation */}
        <button onClick={goToPrev} disabled={currentPage <= 1}
          style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: currentPage <= 1 ? 'not-allowed' : 'pointer', opacity: currentPage <= 1 ? 0.4 : 1 }}>
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: 13, color: '#E0E0E0', minWidth: 80, textAlign: 'center' }}>
          {isLoading ? '...' : `${currentPage} / ${totalPages}`}
        </span>
        <button onClick={goToNext} disabled={currentPage >= totalPages}
          style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', opacity: currentPage >= totalPages ? 0.4 : 1 }}>
          <ChevronRight size={16} />
        </button>

        <div style={{ width: 1, height: 20, background: '#555', margin: '0 4px' }} />

        {/* Zoom */}
        <button onClick={zoomOut}
          style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ZoomOut size={14} />
        </button>
        <span style={{ fontSize: 12, color: '#E0E0E0', minWidth: 44, textAlign: 'center' }}>
          {Math.round(scale * 100)}%
        </span>
        <button onClick={zoomIn}
          style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#444', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ZoomIn size={14} />
        </button>

        <div style={{ flex: 1 }} />

        {/* Re-select file */}
        <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileSelect} />
        <button onClick={() => fileInputRef.current?.click()}
          style={{ fontSize: 11, color: '#9CA3AF', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 8px' }}>
          Change file
        </button>
      </div>

      {/* Canvas area */}
      <div style={{
        flex: 1, overflowY: 'auto', overflowX: 'auto',
        background: '#525659',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '20px 16px',
        borderRadius: '0 0 12px 12px',
      }}>
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ccc', marginTop: 60 }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 14 }}>Loading PDF...</span>
          </div>
        ) : error ? (
          <div style={{ color: '#FF6B6B', fontSize: 13, marginTop: 40, textAlign: 'center' }}>
            <p>{error}</p>
            <button onClick={() => fileInputRef.current?.click()}
              style={{ marginTop: 12, color: '#6C5CE7', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Select file again
            </button>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            style={{
              boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
              maxWidth: '100%',
              display: 'block',
            }}
          />
        )}
      </div>
    </div>
  );
};

export default DocumentViewer;
