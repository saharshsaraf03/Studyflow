import React, { useState, useRef } from 'react';
import {
  User, Bell, Palette, Clock, Database,
  Download, Trash2, Check, ChevronDown,
  Save, KeyRound, Loader2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';

/* ── Reusable primitives matching Claude Design ── */

const SettingCard = ({ title, subtitle, children }) => (
  <div className="sf-card" style={{ padding: 24 }}>
    <div style={{ marginBottom: 18 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0 0' }}>{subtitle}</p>}
    </div>
    {children}
  </div>
);

const SettingRow = ({ label, sub, control, last }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '14px 0',
    borderBottom: last ? 'none' : '1px solid var(--border-light)',
  }}>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
    {control}
  </div>
);

const Toggle = ({ on, onChange }) => (
  <div
    onClick={() => onChange(!on)}
    style={{
      width: 40, height: 22, borderRadius: 999,
      background: on ? '#6C5CE7' : '#E5E7EB',
      position: 'relative', transition: 'background 0.2s',
      cursor: 'pointer', flexShrink: 0,
    }}
  >
    <div style={{
      position: 'absolute', top: 2,
      left: on ? 20 : 2,
      width: 18, height: 18, borderRadius: '50%',
      background: '#fff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      transition: 'left 0.2s',
    }} />
  </div>
);

const ThemePicker = ({ active, onChange }) => (
  <div style={{
    display: 'inline-flex', padding: 3,
    background: '#F5F5F7', border: '1px solid #E5E7EB', borderRadius: 8,
  }}>
    {['Light', 'Dark', 'System'].map(t => (
      <button
        key={t}
        onClick={() => onChange(t.toLowerCase())}
        style={{
          height: 30, padding: '0 14px', fontSize: 12, fontWeight: 600,
          borderRadius: 6, border: 'none', cursor: 'pointer',
          background: t.toLowerCase() === active ? '#fff' : 'transparent',
          color: t.toLowerCase() === active ? '#6C5CE7' : '#6B7280',
          boxShadow: t.toLowerCase() === active ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
          transition: 'all 0.15s',
        }}
      >{t}</button>
    ))}
  </div>
);

const SliderRow = ({ label, sub, value, onChange, min = 0.5, max = 12, step = 0.5, last }) => (
  <SettingRow
    label={label}
    sub={sub}
    last={last}
    control={
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 220 }}>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: '#6C5CE7' }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1D2E', minWidth: 36, textAlign: 'right' }}>
          {value}h
        </span>
      </div>
    }
  />
);

/* ── Main Settings Page ── */

