import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload, FileText, X, Target, Clock, AlertCircle,
  Lightbulb, RefreshCw, Loader2, Sparkles, BookOpen, Download,
  MessageCircle, Send, Save, CheckCircle
} from 'lucide-react';
import { saveDocument, saveChat, callRAG } from '../utils/api';

/* ============================================================
   AIToolsPage — PDF Upload + AI Study Plan + Chat
   Route: /ai-tools
   
   v2 changes:
   - After AI generation, document + results saved to DynamoDB
   - Chat history saved to DynamoDB after each message
   - docId generated client-side (timestamp + random string)
   ============================================================ */

// ── Helpers ───────────────────────────────────────────────────

const MAX_TEXT_LENGTH = 15000;

const extractTextFromPDF = async (file) => {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url,
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(' ');
    fullText += pageText + '\n';
    if (fullText.length >= MAX_TEXT_LENGTH) break;
  }
  return fullText.trim().slice(0, MAX_TEXT_LENGTH);
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/** Generate a unique document ID — timestamp + 6 random chars */
const generateDocId = () => {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${rand}`;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const LOADING_MESSAGES = [
  'Extracting text from PDF...',
  'Analyzing content...',
  'Generating study plan...',
  'Identifying important topics...',
  'Creating exam summary...',
  'Almost there...',
];

const SUGGESTED_QUESTIONS = [
  'Summarize the key concepts',
  'What are the most important formulas?',
  'Explain the hardest topic',
  'Give me practice questions',
];

// ── Main Component ────────────────────────────────────────────

const AIToolsPage = () => {
  // File state
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('plan');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Persistence state
  const [docId, setDocId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // 'saved' | 'error' | null

  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [storedText, setStoredText] = useState('');

  const fileInputRef = useRef(null);
  const loadingIntervalRef = useRef(null);
  const chatEndRef = useRef(null);

  // ── Rotating loading messages ─────────────────────────────
  useEffect(() => {
    if (isProcessing) {
      let idx = 0;
      setLoadingMessage(LOADING_MESSAGES[0]);
      loadingIntervalRef.current = setInterval(() => {
        idx = (idx + 1) % LOADING_MESSAGES.length;
        setLoadingMessage(LOADING_MESSAGES[idx]);
      }, 4500);
    } else {
      clearInterval(loadingIntervalRef.current);
    }
    return () => clearInterval(loadingIntervalRef.current);
  }, [isProcessing]);

  // ── Chat auto-scroll ──────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatLoading]);

  // ── File selection ────────────────────────────────────────
  const handleFileSelect = useCallback((selectedFile) => {
    setError(null);
    if (!selectedFile) return;
    if (selectedFile.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(`File size exceeds 10 MB limit. Your file is ${formatFileSize(selectedFile.size)}.`);
      return;
    }
    setFile(selectedFile);
    setFileName(selectedFile.name);
    setFileSize(selectedFile.size);
  }, []);

  const handleInputChange = (e) => {
    if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
  };

  const clearFile = () => {
    setFile(null); setFileName(''); setFileSize(0); setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetAll = () => {
    clearFile();
    setResults(null); setActiveTab('plan');
    setChatMessages([]); setChatInput(''); setStoredText('');
    setDocId(null); setSaveStatus(null);
  };

  // ── Drag & Drop ───────────────────────────────────────────
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
  };

  // ── Generate study plan ───────────────────────────────────
  const handleGenerate = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    setResults(null);
    setSaveStatus(null);

    try {
      const extractedText = await extractTextFromPDF(file);
      if (!extractedText || extractedText.length < 10) {
        throw new Error('Could not extract readable text from this PDF. It may be scanned/image-based.');
      }

      const truncatedText = extractedText.slice(0, 12000);
      const json = await callRAG({ extractedText: truncatedText, action: 'generate_plan' });

      if (json.error) throw new Error(json.error);
      if (!json.success || !json.data) throw new Error('Unexpected response format from the server.');

      const aiResults = json.data.raw ? { raw: json.data.raw } : json.data;
      setStoredText(truncatedText);
      setResults(aiResults);

      // ── Save document + AI results to DynamoDB ────────────
      const newDocId = generateDocId();
      setDocId(newDocId);
      setIsSaving(true);

      try {
        await saveDocument({
          docId: newDocId,
          fileName: file.name,
          extractedText: truncatedText,
          aiResults,
        });
        setSaveStatus('saved');
      } catch (saveErr) {
        console.error('[StudyFlow] Failed to save document:', saveErr);
        setSaveStatus('error');
      } finally {
        setIsSaving(false);
      }

    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Derived result data ───────────────────────────────────
  const studyPlan = results?.studyPlan || null;
  const examSummary = results?.examSummary || null;
  const rawText = results?.raw || null;

  // ── PDF Download ──────────────────────────────────────────
  const handleDownloadPDF = async () => {
    setIsExporting(true);
    try {
      const jsPDF = (await import('jspdf')).default;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginL = 15, marginR = 15, marginTop = 20, marginBot = 15;
      const contentW = pageW - marginL - marginR;
      let y = marginTop;

      const ensureSpace = (needed) => {
        if (y + needed > pageH - marginBot) { pdf.addPage(); y = marginTop; }
      };
      const addWrappedText = (text, x, fontSize, style = 'normal', color = [51, 51, 51]) => {
        pdf.setFontSize(fontSize); pdf.setFont('helvetica', style); pdf.setTextColor(...color);
        const lines = pdf.splitTextToSize(text, contentW - (x - marginL));
        const lineH = fontSize * 0.5;
        for (const line of lines) { ensureSpace(lineH); pdf.text(line, x, y); y += lineH; }
      };
      const addRule = () => {
        ensureSpace(4); pdf.setDrawColor(200, 200, 200); pdf.setLineWidth(0.3);
        pdf.line(marginL, y, pageW - marginR, y); y += 4;
      };

      const docTitle = studyPlan?.title || examSummary?.title || 'AI Study Plan';
      pdf.setFontSize(20); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(20, 184, 166);
      pdf.text('StudyFlow', marginL, y); y += 8;
      pdf.setFontSize(14); pdf.setTextColor(51, 51, 51); pdf.text(docTitle, marginL, y); y += 6;
      addRule(); y += 2;

      if (studyPlan) {
        ensureSpace(14); pdf.setFontSize(16); pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(20, 100, 150); pdf.text('STUDY PLAN', marginL, y); y += 4;
        if (studyPlan.totalEstimatedHours) {
          pdf.setFontSize(10); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(100, 100, 100);
          pdf.text(`Total Estimated: ${studyPlan.totalEstimatedHours} hours`, marginL, y); y += 6;
        }
        y += 2;
        (studyPlan.topics || []).forEach((topic, idx) => {
          ensureSpace(20);
          pdf.setFontSize(12); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(33, 33, 33);
          pdf.text(`${idx + 1}. ${topic.name}`, marginL, y); y += 5;
          const meta = [];
          if (topic.priority) meta.push(`Priority: ${topic.priority.toUpperCase()}`);
          if (topic.estimatedHours != null) meta.push(`${topic.estimatedHours} hours`);
          if (meta.length) {
            pdf.setFontSize(9); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(120, 120, 120);
            pdf.text(meta.join('  •  '), marginL + 4, y); y += 4.5;
          }
          if (topic.keyPoints?.length) {
            topic.keyPoints.forEach((point) => {
              ensureSpace(5); addWrappedText(`•  ${point}`, marginL + 6, 9, 'normal', [80, 80, 80]); y += 1;
            });
          }
          y += 3;
        });
        addRule(); y += 2;
      }

      if (examSummary) {
        ensureSpace(14); pdf.setFontSize(16); pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(20, 100, 150); pdf.text('EXAM SUMMARY', marginL, y); y += 8;
        (examSummary.sections || []).forEach((section) => {
          ensureSpace(16); pdf.setFontSize(13); pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(33, 33, 33); pdf.text(section.heading || '', marginL, y); y += 6;
          if (section.content) { addWrappedText(section.content, marginL, 10, 'normal', [60, 60, 60]); y += 3; }
          if (section.keyTerms?.length) {
            ensureSpace(8); pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(20, 184, 166); pdf.text('Key Terms:', marginL, y); y += 4;
            addWrappedText(section.keyTerms.join(', '), marginL + 2, 9, 'normal', [80, 80, 80]); y += 2;
          }
          if (section.importantFormulas?.length) {
            ensureSpace(8); pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(59, 130, 246); pdf.text('Important Formulas:', marginL, y); y += 4;
            section.importantFormulas.forEach((f) => {
              ensureSpace(5); pdf.setFontSize(9); pdf.setFont('courier', 'normal');
              pdf.setTextColor(51, 51, 51); pdf.text(`  ${f}`, marginL + 2, y); y += 4;
            }); y += 1;
          }
          if (section.examTips?.length) {
            ensureSpace(8); pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(217, 119, 6); pdf.text('Exam Tips:', marginL, y); y += 4;
            section.examTips.forEach((tip) => {
              ensureSpace(5); addWrappedText(`💡 ${tip}`, marginL + 2, 9, 'normal', [80, 80, 80]); y += 1;
            }); y += 1;
          }
          y += 4;
        });
      }

      pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(160, 160, 160);
      pdf.text('Generated by StudyFlow — AI Study Tools', marginL, pageH - 8);
      const safeName = docTitle.replace(/[^a-zA-Z0-9 &-]/g, '').trim();
      pdf.save(`StudyFlow - ${safeName}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // ── Chat: send message + save history ────────────────────
  const handleSendChat = async (overrideMessage) => {
    const message = (overrideMessage || chatInput).trim();
    if (!message || isChatLoading || !storedText) return;

    setChatInput('');
    const updatedMessages = [...chatMessages, { role: 'user', content: message }];
    setChatMessages(updatedMessages);
    setIsChatLoading(true);

    try {
      const json = await callRAG({ extractedText: storedText, action: 'chat', question: message });
      if (json.error) throw new Error(json.error);

      const answer = json.answer || json.data?.answer || 'No response received.';
      const finalMessages = [...updatedMessages, { role: 'ai', content: answer }];
      setChatMessages(finalMessages);

      // ── Save chat history to DynamoDB ─────────────────────
      if (docId) {
        saveChat({ docId, messages: finalMessages }).catch((err) => {
          console.error('[StudyFlow] Failed to save chat history:', err);
        });
      }

    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'error', content: err.message || 'Failed to get a response.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); }
  };

  // ── Chat PDF download ─────────────────────────────────────
  const handleDownloadChatPDF = async () => {
    try {
      const jsPDF = (await import('jspdf')).default;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const mL = 15, mR = 15, cW = pageW - mL - mR, mTop = 20, mBot = 20;
      let y = mTop;

      const ensureSpace = (needed) => {
        if (y + needed > pageH - mBot) {
          pdf.setFontSize(7); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(160, 160, 160);
          pdf.text('Generated by StudyFlow', pageW / 2, pageH - 8, { align: 'center' });
          pdf.addPage(); y = mTop;
        }
      };
      const addWrapped = (text, x, fontSize, style, color) => {
        pdf.setFontSize(fontSize); pdf.setFont('helvetica', style); pdf.setTextColor(...color);
        const lines = pdf.splitTextToSize(text, cW - (x - mL));
        const lH = fontSize * 0.5;
        for (const line of lines) { ensureSpace(lH); pdf.text(line, x, y); y += lH; }
      };

      pdf.setFontSize(18); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(20, 184, 166);
      pdf.text('StudyFlow \u2014 Chat Transcript', mL, y); y += 7;
      pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(120, 120, 120);
      if (fileName) { pdf.text(`PDF: ${fileName}`, mL, y); y += 4; }
      pdf.text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, mL, y); y += 5;
      pdf.setDrawColor(200, 200, 200); pdf.setLineWidth(0.3); pdf.line(mL, y, pageW - mR, y); y += 6;

      chatMessages.forEach((msg, idx) => {
        if (msg.role === 'error') return;
        ensureSpace(14);
        const label = msg.role === 'user' ? 'You:' : 'AI:';
        const labelColor = msg.role === 'user' ? [20, 184, 166] : [100, 116, 139];
        pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...labelColor);
        pdf.text(label, mL, y); y += 5;
        addWrapped(msg.content, mL + 2, 9.5, 'normal', [51, 51, 51]); y += 3;
        if (msg.role === 'ai' && idx < chatMessages.length - 1) {
          ensureSpace(4); pdf.setDrawColor(220, 220, 220); pdf.setLineWidth(0.15);
          pdf.line(mL, y, pageW - mR, y); y += 5;
        }
      });

      pdf.setFontSize(7); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(160, 160, 160);
      pdf.text('Generated by StudyFlow', pageW / 2, pageH - 8, { align: 'center' });
      pdf.save('StudyFlow - Chat Transcript.pdf');
    } catch (err) {
      console.error('Chat PDF export failed:', err);
    }
  };

  // ── Save status indicator ─────────────────────────────────
  const SaveIndicator = () => {
    if (isSaving) return (
      <span className="flex items-center gap-1.5 text-xs text-surface-400">
        <Loader2 className="w-3 h-3 animate-spin" /> Saving...
      </span>
    );
    if (saveStatus === 'saved') return (
      <span className="flex items-center gap-1.5 text-xs text-accent-green">
        <CheckCircle className="w-3 h-3" /> Saved to account
      </span>
    );
    if (saveStatus === 'error') return (
      <span className="flex items-center gap-1.5 text-xs text-red-400">
        <AlertCircle className="w-3 h-3" /> Not saved (offline?)
      </span>
    );
    return null;
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 py-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)' }}>
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-surface-900">AI Study Tools</h1>
          </div>
          <p className="text-surface-500 text-sm mt-1">
            Upload a PDF of your syllabus or textbook chapter and get an AI-generated study plan and exam summary.
          </p>
        </div>

        {/* Actions bar when results exist */}
        {results && (
          <div className="mb-6 animate-fade-in flex flex-wrap items-center gap-3">
            <button onClick={resetAll} className="btn-secondary flex items-center gap-2 text-sm">
              <RefreshCw className="w-4 h-4" /> Upload Another PDF
            </button>
            {!rawText && (
              <button
                onClick={handleDownloadPDF}
                disabled={isExporting}
                className="btn-glow flex items-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating PDF...</>
                ) : (
                  <><Download className="w-4 h-4" /> Download as PDF</>
                )}
              </button>
            )}
            <div className="ml-auto">
              <SaveIndicator />
            </div>
          </div>
        )}

        {/* Upload Area */}
        {!isProcessing && !results && (
          <div className="animate-fade-in">
            <div className="glass-card p-6 sm:p-8">
              {!file && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-12 sm:p-16 text-center transition-all duration-300 ${
                    isDragOver ? 'border-primary-500 bg-primary-50' : 'border-surface-300 hover:border-surface-400 hover:bg-surface-50'
                  }`}
                >
                  <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleInputChange} className="hidden" />
                  <Upload className={`w-12 h-12 mx-auto mb-4 transition-colors duration-300 ${isDragOver ? 'text-primary-500' : 'text-surface-400'}`} />
                  <p className={`text-lg mb-1 transition-colors duration-300 ${isDragOver ? 'text-primary-600' : 'text-surface-700'}`}>
                    Drag & drop your PDF here
                  </p>
                  <p className="text-sm text-surface-400">or click to browse</p>
                  <p className="text-xs text-surface-400 mt-3">PDF only • Max 10 MB</p>
                </div>
              )}

              {file && (
                <div className="space-y-5">
                  <div className="flex items-center gap-4 rounded-xl p-4 border border-surface-200 bg-surface-50">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)' }}>
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-surface-800 font-medium truncate">{fileName}</p>
                      <p className="text-xs text-surface-400">{formatFileSize(fileSize)}</p>
                    </div>
                    <button onClick={clearFile} className="p-2 rounded-lg text-surface-400 hover:text-red-500 hover:bg-red-50 transition-all">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <button onClick={handleGenerate} className="btn-glow flex items-center justify-center gap-2 text-base w-full sm:w-auto">
                    <Sparkles className="w-5 h-5" /> Generate Study Plan & Summary
                  </button>
                </div>
              )}

              {error && !results && (
                <div className="mt-5 flex items-start gap-3 rounded-xl p-4"
                  style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-600">{error}</p>
                    {file && (
                      <button onClick={handleGenerate} className="mt-2 text-xs text-red-400 hover:text-red-300 underline underline-offset-2 transition-colors">
                        Try Again
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isProcessing && (
          <div className="animate-fade-in">
            <div className="glass-card p-10 sm:p-16 text-center">
              <div className="relative w-16 h-16 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full border-2 border-primary-500/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary-400 animate-spin" />
                <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-primary-400 animate-pulse" />
              </div>
              <p className="text-lg text-surface-800 font-medium mb-2 transition-all duration-500">{loadingMessage}</p>
              <p className="text-sm text-surface-400">This may take 15–30 seconds</p>
            </div>
          </div>
        )}

        {/* Results */}
        {results && !rawText && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-1">
              {[
                { id: 'plan', label: 'Study Plan', icon: Target },
                { id: 'summary', label: 'Exam Summary', icon: FileText },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                    activeTab === tab.id
                      ? 'text-white bg-primary-500 shadow-md'
                      : 'text-surface-500 hover:text-surface-800 hover:bg-white border border-transparent hover:border-surface-200'
                  }`}
                >
                  <tab.icon className="w-4 h-4" /> {tab.label}
                </button>
              ))}
            </div>

            {/* Study Plan Tab */}
            {activeTab === 'plan' && studyPlan && (
              <div className="animate-fade-in space-y-6">
                <div className="glass-card p-5">
                  <h2 className="text-lg font-semibold text-surface-900 mb-1">{studyPlan.title || 'Study Plan'}</h2>
                  {studyPlan.totalEstimatedHours && (
                    <div className="flex items-center gap-2 text-sm text-surface-500">
                      <Clock className="w-4 h-4 text-primary-500" />
                      Total Estimated: <span className="text-primary-500 font-semibold">{studyPlan.totalEstimatedHours} hours</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(studyPlan.topics || []).map((topic, index) => (
                    <div key={index} className="glass-card p-5 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                          style={{ background: `linear-gradient(135deg, ${['#6C5CE7','#4FACFE','#00D2A0','#FECA57','#FF6B6B','#22c55e','#ec4899','#06b6d4','#f97316','#a855f7'][index % 10]}, transparent)` }}>
                          {topic.order || index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-surface-900 font-semibold text-sm">{topic.name}</h3>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {topic.priority && (
                              <span className={`badge ${topic.priority === 'high' ? 'badge-hard' : topic.priority === 'low' ? 'badge-easy' : 'badge-medium'}`}>
                                {topic.priority}
                              </span>
                            )}
                            {topic.estimatedHours != null && (
                              <span className="flex items-center gap-1 text-xs text-surface-500">
                                <Clock className="w-3 h-3" /> {topic.estimatedHours}h
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {topic.keyPoints?.length > 0 && (
                        <ul className="space-y-1 pl-1">
                          {topic.keyPoints.map((point, pIdx) => (
                            <li key={pIdx} className="flex items-start gap-2 text-sm text-surface-500">
                              <span className="text-primary-500 mt-1.5 flex-shrink-0">•</span>
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'plan' && !studyPlan && (
              <div className="glass-card p-8 text-center animate-fade-in">
                <Target className="w-10 h-10 text-surface-400 mx-auto mb-3" />
                <p className="text-surface-500 text-sm">No study plan data was returned.</p>
              </div>
            )}

            {/* Exam Summary Tab */}
            {activeTab === 'summary' && examSummary && (
              <div className="animate-fade-in space-y-6">
                <div className="glass-card p-5">
                  <h2 className="text-lg font-semibold text-surface-900">{examSummary.title || 'Exam Summary'}</h2>
                </div>
                {(examSummary.sections || []).map((section, sIdx) => (
                  <div key={sIdx} className="glass-card p-5 space-y-4">
                    <h3 className="text-lg font-semibold text-surface-900">{section.heading}</h3>
                    {section.content && <p className="text-sm text-surface-600 leading-relaxed">{section.content}</p>}
                    {section.keyTerms?.length > 0 && (
                      <div>
                        <p className="text-xs text-surface-400 uppercase tracking-wider mb-2 font-medium">Key Terms</p>
                        <div className="flex flex-wrap gap-2">
                          {section.keyTerms.map((term, tIdx) => (
                            <span key={tIdx} className="bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full text-xs">{term}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {section.importantFormulas?.length > 0 && (
                      <div className="rounded-xl p-3" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
                        <p className="text-xs text-blue-400 uppercase tracking-wider mb-2 font-medium">Important Formulas</p>
                        <div className="space-y-1">
                          {section.importantFormulas.map((formula, fIdx) => (
                            <p key={fIdx} className="text-sm text-surface-800 font-mono">{formula}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {section.examTips?.length > 0 && (
                      <div className="rounded-xl p-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                          <p className="text-xs text-amber-400 uppercase tracking-wider font-medium">Exam Tips</p>
                        </div>
                        <ul className="space-y-1">
                          {section.examTips.map((tip, tipIdx) => (
                            <li key={tipIdx} className="flex items-start gap-2 text-sm text-surface-600">
                              <span className="text-amber-500 mt-1 flex-shrink-0">•</span>
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'summary' && !examSummary && (
              <div className="glass-card p-8 text-center animate-fade-in">
                <FileText className="w-10 h-10 text-surface-400 mx-auto mb-3" />
                <p className="text-surface-500 text-sm">No exam summary data was returned.</p>
              </div>
            )}
          </div>
        )}

        {/* Raw text fallback */}
        {results && rawText && (
          <div className="animate-fade-in">
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-semibold text-surface-900">AI Response</h2>
              </div>
              <p className="text-xs text-surface-400 mb-2">The AI returned an unstructured response. Here is the raw output:</p>
              <div className="rounded-xl p-4 text-sm text-surface-700 leading-relaxed whitespace-pre-wrap bg-surface-50 border border-surface-200">
                {rawText}
              </div>
            </div>
          </div>
        )}

        {/* Chatbot */}
        {results && storedText && (
          <div className="mt-8 animate-fade-in space-y-4">
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-1">
                <MessageCircle className="w-5 h-5 text-primary-400" />
                <h2 className="text-lg font-semibold text-surface-900">Chat with your PDF</h2>
              </div>
              <p className="text-xs text-surface-400 mb-4">Ask questions about your study material</p>

              <div className="space-y-3 mb-4 overflow-y-auto pr-1" style={{ maxHeight: '400px' }}>
                {chatMessages.length === 0 && !isChatLoading && (
                  <div className="flex flex-wrap gap-2 py-4">
                    {SUGGESTED_QUESTIONS.map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendChat(q)}
                        className="bg-surface-50 border border-surface-200 text-surface-500 text-xs px-3 py-1.5 rounded-full hover:bg-primary-50 hover:text-primary-500 hover:border-primary-200 cursor-pointer transition-all"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <span className="text-xs text-surface-400 mb-1 px-1">
                      {msg.role === 'user' ? 'You' : msg.role === 'error' ? 'Error' : 'AI'}
                    </span>
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-primary-50 border border-primary-200 rounded-2xl rounded-tr-sm text-surface-900'
                          : msg.role === 'error'
                            ? 'bg-red-50 border border-red-200 rounded-2xl rounded-tl-sm text-red-600'
                            : 'rounded-2xl rounded-tl-sm text-surface-800'
                      }`}
                      style={msg.role === 'ai' ? { background: '#F9FAFB', border: '1px solid #E5E7EB' } : undefined}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {isChatLoading && (
                  <div className="flex flex-col items-start">
                    <span className="text-xs text-surface-400 mb-1 px-1">AI</span>
                    <div className="px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5 bg-surface-50 border border-surface-200">
                      <div className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" style={{ animationDelay: '300ms' }} />
                      <div className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" style={{ animationDelay: '600ms' }} />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  disabled={isChatLoading}
                  placeholder="Ask a question about your PDF..."
                  className="input-dark flex-1 text-sm disabled:opacity-50"
                />
                <button
                  onClick={() => handleSendChat()}
                  disabled={isChatLoading || !chatInput.trim()}
                  className="btn-glow p-2.5 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>

            {chatMessages.filter(m => m.role !== 'error').length >= 2 && (
              <button onClick={handleDownloadChatPDF} className="btn-secondary flex items-center gap-2 text-sm">
                <Download className="w-4 h-4" /> Download Chat as PDF
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default AIToolsPage;
