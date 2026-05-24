import { useState, useEffect, useCallback } from 'react';

/**
 * useTextSelection — detects text selection within a container ref
 * Returns: { selectedText, position, clearSelection }
 *
 * Position is the bounding rect of the selection, used to place ExplainPopover.
 * Only fires for selections longer than 10 characters to avoid accidental triggers.
 */
const useTextSelection = (containerRef) => {
  const [selectedText, setSelectedText] = useState('');
  const [position, setPosition] = useState(null);

  const clearSelection = useCallback(() => {
    setSelectedText('');
    setPosition(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    const handleMouseUp = () => {
      // Small delay so selection is fully committed before reading it
      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim();

        if (!text || text.length < 10) {
          setSelectedText('');
          setPosition(null);
          return;
        }

        // Confirm selection is inside our container
        const range = selection.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer)) return;

        const rect = range.getBoundingClientRect();
        setSelectedText(text);
        setPosition({
          top: rect.top + window.scrollY,
          left: rect.left + rect.width / 2,
          bottom: rect.bottom + window.scrollY,
        });
      }, 10);
    };

    const handleMouseDown = (e) => {
      // Clear if clicking outside the popover (popover has data-explain-popover attr)
      if (!e.target.closest('[data-explain-popover]')) {
        setSelectedText('');
        setPosition(null);
      }
    };

    container.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      container.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [containerRef]);

  return { selectedText, position, clearSelection };
};

export default useTextSelection;
