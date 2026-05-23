import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { getSubjectColor } from '../../utils/PlannerEngine';

/**
 * SubjectPieChart — Shows time distribution across subjects
 * Displays both planned and actual hours as two concentric rings
 */
const SubjectPieChart = ({ planned, actual }) => {
  // Build data arrays for recharts
  const plannedData = Object.entries(planned)
    .filter(([_, val]) => val > 0)
    .map(([name, value], index) => ({
      name,
      value: Math.round(value * 100) / 100,
      fill: getSubjectColor(index),
    }));

  const actualData = Object.entries(actual)
    .filter(([_, val]) => val > 0)
    .map(([name, value], index) => ({
      name,
      value: Math.round(value * 100) / 100,
      fill: getSubjectColor(index),
    }));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="sf-card px-3 py-2 text-xs">
          <p className="text-surface-800 font-medium">{payload[0].name}</p>
          <p style={{ color: payload[0].payload.fill }}>
            {payload[0].value} hours
          </p>
        </div>
      );
    }
    return null;
  };

  const renderLabel = ({ name, value, cx, cy, midAngle, outerRadius }) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 20;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    
    if (value < 1) return null;
    
    return (
      <text x={x} y={y} fill="#6B7280" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11}>
        {name}
      </text>
    );
  };

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          {/* Outer ring: Planned hours */}
          <Pie
            data={plannedData}
            cx="50%"
            cy="50%"
            outerRadius={100}
            innerRadius={70}
            paddingAngle={2}
            dataKey="value"
            label={renderLabel}
            labelLine={false}
          >
            {plannedData.map((entry, index) => (
              <Cell key={`planned-${index}`} fill={entry.fill} opacity={0.7} stroke="none" />
            ))}
          </Pie>
          
          {/* Inner ring: Actual hours */}
          {actualData.length > 0 && (
            <Pie
              data={actualData}
              cx="50%"
              cy="50%"
              outerRadius={62}
              innerRadius={40}
              paddingAngle={2}
              dataKey="value"
            >
              {actualData.map((entry, index) => (
                <Cell key={`actual-${index}`} fill={entry.fill} stroke="none" />
              ))}
            </Pie>
          )}
          
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-3 mt-2">
        {plannedData.map((entry, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-surface-500">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: entry.fill }} />
            {entry.name}
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-4 mt-2 text-[10px] text-surface-400">
        <span>◯ Outer = Planned</span>
        {actualData.length > 0 && <span>● Inner = Actual</span>}
      </div>
    </div>
  );
};

export default SubjectPieChart;
