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
      color: '#00D2A0',
      bg: 'rgba(0, 210, 160, 0.08)',
      border: 'rgba(0, 210, 160, 0.15)',
    },
    {
      label: 'Pending',
      value: stats.pendingDays,
      suffix: ' days',
      icon: Clock,
      color: '#4FACFE',
      bg: 'rgba(79, 172, 254, 0.08)',
      border: 'rgba(79, 172, 254, 0.15)',
    },
    {
      label: 'Missed',
      value: stats.missedDays,
      suffix: ' days',
      icon: AlertTriangle,
      color: stats.missedDays > 0 ? '#FF6B6B' : '#9CA3AF',
      bg: stats.missedDays > 0 ? 'rgba(255, 107, 107, 0.08)' : 'rgba(156, 163, 175, 0.08)',
      border: stats.missedDays > 0 ? 'rgba(255, 107, 107, 0.15)' : 'rgba(156, 163, 175, 0.15)',
    },
    {
      label: 'Current Streak',
      value: stats.currentStreak,
      suffix: ' 🔥',
      icon: Flame,
      color: '#FECA57',
      bg: 'rgba(254, 202, 87, 0.08)',
      border: 'rgba(254, 202, 87, 0.15)',
    },
    {
      label: 'Studied',
      value: stats.totalActualHours,
      suffix: 'h',
      icon: Target,
      color: '#6C5CE7',
      bg: 'rgba(108, 92, 231, 0.08)',
      border: 'rgba(108, 92, 231, 0.15)',
    },
    {
      label: 'Best Streak',
      value: stats.longestStreak,
      suffix: ' days',
      icon: TrendingUp,
      color: '#6C5CE7',
      bg: 'rgba(108, 92, 231, 0.06)',
      border: 'rgba(108, 92, 231, 0.12)',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {indicators.map((item, index) => (
        <div
          key={index}
          className="rounded-xl p-3 text-center transition-all duration-300 hover:-translate-y-0.5 bg-white"
          style={{
            background: item.bg,
            border: `1px solid ${item.border}`,
          }}
        >
          <item.icon className="w-4 h-4 mx-auto mb-1.5" style={{ color: item.color }} />
          <div className="text-xl font-bold" style={{ color: item.color }}>
            {item.value}{item.suffix}
          </div>
          <div className="text-[10px] text-surface-500 uppercase tracking-wider mt-0.5">{item.label}</div>
        </div>
      ))}
    </div>
  );
};

export default StatusIndicators;
