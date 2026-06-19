import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { forgotPassword, confirmForgotPassword } from '../utils/auth';

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const requestCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await forgotPassword(email.trim().toLowerCase());
      setMessage('Verification code sent. Check your email.');
      setStep('confirm');
    } catch (err) {
      setError(err.message || 'Could not send reset code.');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await confirmForgotPassword(email.trim().toLowerCase(), code.trim(), password);
      setMessage('Password reset successful. You can sign in now.');
      setTimeout(() => navigate('/login', { replace: true }), 800);
    } catch (err) {
      setError(err.message || 'Could not reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#F5F5F7' }}>
      <div className="sf-card p-7 w-full" style={{ maxWidth: 420 }}>
        <h1 className="text-2xl font-bold text-surface-900 mb-2">Reset Password</h1>
        <p className="text-sm text-surface-500 mb-5">Use your account email to receive a Cognito verification code.</p>

        {message && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-3 text-sm mb-4">{message}</div>}
        {error && <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm mb-4">{error}</div>}

        {step === 'request' ? (
          <form onSubmit={requestCode} className="space-y-4">
            <input className="sf-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            <button className="btn-primary w-full" disabled={loading}>{loading ? 'Sending...' : 'Send Code'}</button>
          </form>
        ) : (
          <form onSubmit={resetPassword} className="space-y-4">
            <input className="sf-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            <input className="sf-input" value={code} onChange={e => setCode(e.target.value)} placeholder="Verification code" required />
            <input className="sf-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="New password" required minLength={8} />
            <button className="btn-primary w-full" disabled={loading}>{loading ? 'Resetting...' : 'Reset Password'}</button>
          </form>
        )}

        <Link to="/login" className="block text-center text-sm font-medium mt-5" style={{ color: '#6C5CE7' }}>Back to sign in</Link>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
