import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText, X, Loader2, Check } from 'lucide-react';

const MAX_SIZE = 10 * 1024 * 1024;

const extractTextFromPDF = async (file) => {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs', import.meta.url,
  ).toString();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
    if (text.length >= 50000) break;
  }
  return text.trim().slice(0, 50000);
};

/**
 * UploadModal — PDF upload dialog
 * Extracts text client-side, calls onUpload with { file, extractedText }
 */
const UploadModal = ({ chapterName, onUpload, onClose }) => {
  const [file, setFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleFile = useCallback((f) => {
    setError('');
    if (!f) return;
    if (f.type !== 'application/pdf') { setError('Please upload a PDF file.'); return; }
    if (f.size > MAX_SIZE) { setError('File exceeds 10 MB limit.'); return; }
    setFile(f);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault(); setIsDragOver(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgress('Extracting text from PDF...');
    try {
      const extractedText = await extractTextFromPDF(file);
      setProgress('Uploading to cloud storage...');
      await onUpload({ file, extractedText });
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
      setIsProcessing(false);
      setProgress('');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      padding: 16,
    }}>
      <div className="sf-card" style={{ width: '100%', maxWidth: 480, padding: 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1A1D2E', margin: 0 }}>Upload PDF</h3>
            {chapterName && <p style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 0 0' }}>to {chapterName}</p>}
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, background: '#F5F5F7', border: 'none', color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>

        {!file ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${isDragOver ? '#6C5CE7' : '#E5E7EB'}`,
              borderRadius: 12, padding: '40px 24px', textAlign: 'center',
              cursor: 'pointer', background: isDragOver ? 'rgba(108,92,231,0.04)' : '#FAFAFA',
              transition: 'all 0.2s',
            }}
          >
            <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0])} />
            <Upload size={32} style={{ color: isDragOver ? '#6C5CE7' : '#9CA3AF', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, fontWeight: 500, color: '#374151', margin: '0 0 4px' }}>
              Drag & drop your PDF here
            </p>
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>or click to browse · Max 10 MB</p>
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: 14,
            background: '#F9F9FB', borderRadius: 10, border: '1px solid #E5E7EB',
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(108,92,231,0.10)', color: '#6C5CE7',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <FileText size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
              <div style={{ fontSize: 12, color: '#9CA3AF' }}>{Math.round(file.size / 1024)} KB</div>
            </div>
            {!isProcessing && (
              <button onClick={() => setFile(null)} style={{ width: 24, height: 24, borderRadius: 5, background: 'transparent', border: 'none', color: '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {error && (
          <p style={{ fontSize: 12, color: '#FF6B6B', marginTop: 8, textAlign: 'center' }}>{error}</p>
        )}

        {isProcessing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: '#6C5CE7' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
            {progress}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} disabled={isProcessing}
            style={{
              flex: 1, height: 40, borderRadius: 10, border: '1px solid #E5E7EB',
              background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500,
              cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.5 : 1,
            }}>
            Cancel
          </button>
          <button onClick={handleUpload} disabled={!file || isProcessing}
            className="btn-primary"
            style={{ flex: 1, height: 40, borderRadius: 10, fontSize: 14, fontWeight: 600, opacity: (!file || isProcessing) ? 0.5 : 1, cursor: (!file || isProcessing) ? 'not-allowed' : 'pointer' }}>
            {isProcessing ? 'Uploading...' : 'Upload PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadModal;
