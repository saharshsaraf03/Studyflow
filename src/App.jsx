import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import SetupPage from './pages/SetupPage';
import DashboardPage from './pages/DashboardPage';
import AIToolsPage from './pages/AIToolsPage';
import { loadData, saveData } from './utils/storage';

/**
 * App — Root component
 * Manages global state and routing.
 * Study plan data is stored in state and synced to localStorage.
 */
function App() {
  const [planData, setPlanData] = useState(null);

  // Load saved data on mount
  useEffect(() => {
    const saved = loadData();
    if (saved) {
      setPlanData(saved);
    }
  }, []);

  // Persist to localStorage whenever planData changes
  useEffect(() => {
    if (planData) {
      saveData(planData);
    }
  }, [planData]);

  return (
    <Router>
      <div className="min-h-screen bg-dark-900 text-dark-50 relative overflow-hidden">
        {/* Background gradient orbs for ambient lighting */}
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="bg-orb w-[600px] h-[600px] bg-primary-500 top-[-200px] left-[-200px]" style={{ position: 'absolute' }} />
          <div className="bg-orb w-[500px] h-[500px] bg-blue-500 bottom-[-150px] right-[-150px]" style={{ position: 'absolute' }} />
          <div className="bg-orb w-[400px] h-[400px] bg-purple-500 top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%]" style={{ position: 'absolute', opacity: 0.05 }} />
        </div>

        {/* Main content */}
        <div className="relative z-10">
          <Navbar hasPlan={!!planData} />
          <Routes>
            <Route path="/" element={<HomePage hasPlan={!!planData} />} />
            <Route path="/setup" element={<SetupPage setPlanData={setPlanData} />} />
            <Route path="/ai-tools" element={<AIToolsPage />} />
            <Route 
              path="/dashboard" 
              element={
                <DashboardPage 
                  planData={planData} 
                  setPlanData={setPlanData} 
                />
              } 
            />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
