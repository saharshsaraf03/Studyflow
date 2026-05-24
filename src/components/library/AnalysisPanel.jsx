import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Target, FileText, MessageCircle, Loader2, Send } from 'lucide-react';
import StudyPlanView from '../StudyPlanView';
import ExamSummaryView from '../ExamSummaryView';
import { callRAG, saveChat, loadChat } from '../../utils/api';

/**
 * AnalysisPanel — slides in from right
 * Tabs: Study Plan | Exam Summary | Chat
 */
const SUGGESTED = [
  'Summarize the key concepts',
  'What are the most important formulas?',
  'Explain the hardest topic',
  'Give me practice questions',
];

const AnalysisPanel = ({ doc, aiResults, extractedText, onClose }) => {
  const [activeTab, setActiveTab] = useState('plan');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatLoaded, setChatLoaded] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // Load chat history when chat tab opens
  useEffect(() => {
    if (activeTab !== 'chat' || chatLoaded || !doc?.docId) return;
    loadChat(doc.docId)
      .then(r => { setChatMessages(r.messages || []); setChatLoaded(true); })
      .catch(() => setChatLoaded(true));
  }, [activeTab, doc?.docId, chatLoaded]);

  const handleSend = useCallback(async (override) => {
    const message = (override || chatInput).trim();
    if (!message || chatLoading || !extractedText) return;
    setChatInput('');
    const updated = [...chatMessages, { role: 'user', content: message }];
    setChatMessages(updated);
    setChatLoading(true);
    try {
      const json = await callRAG({
        extractedText: extractedText.slice(0, 12000),
        action: 'chat',
        question: message,
      });
      const answer = json.answer || 'No response received.';
      const final = [...updated, { role: 'ai', content: answer }];
      setChatMessages(final);
      if (doc?.docId) saveChat({ docId: doc.docId, messages: final }).catch(() => {});
    } catch (err) {
      setChatMessages(p => [...p, { role: 'error', content: err.message }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatMessages, extractedText, doc]);

  const studyPlan = aiResults?.studyPlan || null;
  const examSummary = aiResults?.examSummary || null;

  const TABS = [
    { id: 'plan', label: 'Study Plan', icon: Target },
    { id: 'summary', label: 'Exam Summary', icon: FileText },
    { id: 'chat', label: 'Chat', icon: MessageCircle },
  ];

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 60,
      width: Math.min(580, window.innerWidth - 240),
      background: '#F5F5F7',
      borderLeft: '1px solid #E5E7EB',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.1)',
      display: 'flex', flexDirection: 'column',
      animation: 'slideInRight 0.25s cubic-bezier(0.4,0,0.2,1)',
    }}>
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
        background: '#fff', borderBottom: '1px solid #E5E7EB', flexShrink: 0,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Sparkles size={16} style={{ color: '#fff' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {doc?.fileName}
          </div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>AI Analysis</div>
        </div>
        <button onClick={onClose} style={{
          width: 28, height: 28, borderRadius: 7, background: '#F5F5F7',
          border: 'none', color: '#6B7280', display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
        }}>
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '10px 14px 0', flexShrink: 0, background: '#fff', borderBottom: '1px solid #F0F0F2' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 34, padding: '0 14px', borderRadius: '8px 8px 0 0',
            border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
            background: activeTab === id ? '#F5F5F7' : 'transparent',
            color: activeTab === id ? '#6C5CE7' : '#6B7280',
            borderBottom: activeTab === id ? '2px solid #6C5CE7' : '2px solid transparent',
          }}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: activeTab === 'chat' ? 0 : 16, display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'plan' && <StudyPlanView studyPlan={studyPlan} />}
        {activeTab === 'summary' && <ExamSummaryView examSummary={examSummary} />}

        {activeTab === 'chat' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            {!extractedText ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: '#9CA3AF', padding: 24 }}>
                <MessageCircle size={32} />
                <p style={{ fontSize: 13, margin: 0 }}>Document text not available for chat.</p>
              </div>
            ) : (
              <>
                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {!chatLoaded && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9CA3AF', fontSize: 13 }}>
                      <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading history...
                    </div>
                  )}
                  {chatLoaded && chatMessages.length === 0 && !chatLoading && (
                    <div>
                      <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>Ask anything about this document</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {SUGGESTED.map((q, i) => (
                          <button key={i} onClick={() => handleSend(q)} style={{
                            padding: '5px 10px', borderRadius: 99, fontSize: 12,
                            border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280',
                            cursor: 'pointer', transition: 'all 0.15s',
                          }}>{q}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <span style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3, padding: '0 4px' }}>
                        {msg.role === 'user' ? 'You' : msg.role === 'error' ? 'Error' : 'AI'}
                      </span>
                      <div style={{
                        maxWidth: '85%', padding: '8px 12px', fontSize: 13, lineHeight: 1.55,
                        whiteSpace: 'pre-wrap', borderRadius: 12,
                        background: msg.role === 'user' ? 'rgba(108,92,231,0.08)' : msg.role === 'error' ? 'rgba(255,107,107,0.08)' : '#fff',
                        border: `1px solid ${msg.role === 'user' ? 'rgba(108,92,231,0.2)' : msg.role === 'error' ? 'rgba(255,107,107,0.2)' : '#E5E7EB'}`,
                        color: msg.role === 'error' ? '#FF6B6B' : '#374151',
                        borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3, padding: '0 4px' }}>AI</span>
                      <div style={{ padding: '8px 14px', borderRadius: '12px 12px 12px 4px', background: '#fff', border: '1px solid #E5E7EB', display: 'flex', gap: 4 }}>
                        {[0,150,300].map(d => <div key={d} style={{ width: 6, height: 6, borderRadius: '50%', background: '#6C5CE7', animation: 'pulse 1.2s infinite', animationDelay: `${d}ms` }} />)}
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input */}
                <div style={{ padding: '10px 14px', borderTop: '1px solid #E5E7EB', background: '#fff', flexShrink: 0, display: 'flex', gap: 8 }}>
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    disabled={chatLoading}
                    placeholder="Ask about this document..."
                    className="sf-input"
                    style={{ flex: 1, fontSize: 13 }}
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={chatLoading || !chatInput.trim()}
                    className="btn-primary"
                    style={{ padding: '0 12px', height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: (chatLoading || !chatInput.trim()) ? 0.4 : 1 }}
                  >
                    <Send size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisPanel;
