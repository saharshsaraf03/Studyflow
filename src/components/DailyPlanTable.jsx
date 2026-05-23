import React, { useState, useRef } from 'react';
import { formatDate, getSubjectColor } from '../utils/PlannerEngine';
import { Check, X, Edit3, ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react';

/**
 * DailyPlanTable — Interactive daily schedule table
 * 
 * Features:
 * - Editable cells for planned hours
 * - Visual indicators for day status (pending/completed/missed)
 * - Pagination for manageable view
 * - Color-coded subject columns
 */
const DailyPlanTable = ({ planData, onUpdateDay, subjectNames }) => {
  const [page, setPage] = useState(0);
  const [editingCell, setEditingCell] = useState(null); // { dayIndex, subject }
  const [editValue, setEditValue] = useState('');
  const DAYS_PER_PAGE = 7;

  const { plan } = planData;
  const totalPages = Math.ceil(plan.length / DAYS_PER_PAGE);
  const visibleDays = plan.slice(page * DAYS_PER_PAGE, (page + 1) * DAYS_PER_PAGE);
  
  const today = new Date().toISOString().split('T')[0];

  // Find the current day's page
  const goToToday = () => {
    const todayIndex = plan.findIndex(d => d.date >= today);
    if (todayIndex >= 0) {
      setPage(Math.floor(todayIndex / DAYS_PER_PAGE));
    }
  };

  // Start editing a cell
  const startEdit = (dayIndex, subject, currentValue) => {
    setEditingCell({ dayIndex, subject });
    setEditValue(currentValue.toString());
  };

  // Save edited value
  const saveEdit = () => {
    if (editingCell === null) return;
    const { dayIndex, subject } = editingCell;
    const value = parseFloat(editValue) || 0;
    
    // Update the planned hours for this day/subject
    const actualDayIndex = page * DAYS_PER_PAGE + dayIndex;
    const updatedPlan = { ...planData };
    updatedPlan.plan[actualDayIndex].subjects[subject] = Math.max(0, Math.min(12, value));
    
    onUpdateDay(updatedPlan);
    setEditingCell(null);
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // Handle key press in edit mode
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  // Status styling
  const getStatusStyle = (status, date) => {
    if (status === 'completed') return 'bg-emerald-50 text-emerald-600';
    if (status === 'missed') return 'bg-red-50 text-red-500';
    if (date < today && status === 'pending') return 'bg-amber-50 text-amber-600'; // overdue
    if (date === today) return 'bg-primary-50 text-primary-500';
    return 'text-surface-400';
  };

  const getStatusLabel = (status, date) => {
    if (status === 'completed') return 'Done';
    if (status === 'missed') return 'Missed';
    if (date < today && status === 'pending') return 'Overdue';
    if (date === today) return 'Today';
    return 'Upcoming';
  };

  return (
    <div>
      {/* Table controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-50 text-primary-500 hover:bg-primary-100 transition-colors"
          >
            <Calendar className="w-3 h-3 inline mr-1" />
            Today
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-900 hover:bg-surface-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-surface-500 min-w-[80px] text-center">
            Week {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="p-1.5 rounded-lg text-surface-400 hover:text-surface-900 hover:bg-surface-100 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-surface-200">
        <table className="sf-table min-w-full">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[120px] bg-surface-50">
                Day
              </th>
              <th className="min-w-[80px]">Status</th>
              {subjectNames.map((name, i) => (
                <th key={name} className="min-w-[100px]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: getSubjectColor(i) }} />
                    <span className="truncate">{name}</span>
                  </div>
                </th>
              ))}
              <th className="min-w-[70px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {visibleDays.map((day, dayIndex) => {
              const totalHours = Object.values(day.subjects).reduce((a, b) => a + b, 0);
              const isToday = day.date === today;
              
              return (
                <tr 
                  key={day.date}
                  className={`transition-colors ${isToday ? 'bg-primary-50/50' : ''}`}
                  style={isToday ? { borderLeft: '3px solid #6C5CE7' } : {}}
                >
                  {/* Date cell */}
                  <td className={`sticky left-0 z-10 font-medium ${isToday ? 'bg-primary-50/80' : 'bg-white'}`}>
                    <div>
                      <span className="text-surface-800 text-sm">{formatDate(day.date)}</span>
                      {day.isWeekend && (
                        <span className="ml-1.5 text-[10px] text-primary-500 bg-primary-50 px-1.5 py-0.5 rounded">WE</span>
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td>
                    <span className={`badge ${getStatusStyle(day.status, day.date)}`}>
                      {getStatusLabel(day.status, day.date)}
                    </span>
                  </td>

                  {/* Subject hours — editable cells */}
                  {subjectNames.map((name, subIdx) => {
                    const hours = day.subjects[name] || 0;
                    const isEditing = editingCell?.dayIndex === dayIndex && editingCell?.subject === name;
                    
                    return (
                      <td key={name} className="editable-cell">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={saveEdit}
                              autoFocus
                              className="w-14 px-2 py-1 rounded text-xs text-center bg-white border border-primary-500 text-surface-900 focus:outline-none focus:ring-2 focus:ring-primary-200"
                              min="0"
                              max="12"
                              step="0.25"
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(dayIndex, name, hours)}
                            className="w-full text-left flex items-center gap-1 group/edit"
                            title="Click to edit"
                          >
                            <span className="text-sm" style={{ color: hours > 0 ? getSubjectColor(subIdx) : '#D1D5DB' }}>
                              {hours > 0 ? `${hours}h` : '—'}
                            </span>
                            <Edit3 className="w-3 h-3 text-surface-300 opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </td>
                    );
                  })}

                  {/* Total */}
                  <td>
                    <span className="text-sm font-medium text-surface-800">
                      {Math.round(totalHours * 100) / 100}h
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DailyPlanTable;
