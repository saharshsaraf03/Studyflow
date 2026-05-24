import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, FileText, Target, BookOpen, MessageCircle,
  StickyNote, Send, Loader2, AlertCircle, Sparkles
} from 'lucide-react';
import StudyPlanView from './StudyPlanView';
import ExamSummaryView from './ExamSummaryView';
import DocumentViewer from './DocumentViewer';
import NotesEditor from './NotesEditor';
import { getDocument, loadChat, saveChat, callRAG, deleteDocument } from '../utils/api';

/**
 * DocumentModal — full-screen overlay PDF viewer
 *
 * Animation: scales up from the card's bounding rect (Option C)
 * Layout:
 *   Desktop — fixed left sidebar (200px) + scrollable content area
 *   Mobile  — content area fills screen + bottom tab bar
 *
 * Lifecycle:
 *   1. Mounts with originRect from card's getBoundingClientRect()
 *   2. Animates from card position → full screen (CSS transition)
 *   3. Fetches full document on mount
 *   4. Fetches chat history lazily when Chat tab first opens
 *   5. Escape key or backdrop click closes modal
 *   6. Body scroll locked while open
 */

const TABS = [
  { id: 'plan',     label: 'Study Plan',   icon: Target },
  { id: 'summary',  label: 'Exam Summary', icon: FileText },
  { id: 'document', label: 'Document',     icon: BookOpen },
  { id: 'chat',     label: 'Chat',         icon: MessageCircle },
  { id: 'notes',    label: 'Notes',        icon: StickyNote },
];

const SUGGESTED_QUESTIONS = [
  'Summarize the key concepts',
  'What are the most important formulas?',
  'Explain the hardest topic',
  'Give me practice questions',
];

