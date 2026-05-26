import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, Loader2, Sparkles, BookOpen, ChevronDown } from 'lucide-react';
import { globalChat, saveGlobalChat, loadGlobalChat } from '../../utils/api';

/**
 * GlobalChatbot — floating bottom-right chat panel for Library page
 *
 * Features:
 * - Floating button → slide-up panel
 * - Searches across ALL user documents (cross-document RAG)
 * - Full conversation persistence via DynamoDB (CHAT#GLOBAL)
 * - Source attribution — shows which docs were used
 * - Multi-turn context — sends last 6 messages as history
 */

const SUGGESTED = [
  'What topics are covered across my documents?',
  'Summarize the most important concepts',
  'What formulas should I know?',
  'Compare topics across my subjects',
];

const GlobalChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load chat history on first open
  useEffect(() => {
    if (!isOpen || historyLoaded) return;
    loadGlobalChat()
      .then(r => {
        setMessages(r.messages || []);
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));
  }, [isOpen, historyLoaded]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Track unread when closed
  useEffect(() => {
    if (!isOpen && messages.length > 0) {
      const aiMessages = messages.filter(m => m.role === 'ai');
      setUnreadCount(aiMessages.length > 0 ? 1 : 0);
    } else {
      setUnreadCount(0);
    }
  }, [isOpen]);

  const handleSend = useCallback(async (override) => {
    const question = (override || input).trim();
    if (!question || isLoading) return;

    setInput('');
    const userMsg = { role: 'user', content: question };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      // Build history in OpenAI format for multi-turn context
      const history = messages.slice(-6).map(m => ({
        role: m.role === 'ai' ? 'assistant' : m.role,
        content: m.content,
      }));

      const result = await globalChat({ question, history });

      const aiMsg = {
        role: 'ai',
        content: result.answer,
        sources: result.sources || [],
      };
      const finalMessages = [...updatedMessages, aiMsg];
      setMessages(finalMessages);

      // Persist to DynamoDB
      saveGlobalChat(finalMessages).catch(() => {});

    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'error',
        content: err.message || 'Something went wrong. Please try again.',
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleClearChat = () => {
    if (!window.confirm('Clear chat history?')) return;
    setMessages([]);
    saveGlobalChat([]).catch(() => {});
  };

  const panelHeight = isExpanded ? '85vh' : '520px';
  const panelWidth = isExpanded ? '640px' : '380px';

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: 'fixed', bottom: 28, right: 28, zIndex: 50,
            width: 56, height: 56, borderRadius: '50%', border: 'none',
            background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)',
            boxShadow: '0 4px 20px rgba(108,92,231,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.08)';
            e.currentTarget.style.boxShadow = '0 6px 24px rgba(108,92,231,0.5)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(108,92,231,0.4)';
          }}
          title="Ask your library"
        >
          <MessageCircle size={24} style={{ color: '#fff' }} />
          {unreadCount > 0 && (
            <div style={{
              position: 'absolute', top: 0, right: 0,
              width: 16, height: 16, borderRadius: '50%',
              background: '#FF6B6B', border: '2px solid #fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, color: '#fff',
            }}>!</div>
          )}
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <>
          {/* Backdrop for expanded mode */}
          {isExpanded && (
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 48, background: 'rgba(0,0,0,0.3)' }}
              onClick={() => setIsExpanded(false)}
            />
          )}

          <div
            style={{
              position: 'fixed', bottom: 28, right: 28, zIndex: 49,
              width: panelWidth, height: panelHeight,
              background: 'var(--bg-card)', borderRadius: 20,
              boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              animation: 'slideUpFade 0.28s cubic-bezier(0.4,0,0.2,1)',
              transition: 'width 0.25s ease, height 0.25s ease',
            }}
          >
            <style>{`
              @keyframes slideUpFade {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
            `}</style>

            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 16px', flexShrink: 0,
              background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Sparkles size={18} style={{ color: '#fff' }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>
                  Library Assistant
                </p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
                  Searches across all your documents
                </p>
              </div>

              {/* Expand/collapse */}
              <button
                onClick={() => setIsExpanded(v => !v)}
                style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: 'rgba(255,255,255,0.15)', border: 'none',
                  color: '#fff', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer',
                }}
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                <ChevronDown size={14} style={{
                  transform: isExpanded ? 'rotate(0deg)' : 'rotate(180deg)',
                  transition: 'transform 0.2s',
                }} />
              </button>

              <button
                onClick={() => setIsOpen(false)}
                style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: 'rgba(255,255,255,0.15)', border: 'none',
                  color: '#fff', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer',
                }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1, overflowY: 'auto', padding: '14px 14px 4px',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              {/* Loading history */}
              {!historyLoaded && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9CA3AF', fontSize: 13, padding: 8 }}>
                  <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  Loading conversation...
                </div>
              )}

              {/* Empty state */}
              {historyLoaded && messages.length === 0 && (
                <div style={{ padding: '8px 0' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', borderRadius: 12, marginBottom: 14,
                    background: 'rgba(108,92,231,0.10)', border: '1px solid rgba(108,92,231,0.20)',
                  }}>
                    <BookOpen size={14} style={{ color: '#6C5CE7', flexShrink: 0 }} />
                    <p style={{ fontSize: 12, color: '#8B82F0', margin: 0, lineHeight: 1.5 }}>
                      Ask me anything about your library. I'll search across all your uploaded documents to answer.
                    </p>
                  </div>
                  <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8, fontWeight: 500 }}>
                    Try asking:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {SUGGESTED.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(q)}
                        style={{
                          padding: '8px 12px', borderRadius: 10, textAlign: 'left',
                          border: '1px solid #E5E7EB', background: '#FAFAFA',
                          color: '#374151', fontSize: 12, cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = '#6C5CE7';
                          e.currentTarget.style.background = 'rgba(108,92,231,0.15)';
                          e.currentTarget.style.color = '#6C5CE7';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'var(--border-light)';
                          e.currentTarget.style.background = 'var(--bg-primary)';
                          e.currentTarget.style.color = 'var(--text-primary)';
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              {messages.map((msg, i) => (
                <div key={i} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}>
                  <span style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 3, padding: '0 4px' }}>
                    {msg.role === 'user' ? 'You' : msg.role === 'error' ? 'Error' : 'AI'}
                  </span>
                  <div style={{
                    maxWidth: '88%',
                    padding: '9px 13px',
                    fontSize: 13, lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg, #6C5CE7, #5B4ED4)'
                      : msg.role === 'error'
                        ? 'rgba(255,107,107,0.08)'
                        : 'var(--bg-primary)',
                    color: msg.role === 'user' ? '#fff'
                      : msg.role === 'error' ? '#FF6B6B'
                      : 'var(--text-primary)',
                    border: msg.role === 'error' ? '1px solid rgba(255,107,107,0.2)' : msg.role === 'user' ? 'none' : '1px solid var(--border-light)',
                  }}>
                    {msg.content}
                  </div>

                  {/* Source attribution */}
                  {msg.role === 'ai' && msg.sources && msg.sources.length > 0 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      marginTop: 5, padding: '0 4px', flexWrap: 'wrap',
                    }}>
                      <BookOpen size={10} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                      {msg.sources.map((s, si) => (
                        <span key={si} style={{
                          fontSize: 10, color: 'var(--text-muted)',
                          background: 'var(--bg-primary)', padding: '2px 7px',
                          borderRadius: 99, whiteSpace: 'nowrap',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          maxWidth: 140,
                        }} title={s}>{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 3, padding: '0 4px' }}>AI</span>
                  <div style={{
                    padding: '10px 14px', borderRadius: '14px 14px 14px 4px',
                    background: 'var(--bg-primary)', display: 'flex', gap: 4, alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 11, color: '#9CA3AF', marginRight: 4 }}>Searching library</span>
                    {[0, 150, 300].map(d => (
                      <div key={d} style={{
                        width: 5, height: 5, borderRadius: '50%', background: '#6C5CE7',
                        animation: 'pulse 1.2s infinite', animationDelay: `${d}ms`,
                      }} />
                    ))}
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Clear chat link */}
            {messages.length > 0 && (
              <div style={{ padding: '4px 16px', textAlign: 'right' }}>
                <button
                  onClick={handleClearChat}
                  style={{ fontSize: 11, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  Clear chat
                </button>
              </div>
            )}

            {/* Input */}
            <div style={{
              padding: '10px 14px 14px',
              borderTop: '1px solid #F0F0F2',
              display: 'flex', gap: 8, flexShrink: 0,
              background: '#fff',
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                placeholder="Ask about your documents..."
                rows={1}
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 12,
                  border: '1.5px solid var(--border-light)', fontSize: 13, color: 'var(--text-primary)', background: 'var(--bg-primary)',
                  resize: 'none', outline: 'none', fontFamily: 'inherit',
                  lineHeight: 1.5, maxHeight: 80, overflowY: 'auto',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => { e.target.style.borderColor = '#6C5CE7'; }}
                onBlur={e => { e.target.style.borderColor = '#E5E7EB'; }}
              />
              <button
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim()}
                style={{
                  width: 38, height: 38, borderRadius: 12, border: 'none',
                  background: isLoading || !input.trim()
                    ? '#E5E7EB'
                    : 'linear-gradient(135deg, #6C5CE7, #5B4ED4)',
                  color: isLoading || !input.trim() ? '#9CA3AF' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                  flexShrink: 0, alignSelf: 'flex-end',
                  transition: 'all 0.15s',
                }}
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default GlobalChatbot;