const SettingsPage = () => {
  const { user, getToken } = useAuth();
  const { theme, setTheme } = useTheme();

  // Profile state — load from localStorage for persistence
  const savedProfile = JSON.parse(localStorage.getItem('sf_profile') || '{}');
  const [name, setName] = useState(user?.name || savedProfile.name || '');
  const [university, setUniversity] = useState(savedProfile.university || '');
  const [fieldOfStudy, setFieldOfStudy] = useState(savedProfile.fieldOfStudy || '');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Preferences state
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [pushNotifs, setPushNotifs] = useState(false);
  const [aiTips, setAiTips] = useState(true);
  const [soundEffects, setSoundEffects] = useState(false);

  // Study defaults
  const [weekdayHours, setWeekdayHours] = useState(3);
  const [weekendHours, setWeekendHours] = useState(4);
  const [sessionLength, setSessionLength] = useState(45);

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    // Save to localStorage for persistence
    localStorage.setItem('sf_profile', JSON.stringify({ name, university, fieldOfStudy }));
    await new Promise(r => setTimeout(r, 600));
    setProfileSaving(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) { setPasswordMsg('Please fill in both fields.'); return; }
    if (newPassword.length < 8) { setPasswordMsg('New password must be at least 8 characters.'); return; }
    setPasswordLoading(true); setPasswordMsg('');
    try {
      const { changePassword } = await import('../utils/auth');
      await changePassword(oldPassword, newPassword);
      setPasswordMsg('Password changed successfully!');
      setOldPassword(''); setNewPassword('');
      setTimeout(() => { setShowChangePassword(false); setPasswordMsg(''); }, 2000);
    } catch (err) {
      setPasswordMsg(err.message || 'Failed to change password. Check your current password.');
    } finally { setPasswordLoading(false); }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { loadPlanner } = await import('../utils/api');

      // Fetch export data from backend
      const token = await getToken();
      const res = await fetch('https://studyflow-rag-backend.onrender.com/api/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const exportData = await res.json();

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const mL = 15, mR = 15, mTop = 20, mBot = 15;
      const cW = pageW - mL - mR;
      let y = mTop;

      const ensureSpace = (needed) => {
        if (y + needed > pageH - mBot) { pdf.addPage(); y = mTop; }
      };

      const addText = (text, x, size, style = 'normal', color = [51, 51, 51]) => {
        pdf.setFontSize(size); pdf.setFont('helvetica', style); pdf.setTextColor(...color);
        const lines = pdf.splitTextToSize(String(text || ''), cW - (x - mL));
        const lH = size * 0.5;
        lines.forEach(line => { ensureSpace(lH); pdf.text(line, x, y); y += lH; });
      };

      // Title page
      pdf.setFontSize(24); pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(108, 92, 231);
      pdf.text('StudyFlow', mL, y); y += 10;
      pdf.setFontSize(16); pdf.setTextColor(51, 51, 51);
      pdf.text('Complete Library Export', mL, y); y += 6;
      pdf.setFontSize(10); pdf.setTextColor(150, 150, 150);
      pdf.text(`${user?.email || ''} · Exported ${new Date().toLocaleDateString()}`, mL, y); y += 4;
      pdf.setDrawColor(200, 200, 200); pdf.line(mL, y, pageW - mR, y); y += 8;

      // Each subject
      for (const subject of (exportData.data || [])) {
        ensureSpace(20);
        // Subject heading
        pdf.setFontSize(16); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(108, 92, 231);
        pdf.text(subject.name || 'Untitled Subject', mL, y); y += 8;

        // Subject docs
        if (subject.subjectDocs?.length > 0) {
          addText(`Documents (${subject.subjectDocs.length}):`, mL + 2, 10, 'bold', [100, 100, 100]);
          y += 1;
          subject.subjectDocs.forEach(doc => {
            addText(`• ${doc.fileName}${doc.hasAiResults ? ' ✓ AI Analyzed' : ''}`, mL + 4, 9, 'normal', [80, 80, 80]);
          });
          y += 3;
        }

        // Subject notes
        if (subject.subjectNotes) {
          addText('Notes:', mL + 2, 10, 'bold', [100, 100, 100]); y += 1;
          // Strip HTML tags for PDF
          const plainNotes = subject.subjectNotes.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (plainNotes) addText(plainNotes.slice(0, 800), mL + 4, 9, 'normal', [80, 80, 80]);
          y += 3;
        }

        // Chapters
        for (const ch of (subject.chapters || [])) {
          ensureSpace(14);
          pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(51, 51, 51);
          pdf.text(ch.name || 'Untitled Chapter', mL + 4, y); y += 6;

          // Chapter docs
          if (ch.docs?.length > 0) {
            addText(`Documents (${ch.docs.length}):`, mL + 6, 9, 'bold', [120, 120, 120]); y += 1;
            ch.docs.forEach(doc => {
              addText(`• ${doc.fileName}${doc.hasAiResults ? ' ✓ AI' : ''}`, mL + 8, 9, 'normal', [100, 100, 100]);
            });
            y += 2;

            // AI results for each doc
            ch.docs.forEach(doc => {
              if (!doc.aiResults?.studyPlan && !doc.aiResults?.examSummary) return;
              ensureSpace(10);
              addText(`AI: ${doc.fileName}`, mL + 6, 10, 'bold', [108, 92, 231]);
              if (doc.aiResults?.studyPlan?.topics) {
                doc.aiResults.studyPlan.topics.slice(0, 5).forEach(t => {
                  addText(`  • ${t.name} (${t.estimatedHours}h, ${t.priority})`, mL + 8, 8, 'normal', [100, 100, 100]);
                });
              }
              y += 2;
            });
          }

          // Chapter notes
          if (ch.notes) {
            addText('Notes:', mL + 6, 9, 'bold', [120, 120, 120]); y += 1;
            const plain = ch.notes.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (plain) addText(plain.slice(0, 600), mL + 8, 8, 'normal', [100, 100, 100]);
            y += 3;
          }
        }

        pdf.setDrawColor(220, 220, 220); pdf.line(mL, y, pageW - mR, y); y += 6;
      }

      // Footer on last page
      pdf.setFontSize(8); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(180, 180, 180);
      pdf.text('Generated by StudyFlow', pageW / 2, pageH - 8, { align: 'center' });

      pdf.save(`StudyFlow_Export_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Export error:', err);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = () => {
    const confirmed = window.confirm(
      'Are you absolutely sure? This will permanently delete your account and ALL data. This cannot be undone.'
    );
    if (confirmed) {
      alert('Account deletion is not yet implemented. Please contact support.');
    }
  };

  const getInitials = (n) => {
    if (!n) return 'SF';
    const parts = n.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>Settings</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>
            Manage your account, preferences and data
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>

          {/* ── Profile — full width ── */}
          <div style={{ gridColumn: '1 / -1' }}>
            <SettingCard title="Profile" subtitle="Your account information">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>

                {/* Avatar */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <div style={{
                    width: 84, height: 84, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #6C5CE7, #00D2A0)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 28, fontWeight: 700, color: '#fff',
                  }}>
                    {getInitials(name || user?.name)}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                    JPG, PNG up to 2 MB
                  </span>
                </div>

                {/* Fields */}
                <div style={{ flex: 1, minWidth: 280, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                      Full name
                    </label>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="sf-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                      Email
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        value={user?.email || ''}
                        readOnly
                        className="sf-input"
                        style={{ width: '100%', paddingRight: 110, background: '#FAFAFA', color: '#9CA3AF' }}
                      />
                      <div style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 99,
                        background: 'rgba(0,210,160,0.12)', color: '#00B488',
                        fontSize: 11, fontWeight: 600,
                      }}>
                        <Check size={10} /> Verified
                      </div>
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                      University
                    </label>
                    <input
                      value={university}
                      onChange={e => setUniversity(e.target.value)}
                      placeholder="e.g. MIT World Peace University"
                      className="sf-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                      Field of study
                    </label>
                    <input
                      value={fieldOfStudy}
                      onChange={e => setFieldOfStudy(e.target.value)}
                      placeholder="e.g. Electronics Engineering"
                      className="sf-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  onClick={handleSaveProfile}
                  disabled={profileSaving}
                  className="btn-primary"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 38, padding: '0 18px', fontSize: 13,
                    opacity: profileSaving ? 0.7 : 1,
                  }}
                >
                  {profileSaving ? (
                    <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Saving...</>
                  ) : profileSaved ? (
                    <><Check size={14} />Saved!</>
                  ) : (
                    <><Save size={14} />Save changes</>
                  )}
                </button>
                <button
                  onClick={() => setShowChangePassword(v => !v)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 38, padding: '0 18px', fontSize: 13, fontWeight: 500,
                    borderRadius: 10, border: '1px solid var(--border-light)', background: 'var(--bg-card)',
                    color: 'var(--text-primary)', cursor: 'pointer',
                  }}
                >
                  <KeyRound size={14} /> Change password
                </button>
              </div>

              {showChangePassword && (
                <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: 'var(--bg-primary)', border: '1px solid var(--border-light)' }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' }}>Change Password</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Current password</label>
                      <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)}
                        className="sf-input" style={{ width: '100%' }} placeholder="••••••••" />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>New password</label>
                      <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                        className="sf-input" style={{ width: '100%' }} placeholder="Min. 8 characters" />
                    </div>
                  </div>
                  {passwordMsg && (
                    <p style={{ fontSize: 12, color: passwordMsg.includes('success') ? '#00B488' : '#FF6B6B', marginBottom: 10 }}>{passwordMsg}</p>
                  )}
                  <button onClick={handleChangePassword} disabled={passwordLoading}
                    className="btn-primary"
                    style={{ height: 36, padding: '0 16px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: passwordLoading ? 0.7 : 1 }}>
                    {passwordLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              )}
            </SettingCard>
          </div>

          {/* ── Preferences ── */}
          <SettingCard title="Preferences" subtitle="Customize how StudyFlow works for you">
            <SettingRow
              label="Theme"
              sub="Choose a light, dark, or system-matching appearance"
              control={<ThemePicker active={theme} onChange={setTheme} />}
            />
            <SettingRow
              label="Email notifications"
              sub="Weekly summary and exam reminders"
              control={<Toggle on={emailNotifs} onChange={setEmailNotifs} />}
            />
            <SettingRow
              label="Push notifications"
              sub="Browser alerts for streak reminders"
              control={<Toggle on={pushNotifs} onChange={setPushNotifs} />}
            />
            <SettingRow
              label="AI proactive tips"
              sub="Let the AI suggest topics to review"
              control={<Toggle on={aiTips} onChange={setAiTips} />}
            />
            <SettingRow
              label="Sound effects"
              sub="Subtle audio feedback during sessions"
              control={<Toggle on={soundEffects} onChange={setSoundEffects} />}
              last
            />
          </SettingCard>

          {/* ── Study defaults ── */}
          <SettingCard title="Study defaults" subtitle="Default planning behavior for new subjects">
            <SliderRow
              label="Weekday hours"
              sub="Target daily hours Monday – Friday"
              value={weekdayHours}
              onChange={setWeekdayHours}
            />
            <SliderRow
              label="Weekend hours"
              sub="Target daily hours Saturday – Sunday"
              value={weekendHours}
              onChange={setWeekendHours}
            />
            <SettingRow
              label="Default session length"
              sub="Used for study session planning"
              last
              control={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {[25, 45, 60, 90].map(mins => (
                    <button
                      key={mins}
                      onClick={() => setSessionLength(mins)}
                      style={{
                        height: 32, padding: '0 12px', borderRadius: 8,
                        border: sessionLength === mins ? '1.5px solid #6C5CE7' : '1px solid #E5E7EB',
                        background: sessionLength === mins ? 'rgba(108,92,231,0.08)' : 'var(--bg-card)',
                        color: sessionLength === mins ? '#6C5CE7' : 'var(--text-secondary)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              }
            />
          </SettingCard>

          {/* ── Connected services ── */}
          <SettingCard title="Connected services" subtitle="Manage external integrations">
            <SettingRow
              label="AWS Cognito"
              sub={`${user?.email || 'your account'} · Authentication provider`}
              control={
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 99,
                  background: 'rgba(0,210,160,0.12)', color: '#00B488',
                  fontSize: 12, fontWeight: 500,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00D2A0' }} />
                  Active
                </div>
              }
            />
            <SettingRow
              label="OpenAI API"
              sub="GPT-4o mini · Powers AI analysis and chat"
              control={
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 99,
                  background: 'rgba(0,210,160,0.12)', color: '#00B488',
                  fontSize: 12, fontWeight: 500,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00D2A0' }} />
                  Active
                </div>
              }
            />
            <SettingRow
              label="Amazon DynamoDB"
              sub="ap-south-1 · Stores all your library data"
              control={
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 99,
                  background: 'rgba(0,210,160,0.12)', color: '#00B488',
                  fontSize: 12, fontWeight: 500,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00D2A0' }} />
                  Active
                </div>
              }
              last
            />
          </SettingCard>

          {/* ── Data & storage ── */}
          <SettingCard title="Data & storage" subtitle="Exports and account management">
            <SettingRow
              label="Export all data"
              sub="Download your notes and study history"
              control={
                <button
                  onClick={handleExportData}
                  disabled={exporting}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 34, padding: '0 14px', borderRadius: 8,
                    border: '1px solid var(--border-light)', background: 'var(--bg-card)',
                    color: 'var(--text-primary)', fontSize: 12, fontWeight: 500,
                    cursor: exporting ? 'not-allowed' : 'pointer',
                    opacity: exporting ? 0.6 : 1,
                  }}
                >
                  {exporting
                    ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />Exporting...</>
                    : <><Download size={13} />Export PDF</>
                  }
                </button>
              }
            />
            <SettingRow
              label="Delete account"
              sub="Permanently remove your account and all data. Irreversible."
              last
              control={
                <button
                  onClick={handleDeleteAccount}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 34, padding: '0 14px', borderRadius: 8,
                    border: '1px solid rgba(255,107,107,0.3)',
                    background: 'rgba(255,107,107,0.06)',
                    color: '#FF6B6B', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  <Trash2 size={13} /> Delete account
                </button>
              }
            />
          </SettingCard>

        </div>

        <div style={{ height: 40 }} />
      </div>
    </div>
  );
};

export default SettingsPage;
