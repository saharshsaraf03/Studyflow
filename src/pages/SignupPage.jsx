import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Check } from 'lucide-react';
import { signUp, confirmSignUp, resendConfirmationCode } from '../utils/auth';

/* ============================================================
   SignupPage — Full-width split-screen auth page
   Left: Same gradient brand panel | Right: Signup form
   ============================================================ */

// ── Shared Left Panel (same as LoginPage) ────────────────────
const featureCards = [
  {
    icon: '📊',
    label: 'Smart Study Plans',
    color: 'rgba(108, 92, 231, 0.15)',
    rotate: '-2deg',
    marginLeft: '0px',
  },
  {
    icon: '🤖',
    label: 'AI-Powered Q&A',
    color: 'rgba(0, 210, 160, 0.15)',
    rotate: '0deg',
    marginLeft: '20px',
  },
  {
    icon: '📚',
    label: 'Organized Library',
    color: 'rgba(254, 202, 87, 0.15)',
    rotate: '2deg',
    marginLeft: '40px',
  },
];

function LeftPanel() {
  return (
    <div
      className="hidden lg:flex flex-col justify-between w-[45%] min-h-screen p-10 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #6C5CE7 0%, #4FACFE 100%)' }}
    >
      <div
        className="absolute top-[-80px] right-[-80px] w-64 h-64 rounded-full opacity-20"
        style={{ background: 'rgba(255,255,255,0.3)' }}
      />
      <div
        className="absolute bottom-[-60px] left-[-60px] w-48 h-48 rounded-full opacity-15"
        style={{ background: 'rgba(255,255,255,0.2)' }}
      />

      {/* Logo */}
      <div className="relative z-10 flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-lg"
          style={{ background: 'rgba(255,255,255,0.25)' }}
        >
          S
        </div>
        <span className="text-white font-bold text-lg tracking-tight">StudyFlow</span>
      </div>

      {/* Center content */}
      <div className="relative z-10 flex-1 flex flex-col justify-center py-10">
        <h2
          className="font-bold text-white mb-4 leading-tight"
          style={{ fontSize: '36px', maxWidth: '380px' }}
        >
          Master Your Studies with AI
        </h2>
        <p
          className="mb-8 leading-relaxed"
          style={{
            fontSize: '15px',
            color: 'rgba(255,255,255,0.85)',
            maxWidth: '360px',
          }}
        >
          Upload materials, generate study plans, and ace your exams with your
          personal AI study companion.
        </p>

        <div className="flex flex-col gap-2.5">
          {featureCards.map((card, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-5 py-3 rounded-xl"
              style={{
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                transform: `rotate(${card.rotate})`,
                marginLeft: card.marginLeft,
                maxWidth: '280px',
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                style={{ background: card.color }}
              >
                {card.icon}
              </div>
              <span
                className="font-semibold"
                style={{ fontSize: '14px', color: '#1A1D2E' }}
              >
                {card.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Social proof */}
      <div className="relative z-10 flex items-center gap-3">
        <div className="flex items-center">
          {[
            { bg: '#6C5CE7', letter: 'A' },
            { bg: '#00D2A0', letter: 'B' },
            { bg: '#FECA57', letter: 'C' },
          ].map((c, i) => (
            <div
              key={i}
              className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs font-bold text-white"
              style={{
                background: c.bg,
                marginLeft: i === 0 ? '0' : '-8px',
                zIndex: 3 - i,
                position: 'relative',
              }}
            >
              {c.letter}
            </div>
          ))}
        </div>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
          50,000+ students are already studying smarter.
        </p>
      </div>
    </div>
  );
}

// ── Password Strength Indicator ──────────────────────────────
function PasswordStrength({ password }) {
  const getStrength = (pw) => {
    if (!pw) return { score: 0, label: '', color: '' };
    if (pw.length < 8) return { score: 1, label: 'Weak', color: '#FF6B6B' };
    const hasUpper = /[A-Z]/.test(pw);
    const hasNumber = /[0-9]/.test(pw);
    const hasSpecial = /[^A-Za-z0-9]/.test(pw);
    if (hasUpper && hasNumber && hasSpecial) return { score: 4, label: 'Strong', color: '#00D2A0' };
    if (hasUpper && hasNumber) return { score: 3, label: 'Good', color: '#4FACFE' };
    return { score: 2, label: 'Fair', color: '#FECA57' };
  };

  const { score, label, color } = getStrength(password);

  if (!password) return null;

  const segmentColors = ['#FF6B6B', '#FECA57', '#4FACFE', '#00D2A0'];

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4].map((seg) => (
          <div
            key={seg}
            className="h-1.5 flex-1 rounded-full transition-all duration-300"
            style={{
              background: score >= seg ? segmentColors[seg - 1] : '#E5E7EB',
            }}
          />
        ))}
      </div>
      {label && (
        <p className="text-xs font-medium" style={{ color }}>
          {label}
        </p>
      )}
    </div>
  );
}

// ── Main Signup Page ─────────────────────────────────────────
const SignupPage = () => {
  const navigate = useNavigate();

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Verification flow
  const [step, setStep] = useState('signup'); // 'signup' | 'verify'
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const passwordsMatch = password && confirmPassword && password === confirmPassword;

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) { setError('Please enter your full name.'); return; }
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!agreedToTerms) { setError('Please agree to the Terms of Service.'); return; }

    setIsLoading(true);
    try {
      await signUp(email.trim().toLowerCase(), password, name.trim());
      setStep('verify');
    } catch (err) {
      const code = err.code || err.name || '';
      if (code === 'UsernameExistsException') {
        setError('An account with this email already exists. Please sign in instead.');
      } else if (code === 'InvalidPasswordException') {
        setError('Password must be at least 8 characters with uppercase letters and numbers.');
      } else if (code === 'InvalidParameterException') {
        setError(err.message || 'Invalid input. Please check your details.');
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setVerifyError('');

    if (!verificationCode.trim() || verificationCode.trim().length < 6) {
      setVerifyError('Please enter the 6-digit verification code.');
      return;
    }

    setVerifyLoading(true);
    try {
      await confirmSignUp(email.trim().toLowerCase(), verificationCode.trim());
      navigate('/login', {
        state: { successMessage: 'Email verified! Please sign in to continue.' },
      });
    } catch (err) {
      const code = err.code || err.name || '';
      if (code === 'CodeMismatchException') {
        setVerifyError('Invalid verification code. Please try again.');
      } else if (code === 'ExpiredCodeException') {
        setVerifyError('Code has expired. Please request a new one.');
      } else {
        setVerifyError(err.message || 'Verification failed. Please try again.');
      }
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setResendSuccess(false);
    try {
      await resendConfirmationCode(email.trim().toLowerCase());
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 5000);
    } catch (err) {
      setVerifyError(err.message || 'Could not resend code. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const handleGoogleSignUp = () => {
    alert('Google sign-in coming soon!');
  };

  // ── Email Verification Step ──────────────────────────────
  if (step === 'verify') {
    return (
      <div className="min-h-screen flex">
        <LeftPanel />

        <div
          className="flex-1 flex items-center justify-center px-6 py-12"
          style={{ background: '#F5F5F7' }}
        >
          <div className="w-full" style={{ maxWidth: '400px' }}>
            {/* Icon */}
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 mx-auto"
              style={{ background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)' }}
            >
              <span className="text-2xl">✉️</span>
            </div>

            <h1
              className="font-bold mb-2 text-center"
              style={{ fontSize: '28px', color: '#1A1D2E' }}
            >
              Verify your email
            </h1>
            <p
              className="mb-7 text-center"
              style={{ fontSize: '14px', color: '#6B7280' }}
            >
              We sent a 6-digit code to{' '}
              <strong className="text-surface-800">{email}</strong>
            </p>

            {verifyError && (
              <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm mb-5">
                {verifyError}
              </div>
            )}

            {resendSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-3 text-sm mb-5">
                Verification code resent! Please check your email.
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label
                  className="block mb-1.5 font-medium"
                  style={{ fontSize: '13px', color: '#4B5563' }}
                >
                  Verification code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) =>
                    setVerificationCode(e.target.value.replace(/\D/g, ''))
                  }
                  placeholder="123456"
                  className="sf-input text-center tracking-[0.5em] font-mono text-lg"
                  autoFocus
                  disabled={verifyLoading}
                />
              </div>

              <button
                type="submit"
                disabled={verifyLoading}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ fontSize: '15px' }}
              >
                {verifyLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify Email'
                )}
              </button>
            </form>

            <p
              className="text-center mt-6"
              style={{ fontSize: '14px', color: '#6B7280' }}
            >
              Didn't receive the code?{' '}
              <button
                onClick={handleResend}
                disabled={resendLoading}
                className="font-semibold hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ color: '#6C5CE7', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {resendLoading ? 'Sending...' : 'Resend'}
              </button>
            </p>

            <p
              className="text-center mt-3"
              style={{ fontSize: '13px', color: '#9CA3AF' }}
            >
              <button
                onClick={() => setStep('signup')}
                className="hover:underline"
                style={{ color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                ← Back to sign up
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Signup Form Step ─────────────────────────────────────
  return (
    <div className="min-h-screen flex">
      <LeftPanel />

      <div
        className="flex-1 flex items-center justify-center px-6 py-12 min-h-screen overflow-y-auto"
        style={{ background: '#F5F5F7' }}
      >
        <div className="w-full" style={{ maxWidth: '400px' }}>
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)' }}
            >
              S
            </div>
            <span className="font-bold text-lg" style={{ color: '#1A1D2E' }}>
              StudyFlow
            </span>
          </div>

          {/* Heading */}
          <h1
            className="font-bold mb-2"
            style={{ fontSize: '28px', color: '#1A1D2E' }}
          >
            Create your account
          </h1>
          <p className="mb-7" style={{ fontSize: '14px', color: '#6B7280' }}>
            Start your AI-powered study journey
          </p>

          {/* Error box */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            {/* Full Name */}
            <div>
              <label
                className="block mb-1.5 font-medium"
                style={{ fontSize: '13px', color: '#4B5563' }}
              >
                Full name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Saharsh Saraf"
                className="sf-input"
                autoComplete="name"
                disabled={isLoading}
              />
            </div>

            {/* Email */}
            <div>
              <label
                className="block mb-1.5 font-medium"
                style={{ fontSize: '13px', color: '#4B5563' }}
              >
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu"
                className="sf-input"
                autoComplete="email"
                disabled={isLoading}
              />
            </div>

            {/* Password */}
            <div>
              <label
                className="block mb-1.5 font-medium"
                style={{ fontSize: '13px', color: '#4B5563' }}
              >
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="sf-input pr-10"
                  autoComplete="new-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            {/* Confirm Password */}
            <div>
              <label
                className="block mb-1.5 font-medium"
                style={{ fontSize: '13px', color: '#4B5563' }}
              >
                Confirm password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="sf-input pr-10"
                  autoComplete="new-password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : passwordsMatch ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {confirmPassword && !passwordsMatch && (
                <p className="mt-1 text-xs" style={{ color: '#FF6B6B' }}>
                  Passwords do not match
                </p>
              )}
            </div>

            {/* Terms */}
            <div className="flex items-start gap-2.5">
              <input
                id="terms"
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded accent-primary-500 cursor-pointer flex-shrink-0"
                disabled={isLoading}
              />
              <label
                htmlFor="terms"
                className="cursor-pointer select-none leading-snug"
                style={{ fontSize: '13px', color: '#6B7280' }}
              >
                I agree to the{' '}
                <span
                  className="font-medium cursor-pointer hover:underline"
                  style={{ color: '#6C5CE7' }}
                >
                  Terms of Service
                </span>{' '}
                and{' '}
                <span
                  className="font-medium cursor-pointer hover:underline"
                  style={{ color: '#6C5CE7' }}
                >
                  Privacy Policy
                </span>
              </label>
            </div>

            {/* Create Account button */}
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ fontSize: '15px', marginTop: '8px' }}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: '#E5E7EB' }} />
            <span
              className="px-3 py-1 rounded-full text-xs font-medium bg-white"
              style={{ color: '#9CA3AF', border: '1px solid #E5E7EB' }}
            >
              OR
            </span>
            <div className="flex-1 h-px" style={{ background: '#E5E7EB' }} />
          </div>

          {/* Google button */}
          <button
            type="button"
            onClick={handleGoogleSignUp}
            className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl font-medium transition-all duration-200 hover:bg-surface-100"
            style={{
              fontSize: '14px',
              color: '#4B5563',
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
            }}
          >
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: '#4285F4', color: '#fff', flexShrink: 0 }}
            >
              G
            </span>
            Continue with Google
          </button>

          {/* Sign in link */}
          <p
            className="text-center mt-7"
            style={{ fontSize: '14px', color: '#6B7280' }}
          >
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-semibold hover:underline"
              style={{ color: '#6C5CE7' }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;
