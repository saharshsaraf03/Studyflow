import React, { useState } from 'react';
import {
  HelpCircle, MessageSquare, Bug, Lightbulb,
  Send, CheckCircle, Loader2, ChevronDown, ChevronUp,
  BookOpen, Mail,
} from 'lucide-react';

/**
 * HelpPage — route: /help
 * Features:
 * 1. Feedback form (review / bug report / feature request)
 *    Sends directly to saharsh.saraf03@gmail.com via EmailJS
 * 2. FAQ section
 */

// ── EmailJS config ────────────────────────────────────────────
// Sign up at emailjs.com, create a service + template, paste IDs below
const EMAILJS_SERVICE_ID = 'service_9ajhibo';
const EMAILJS_TEMPLATE_ID = 'template_dzdnuql';
const EMAILJS_PUBLIC_KEY = 'eqCcKH84RnvWNrh5s';

const FEEDBACK_TYPES = [
  { id: 'review', label: 'Review', icon: MessageSquare, color: '#00D2A0', desc: 'Share your experience' },
  { id: 'bug', label: 'Bug Report', icon: Bug, color: '#FF6B6B', desc: 'Something not working?' },
  { id: 'feature', label: 'Feature Request', icon: Lightbulb, color: '#FECA57', desc: 'Suggest an improvement' },
];

const FAQS = [
  {
    q: 'How do I get started?',
    a: 'Go to the Library page, add your subjects and chapters, then upload your PDFs. You can generate AI study notes and summaries from the documents you upload.',
  },
  {
    q: 'What types of files can I upload?',
    a: 'Currently only PDF files are supported, up to 10 MB each. Support for images and Word documents is planned.',
  },
  {
    q: 'How does the AI analysis work?',
    a: 'When you click "Analyze with AI" on a document, StudyFlow extracts the text and uses GPT-4o mini to generate a structured study plan and exam summary tailored to that content.',
  },
  {
    q: 'Is my data private?',
    a: 'Yes. Your documents and notes are stored securely in AWS DynamoDB, linked only to your account. No one else can access your library.',
  },
  {
    q: 'Can I use StudyFlow on mobile?',
    a: 'StudyFlow is a web app and works on mobile browsers. A dedicated mobile app is planned for a future release.',
  },
  {
    q: 'What happens to my data if I delete a subject?',
    a: 'Deleting a subject permanently removes all its chapters, documents, and notes from our servers. This cannot be undone.',
  },
];

const FaqItem = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      borderBottom: '1px solid #F0F0F2', paddingBottom: open ? 14 : 0,
      marginBottom: open ? 4 : 0,
    }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 0', background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left', gap: 12,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1D2E' }}>{q}</span>
        {open
          ? <ChevronUp size={16} style={{ color: '#6C5CE7', flexShrink: 0 }} />
          : <ChevronDown size={16} style={{ color: '#9CA3AF', flexShrink: 0 }} />
        }
      </button>
      {open && (
        <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.65, marginBottom: 4 }}>{a}</p>
      )}
    </div>
  );
};

