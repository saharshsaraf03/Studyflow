import React, { forwardRef } from 'react';
import { FileText, Trash2, Loader2, Calendar, Sparkles } from 'lucide-react';

/**
 * DocumentCard — slim clickable card
 * Clicking anywhere on the card opens the DocumentModal.
 * Delete is the only separate action (stops propagation to avoid modal open).
 */
const DocumentCard = forwardRef(({ doc, onClick, onDelete }, ref) => {
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);

  const formattedDate = doc.updatedAt
    ? new Date(doc.updatedAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      })
    : '';

  const handleDeleteClick = (e) => {
    e.stopPropagation(); // prevent card click → modal open
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async (e) => {
    e.stopPropagation();
    setIsDeleting(true);
    try {
      await onDelete(doc.docId);
    } catch {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleCancelDelete = (e) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  return (
    <div
      ref={ref}
      onClick={onClick}
      className="sf-card p-4 flex items-center gap-4 cursor-pointer hover:shadow-md hover:border-primary-200 transition-all duration-200 group"
      style={{ userSelect: 'none' }}
    >
      {/* File icon */}
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105"
        style={{ background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)' }}
      >
        <FileText className="w-5 h-5 text-white" />
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-surface-900 truncate group-hover:text-primary-600 transition-colors">
          {doc.fileName}
        </p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {formattedDate && (
            <span className="flex items-center gap-1 text-xs text-surface-400">
              <Calendar className="w-3 h-3" />
              {formattedDate}
            </span>
          )}
          {doc.hasAiResults && (
            <span className="flex items-center gap-1 text-xs font-medium text-primary-500">
              <Sparkles className="w-3 h-3" />
              AI Results
            </span>
          )}
        </div>
      </div>

      {/* Delete action */}
      <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
        {!showDeleteConfirm ? (
          <button
            onClick={handleDeleteClick}
            className="p-2 rounded-lg text-surface-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
            title="Delete document"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-red-500 font-medium">Delete?</span>
            <button
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="px-2 py-1 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-60 transition-all"
            >
              {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Yes'}
            </button>
            <button
              onClick={handleCancelDelete}
              className="px-2 py-1 rounded-lg bg-surface-100 text-surface-600 text-xs font-medium hover:bg-surface-200 transition-all"
            >
              No
            </button>
          </div>
        )}
      </div>

      {/* Open hint */}
      <div className="text-xs text-surface-300 group-hover:text-primary-400 transition-colors flex-shrink-0 hidden sm:block">
        Click to open →
      </div>
    </div>
  );
});

DocumentCard.displayName = 'DocumentCard';
export default DocumentCard;
