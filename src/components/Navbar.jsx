import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, LayoutDashboard, Home, Menu, X, Sparkles, Brain } from 'lucide-react';

/**
 * Navbar — Top navigation bar
 * Shows navigation links and glows on active page.
 * Responsive with hamburger menu on mobile.
 */
const Navbar = ({ hasPlan }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  const navLinks = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/setup', label: 'Setup', icon: BookOpen },
    { path: '/ai-tools', label: 'AI Tools', icon: Brain },
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, disabled: !hasPlan },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-white/5" style={{
      background: 'rgba(15, 23, 42, 0.8)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
    }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="relative">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{
                background: 'linear-gradient(135deg, #14b8a6, #3b82f6)',
              }}>
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{
                background: 'linear-gradient(135deg, #14b8a6, #3b82f6)',
                filter: 'blur(8px)',
              }} />
            </div>
            <span className="text-lg font-bold gradient-text">StudyFlow</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(({ path, label, icon: Icon, disabled }) => (
              <Link
                key={path}
                to={disabled ? '#' : path}
                onClick={(e) => disabled && e.preventDefault()}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                  disabled 
                    ? 'text-dark-600 cursor-not-allowed opacity-50' 
                    : isActive(path)
                      ? 'text-primary-400 bg-primary-500/10'
                      : 'text-dark-400 hover:text-dark-200 hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
                {isActive(path) && (
                  <div className="w-1 h-1 rounded-full bg-primary-400 animate-pulse" />
                )}
              </Link>
            ))}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-dark-400 hover:text-dark-200 hover:bg-white/5 transition-colors"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/5 animate-slide-up" style={{
          background: 'rgba(15, 23, 42, 0.95)',
        }}>
          <div className="px-4 py-3 space-y-1">
            {navLinks.map(({ path, label, icon: Icon, disabled }) => (
              <Link
                key={path}
                to={disabled ? '#' : path}
                onClick={(e) => {
                  if (disabled) e.preventDefault();
                  else setMobileOpen(false);
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                  disabled
                    ? 'text-dark-600 cursor-not-allowed opacity-50'
                    : isActive(path)
                      ? 'text-primary-400 bg-primary-500/10'
                      : 'text-dark-400 hover:text-dark-200 hover:bg-white/5'
                }`}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