const HelpPage = () => {
  const [feedbackType, setFeedbackType] = useState('review');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || !email.trim()) {
      setError('Please fill in your email and message.');
      return;
    }
    setError('');
    setIsSending(true);

    try {
      // Load EmailJS dynamically
      const emailjs = await import('@emailjs/browser');

      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          from_name: name || 'Anonymous',
          from_email: email,
          feedback_type: feedbackType,
          subject: subject || `StudyFlow ${feedbackType}`,
          message: message,
          to_email: 'saharsh.saraf03@gmail.com',
        },
        EMAILJS_PUBLIC_KEY
      );

      setSent(true);
      setMessage('');
      setSubject('');
    } catch (err) {
      console.error('EmailJS error:', err);
      setError('Failed to send. Please try emailing saharsh.saraf03@gmail.com directly.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1A1D2E', margin: '0 0 4px' }}>
            Help & Feedback
          </h1>
          <p style={{ fontSize: 14, color: '#9CA3AF', margin: 0 }}>
            Get answers or share your thoughts with the StudyFlow team
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          {/* ── Feedback Form ── */}
          <div className="sf-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Send size={16} style={{ color: '#fff' }} />
              </div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1A1D2E', margin: 0 }}>
                  Send Feedback
                </h3>
                <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>
                  Goes directly to the developer
                </p>
              </div>
            </div>

            {sent ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 12, padding: '32px 0', textAlign: 'center',
              }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'rgba(0,210,160,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <CheckCircle size={28} style={{ color: '#00D2A0' }} />
                </div>
                <h4 style={{ fontSize: 15, fontWeight: 700, color: '#1A1D2E', margin: 0 }}>
                  Thank you!
                </h4>
                <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
                  Your feedback has been sent. We'll get back to you soon.
                </p>
                <button
                  onClick={() => setSent(false)}
                  style={{
                    marginTop: 8, fontSize: 13, color: '#6C5CE7',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Feedback type */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>
                    Type of feedback
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {FEEDBACK_TYPES.map(({ id, label, icon: Icon, color }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setFeedbackType(id)}
                        style={{
                          flex: 1, padding: '8px 6px', borderRadius: 10,
                          border: feedbackType === id ? `1.5px solid ${color}` : '1px solid #E5E7EB',
                          background: feedbackType === id ? `${color}18` : '#FAFAFA',
                          cursor: 'pointer', display: 'flex', flexDirection: 'column',
                          alignItems: 'center', gap: 4, transition: 'all 0.15s',
                        }}
                      >
                        <Icon size={16} style={{ color: feedbackType === id ? color : '#9CA3AF' }} />
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: feedbackType === id ? color : '#6B7280',
                        }}>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                    Your name <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="John Doe"
                    className="sf-input"
                    style={{ width: '100%' }}
                  />
                </div>

                {/* Email */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                    Your email <span style={{ color: '#FF6B6B' }}>*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="sf-input"
                    style={{ width: '100%' }}
                    required
                  />
                </div>

                {/* Subject */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                    Subject <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Brief description..."
                    className="sf-input"
                    style={{ width: '100%' }}
                  />
                </div>

                {/* Message */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                    Message <span style={{ color: '#FF6B6B' }}>*</span>
                  </label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder={
                      feedbackType === 'review' ? 'Tell us what you think about StudyFlow...'
                      : feedbackType === 'bug' ? 'Describe the issue and steps to reproduce it...'
                      : 'Describe the feature you\'d like to see...'
                    }
                    rows={5}
                    className="sf-input"
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                    required
                  />
                </div>

                {error && (
                  <p style={{ fontSize: 12, color: '#FF6B6B', margin: 0 }}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={isSending}
                  className="btn-primary"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    gap: 6, height: 42, fontSize: 14,
                    opacity: isSending ? 0.7 : 1,
                  }}
                >
                  {isSending ? (
                    <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Sending...</>
                  ) : (
                    <><Send size={14} />Send Feedback</>
                  )}
                </button>

                <p style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', margin: 0 }}>
                  Or email directly:{' '}
                  <a href="mailto:saharsh.saraf03@gmail.com" style={{ color: '#6C5CE7' }}>
                    saharsh.saraf03@gmail.com
                  </a>
                </p>
              </form>
            )}
          </div>

          {/* ── FAQ ── */}
          <div className="sf-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, #00D2A0, #4FACFE)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <HelpCircle size={16} style={{ color: '#fff' }} />
              </div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1A1D2E', margin: 0 }}>
                  Frequently Asked Questions
                </h3>
                <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>
                  Quick answers to common questions
                </p>
              </div>
            </div>

            <div>
              {FAQS.map((faq, i) => (
                <FaqItem key={i} q={faq.q} a={faq.a} />
              ))}
            </div>

            <div style={{
              marginTop: 20, padding: '14px 16px', borderRadius: 12,
              background: 'rgba(108,92,231,0.06)', border: '1px solid rgba(108,92,231,0.12)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Mail size={16} style={{ color: '#6C5CE7', flexShrink: 0 }} />
              <p style={{ fontSize: 12, color: '#6C5CE7', margin: 0 }}>
                Still have questions? Email us at{' '}
                <a href="mailto:saharsh.saraf03@gmail.com" style={{ fontWeight: 600 }}>
                  saharsh.saraf03@gmail.com
                </a>
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default HelpPage;
