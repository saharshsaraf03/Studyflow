import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload, FileText, X, Target, Clock, AlertCircle,
  Lightbulb, ArrowLeft, RefreshCw, Loader2, Sparkles, BookOpen, Download,
  MessageCircle, Send
} from 'lucide-react';

/* ============================================================
   AIToolsPage — PDF Upload + AI-Powered Study Plan & Exam Summary
   Route: /ai-tools
   
   Allows users to upload a PDF, sends it to an AI API, and
   displays a generated study plan and exam summary.
   ============================================================ */

// ── Helpers ──────────────────────────────────────────────────

const MAX_TEXT_LENGTH = 15000; // Truncate extracted text to stay within API limits

/**
 * Extract text content from a PDF file using pdfjs-dist.
 * Reads the file as an ArrayBuffer, parses every page, and
 * concatenates all text items into a single string.
 * The result is truncated to MAX_TEXT_LENGTH characters.
 *
 * @param {File} file - PDF File object
 * @returns {Promise<string>} Extracted text content
 */
const extractTextFromPDF = async (file) => {
  // Dynamic import so pdfjs-dist is only loaded when needed
  const pdfjsLib = await import('pdfjs-dist');

  // Point the worker to the bundled worker file from pdfjs-dist
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url,
  ).toString();

  // Read file into ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  // Load the PDF document
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';

  // Iterate through every page and extract text
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(' ');
    fullText += pageText + '\n';

    // Early exit if we already have enough text
    if (fullText.length >= MAX_TEXT_LENGTH) break;
  }

  // Trim whitespace and truncate
  return fullText.trim().slice(0, MAX_TEXT_LENGTH);
};

