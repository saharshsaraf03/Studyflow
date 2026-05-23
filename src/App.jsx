import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import HomePage from './pages/HomePage';
import SetupPage from './pages/SetupPage';
import DashboardPage from './pages/DashboardPage';
import AIToolsPage from './pages/AIToolsPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import { loadData, clearData } from './utils/storage';
import { initApi, savePlanner, loadPlanner, migrateToCloud } from './utils/api';

/**
 * AppInner — contains all app logic and routing.
 * Separated from App so it can access AuthContext via useAuth().
 */
function AppInner() {
  const { isAuthenticated, isLoading, getToken } = useAuth();

  const [planData, setPlanDataState] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Migration modal state
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [localDataForMigration, setLocalDataForMigration] = useState(null);
  const [isMigrating, setIsMigrating] = useState(false);

  // ── Initialize API client once auth is ready ───────────────────────────────
  useEffect(() => {
    if (isAuthenticated) {
      initApi(getToken);
    }
  }, [isAuthenticated, getToken]);

  // ── Load planner from cloud on login ──────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || isLoading) return;

    async function loadFromCloud() {
      setPlanLoading(true);
      try {
        const result = await loadPlanner();

        if (result.planData) {
          // User has cloud data — use it
          setPlanDataState(result.planData);
        } else {
          // No cloud data — check if localStorage has existing data for migration
          const localData = loadData();
          if (localData) {
            setLocalDataForMigration(localData);
            setShowMigrationModal(true);
          }
        }
      } catch (err) {
        console.error('[StudyFlow] Failed to load planner from cloud:', err);
        // Fallback to localStorage if cloud is unreachable
        const localData = loadData();
        if (localData) setPlanDataState(localData);
      } finally {
        setPlanLoading(false);
      }
    }

    loadFromCloud();
  }, [isAuthenticated, isLoading]);

  // ── Save planner to cloud whenever planData changes ────────────────────────
  const setPlanData = useCallback(async (newPlanData) => {
    setPlanDataState(newPlanData);
    if (!newPlanData) return;
    try {
      await savePlanner(newPlanData);
    } catch (err) {
      console.error('[StudyFlow] Failed to save planner to cloud:', err);
      // Silent fail — data is still in React state
    }
  }, []);

  // ── Migration handlers ─────────────────────────────────────────────────────
  const handleAcceptMigration = async () => {
    setIsMigrating(true);
    try {
      await migrateToCloud(localDataForMigration);
      setPlanDataState(localDataForMigration);
      clearData(); // Clear localStorage after successful migration
    } catch (err) {
      console.error('[StudyFlow] Migration failed:', err);
      // Still use the local data even if migration failed
      setPlanDataState(localDataForMigration);
    } finally {
      setIsMigrating(false);
      setShowMigrationModal(false);
      setLocalDataForMigration(null);
    }
  };

  const handleDeclineMigration = () => {
    setShowMigrationModal(false);
    setLocalDataForMigration(null);
    clearData();
  };

  // ── Loading screen while auth + plan load ─────────────────────────────────
  if (isLoading || planLoading) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-transparent border-t-primary-500 animate-spin" />
          <p className="text-sm text-surface-500">Loading StudyFlow...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        {/* ── Auth pages — no sidebar ── */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* ── Protected pages — with sidebar ── */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <div className="min-h-screen bg-surface-50 text-surface-900 flex">
                <Sidebar
                  hasPlan={!!planData}
                  isOpen={sidebarOpen}
                  onClose={() => setSidebarOpen(false)}
                />

                <main className="flex-1 min-h-screen md:ml-[240px]">
                  {/* Mobile header */}
                  <div className="md:hidden flex items-center justify-between px-4 h-14 bg-white border-b border-surface-200">
                    <button
                      onClick={() => setSidebarOpen(true)}
                      className="p-2 rounded-lg hover:bg-surface-100"
                    >
                      <svg className="w-5 h-5 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </button>
                    <span className="text-base font-bold gradient-text">StudyFlow</span>
                    <div className="w-9" />
                  </div>

                  <div className="p-4 sm:p-6 lg:p-8">
                    <Routes>
                      <Route path="/" element={<HomePage hasPlan={!!planData} />} />
                      <Route path="/setup" element={<SetupPage setPlanData={setPlanData} />} />
                      <Route path="/ai-tools" element={<AIToolsPage />} />
                      <Route
                        path="/dashboard"
                        element={<DashboardPage planData={planData} setPlanData={setPlanData} />}
                      />
                    </Routes>
                  </div>
                </main>
              </div>
            </ProtectedRoute>
          }
        />
      </Routes>

      {/* ── localStorage Migration Modal ─────────────────────────────────── */}
      {showMigrationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="sf-card p-6 max-w-md w-full animate-fade-in">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)' }}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-surface-900">Import Existing Data?</h3>
                <p className="text-xs text-surface-500">We found a study plan saved on this device</p>
              </div>
            </div>

            <p className="text-sm text-surface-600 mb-5">
              Would you like to import your existing study plan to your account?
              It will be available on all your devices and won't be lost if you clear your browser.
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleAcceptMigration}
                disabled={isMigrating}
                className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm disabled:opacity-60"
              >
                {isMigrating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Importing...
                  </>
                ) : (
                  'Yes, import it'
                )}
              </button>
              <button
                onClick={handleDeclineMigration}
                disabled={isMigrating}
                className="btn-secondary flex-1 text-sm"
              >
                No thanks
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
