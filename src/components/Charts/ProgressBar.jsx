import React from 'react';

/**
 * ProgressBar — Animated progress bar with percentage label
 * Uses gradient fill and glow effect at the tip
 */
const ProgressBar = ({ percentage = 0, label = 'Overall Progress', showLabel = true }) => {
  const clampedPercent = Math.min(100, Math.max(0, percentage));
  
  // Color based on percentage
  const getColor = (pct) => {
    if (pct >= 80) return { from: '#22c55e', to: '#14b8a6' };
    if (pct >= 50) return { from: '#14b8a6', to: '#3b82f6' };
    if (pct >= 25) return { from: '#f59e0b', to: '#ef4444' };
    return { from: '#ef4444', to: '#dc2626' };
  };
  
  const colors = getColor(clampedPercent);

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-dark-300 font-medium">{label}</span>
          <span className="text-sm font-bold" style={{ color: colors.from }}>
            {clampedPercent}%
          </span>
        </div>
      )}
      <div className="progress-bar">
        <div
          className="progress-bar-fill relative"
          style={{
            width: `${clampedPercent}%`,
            background: `linear-gradient(90deg, ${colors.from}, ${colors.to})`,
          }}
        >
          {/* Glow tip */}
          {clampedPercent > 3 && (
            <div
              className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
              style={{
                background: colors.to,
                boxShadow: `0 0 8px ${colors.to}, 0 0 16px ${colors.to}`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ProgressBar;
