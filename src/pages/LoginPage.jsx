import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, Sparkles, BookOpen, Brain, Library } from 'lucide-react';
import { signIn, getUserAttributes, signInWithGoogle } from '../utils/auth';
import { useAuth } from '../contexts/AuthContext';

/* ============================================================
   LoginPage — Full-width split-screen auth page
   Left: Gradient brand panel | Right: Login form
   ============================================================ */

// ── Left Panel Decorative Feature Cards ──────────────────────
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

// ── Left Panel ───────────────────────────────────────────────
function LeftPanel() {
  return (
    <div
      className="hidden lg:flex flex-col justify-between w-[45%] min-h-screen p-10 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #6C5CE7 0%, #4FACFE 100%)' }}
    >
      {/* Decorative background blobs */}
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
        {/* Headline */}
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

        {/* Feature cards — stacked cascade */}
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

      {/* Bottom social proof */}
      <div className="relative z-10 flex items-center gap-3">
        {/* Overlapping circles */}
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

// ── Main Login Page ──────────────────────────────────────────
const LoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setIsLoading(true);

    try {
      const session = await signIn(email.trim().toLowerCase(), password);
      const attrs = await getUserAttributes();
      login(session, attrs);
      navigate('/', { replace: true });
    } catch (err) {
      const code = err.code || err.name || '';
      if (code === 'NotAuthorizedException') {
        setError('Incorrect email or password. Please try again.');
      } else if (code === 'UserNotConfirmedException') {
        setError('Your email is not verified. Please check your inbox.');
      } else if (code === 'UserNotFoundException') {
        setError('No account found with this email. Please sign up first.');
      } else if (code === 'NetworkError' || err.message?.includes('fetch')) {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    signInWithGoogle();
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left gradient panel ── */}
      <LeftPanel />

      {/* ── Right form panel ── */}
      <div
        className="flex-1 flex items-center justify-center px-6 py-12 min-h-screen"
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
            Welcome back
          </h1>
          <p className="mb-7" style={{ fontSize: '14px', color: '#6B7280' }}>
            Sign in to continue your study journey
          </p>

          {/* Error box */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-3 text-sm mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
              <div className="flex items-center justify-between mb-1.5">
                <label
                  className="font-medium"
                  style={{ fontSize: '13px', color: '#4B5563' }}
                >
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium hover:underline"
                  style={{ color: '#6C5CE7' }}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="sf-input pr-10"
                  autoComplete="current-password"
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
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2.5">
              <input
                id="remember-me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded accent-primary-500 cursor-pointer"
                disabled={isLoading}
              />
              <label
                htmlFor="remember-me"
                className="cursor-pointer select-none"
                style={{ fontSize: '13px', color: '#6B7280' }}
              >
                Remember me for 30 days
              </label>
            </div>

            {/* Sign in button */}
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ fontSize: '15px', marginTop: '8px' }}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
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
            onClick={handleGoogleSignIn}
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

          {/* Sign up link */}
          <p
            className="text-center mt-7"
            style={{ fontSize: '14px', color: '#6B7280' }}
          >
            Don't have an account?{' '}
            <Link
              to="/signup"
              className="font-semibold hover:underline"
              style={{ color: '#6C5CE7' }}
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
