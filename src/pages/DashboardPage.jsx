import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, Settings, Download, Trash2, RefreshCw, 
  ArrowLeft, BarChart3, Clock, Table2, Activity 
} from 'lucide-react';
import DailyPlanTable from '../components/DailyPlanTable';
import ProgressTracker from '../components/ProgressTracker';
import StatusIndicators from '../components/StatusIndicators';
import ProgressBar from '../components/Charts/ProgressBar';
import SubjectPieChart from '../components/Charts/SubjectPieChart';
import PlannedVsActualChart from '../components/Charts/PlannedVsActualChart';
import { recalculatePlan, calculateStats, getSubjectColor } from '../utils/PlannerEngine';
import { clearData } from '../utils/storage';

/**
 * DashboardPage — Main analytics and management page
 * 
 * Sections:
 * 1. Status indicators (top row)
 * 2. Overall progress bar
 * 3. Daily plan table (editable)
 * 4. Progress tracker (log actual hours)
 * 5. Charts: Pie chart + Line chart
 */
const DashboardPage = ({ planData, setPlanData }) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' | 'analytics'

  // Recalculate stats whenever plan data changes
  useEffect(() => {
    if (planData) {
      const s = calculateStats(planData);
      setStats(s);
    }
  }, [planData]);

  // Handle plan updates (from table edits or progress logging)
  // Auto-recalculates remaining schedule
  const handlePlanUpdate = useCallback((updatedPlan) => {
    const recalculated = recalculatePlan(updatedPlan);
    setPlanData(recalculated);
  }, [setPlanData]);

  // Export as PDF (using html2canvas + jsPDF)
  const handleExport = async () => {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;
      
      const element = document.getElementById('dashboard-content');
      if (!element) return;
      
      const canvas = await html2canvas(element, {
        backgroundColor: '#0f172a',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      
      const pdf = new jsPDF('l', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('study-plan.pdf');
    } catch (err) {
      console.error('Export failed:', err);
      alert('PDF export failed. Please try again.');
    }
  };

  // Reset all data
  const handleReset = () => {
    if (window.confirm('Are you sure? This will delete your study plan and all progress.')) {
      clearData();
      setPlanData(null);
      navigate('/setup');
    }
  };

  // Redirect if no plan data
  if (!planData || !planData.plan) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="glass-card p-10 text-center max-w-md">
          <LayoutDashboard className="w-12 h-12 text-dark-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-dark-200 mb-2">No Study Plan Found</h2>
          <p className="text-sm text-dark-400 mb-6">Create a study plan first to see your dashboard.</p>
          <Link to="/setup" className="btn-glow inline-flex items-center gap-2">
            Create Plan
          </Link>
        </div>
      </div>
    );
  }

  const subjectNames = planData.subjects.map(s => s.name);

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 py-6">
      <div className="max-w-7xl mx-auto" id="dashboard-content">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
                background: 'linear-gradient(135deg, #14b8a6, #3b82f6)',
              }}>
                <LayoutDashboard className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-dark-100">Dashboard</h1>
            </div>
            <p className="text-sm text-dark-400">
              Track your progress and manage your study schedule.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 no-print">
            <button
              onClick={handleExport}
              className="px-3 py-2 rounded-xl text-xs font-medium text-dark-300 bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all flex items-center gap-1.5"
              title="Export as PDF"
            >
              <Download className="w-3.5 h-3.5" />
              Export PDF
            </button>
            <Link
              to="/setup"
              className="px-3 py-2 rounded-xl text-xs font-medium text-dark-300 bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5" />
              New Plan
            </Link>
            <button
              onClick={handleReset}
              className="px-3 py-2 rounded-xl text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all flex items-center gap-1.5"
              title="Delete plan"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Status Indicators */}
        {stats && (
          <div className="mb-6 animate-fade-in">
            <StatusIndicators stats={stats} />
          </div>
        )}

        {/* Overall Progress */}
        {stats && (
          <div className="glass-card p-5 mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <ProgressBar percentage={stats.completionPercentage} label="Overall Completion" />
          </div>
        )}

        {/* Tab navigation */}
        <div className="flex items-center gap-1 mb-6 no-print">
          {[
            { id: 'schedule', label: 'Schedule', icon: Table2 },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                activeTab === tab.id
                  ? 'text-primary-400 bg-primary-500/10 border border-primary-500/20'
                  : 'text-dark-400 hover:text-dark-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ========== SCHEDULE TAB ========== */}
        {activeTab === 'schedule' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fade-in">
            {/* Daily Plan Table — Takes 3 columns */}
            <div className="lg:col-span-3">
              <div className="glass-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Table2 className="w-5 h-5 text-primary-400" />
                  <h2 className="text-lg font-semibold text-dark-100">Daily Study Plan</h2>
                  <span className="text-xs text-dark-500 ml-auto">Click cells to edit</span>
                </div>
                <DailyPlanTable 
                  planData={planData} 
                  onUpdateDay={handlePlanUpdate}
                  subjectNames={subjectNames}
                />
              </div>
            </div>

            {/* Progress Tracker — Takes 1 column */}
            <div className="lg:col-span-1">
              <div className="glass-card p-5 sticky top-20">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-5 h-5 text-blue-400" />
                  <h2 className="text-lg font-semibold text-dark-100">Log Progress</h2>
                </div>
                <ProgressTracker 
                  planData={planData}
                  onUpdatePlan={handlePlanUpdate}
                  subjectNames={subjectNames}
                />
              </div>
            </div>
          </div>
        )}

        {/* ========== ANALYTICS TAB ========== */}
        {activeTab === 'analytics' && stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            {/* Pie Chart: Subject Distribution */}
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-semibold text-dark-100">Time Distribution</h2>
              </div>
              <SubjectPieChart 
                planned={stats.subjectDistribution}
                actual={stats.subjectActualDistribution}
              />
            </div>

            {/* Line Chart: Planned vs Actual */}
            <div className="glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-primary-400" />
                <h2 className="text-lg font-semibold text-dark-100">Planned vs Actual</h2>
              </div>
              <PlannedVsActualChart data={stats.dailyPlannedVsActual} />
            </div>

            {/* Subject breakdown table */}
            <div className="glass-card p-5 lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-semibold text-dark-100">Subject Breakdown</h2>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/5">
                <table className="table-dark min-w-full">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Difficulty</th>
                      <th>Syllabus</th>
                      <th>Exam Date</th>
                      <th>Planned Hours</th>
                      <th>Actual Hours</th>
                      <th>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planData.subjects.map((subject, i) => {
                      const planned = stats.subjectDistribution[subject.name] || 0;
                      const actual = stats.subjectActualDistribution[subject.name] || 0;
                      const pct = planned > 0 ? Math.round((actual / planned) * 100) : 0;
                      
                      return (
                        <tr key={subject.name}>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ background: getSubjectColor(i) }} />
                              <span className="text-dark-200 font-medium">{subject.name}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${
                              subject.difficulty === 'hard' ? 'badge-hard' : 
                              subject.difficulty === 'easy' ? 'badge-easy' : 'badge-medium'
                            }`}>
                              {subject.difficulty}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${
                              subject.syllabusSize === 'large' ? 'badge-hard' : 
                              subject.syllabusSize === 'small' ? 'badge-easy' : 'badge-medium'
                            }`}>
                              {subject.syllabusSize}
                            </span>
                          </td>
                          <td className="text-dark-300 text-sm">
                            {new Date(subject.examDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="text-dark-200 font-medium">{Math.round(planned * 10) / 10}h</td>
                          <td className="text-blue-400 font-medium">{Math.round(actual * 10) / 10}h</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(15, 23, 42, 0.6)' }}>
                                <div 
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{ 
                                    width: `${Math.min(100, pct)}%`,
                                    background: `linear-gradient(90deg, ${getSubjectColor(i)}, ${getSubjectColor(i)}aa)`,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-dark-400 w-10 text-right">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
