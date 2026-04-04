import React from 'react';
import { CheckCircle2, Clock, AlertTriangle, Flame, Target, TrendingUp } from 'lucide-react';

/**
 * StatusIndicators — Quick-glance stats cards
 * Shows completed days, pending, missed, streak, and totals
 */
const StatusIndicators = ({ stats }) => {
  const indicators = [
    {
      label: 'Completed',
      value: stats.completedDays,
      suffix: ' days',
      icon: CheckCircle2,
      color: '#22c55e',
      bg: 'rgba(34, 197, 94, 0.08)',
      border: 'rgba(34, 197, 94, 0.15)',
    },
    {
      label: 'Pending',
      value: stats.pendingDays,
      suffix: ' days',
      icon: Clock,
      color: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.08)',
      border: 'rgba(59, 130, 246, 0.15)',
    },
    {
      label: 'Missed',
      value: stats.missedDays,
      suffix: ' days',
      icon: AlertTriangle,
      color: stats.missedDays > 0 ? '#ef4444' : '#64748b',
      bg: stats.missedDays > 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(100, 116, 139, 0.08)',
      border: stats.missedDays > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(100, 116, 139, 0.15)',
    },
    {
      label: 'Current Streak',
      value: stats.currentStreak,
      suffix: ' 🔥',
      icon: Flame,
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.08)',
      border: 'rgba(245, 158, 11, 0.15)',
    },
    {
      label: 'Studied',
      value: stats.totalActualHours,
      suffix: 'h',
      icon: Target,
      color: '#14b8a6',
      bg: 'rgba(20, 184, 166, 0.08)',
      border: 'rgba(20, 184, 166, 0.15)',
    },
    {
      label: 'Best Streak',
      value: stats.longestStreak,
      suffix: ' days',
      icon: TrendingUp,
      color: '#8b5cf6',
      bg: 'rgba(139, 92, 246, 0.08)',
      border: 'rgba(139, 92, 246, 0.15)',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {indicators.map((item, index) => (
        <div
          key={index}
          className="rounded-xl p-3 text-center transition-all duration-300 hover:-translate-y-0.5"
          style={{
            background: item.bg,
            border: `1px solid ${item.border}`,
          }}
        >
          <item.icon className="w-4 h-4 mx-auto mb-1.5" style={{ color: item.color }} />
          <div className="text-xl font-bold" style={{ color: item.color }}>
            {item.value}{item.suffix}
          </div>
          <div className="text-[10px] text-dark-400 uppercase tracking-wider mt-0.5">{item.label}</div>
        </div>
      ))}
    </div>
  );
};

export default StatusIndicators;
