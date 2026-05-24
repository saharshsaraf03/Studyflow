import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { explainText } from '../utils/api';

/**
 * ExplainPopover — two-state floating card
 * State 1: Small pill "✨ Ask AI About This" positioned above selection
 * State 2: Expands to show AI explanation with loading spinner
 *
 * Positioning: floats above the selection midpoint, clamped to viewport.
 */
const ExplainPopover = ({ selectedText, position, extractedText, onClose }) => {
  const [state, setState] = useState('trigger'); // 'trigger' | 'loading' | 'result'
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState('');
  const popoverRef = useRef(null);

  // Reset when selection changes
  useEffect(() => {
    setState('trigger');
    setExplanation('');
    setError('');
  }, [selectedText]);

  if (!selectedText || !position) return null;

  const handleAskAI = async () => {
    setState('loading');
    setError('');
    try {
      // Extract surrounding context (~500 chars around selected text occurrence)
      const idx = extractedText?.indexOf(selectedText.slice(0, 30)) ?? -1;
      const contextStart = Math.max(0, idx - 250);
      const contextEnd = Math.min((extractedText?.length || 0), idx + selectedText.length + 250);
      const context = idx !== -1
        ? extractedText.slice(contextStart, contextEnd)
        : extractedText?.slice(0, 500) || '';

      const result = await explainText({ selectedText, context });
      setExplanation(result.explanation);
      setState('result');
    } catch (err) {
      setError('Failed to get explanation. Please try again.');
      setState('result');
    }
  };

  // Position: above the selection midpoint, horizontally centered
  const popoverStyle = {
    position: 'fixed',
    zIndex: 1000,
    // We use transform to center horizontally from the left anchor
    left: Math.min(
      Math.max(140, position.left),
      window.innerWidth - 140
    ),
    top: position.top - (state === 'result' ? 220 : 52),
    transform: 'translateX(-50%)',
  };

  return (
    <div
      ref={popoverRef}
      data-explain-popover="true"
      style={popoverStyle}
      className="animate-fade-in"
    >
      {/* ── Trigger state: small pill button ── */}
      {state === 'trigger' && (
        <button
          onClick={handleAskAI}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white shadow-lg whitespace-nowrap transition-transform hover:scale-105"
          style={{ background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)' }}
        >
          <Sparkles className="w-3 h-3" />
          Ask AI About This
        </button>
      )}

      {/* ── Loading state ── */}
      {state === 'loading' && (
        <div className="sf-card p-4 w-64 shadow-xl">
          <div className="flex items-center gap-2 text-sm text-surface-500">
            <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
            Explaining...
          </div>
        </div>
      )}

      {/* ── Result state: explanation card ── */}
      {state === 'result' && (
        <div className="sf-card p-4 w-72 shadow-xl" style={{ maxHeight: '200px', overflowY: 'auto' }}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary-500 flex-shrink-0" />
              <span className="text-xs font-semibold text-primary-500 uppercase tracking-wider">AI Explanation</span>
            </div>
            <button onClick={onClose} className="p-0.5 rounded hover:bg-surface-100 transition-colors flex-shrink-0">
              <X className="w-3.5 h-3.5 text-surface-400" />
            </button>
          </div>
          {error ? (
            <p className="text-xs text-red-500">{error}</p>
          ) : (
            <p className="text-xs text-surface-700 leading-relaxed">{explanation}</p>
          )}
          <div className="mt-2 pt-2 border-t border-surface-100">
            <p className="text-xs text-surface-400 italic truncate">"{selectedText.slice(0, 60)}{selectedText.length > 60 ? '...' : ''}"</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExplainPopover;
