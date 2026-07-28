import React, { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { Bold, Italic, Underline, Link, Code, List, ListOrdered } from 'lucide-react';
import { saveCNote } from '../../utils/api';
import { sanitizeNotesHtml } from '../../utils/sanitize';

/**
 * NotesEditor — rich text editor matching Claude Design toolbar exactly
 * Uses contentEditable + document.execCommand for formatting
 * Auto-saves with 2s debounce via DynamoDB
 */
const NotesEditor = forwardRef(({ chapterId, initialContent = '', saveOverride = null }, ref) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const editorRef = useRef(null);
  const debounceRef = useRef(null);

  // Expose insertHtml to parent via ref
  useImperativeHandle(ref, () => ({
    insertHtml: (html, mode) => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      const safeHtml = sanitizeNotesHtml(html);
      if (mode === 'replace') {
        editorRef.current.innerHTML = safeHtml;
      } else {
        // Append: move cursor to end then insert
        const el = editorRef.current;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        if (sel) { sel.removeAllRanges(); sel.addRange(range); }
        document.execCommand('insertHTML', false, '<br><br>' + safeHtml);
      }
      // Trigger save
      handleInput();
    },
    getContent: () => editorRef.current?.innerHTML || '',
  }));

  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  const [lastSaved, setLastSaved] = useState(null);
  const [activeFormats, setActiveFormats] = useState({});

  // Inject global styles for contentEditable content
  useEffect(() => {
    if (!editorRef.current) return;
    const style = document.createElement('style');
    style.textContent = `
      [contenteditable] * { max-width: 100%; box-sizing: border-box; }
      [contenteditable] h3 { font-size: 14px; font-weight: 700; color: #1A1D2E; margin: 14px 0 6px; }
      [contenteditable] ul { margin: 4px 0 8px 18px; padding: 0; }
      [contenteditable] li { margin-bottom: 4px; line-height: 1.6; }
      [contenteditable] strong { font-weight: 700; color: #1A1D2E; }
      [contenteditable] pre { background: #F5F5F7; padding: 8px 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
      [data-theme="dark"] [contenteditable] { background: #1A1D2E !important; color: #F1F5F9 !important; }
      [data-theme="dark"] [contenteditable] h3 { color: #F1F5F9 !important; }
      [data-theme="dark"] [contenteditable] strong { color: #F1F5F9 !important; }
      [data-theme="dark"] [contenteditable] pre { background: #252840 !important; color: #F1F5F9 !important; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  // Load initial content
  useEffect(() => {
    if (editorRef.current && initialContent) {
      editorRef.current.innerHTML = sanitizeNotesHtml(initialContent);
    }
  }, [chapterId]);

  const updateActiveFormats = () => {
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
    });
  };

  const execFormat = (command, value = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    updateActiveFormats();
    handleInput();
  };

  const handleH1 = () => {
    editorRef.current?.focus();
    document.execCommand('formatBlock', false, 'h2');
    handleInput();
  };

  const handleH2 = () => {
    editorRef.current?.focus();
    document.execCommand('formatBlock', false, 'h3');
    handleInput();
  };

  const handleCode = () => {
    editorRef.current?.focus();
    document.execCommand('formatBlock', false, 'pre');
    handleInput();
  };

  const handleInput = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus('saving');
    debounceRef.current = setTimeout(async () => {
      try {
        const content = editorRef.current?.innerHTML || '';
        if (saveOverride) { await saveOverride(content); } else { await saveCNote({ chapterId, content }); }
        setSaveStatus('saved');
        setLastSaved(new Date());
        setTimeout(() => setSaveStatus(null), 3000);
      } catch {
        setSaveStatus('error');
      }
    }, 2000);
  }, [chapterId]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const formatLastSaved = () => {
    if (!lastSaved) return 'Not yet saved';
    const diff = Math.floor((Date.now() - lastSaved) / 60000);
    if (diff < 1) return 'Just now';
    if (diff === 1) return '1 minute ago';
    return `${diff} minutes ago`;
  };

  const tools = [
    { label: 'B', title: 'Bold', style: { fontWeight: 800 }, cmd: () => execFormat('bold'), active: activeFormats.bold },
    { label: 'I', title: 'Italic', style: { fontStyle: 'italic' }, cmd: () => execFormat('italic'), active: activeFormats.italic },
    { label: 'U', title: 'Underline', style: { textDecoration: 'underline' }, cmd: () => execFormat('underline'), active: activeFormats.underline },
    { label: 'H1', title: 'Heading 1', style: { fontSize: 12, fontWeight: 700 }, cmd: handleH1 },
    { label: 'H2', title: 'Heading 2', style: { fontSize: 12, fontWeight: 700 }, cmd: handleH2 },
    'divider',
    { icon: <List size={14} />, title: 'Bullet list', cmd: () => execFormat('insertUnorderedList'), active: activeFormats.insertUnorderedList },
    { icon: <ListOrdered size={14} />, title: 'Numbered list', cmd: () => execFormat('insertOrderedList'), active: activeFormats.insertOrderedList },
    { label: '{ }', title: 'Code block', style: { fontFamily: 'monospace', fontSize: 12 }, cmd: handleCode },
    { icon: <Link size={13} />, title: 'Link', cmd: () => { const url = prompt('Enter URL:'); if (url) execFormat('createLink', url); } },
  ];

  return (
    <div className="sf-card" style={{ overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 280, background: isDark ? '#1A1D2E' : '#ffffff' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: 10, borderBottom: '1px solid #F0F0F2', flexShrink: 0,
      }}>
        {tools.map((t, i) => t === 'divider' ? (
          <div key={i} style={{ width: 1, height: 20, background: '#E5E7EB', margin: '0 4px' }} />
        ) : (
          <button
            key={i}
            title={t.title}
            onMouseDown={e => { e.preventDefault(); t.cmd(); }}
            style={{
              width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer',
              background: t.active ? 'rgba(108,92,231,0.10)' : '#F5F5F7',
              color: t.active ? '#6C5CE7' : '#6B7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 600, ...(t.style || {}),
              transition: 'all 0.15s',
            }}
          >
            {t.icon || t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {/* Save indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9CA3AF' }}>
          {saveStatus === 'saving' && <><div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FECA57' }} />Saving...</>}
          {saveStatus === 'saved' && <><div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00D2A0' }} />Saved</>}
          {saveStatus === 'error' && <><div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FF6B6B' }} />Error</>}
          {!saveStatus && <><div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00D2A0' }} />Saved</>}
        </div>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyUp={updateActiveFormats}
        onMouseUp={updateActiveFormats}
        data-placeholder="Start writing your notes here..."
        style={{
          flex: 1, padding: '16px 22px', fontSize: 13, lineHeight: 1.65,
          color: isDark ? '#F1F5F9' : '#374151', outline: 'none', overflowY: 'auto',
          overflowX: 'hidden', wordBreak: 'break-word', wordWrap: 'break-word',
          minHeight: 200, background: isDark ? '#1A1D2E' : '#ffffff',
        }}
      />

      {/* Footer */}
      <div style={{
        padding: '8px 18px', borderTop: '1px solid #F0F0F2',
        display: 'flex', alignItems: 'center', fontSize: 11, color: '#9CA3AF', flexShrink: 0,
      }}>
        Last edited {formatLastSaved()} · Auto-saved
      </div>
    </div>
  );
});

export default NotesEditor;
