import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

/**
 * PlannedVsActualChart — Area chart comparing planned vs actual hours
 * Shows the gap between planned and actually studied hours over time
 */
const PlannedVsActualChart = ({ data }) => {
  // Limit to most recent 30 data points for readability
  const chartData = data.slice(-30).map(d => ({
    ...d,
    // Short date label
    label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-card px-3 py-2 text-xs space-y-1">
          <p className="text-dark-200 font-medium">{label}</p>
          {payload.map((entry, i) => (
            <p key={i} style={{ color: entry.color }}>
              {entry.name}: {entry.value} hrs
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="plannedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.08)" />
          <XAxis 
            dataKey="label" 
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(148, 163, 184, 0.1)' }}
            interval={'preserveStartEnd'}
          />
          <YAxis 
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(148, 163, 184, 0.1)' }}
          />
          <Tooltip content={<CustomTooltip />} />
          
          <Area
            type="monotone"
            dataKey="planned"
            name="Planned"
            stroke="#14b8a6"
            fill="url(#plannedGrad)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: '#14b8a6', strokeWidth: 2, fill: '#0f172a' }}
          />
          <Area
            type="monotone"
            dataKey="actual"
            name="Actual"
            stroke="#3b82f6"
            fill="url(#actualGrad)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: '#3b82f6', strokeWidth: 2, fill: '#0f172a' }}
          />
        </AreaChart>
      </ResponsiveContainer>
      
      {/* Legend */}
      <div className="flex justify-center gap-6 mt-2">
        <div className="flex items-center gap-1.5 text-xs text-dark-400">
          <div className="w-3 h-0.5 bg-primary-500 rounded" />
          Planned
        </div>
        <div className="flex items-center gap-1.5 text-xs text-dark-400">
          <div className="w-3 h-0.5 bg-blue-500 rounded" />
          Actual
        </div>
      </div>
    </div>
  );
};

export default PlannedVsActualChart;
