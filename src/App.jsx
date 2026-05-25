import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import HomePage from './pages/HomePage';
import SetupPage from './pages/SetupPage';
import DashboardPage from './pages/DashboardPage';
import LibraryPage from './pages/LibraryPage';
import SettingsPage from './pages/SettingsPage';
import HelpPage from './pages/HelpPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import { loadData, clearData } from './utils/storage';
import { initApi, savePlanner, loadPlanner, migrateToCloud } from './utils/api';

function AppInner() {
  const { isAuthenticated, isLoading, getToken } = useAuth();

  // Initialize API immediately whenever getToken changes — don't wait for effects
  if (isAuthenticated && getToken) initApi(getToken);
  const [planData, setPlanDataState] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [localDataForMigration, setLocalDataForMigration] = useState(null);
  const [isMigrating, setIsMigrating] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    async function loadFromCloud() {
      setPlanLoading(true);
      try {
        const result = await loadPlanner();
        if (result.planData) {
          // Cloud load succeeded — also update localStorage as backup
          setPlanDataState(result.planData);
          localStorage.setItem('sf_plan_backup', JSON.stringify(result.planData));
        } else {
          // No cloud data — check localStorage backup
          const backup = localStorage.getItem('sf_plan_backup');
          if (backup) {
            const parsed = JSON.parse(backup);
            setPlanDataState(parsed);
            // Re-save to cloud since it was missing
            try { await savePlanner(parsed); } catch {}
          } else {
            const localData = loadData();
            if (localData) { setLocalDataForMigration(localData); setShowMigrationModal(true); }
          }
        }
      } catch (err) {
        console.error('Cloud load failed:', err);
        // Fall back to localStorage backup
        const backup = localStorage.getItem('sf_plan_backup');
        if (backup) {
          try { setPlanDataState(JSON.parse(backup)); } catch {}
        } else {
          const localData = loadData();
          if (localData) setPlanDataState(localData);
        }
      } finally { setPlanLoading(false); }
    }
    loadFromCloud();
  }, [isAuthenticated, isLoading, getToken]);

  const setPlanData = useCallback(async (newPlanData) => {
    setPlanDataState(newPlanData);
    if (!newPlanData) {
      localStorage.removeItem('sf_plan_backup');
      return;
    }
    // Always save to localStorage as backup first (instant)
    localStorage.setItem('sf_plan_backup', JSON.stringify(newPlanData));
    // Then save to cloud
    try { await savePlanner(newPlanData); } catch (err) {
      console.error('Cloud save failed, but localStorage backup saved:', err);
    }
  }, []);

  const handleAcceptMigration = async () => {
    setIsMigrating(true);
    try { await migrateToCloud(localDataForMigration); setPlanDataState(localDataForMigration); clearData(); }
    catch { setPlanDataState(localDataForMigration); }
    finally { setIsMigrating(false); setShowMigrationModal(false); setLocalDataForMigration(null); }
  };

  const handleDeclineMigration = () => {
    setShowMigrationModal(false); setLocalDataForMigration(null); clearData();
  };

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
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <div className="min-h-screen bg-surface-50 text-surface-900 flex">
              <Sidebar hasPlan={!!planData} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
              <main className="flex-1 min-h-screen md:ml-[240px]">
                {/* Mobile header */}
                <div className="md:hidden flex items-center justify-between px-4 h-14 bg-white border-b border-surface-200">
                  <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-surface-100">
                    <svg className="w-5 h-5 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                  <span className="text-base font-bold gradient-text">StudyFlow</span>
                  <div className="w-9" />
                </div>
                <Routes>
                  {/* Library gets full height — no padding wrapper */}
                  <Route path="/library" element={<LibraryPage />} />
                  {/* All other pages get standard padding */}
                  <Route path="/*" element={
                    <div className="p-4 sm:p-6 lg:p-8">
                      <Routes>
                        <Route path="/" element={<HomePage hasPlan={!!planData} />} />
                        <Route path="/setup" element={<SetupPage setPlanData={setPlanData} />} />
                        <Route path="/dashboard" element={<DashboardPage planData={planData} setPlanData={setPlanData} />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/help" element={<HelpPage />} />
                      </Routes>
                    </div>
                  } />
                </Routes>
              </main>
            </div>
          </ProtectedRoute>
        } />
      </Routes>

      {showMigrationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="sf-card p-6 max-w-md w-full">
            <h3 className="text-base font-semibold text-surface-900 mb-2">Import Existing Data?</h3>
            <p className="text-sm text-surface-600 mb-5">We found a study plan on this device. Import it to your account?</p>
            <div className="flex gap-3">
              <button onClick={handleAcceptMigration} disabled={isMigrating} className="btn-primary flex-1 text-sm disabled:opacity-60">
                {isMigrating ? 'Importing...' : 'Yes, import it'}
              </button>
              <button onClick={handleDeclineMigration} disabled={isMigrating} className="btn-secondary flex-1 text-sm">No thanks</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function App() {
  return <ThemeProvider><AuthProvider><Router><AppInner /></Router></AuthProvider></ThemeProvider>;
}

export default App;
