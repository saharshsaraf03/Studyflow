import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Library, Plus, Loader2, FileX } from 'lucide-react';
import { Link } from 'react-router-dom';
import DocumentCard from '../components/DocumentCard';
import DocumentModal from '../components/DocumentModal';
import { listDocuments, loadNotes, deleteDocument } from '../utils/api';

/**
 * LibraryPage — route: /library
 *
 * Owns:
 * - documents[] and notes{} fetched on mount
 * - selectedDoc + originRect for the modal
 * - delete handler (removes from list after API call)
 *
 * Scale-from-card animation works by:
 * 1. Storing a ref for each card (cardRefs map)
 * 2. On card click, calling getBoundingClientRect() on that card's ref
 * 3. Passing the rect to DocumentModal as originRect
 * 4. DocumentModal uses it as the animation start position
 */
const LibraryPage = ({ planData }) => {
  const [documents, setDocuments] = useState([]);
  const [notes, setNotes] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal state
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [originRect, setOriginRect] = useState(null);

  // Map of docId → ref for scale-from-card animation
  const cardRefs = useRef({});

  useEffect(() => {
    async function fetchLibraryData() {
      setIsLoading(true);
      setError(null);
      try {
        const [docsResult, notesResult] = await Promise.all([
          listDocuments(),
          loadNotes(),
        ]);
        const sorted = (docsResult.documents || []).sort(
          (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
        );
        setDocuments(sorted);
        setNotes(notesResult.notes || {});
      } catch (err) {
        setError(err.message || 'Failed to load library. Please refresh.');
      } finally {
        setIsLoading(false);
      }
    }
    fetchLibraryData();
  }, []);

  const handleCardClick = useCallback((doc) => {
    const ref = cardRefs.current[doc.docId];
    const rect = ref ? ref.getBoundingClientRect() : null;
    setOriginRect(rect);
    setSelectedDoc(doc);
  }, []);

  const handleModalClose = useCallback(() => {
    setSelectedDoc(null);
    setOriginRect(null);
  }, []);

  const handleDelete = useCallback(async (docId) => {
    await deleteDocument(docId);
    setDocuments(prev => prev.filter(d => d.docId !== docId));
    // If this doc was open in modal, close it
    if (selectedDoc?.docId === docId) handleModalClose();
  }, [selectedDoc, handleModalClose]);

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)' }}>
                <Library className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-surface-900">Library</h1>
            </div>
            <p className="text-sm text-surface-500">
              Your saved documents, AI results, chat history, and notes.
            </p>
          </div>
          <Link to="/ai-tools" className="btn-primary flex items-center gap-2 text-sm self-start sm:self-auto">
            <Plus className="w-4 h-4" />
            Upload New PDF
          </Link>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center gap-3 py-24 text-surface-400">
            <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
            <span className="text-sm">Loading your library...</span>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="sf-card p-6 text-center">
            <FileX className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-red-500 mb-4">{error}</p>
            <button onClick={() => window.location.reload()} className="btn-secondary text-sm">
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && documents.length === 0 && (
          <div className="sf-card p-12 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'linear-gradient(135deg, rgba(108,92,231,0.1), rgba(79,172,254,0.1))' }}>
              <Library className="w-8 h-8 text-primary-400" />
            </div>
            <h3 className="text-lg font-semibold text-surface-800 mb-2">No documents yet</h3>
            <p className="text-sm text-surface-500 mb-6 max-w-sm mx-auto">
              Upload a PDF in AI Tools to generate a study plan and exam summary.
              Everything gets saved here automatically.
            </p>
            <Link to="/ai-tools" className="btn-primary inline-flex items-center gap-2 text-sm">
              <Plus className="w-4 h-4" />
              Upload Your First PDF
            </Link>
          </div>
        )}

        {/* Document list */}
        {!isLoading && !error && documents.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-surface-400 font-medium uppercase tracking-wider">
              {documents.length} document{documents.length > 1 ? 's' : ''}
            </p>
            {documents.map(doc => (
              <DocumentCard
                key={doc.docId}
                ref={el => { cardRefs.current[doc.docId] = el; }}
                doc={doc}
                onClick={() => handleCardClick(doc)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal — rendered at root level to avoid clipping */}
      {selectedDoc && (
        <DocumentModal
          doc={selectedDoc}
          planData={planData}
          notes={notes}
          originRect={originRect}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
};

export default LibraryPage;
