import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, CalendarDays, Settings,
  HelpCircle, X, Sparkles, LogOut, ChevronDown, Library
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Sidebar = ({ hasPlan, isOpen, onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isActive = (path) => location.pathname === path;

  const getInitials = (name) => {
    if (!name) return 'SF';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  const navItems = [
    { path: '/', label: 'Home', icon: LayoutDashboard },
    { path: '/library', label: 'Library', icon: Library },
    { path: '/setup', label: 'Setup', icon: BookOpen },
    { path: '/dashboard', label: 'Dashboard', icon: CalendarDays, disabled: !hasPlan },
  ];

  const secondaryItems = [
    { path: '/settings', label: 'Settings', icon: Settings },
    { path: '/help', label: 'Help', icon: HelpCircle },
  ];

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={onClose} />}
      <aside
        className={`fixed top-0 left-0 h-full w-[204px] z-50 flex flex-col transition-transform duration-300 md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: '#1A1D2E' }}
      >
        <div className="flex items-center justify-between px-5 h-16">
          <Link to="/" className="flex items-center gap-2.5" onClick={onClose}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)' }}>
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-white">StudyFlow</span>
          </Link>
          <button onClick={onClose} className="md:hidden p-1.5 rounded-lg hover:bg-white/10 text-surface-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ path, label, icon: Icon, disabled }) => (
            <Link key={path} to={disabled ? '#' : path}
              onClick={e => { if (disabled) e.preventDefault(); else onClose(); }}
              className={disabled ? 'opacity-40 cursor-not-allowed sidebar-item' : isActive(path) ? 'sidebar-item-active' : 'sidebar-item'}>
              <Icon className="w-5 h-5" />{label}
            </Link>
          ))}
          <div className="my-4 mx-2 border-t" style={{ borderColor: '#2D3148' }} />
          {secondaryItems.map(({ path, label, icon: Icon }) => (
            <Link key={path} to={path} onClick={onClose}
              className={isActive(path) ? 'sidebar-item-active' : 'sidebar-item'}>
              <Icon className="w-5 h-5" />{label}
            </Link>
          ))}
        </nav>

        <div className="px-3 py-3 border-t" style={{ borderColor: '#2D3148' }}>
          <div className="relative">
            <button onClick={() => setShowUserMenu(v => !v)}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #6C5CE7, #00D2A0)' }}>
                {getInitials(user?.name)}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-white truncate">{user?.name || 'StudyFlow User'}</p>
                <p className="text-xs truncate" style={{ color: '#64748B' }}>{user?.email || ''}</p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-surface-500 transition-transform duration-200"
                style={{ transform: showUserMenu ? 'rotate(180deg)' : 'rotate(0deg)' }} />
            </button>
            {showUserMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl overflow-hidden shadow-lg"
                style={{ background: '#252840', border: '1px solid #2D3148' }}>
                <button onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-white/10"
                  style={{ color: '#FF6B6B' }}>
                  <LogOut className="w-4 h-4" />Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
