import React, { useState } from 'react';
import { getSubjectColor } from '../utils/PlannerEngine';
import { Check, Clock, SkipForward, Save, RotateCcw, Flame, AlertTriangle } from 'lucide-react';

/**
 * ProgressTracker — Log actual study hours and manage day statuses
 * 
 * Allows user to:
 * - Select a day to log progress for
 * - Input actual hours studied per subject
 * - Mark days as completed or missed
 * - Handles the "missed days" auto-adjustment trigger
 */
const ProgressTracker = ({ planData, onUpdatePlan, subjectNames }) => {
  const { plan } = planData;
  const today = new Date().toISOString().split('T')[0];
  
  // Find the first incomplete day (today or closest past day without logging)
  const defaultDayIndex = plan.findIndex(d => d.date === today) >= 0 
    ? plan.findIndex(d => d.date === today)
    : plan.findIndex(d => d.status === 'pending');
  
  const [selectedDayIndex, setSelectedDayIndex] = useState(Math.max(0, defaultDayIndex));
  const [actualHours, setActualHours] = useState({});
  const [saved, setSaved] = useState(false);

  const selectedDay = plan[selectedDayIndex];

  // Initialize actual hours when day selection changes
  React.useEffect(() => {
    if (selectedDay) {
      const hours = {};
      subjectNames.forEach(name => {
        hours[name] = selectedDay.actual[name] || 0;
      });
      setActualHours(hours);
      setSaved(false);
    }
  }, [selectedDayIndex]);

  // Get days that can be logged (today and past pending days)
  const loggableDays = plan
    .map((day, index) => ({ ...day, index }))
    .filter(day => day.date <= today || day.status !== 'pending');

  // Save actual hours for the selected day
  const handleSave = (status = 'completed') => {
    const updatedPlan = { ...planData };
    updatedPlan.plan[selectedDayIndex] = {
      ...updatedPlan.plan[selectedDayIndex],
      actual: { ...actualHours },
      status,
    };
    
    onUpdatePlan(updatedPlan);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Mark day as missed (0 hours for all subjects)
  const handleMarkMissed = () => {
    const zeroHours = {};
    subjectNames.forEach(name => { zeroHours[name] = 0; });
    
    const updatedPlan = { ...planData };
    updatedPlan.plan[selectedDayIndex] = {
      ...updatedPlan.plan[selectedDayIndex],
      actual: zeroHours,
      status: 'missed',
    };
    
    onUpdatePlan(updatedPlan);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Reset day to pending
  const handleReset = () => {
    const updatedPlan = { ...planData };
    updatedPlan.plan[selectedDayIndex] = {
      ...updatedPlan.plan[selectedDayIndex],
      actual: {},
      status: 'pending',
    };
    
    onUpdatePlan(updatedPlan);
    const hours = {};
    subjectNames.forEach(name => { hours[name] = 0; });
    setActualHours(hours);
  };

  if (!selectedDay) return null;

  const plannedTotal = Object.values(selectedDay.subjects).reduce((a, b) => a + b, 0);
  const actualTotal = Object.values(actualHours).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      {/* Day selector */}
      <div>
        <label className="block text-xs text-surface-500 mb-1.5 font-medium">Select Day</label>
        <select
          value={selectedDayIndex}
          onChange={(e) => setSelectedDayIndex(Number(e.target.value))}
          className="sf-select"
        >
          {plan.map((day, index) => (
            <option key={day.date} value={index}>
              {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              {day.date === today ? ' (Today)' : ''}
              {day.status === 'completed' ? ' ✓' : day.status === 'missed' ? ' ✗' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Planned vs Actual summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(108, 92, 231, 0.06)', border: '1px solid rgba(108, 92, 231, 0.12)' }}>
          <div className="text-xs text-surface-500 mb-1">Planned</div>
          <div className="text-lg font-bold text-primary-500">{Math.round(plannedTotal * 100) / 100}h</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(79, 172, 254, 0.06)', border: '1px solid rgba(79, 172, 254, 0.12)' }}>
          <div className="text-xs text-surface-500 mb-1">Actual</div>
          <div className="text-lg font-bold text-accent-blue">{Math.round(actualTotal * 100) / 100}h</div>
        </div>
      </div>

      {/* Subject inputs */}
      <div className="space-y-3">
        <label className="block text-xs text-surface-500 font-medium">Hours Studied Per Subject</label>
        {subjectNames.map((name, i) => {
          const planned = selectedDay.subjects[name] || 0;
          return (
            <div key={name} className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: getSubjectColor(i) }} />
                <span className="text-sm text-surface-700 truncate">{name}</span>
                <span className="text-[10px] text-surface-400 flex-shrink-0">({planned}h planned)</span>
              </div>
              <input
                type="number"
                min="0"
                max="12"
                step="0.25"
                value={actualHours[name] || 0}
                onChange={(e) => {
                  setActualHours(prev => ({
                    ...prev,
                    [name]: Math.max(0, parseFloat(e.target.value) || 0),
                  }));
                  setSaved(false);
                }}
                className="w-20 sf-input text-center !py-2"
              />
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => handleSave('completed')}
          className="btn-primary flex items-center justify-center gap-2 text-sm w-full"
        >
          {saved ? (
            <>
              <Check className="w-4 h-4" /> Saved!
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Save Progress
            </>
          )}
        </button>
        
        <div className="flex gap-2">
          <button
            onClick={handleMarkMissed}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all duration-300 text-amber-600 bg-amber-50 border border-amber-200 hover:bg-amber-100"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Mark Missed
          </button>
          <button
            onClick={handleReset}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-all duration-300 text-surface-500 bg-surface-50 border border-surface-200 hover:bg-surface-100"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Day
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProgressTracker;
