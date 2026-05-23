import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import HomePage from './pages/HomePage';
import SetupPage from './pages/SetupPage';
import DashboardPage from './pages/DashboardPage';
import AIToolsPage from './pages/AIToolsPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import { loadData, saveData } from './utils/storage';

/**
 * App — Root component
 * Manages global state and routing.
 * Study plan data is stored in state and synced to localStorage.
 */
function AppInner() {
  const [planData, setPlanData] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Load saved data on mount
  useEffect(() => {
    const saved = loadData();
    if (saved) setPlanData(saved);
  }, []);

  // Persist to localStorage whenever planData changes
  useEffect(() => {
    if (planData) saveData(planData);
  }, [planData]);

  return (
    <Routes>
      {/* ── Auth pages — no sidebar, full-width ── */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* ── Protected pages — with sidebar ── */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <div className="min-h-screen bg-surface-50 text-surface-900 flex">
              {/* Sidebar */}
              <Sidebar
                hasPlan={!!planData}
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
              />

              {/* Main content */}
              <main className="flex-1 min-h-screen md:ml-[240px]">
                {/* Mobile header */}
                <div className="md:hidden flex items-center justify-between px-4 h-14 bg-white border-b border-surface-200">
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="p-2 rounded-lg hover:bg-surface-100"
                  >
                    <svg
                      className="w-5 h-5 text-surface-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 6h16M4 12h16M4 18h16"
                      />
                    </svg>
                  </button>
                  <span className="text-base font-bold gradient-text">StudyFlow</span>
                  <div className="w-9" />
                </div>

                <div className="p-4 sm:p-6 lg:p-8">
                  <Routes>
                    <Route path="/" element={<HomePage hasPlan={!!planData} />} />
                    <Route
                      path="/setup"
                      element={<SetupPage setPlanData={setPlanData} />}
                    />
                    <Route path="/ai-tools" element={<AIToolsPage />} />
                    <Route
                      path="/dashboard"
                      element={
                        <DashboardPage planData={planData} setPlanData={setPlanData} />
                      }
                    />
                  </Routes>
                </div>
              </main>
            </div>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppInner />
      </Router>
    </AuthProvider>
  );
}

export default App;
