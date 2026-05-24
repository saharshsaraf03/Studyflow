import React, { useState, useEffect } from 'react';
import { Sparkles, X, Loader2, RefreshCw, Replace, PlusSquare } from 'lucide-react';
import { generateNotes, getCDoc, getSDoc } from '../../utils/api';

/**
 * GenerateNotesModal — Option C preview flow
 *
 * Steps:
 * 1. If multiple docs: show doc picker dropdown
 * 2. Fetch extractedText for selected doc
 * 3. Call /api/generate-notes
 * 4. Show preview of generated HTML
 * 5. User chooses: "Replace notes" or "Append to notes"
 */
const GenerateNotesModal = ({ docs, chapterId, subjectId, onInsert, onClose }) => {
  const [step, setStep] = useState(docs.length === 1 ? 'generating' : 'pick'); // 'pick' | 'generating' | 'preview'
  const [selectedDocId, setSelectedDocId] = useState(docs.length === 1 ? docs[0].docId : '');
  const [generatedHtml, setGeneratedHtml] = useState('');
  const [error, setError] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Auto-generate if only one doc
  useEffect(() => {
    if (docs.length === 1) {
      handleGenerate(docs[0].docId);
    }
  }, []);

  const fetchExtractedText = async (docId) => {
    if (chapterId) {
      const result = await getCDoc(chapterId, docId);
      return result.doc?.extractedText || '';
    } else {
      const result = await getSDoc(subjectId, docId);
      return result.doc?.extractedText || '';
    }
  };

  const handleGenerate = async (docId) => {
    const id = docId || selectedDocId;
    if (!id) return;
    setStep('generating');
    setError('');
    try {
      const doc = docs.find(d => d.docId === id);
      const extractedText = await fetchExtractedText(id);
      if (!extractedText || extractedText.length < 50) {
        throw new Error('This document has no extractable text. Try re-uploading the PDF.');
      }
      const result = await generateNotes({
        extractedText: extractedText.slice(0, 15000),
        fileName: doc?.fileName || 'document',
      });
      setGeneratedHtml(result.html);
      setStep('preview');
    } catch (err) {
      setError(err.message || 'Generation failed. Please try again.');
      setStep(docs.length === 1 ? 'pick_error' : 'pick');
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const doc = docs.find(d => d.docId === selectedDocId || d.docId === docs[0].docId);
      const extractedText = await fetchExtractedText(doc.docId);
      const result = await generateNotes({
        extractedText: extractedText.slice(0, 15000),
        fileName: doc?.fileName || 'document',
      });
      setGeneratedHtml(result.html);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', padding: 16,
    }}>
      <div className="sf-card" style={{
        width: '100%', maxWidth: 680,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: '1px solid #E5E7EB', flexShrink: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={18} style={{ color: '#fff' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1A1D2E', margin: 0 }}>Generate Study Notes</h3>
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 0 0' }}>
              AI will generate structured notes from your document
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 7, background: '#F5F5F7',
            border: 'none', color: '#6B7280', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer',
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Step: Pick document */}
        {(step === 'pick' || step === 'pick_error') && (
          <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>
                Select document to generate notes from:
              </label>
              <select
                value={selectedDocId}
                onChange={e => setSelectedDocId(e.target.value)}
                className="sf-select"
                style={{ width: '100%' }}
              >
                <option value="">Choose a document...</option>
                {docs.map(d => (
                  <option key={d.docId} value={d.docId}>{d.fileName}</option>
                ))}
              </select>
            </div>
            {error && (
              <p style={{ fontSize: 12, color: '#FF6B6B', margin: 0 }}>{error}</p>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{
                flex: 1, height: 40, borderRadius: 10, border: '1px solid #E5E7EB',
                background: '#fff', color: '#374151', fontSize: 14, fontWeight: 500, cursor: 'pointer',
              }}>Cancel</button>
              <button
                onClick={() => handleGenerate()}
                disabled={!selectedDocId}
                className="btn-primary"
                style={{ flex: 1, height: 40, borderRadius: 10, fontSize: 14, opacity: !selectedDocId ? 0.5 : 1, cursor: !selectedDocId ? 'not-allowed' : 'pointer' }}
              >
                Generate Notes
              </button>
            </div>
          </div>
        )}

        {/* Step: Generating */}
        {step === 'generating' && (
          <div style={{ padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative', width: 56, height: 56 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(108,92,231,0.2)' }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: '#6C5CE7', animation: 'spin 1s linear infinite' }} />
              <Sparkles size={22} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: '#6C5CE7' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#1A1D2E', margin: '0 0 4px' }}>Generating notes...</p>
              <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>Reading your document and structuring key concepts</p>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && (
          <>
            {/* Preview label + regenerate */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #F0F0F2', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: 'rgba(108,92,231,0.04)' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#6C5CE7', margin: 0 }}>PREVIEW</p>
                <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0 0' }}>Review the generated notes before inserting</p>
              </div>
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 32, padding: '0 12px', borderRadius: 8,
                  border: '1px solid #E5E7EB', background: '#fff',
                  color: '#6B7280', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  opacity: isRegenerating ? 0.5 : 1,
                }}
              >
                <RefreshCw size={12} style={{ animation: isRegenerating ? 'spin 1s linear infinite' : 'none' }} />
                Regenerate
              </button>
            </div>

            {/* Rendered preview */}
            <div
              style={{
                flex: 1, overflowY: 'auto', padding: '16px 24px',
                fontSize: 13, lineHeight: 1.65, color: '#374151',
              }}
              dangerouslySetInnerHTML={{ __html: generatedHtml }}
            />

            {/* Action buttons */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid #E5E7EB', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button onClick={onClose} style={{
                height: 40, padding: '0 16px', borderRadius: 10,
                border: '1px solid #E5E7EB', background: '#fff',
                color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}>Cancel</button>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => onInsert(generatedHtml, 'append')}
                style={{
                  height: 40, padding: '0 16px', borderRadius: 10,
                  border: '1.5px solid #6C5CE7', background: '#fff',
                  color: '#6C5CE7', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <PlusSquare size={14} /> Append to notes
              </button>
              <button
                onClick={() => onInsert(generatedHtml, 'replace')}
                className="btn-primary"
                style={{
                  height: 40, padding: '0 16px', borderRadius: 10,
                  fontSize: 13, fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <Replace size={14} /> Replace notes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default GenerateNotesModal;