const DocumentModal = ({ doc, planData, notes, originRect, onClose }) => {
  const [activeTab, setActiveTab] = useState('plan');
  const [isAnimatedIn, setIsAnimatedIn] = useState(false);

  // Document data
  const [fullDoc, setFullDoc] = useState(null);
  const [docLoading, setDocLoading] = useState(true);
  const [docError, setDocError] = useState(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatLoaded, setChatLoaded] = useState(false);

  const chatEndRef = useRef(null);
  const contentRef = useRef(null);

  // ── Lock body scroll on mount ──────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── Animate in ────────────────────────────────────────────
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsAnimatedIn(true));
    });
  }, []);

  // ── Escape key to close ───────────────────────────────────
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // ── Fetch full document on mount ──────────────────────────
  useEffect(() => {
    async function fetchDoc() {
      setDocLoading(true);
      try {
        const result = await getDocument(doc.docId);
        setFullDoc(result.document);
      } catch (err) {
        setDocError(err.message || 'Failed to load document');
      } finally {
        setDocLoading(false);
      }
    }
    fetchDoc();
  }, [doc.docId]);

  // ── Fetch chat history when Chat tab first opens ───────────
  useEffect(() => {
    if (activeTab !== 'chat' || chatLoaded) return;
    loadChat(doc.docId)
      .then(r => { setChatMessages(r.messages || []); setChatLoaded(true); })
      .catch(() => setChatLoaded(true));
  }, [activeTab, doc.docId, chatLoaded]);

  // ── Auto-scroll chat ──────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // ── Reset content scroll on tab change ───────────────────
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [activeTab]);

  // ── Close with animate-out ────────────────────────────────
  const handleClose = () => {
    setIsAnimatedIn(false);
    setTimeout(onClose, 280);
  };

  // ── Chat send ─────────────────────────────────────────────
  const handleSendChat = useCallback(async (overrideMessage) => {
    const message = (overrideMessage || chatInput).trim();
    if (!message || chatLoading || !fullDoc?.extractedText) return;
    setChatInput('');
    const updated = [...chatMessages, { role: 'user', content: message }];
    setChatMessages(updated);
    setChatLoading(true);
    try {
      const json = await callRAG({
        extractedText: fullDoc.extractedText.slice(0, 12000),
        action: 'chat',
        question: message,
      });
      const answer = json.answer || 'No response received.';
      const final = [...updated, { role: 'ai', content: answer }];
      setChatMessages(final);
      saveChat({ docId: doc.docId, messages: final }).catch(() => {});
    } catch (err) {
      setChatMessages(p => [...p, { role: 'error', content: err.message }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, fullDoc, doc.docId]);

  const handleChatKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); }
  };

  // ── Derived data ──────────────────────────────────────────
  const aiResults = fullDoc?.aiResults || {};
  const studyPlan = aiResults.studyPlan || null;
  const examSummary = aiResults.examSummary || null;
  const extractedText = fullDoc?.extractedText || null;

  const formattedDate = doc.updatedAt
    ? new Date(doc.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  // ── Scale-from-card animation styles ─────────────────────
  // originRect is the card's getBoundingClientRect()
  // We animate from the card's position/size → full viewport
  const backdropStyle = {
    opacity: isAnimatedIn ? 1 : 0,
    transition: 'opacity 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
  };

  const modalStyle = isAnimatedIn
    ? {
        // Final state: full screen
        top: 0, left: 0, right: 0, bottom: 0,
        borderRadius: '0px',
        transform: 'scale(1)',
        opacity: 1,
        transition: 'all 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
      }
    : originRect
    ? {
        // Initial state: match the card's position exactly
        top: originRect.top,
        left: originRect.left,
        width: originRect.width,
        height: originRect.height,
        borderRadius: '16px',
        transform: 'scale(1)',
        opacity: 0,
        transition: 'all 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
      }
    : {
        top: '5%', left: '5%', right: '5%', bottom: '5%',
        borderRadius: '16px',
        opacity: 0,
        transition: 'all 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
      };

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', ...backdropStyle }}
        onClick={handleClose}
      />

      {/* ── Modal ── */}
      <div
        className="fixed z-50 flex flex-col overflow-hidden"
        style={{
          background: '#F5F5F7',
          boxShadow: '0 25px 80px rgba(0,0,0,0.4)',
          ...modalStyle,
        }}
      >
        {/* ── Header bar (dark navy) ── */}
        <div
          className="flex items-center gap-3 px-5 py-3 flex-shrink-0"
          style={{ background: '#1A1D2E', borderBottom: '1px solid #2D3148' }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)' }}>
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{doc.fileName}</p>
            {formattedDate && (
              <p className="text-xs" style={{ color: '#64748B' }}>Saved {formattedDate}</p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body: sidebar + content (desktop) / content + bottom tabs (mobile) ── */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Desktop sidebar */}
          <nav
            className="hidden md:flex flex-col py-4 px-3 gap-1 flex-shrink-0"
            style={{
              width: '200px',
              background: '#1A1D2E',
              borderRight: '1px solid #2D3148',
            }}
          >
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                  activeTab === id
                    ? 'text-white bg-primary-500/20 border border-primary-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${activeTab === id ? 'text-primary-400' : ''}`} />
                {label}
              </button>
            ))}
          </nav>

          {/* Content area */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">

            {/* Loading state */}
            {docLoading && (
              <div className="flex-1 flex items-center justify-center gap-3 text-surface-400">
                <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                <span className="text-sm">Loading document...</span>
              </div>
            )}

            {/* Error state */}
            {docError && !docLoading && (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="sf-card p-6 text-center max-w-sm">
                  <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                  <p className="text-sm text-red-500">{docError}</p>
                </div>
              </div>
            )}

            {/* Loaded content */}
            {fullDoc && !docLoading && (
              <div ref={contentRef} className="flex-1 overflow-y-auto p-6">

                {/* Study Plan */}
                {activeTab === 'plan' && <StudyPlanView studyPlan={studyPlan} />}

                {/* Exam Summary */}
                {activeTab === 'summary' && <ExamSummaryView examSummary={examSummary} />}

                {/* Document viewer */}
                {activeTab === 'document' && (
                  extractedText ? (
                    <div className="max-w-3xl mx-auto">
                      {/* Paper-like document card (Option B) */}
                      <div
                        className="rounded-2xl p-8 mb-4"
                        style={{
                          background: '#FFFFFF',
                          boxShadow: '0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
                          border: '1px solid rgba(0,0,0,0.06)',
                        }}
                      >
                        {/* Document header */}
                        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-surface-100">
                          <FileText className="w-5 h-5 text-primary-400 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-surface-800">{doc.fileName}</p>
                            <p className="text-xs text-surface-400">Extracted text</p>
                          </div>
                        </div>
                        {/* DocumentViewer handles search + text selection */}
                        <DocumentViewer extractedText={extractedText} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="sf-card p-8 text-center">
                        <BookOpen className="w-10 h-10 text-surface-400 mx-auto mb-3" />
                        <p className="text-sm text-surface-500">No document text available.</p>
                      </div>
                    </div>
                  )
                )}

                {/* Chat */}
                {activeTab === 'chat' && (
                  <div className="max-w-3xl mx-auto flex flex-col" style={{ minHeight: 'calc(100vh - 220px)' }}>
                    {!extractedText ? (
                      <div className="sf-card p-8 text-center">
                        <MessageCircle className="w-10 h-10 text-surface-400 mx-auto mb-3" />
                        <p className="text-sm text-surface-500">Document text needed to enable chat.</p>
                      </div>
                    ) : (
                      <>
                        {/* Messages */}
                        <div className="flex-1 space-y-3 mb-4">
                          {!chatLoaded && (
                            <div className="flex items-center gap-2 text-surface-400 text-sm py-6">
                              <Loader2 className="w-4 h-4 animate-spin" /> Loading chat history...
                            </div>
                          )}
                          {chatLoaded && chatMessages.length === 0 && !chatLoading && (
                            <div>
                              <p className="text-sm text-surface-400 mb-3">Ask anything about this document</p>
                              <div className="flex flex-wrap gap-2">
                                {SUGGESTED_QUESTIONS.map((q, i) => (
                                  <button key={i} onClick={() => handleSendChat(q)}
                                    className="bg-white border border-surface-200 text-surface-500 text-xs px-3 py-1.5 rounded-full hover:bg-primary-50 hover:text-primary-500 hover:border-primary-200 transition-all">
                                    {q}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {chatMessages.map((msg, i) => (
                            <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                              <span className="text-xs text-surface-400 mb-1 px-1">
                                {msg.role === 'user' ? 'You' : msg.role === 'error' ? 'Error' : 'AI'}
                              </span>
                              <div className={`max-w-[80%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap rounded-2xl ${
                                msg.role === 'user'
                                  ? 'bg-primary-50 border border-primary-200 rounded-tr-sm text-surface-900'
                                  : msg.role === 'error'
                                    ? 'bg-red-50 border border-red-200 rounded-tl-sm text-red-600'
                                    : 'bg-white border border-surface-200 rounded-tl-sm text-surface-800'
                              }`}>
                                {msg.content}
                              </div>
                            </div>
                          ))}
                          {chatLoading && (
                            <div className="flex flex-col items-start">
                              <span className="text-xs text-surface-400 mb-1 px-1">AI</span>
                              <div className="px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1.5 bg-white border border-surface-200">
                                {[0,300,600].map(d => (
                                  <div key={d} className="w-2 h-2 rounded-full bg-primary-400 animate-pulse"
                                    style={{ animationDelay: `${d}ms` }} />
                                ))}
                              </div>
                            </div>
                          )}
                          <div ref={chatEndRef} />
                        </div>

                        {/* Sticky chat input */}
                        <div className="sticky bottom-0 pt-3 pb-1"
                          style={{ background: 'linear-gradient(to top, #F5F5F7 80%, transparent)' }}>
                          <div className="flex gap-2">
                            <input
                              type="text" value={chatInput}
                              onChange={e => setChatInput(e.target.value)}
                              onKeyDown={handleChatKey}
                              disabled={chatLoading}
                              placeholder="Ask a question about this document..."
                              className="sf-input flex-1 text-sm disabled:opacity-50"
                            />
                            <button
                              onClick={() => handleSendChat()}
                              disabled={chatLoading || !chatInput.trim()}
                              className="btn-primary p-2.5 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Notes */}
                {activeTab === 'notes' && (
                  <div className="max-w-3xl mx-auto">
                    <NotesEditor planData={planData} notes={notes} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Mobile bottom tab bar ── */}
        <div
          className="md:hidden flex items-center justify-around px-2 py-2 flex-shrink-0 border-t"
          style={{ background: '#1A1D2E', borderColor: '#2D3148' }}
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${
                activeTab === id ? 'text-primary-400' : 'text-slate-500'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

export default DocumentModal;
