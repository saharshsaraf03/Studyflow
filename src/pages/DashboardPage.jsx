import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Settings, Download, Trash2,
  ArrowLeft, BarChart3, Clock, Table2, Activity
} from 'lucide-react';
import DailyPlanTable from '../components/DailyPlanTable';
import ProgressTracker from '../components/ProgressTracker';
import StatusIndicators from '../components/StatusIndicators';
import ProgressBar from '../components/Charts/ProgressBar';
import SubjectPieChart from '../components/Charts/SubjectPieChart';
import PlannedVsActualChart from '../components/Charts/PlannedVsActualChart';
import { recalculatePlan, calculateStats, getSubjectColor } from '../utils/PlannerEngine';

const DashboardPage = ({ planData, setPlanData }) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('schedule');

  useEffect(() => {
    if (planData) {
      setStats(calculateStats(planData));
    }
  }, [planData]);

  const handlePlanUpdate = useCallback((updatedPlan) => {
    const recalculated = recalculatePlan(updatedPlan);
    setPlanData(recalculated); // this now saves to cloud via App.jsx
  }, [setPlanData]);

  const handleExport = async () => {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;
      const element = document.getElementById('dashboard-content');
      if (!element) return;
      const canvas = await html2canvas(element, {
        backgroundColor: '#F5F5F7',
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

  const handleReset = () => {
    if (window.confirm('Are you sure? This will delete your study plan and all progress from your account.')) {
      // setPlanData(null) triggers a cloud save with null — which is handled
      // gracefully by the backend (it simply doesn't save null).
      // We call it with null to clear React state, then navigate away.
      setPlanData(null);
      navigate('/setup');
    }
  };

  if (!planData || !planData.plan) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4">
        <div className="sf-card p-10 text-center max-w-md">
          <LayoutDashboard className="w-12 h-12 text-surface-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-surface-800 mb-2">No Study Plan Found</h2>
          <p className="text-sm text-surface-500 mb-6">Create a study plan first to see your dashboard.</p>
          <Link to="/setup" className="btn-primary inline-flex items-center gap-2">
            Create Plan
          </Link>
        </div>
      </div>
    );
  }

  const subjectNames = planData.subjects.map(s => s.name);

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto" id="dashboard-content">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)' }}>
                <LayoutDashboard className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-surface-900">Dashboard</h1>
            </div>
            <p className="text-sm text-surface-500">Track your progress and manage your study schedule.</p>
          </div>

          <div className="flex items-center gap-2 no-print">
            <button
              onClick={handleExport}
              className="px-3 py-2 rounded-xl text-xs font-medium text-surface-600 bg-white border border-surface-200 hover:bg-surface-50 hover:border-surface-300 transition-all flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export PDF
            </button>
            <Link
              to="/setup"
              className="px-3 py-2 rounded-xl text-xs font-medium text-surface-600 bg-white border border-surface-200 hover:bg-surface-50 hover:border-surface-300 transition-all flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5" />
              New Plan
            </Link>
            <button
              onClick={handleReset}
              className="px-3 py-2 rounded-xl text-xs font-medium text-red-500 bg-red-50 border border-red-200 hover:bg-red-100 transition-all flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {stats && (
          <div className="mb-6 animate-fade-in">
            <StatusIndicators stats={stats} />
          </div>
        )}

        {stats && (
          <div className="sf-card p-5 mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <ProgressBar percentage={stats.completionPercentage} label="Overall Completion" />
          </div>
        )}

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
                  ? 'text-white bg-primary-500 shadow-md'
                  : 'text-surface-500 hover:text-surface-800 hover:bg-white border border-transparent hover:border-surface-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'schedule' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fade-in">
            <div className="lg:col-span-3">
              <div className="sf-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Table2 className="w-5 h-5 text-primary-500" />
                  <h2 className="text-lg font-semibold text-surface-900">Daily Study Plan</h2>
                  <span className="text-xs text-surface-400 ml-auto">Click cells to edit</span>
                </div>
                <DailyPlanTable
                  planData={planData}
                  onUpdateDay={handlePlanUpdate}
                  subjectNames={subjectNames}
                />
              </div>
            </div>
            <div className="lg:col-span-1">
              <div className="sf-card p-5 sticky top-20">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-5 h-5 text-accent-blue" />
                  <h2 className="text-lg font-semibold text-surface-900">Log Progress</h2>
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

        {activeTab === 'analytics' && stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            <div className="sf-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-primary-500" />
                <h2 className="text-lg font-semibold text-surface-900">Time Distribution</h2>
              </div>
              <SubjectPieChart
                planned={stats.subjectDistribution}
                actual={stats.subjectActualDistribution}
              />
            </div>
            <div className="sf-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-primary-500" />
                <h2 className="text-lg font-semibold text-surface-900">Planned vs Actual</h2>
              </div>
              <PlannedVsActualChart data={stats.dailyPlannedVsActual} />
            </div>
            <div className="sf-card p-5 lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-accent-yellow" />
                <h2 className="text-lg font-semibold text-surface-900">Subject Breakdown</h2>
              </div>
              <div className="overflow-x-auto rounded-xl border border-surface-200">
                <table className="sf-table min-w-full">
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
                              <span className="text-surface-800 font-medium">{subject.name}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${
                              subject.difficulty === 'hard' ? 'badge-hard' :
                              subject.difficulty === 'easy' ? 'badge-easy' : 'badge-medium'
                            }`}>{subject.difficulty}</span>
                          </td>
                          <td>
                            <span className={`badge ${
                              subject.syllabusSize === 'large' ? 'badge-hard' :
                              subject.syllabusSize === 'small' ? 'badge-easy' : 'badge-medium'
                            }`}>{subject.syllabusSize}</span>
                          </td>
                          <td className="text-surface-600 text-sm">
                            {new Date(subject.examDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="text-surface-800 font-medium">{Math.round(planned * 10) / 10}h</td>
                          <td className="text-accent-blue font-medium">{Math.round(actual * 10) / 10}h</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-surface-100">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${Math.min(100, pct)}%`,
                                    background: `linear-gradient(90deg, ${getSubjectColor(i)}, ${getSubjectColor(i)}aa)`,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-surface-500 w-10 text-right">{pct}%</span>
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