/**
 * Format bytes into a human-readable string (e.g. "2.4 MB")
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const LOADING_MESSAGES = [
  'Extracting text from PDF...',
  'Analyzing content...',
  'Generating study plan...',
  'Identifying important topics...',
  'Creating exam summary...',
  'Almost there...',
];

const API_ENDPOINT =
  'https://v3u5diepj6ssc7464rwra3mfhi0odnqa.lambda-url.ap-south-1.on.aws/';

// ── Main Component ───────────────────────────────────────────

const AIToolsPage = () => {
  // ── State ───────────────────────────────────────────────────
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('plan');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Chat states
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [storedText, setStoredText] = useState('');

  const fileInputRef = useRef(null);
  const loadingIntervalRef = useRef(null);
  const chatEndRef = useRef(null);

  // ── Rotating loading messages ───────────────────────────────
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

  // ── File selection / validation ─────────────────────────────
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
    setFile(null);
    setFileName('');
    setFileSize(0);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetAll = () => {
    clearFile();
    setResults(null);
    setActiveTab('plan');
    setChatMessages([]);
    setChatInput('');
    setStoredText('');
  };

  // ── Drag & Drop handlers ────────────────────────────────────
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
  };

  // ── API call ────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setResults(null);

    try {
      // Extract text from the PDF client-side (avoids base64 payload limit)
      const extractedText = await extractTextFromPDF(file);

      if (!extractedText || extractedText.length < 10) {
        throw new Error('Could not extract readable text from this PDF. It may be scanned/image-based.');
      }

      // Truncate to stay within API Gateway payload limits
      console.log('[StudyFlow] Extracted text length:', extractedText.length);
      const truncatedText = extractedText.slice(0, 12000);
      console.log('[StudyFlow] Truncated text length:', truncatedText.length);

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extractedText: truncatedText, action: 'generate_plan' }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error (${response.status})`);
      }

      const json = await response.json();

      if (json.error) {
        throw new Error(json.error);
      }

      if (!json.success || !json.data) {
        throw new Error('Unexpected response format from the server.');
      }

      // Store the truncated text so the chatbot can reuse it
      setStoredText(truncatedText);

      // Handle cases where AI returned raw text instead of structured JSON
      if (json.data.raw && !json.data.studyPlan) {
        setResults({ raw: json.data.raw });
      } else {
        setResults(json.data);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Derived data (safe access with fallbacks) ───────────────
  const studyPlan = results?.studyPlan || null;
  const examSummary = results?.examSummary || null;
  const rawText = results?.raw || null;

  // ── PDF Download (programmatic jsPDF — no screenshots) ──────
  const handleDownloadPDF = async () => {
    setIsExporting(true);

    try {
      const jsPDF = (await import('jspdf')).default;
      const pdf = new jsPDF('p', 'mm', 'a4');

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const marginL = 15;
      const marginR = 15;
      const contentW = pageW - marginL - marginR;
      const marginTop = 20;
      const marginBot = 15;
      let y = marginTop;

      // ── Helper: check remaining space, add page if needed ──
      const ensureSpace = (needed) => {
        if (y + needed > pageH - marginBot) {
          pdf.addPage();
          y = marginTop;
        }
      };

      // ── Helper: add wrapped text and advance y ──
      const addWrappedText = (text, x, fontSize, style = 'normal', color = [51, 51, 51]) => {
        pdf.setFontSize(fontSize);
        pdf.setFont('helvetica', style);
        pdf.setTextColor(...color);
        const lines = pdf.splitTextToSize(text, contentW - (x - marginL));
        const lineH = fontSize * 0.5;
        for (const line of lines) {
          ensureSpace(lineH);
          pdf.text(line, x, y);
          y += lineH;
        }
      };

      // ── Helper: draw a thin horizontal rule ──
      const addRule = () => {
        ensureSpace(4);
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.3);
        pdf.line(marginL, y, pageW - marginR, y);
        y += 4;
      };

      // ════════════════════════════════════════════
      // TITLE
      // ════════════════════════════════════════════
      const docTitle = studyPlan?.title || examSummary?.title || 'AI Study Plan';
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(20, 184, 166); // teal accent
      pdf.text(`StudyFlow`, marginL, y);
      y += 8;
      pdf.setFontSize(14);
      pdf.setTextColor(51, 51, 51);
      pdf.text(docTitle, marginL, y);
      y += 6;
      addRule();
      y += 2;

      // ════════════════════════════════════════════
      // STUDY PLAN SECTION
      // ════════════════════════════════════════════
      if (studyPlan) {
        ensureSpace(14);
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(20, 100, 150);
        pdf.text('STUDY PLAN', marginL, y);
        y += 4;

        if (studyPlan.totalEstimatedHours) {
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(100, 100, 100);
          pdf.text(`Total Estimated: ${studyPlan.totalEstimatedHours} hours`, marginL, y);
          y += 6;
        }
        y += 2;

        (studyPlan.topics || []).forEach((topic, idx) => {
          ensureSpace(20);

          // Topic name + number
          pdf.setFontSize(12);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(33, 33, 33);
          pdf.text(`${idx + 1}. ${topic.name}`, marginL, y);
          y += 5;

          // Priority + hours on one line
          const meta = [];
          if (topic.priority) meta.push(`Priority: ${topic.priority.toUpperCase()}`);
          if (topic.estimatedHours != null) meta.push(`${topic.estimatedHours} hours`);
          if (meta.length) {
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'italic');
            pdf.setTextColor(120, 120, 120);
            pdf.text(meta.join('  •  '), marginL + 4, y);
            y += 4.5;
          }

          // Key points
          if (topic.keyPoints?.length) {
            topic.keyPoints.forEach((point) => {
              ensureSpace(5);
              addWrappedText(`•  ${point}`, marginL + 6, 9, 'normal', [80, 80, 80]);
              y += 1;
            });
          }
          y += 3;
        });

        addRule();
        y += 2;
      }

      // ════════════════════════════════════════════
      // EXAM SUMMARY SECTION
      // ════════════════════════════════════════════
      if (examSummary) {
        ensureSpace(14);
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(20, 100, 150);
        pdf.text('EXAM SUMMARY', marginL, y);
        y += 8;

        (examSummary.sections || []).forEach((section) => {
          ensureSpace(16);

          // Section heading
          pdf.setFontSize(13);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(33, 33, 33);
          pdf.text(section.heading || '', marginL, y);
          y += 6;

          // Content
          if (section.content) {
            addWrappedText(section.content, marginL, 10, 'normal', [60, 60, 60]);
            y += 3;
          }

          // Key terms
          if (section.keyTerms?.length) {
            ensureSpace(8);
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(20, 184, 166);
            pdf.text('Key Terms:', marginL, y);
            y += 4;
            addWrappedText(section.keyTerms.join(', '), marginL + 2, 9, 'normal', [80, 80, 80]);
            y += 2;
          }

          // Formulas
          if (section.importantFormulas?.length) {
            ensureSpace(8);
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(59, 130, 246);
            pdf.text('Important Formulas:', marginL, y);
            y += 4;
            section.importantFormulas.forEach((f) => {
              ensureSpace(5);
              pdf.setFontSize(9);
              pdf.setFont('courier', 'normal');
              pdf.setTextColor(51, 51, 51);
              pdf.text(`  ${f}`, marginL + 2, y);
              y += 4;
            });
            y += 1;
          }

          // Exam tips
          if (section.examTips?.length) {
            ensureSpace(8);
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(217, 119, 6);
            pdf.text('Exam Tips:', marginL, y);
            y += 4;
            section.examTips.forEach((tip) => {
              ensureSpace(5);
              addWrappedText(`💡 ${tip}`, marginL + 2, 9, 'normal', [80, 80, 80]);
              y += 1;
            });
            y += 1;
          }

          y += 4;
        });
      }

      // ── Footer on last page ──
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(160, 160, 160);
      pdf.text('Generated by StudyFlow — AI Study Tools', marginL, pageH - 8);

      // ── Save ──
      const safeName = docTitle.replace(/[^a-zA-Z0-9 &-]/g, '').trim();
      pdf.save(`StudyFlow - ${safeName}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // ── Chat: auto-scroll on new messages ───────────────────────
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatLoading]);

  // ── Chat: send message ─────────────────────────────────────
  const handleSendChat = async (overrideMessage) => {
    const message = (overrideMessage || chatInput).trim();
    if (!message || isChatLoading || !storedText) return;

    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: message }]);
    setIsChatLoading(true);

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extractedText: storedText,
          action: 'chat',
          question: message,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error (${response.status})`);
      }

      const json = await response.json();

      if (json.error) throw new Error(json.error);

      const answer = json.answer || json.data?.answer || 'No response received.';
      setChatMessages((prev) => [...prev, { role: 'ai', content: answer }]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'error', content: err.message || 'Failed to get a response.' },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  // ── Chat: download transcript as PDF ────────────────────────
  const handleDownloadChatPDF = async () => {
    try {
      const jsPDF = (await import('jspdf')).default;
      const pdf = new jsPDF('p', 'mm', 'a4');

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const mL = 15;
      const mR = 15;
      const cW = pageW - mL - mR;
      const mTop = 20;
      const mBot = 20;
      let y = mTop;

      const ensureSpace = (needed) => {
        if (y + needed > pageH - mBot) {
          // Footer before new page
          pdf.setFontSize(7);
          pdf.setFont('helvetica', 'italic');
          pdf.setTextColor(160, 160, 160);
          pdf.text('Generated by StudyFlow', pageW / 2, pageH - 8, { align: 'center' });
          pdf.addPage();
          y = mTop;
        }
      };

      const addWrapped = (text, x, fontSize, style, color) => {
        pdf.setFontSize(fontSize);
        pdf.setFont('helvetica', style);
        pdf.setTextColor(...color);
        const lines = pdf.splitTextToSize(text, cW - (x - mL));
        const lH = fontSize * 0.5;
        for (const line of lines) {
          ensureSpace(lH);
          pdf.text(line, x, y);
          y += lH;
        }
      };

      // Title
      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(20, 184, 166);
      pdf.text('StudyFlow \u2014 Chat Transcript', mL, y);
      y += 7;

      // Subtitle
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(120, 120, 120);
      if (fileName) {
        pdf.text(`PDF: ${fileName}`, mL, y);
        y += 4;
      }
      pdf.text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, mL, y);
      y += 5;

      // Separator
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.3);
      pdf.line(mL, y, pageW - mR, y);
      y += 6;

      // Messages
      chatMessages.forEach((msg, idx) => {
        if (msg.role === 'error') return;

        ensureSpace(14);

        // Label
        const label = msg.role === 'user' ? 'You:' : 'AI:';
        const labelColor = msg.role === 'user' ? [20, 184, 166] : [100, 116, 139];
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...labelColor);
        pdf.text(label, mL, y);
        y += 5;

        // Content
        addWrapped(msg.content, mL + 2, 9.5, 'normal', [51, 51, 51]);
        y += 3;

        // Separator between Q&A pairs (after AI answers)
        if (msg.role === 'ai' && idx < chatMessages.length - 1) {
          ensureSpace(4);
          pdf.setDrawColor(220, 220, 220);
          pdf.setLineWidth(0.15);
          pdf.line(mL, y, pageW - mR, y);
          y += 5;
        }
      });

      // Footer on last page
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(160, 160, 160);
      pdf.text('Generated by StudyFlow', pageW / 2, pageH - 8, { align: 'center' });

      pdf.save('StudyFlow - Chat Transcript.pdf');
    } catch (err) {
      console.error('Chat PDF export failed:', err);
    }
  };

  // ── Suggested questions ─────────────────────────────────────
  const SUGGESTED_QUESTIONS = [
    'Summarize the key concepts',
    'What are the most important formulas?',
    'Explain the hardest topic',
    'Give me practice questions',
  ];

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 py-8">
      <div className="max-w-5xl mx-auto">

        {/* ── Header ────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
            }}>
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-dark-100">
              AI Study Tools
            </h1>
          </div>
          <p className="text-dark-400 text-sm mt-1">
            Upload a PDF of your syllabus or textbook chapter and get an AI-generated study plan and exam summary.
          </p>
        </div>

        {/* ── Upload Another + Download (shown when results exist) */}
        {results && (
          <div className="mb-6 animate-fade-in flex flex-wrap items-center gap-3">
            <button
              onClick={resetAll}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Upload Another PDF
            </button>
            {!rawText && (
              <button
                onClick={handleDownloadPDF}
                disabled={isExporting}
                className="btn-glow flex items-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating PDF...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download as PDF
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* ──────────────────────────────────────────────────────
            SECTION: Upload Area (hidden while processing or when results are shown)
            ────────────────────────────────────────────────────── */}
        {!isProcessing && !results && (
          <div className="animate-fade-in">
            <div className="glass-card p-6 sm:p-8">

              {/* Drop zone */}
              {!file && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-12 sm:p-16 text-center transition-all duration-300 ${
                    isDragOver
                      ? 'border-primary-500/50 bg-primary-500/5'
                      : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleInputChange}
                    className="hidden"
                  />

                  <Upload className={`w-12 h-12 mx-auto mb-4 transition-colors duration-300 ${
                    isDragOver ? 'text-primary-400' : 'text-dark-500'
                  }`} />
                  <p className={`text-lg mb-1 transition-colors duration-300 ${
                    isDragOver ? 'text-primary-300' : 'text-dark-300'
                  }`}>
                    Drag & drop your PDF here
                  </p>
                  <p className="text-sm text-dark-500">
                    or click to browse
                  </p>
                  <p className="text-xs text-dark-600 mt-3">
                    PDF only • Max 10 MB
                  </p>
                </div>
              )}

              {/* File selected preview */}
              {file && (
                <div className="space-y-5">
                  <div className="flex items-center gap-4 rounded-xl p-4 border border-white/5" style={{ background: 'rgba(15, 23, 42, 0.4)' }}>
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{
                      background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                    }}>
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-dark-200 font-medium truncate">{fileName}</p>
                      <p className="text-xs text-dark-500">{formatFileSize(fileSize)}</p>
                    </div>
                    <button
                      onClick={clearFile}
                      className="p-2 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={handleGenerate}
                    className="btn-glow flex items-center justify-center gap-2 text-base w-full sm:w-auto"
                  >
                    <Sparkles className="w-5 h-5" />
                    Generate Study Plan & Summary
                  </button>
                </div>
              )}

              {/* Error under upload area */}
              {error && !results && (
                <div className="mt-5 flex items-start gap-3 rounded-xl p-4" style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}>
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-300">{error}</p>
                    {file && (
                      <button
                        onClick={handleGenerate}
                        className="mt-2 text-xs text-red-400 hover:text-red-300 underline underline-offset-2 transition-colors"
                      >
                        Try Again
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────
            SECTION: Loading State
            ────────────────────────────────────────────────────── */}
        {isProcessing && (
          <div className="animate-fade-in">
            <div className="glass-card p-10 sm:p-16 text-center">
              <div className="relative w-16 h-16 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full border-2 border-primary-500/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary-400 animate-spin" />
                <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-primary-400 animate-pulse" />
              </div>
              <p className="text-lg text-dark-200 font-medium mb-2 transition-all duration-500">
                {loadingMessage}
              </p>
              <p className="text-sm text-dark-500">
                This may take 15–30 seconds
              </p>
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────
            SECTION: Error State (standalone — after processing)
            ────────────────────────────────────────────────────── */}
        {!isProcessing && error && !results && !file && (
          <div className="animate-fade-in">
            <div className="glass-card p-8 text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-dark-200 font-medium mb-2">Something went wrong</p>
              <p className="text-sm text-dark-400 mb-6">{error}</p>
              <button onClick={resetAll} className="btn-glow inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────
            SECTION: Results
            ────────────────────────────────────────────────────── */}
        {results && !rawText && (
          <div className="space-y-6 animate-fade-in">

            {/* Tab navigation — matches Dashboard tab style */}
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
                      ? 'text-primary-400 bg-primary-500/10 border border-primary-500/20'
                      : 'text-dark-400 hover:text-dark-200 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ── Study Plan Tab ──────────────────────────────── */}
            {activeTab === 'plan' && studyPlan && (
              <div className="animate-fade-in space-y-6">
                {/* Plan header */}
                <div className="glass-card p-5">
                  <h2 className="text-lg font-semibold text-dark-100 mb-1">
                    {studyPlan.title || 'Study Plan'}
                  </h2>
                  {studyPlan.totalEstimatedHours && (
                    <div className="flex items-center gap-2 text-sm text-dark-400">
                      <Clock className="w-4 h-4 text-primary-400" />
                      Total Estimated: <span className="text-primary-400 font-semibold">{studyPlan.totalEstimatedHours} hours</span>
                    </div>
                  )}
                </div>

                {/* Topic cards grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(studyPlan.topics || []).map((topic, index) => (
                    <div key={index} className="glass-card p-5 space-y-3">
                      {/* Topic header */}
                      <div className="flex items-start gap-3">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                          style={{
                            background: `linear-gradient(135deg, ${
                              ['#14b8a6', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#22c55e', '#ec4899', '#06b6d4', '#f97316', '#a855f7'][index % 10]
                            }, transparent)`,
                          }}
                        >
                          {topic.order || index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-dark-100 font-semibold text-sm">
                            {topic.name}
                          </h3>
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {topic.priority && (
                              <span className={`badge ${
                                topic.priority === 'high' ? 'badge-hard' :
                                topic.priority === 'low' ? 'badge-easy' : 'badge-medium'
                              }`}>
                                {topic.priority}
                              </span>
                            )}
                            {topic.estimatedHours != null && (
                              <span className="flex items-center gap-1 text-xs text-dark-400">
                                <Clock className="w-3 h-3" />
                                {topic.estimatedHours}h
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Key points */}
                      {topic.keyPoints?.length > 0 && (
                        <ul className="space-y-1 pl-1">
                          {topic.keyPoints.map((point, pIdx) => (
                            <li key={pIdx} className="flex items-start gap-2 text-sm text-dark-400">
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

            {/* ── Study Plan empty state ──────────────────────── */}
            {activeTab === 'plan' && !studyPlan && (
              <div className="glass-card p-8 text-center animate-fade-in">
                <Target className="w-10 h-10 text-dark-500 mx-auto mb-3" />
                <p className="text-dark-400 text-sm">No study plan data was returned.</p>
              </div>
            )}

            {/* ── Exam Summary Tab ────────────────────────────── */}
            {activeTab === 'summary' && examSummary && (
              <div className="animate-fade-in space-y-6">
                {/* Summary header */}
                <div className="glass-card p-5">
                  <h2 className="text-lg font-semibold text-dark-100">
                    {examSummary.title || 'Exam Summary'}
                  </h2>
                </div>

                {/* Sections */}
                {(examSummary.sections || []).map((section, sIdx) => (
                  <div key={sIdx} className="glass-card p-5 space-y-4">
                    <h3 className="text-lg font-semibold text-dark-100">
                      {section.heading}
                    </h3>

                    {/* Content paragraph */}
                    {section.content && (
                      <p className="text-sm text-dark-300 leading-relaxed">
                        {section.content}
                      </p>
                    )}

                    {/* Key terms */}
                    {section.keyTerms?.length > 0 && (
                      <div>
                        <p className="text-xs text-dark-500 uppercase tracking-wider mb-2 font-medium">Key Terms</p>
                        <div className="flex flex-wrap gap-2">
                          {section.keyTerms.map((term, tIdx) => (
                            <span
                              key={tIdx}
                              className="bg-primary-500/10 text-primary-400 px-2 py-0.5 rounded-full text-xs"
                            >
                              {term}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Important formulas */}
                    {section.importantFormulas?.length > 0 && (
                      <div className="rounded-xl p-3" style={{
                        background: 'rgba(59, 130, 246, 0.08)',
                        border: '1px solid rgba(59, 130, 246, 0.15)',
                      }}>
                        <p className="text-xs text-blue-400 uppercase tracking-wider mb-2 font-medium">Important Formulas</p>
                        <div className="space-y-1">
                          {section.importantFormulas.map((formula, fIdx) => (
                            <p key={fIdx} className="text-sm text-dark-200 font-mono">
                              {formula}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Exam tips */}
                    {section.examTips?.length > 0 && (
                      <div className="rounded-xl p-3" style={{
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.15)',
                      }}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                          <p className="text-xs text-amber-400 uppercase tracking-wider font-medium">Exam Tips</p>
                        </div>
                        <ul className="space-y-1">
                          {section.examTips.map((tip, tipIdx) => (
                            <li key={tipIdx} className="flex items-start gap-2 text-sm text-dark-300">
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

            {/* ── Exam Summary empty state ────────────────────── */}
            {activeTab === 'summary' && !examSummary && (
              <div className="glass-card p-8 text-center animate-fade-in">
                <FileText className="w-10 h-10 text-dark-500 mx-auto mb-3" />
                <p className="text-dark-400 text-sm">No exam summary data was returned.</p>
              </div>
            )}
          </div>
        )}

        {/* ──────────────────────────────────────────────────────
            SECTION: Raw text fallback (when AI didn't return valid JSON)
            ────────────────────────────────────────────────────── */}
        {results && rawText && (
          <div className="animate-fade-in">
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-semibold text-dark-100">AI Response</h2>
              </div>
              <p className="text-xs text-dark-500 mb-2">
                The AI returned an unstructured response. Here is the raw output:
              </p>
              <div
                className="rounded-xl p-4 text-sm text-dark-300 leading-relaxed whitespace-pre-wrap"
                style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(148, 163, 184, 0.1)' }}
              >
                {rawText}
              </div>
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────────────────
            SECTION: Chatbot (shown after results)
            ────────────────────────────────────────────────────── */}
        {results && storedText && (
          <div className="mt-8 animate-fade-in space-y-4">
            <div className="glass-card p-5">
              {/* Chat header */}
              <div className="flex items-center gap-2 mb-1">
                <MessageCircle className="w-5 h-5 text-primary-400" />
                <h2 className="text-lg font-semibold text-dark-100">Chat with your PDF</h2>
              </div>
              <p className="text-xs text-dark-500 mb-4">Ask questions about your study material</p>

              {/* Messages area */}
              <div
                className="space-y-3 mb-4 overflow-y-auto pr-1"
                style={{ maxHeight: '400px' }}
              >
                {/* Suggested questions (before first message) */}
                {chatMessages.length === 0 && !isChatLoading && (
                  <div className="flex flex-wrap gap-2 py-4">
                    {SUGGESTED_QUESTIONS.map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendChat(q)}
                        className="bg-white/5 border border-white/10 text-dark-400 text-xs px-3 py-1.5 rounded-full hover:bg-primary-500/10 hover:text-primary-400 hover:border-primary-500/30 cursor-pointer transition-all"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {/* Chat messages */}
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    <span className="text-xs text-dark-500 mb-1 px-1">
                      {msg.role === 'user' ? 'You' : msg.role === 'error' ? 'Error' : 'AI'}
                    </span>
                    <div
                      className={`max-w-[85%] sm:max-w-[75%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-primary-500/20 border border-primary-500/30 rounded-2xl rounded-tr-sm text-dark-100'
                          : msg.role === 'error'
                            ? 'bg-red-500/10 border border-red-500/20 rounded-2xl rounded-tl-sm text-red-300'
                            : 'rounded-2xl rounded-tl-sm text-dark-200'
                      }`}
                      style={
                        msg.role === 'ai'
                          ? { background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255,255,255,0.05)' }
                          : undefined
                      }
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {/* Typing indicator */}
                {isChatLoading && (
                  <div className="flex flex-col items-start">
                    <span className="text-xs text-dark-500 mb-1 px-1">AI</span>
                    <div
                      className="px-4 py-3 rounded-2xl rounded-tl-sm flex items-center gap-1.5"
                      style={{ background: 'rgba(30, 41, 59, 0.7)', border: '1px solid rgba(255,255,255,0.05)' }}
                    >
                      <div className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" style={{ animationDelay: '300ms' }} />
                      <div className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" style={{ animationDelay: '600ms' }} />
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Input area */}
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
                  title="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Download Chat as PDF */}
            {chatMessages.filter((m) => m.role !== 'error').length >= 2 && (
              <button
                onClick={handleDownloadChatPDF}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <Download className="w-4 h-4" />
                Download Chat as PDF
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default AIToolsPage;
