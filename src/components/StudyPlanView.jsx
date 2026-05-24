import React from 'react';
import { Clock, Target } from 'lucide-react';

/**
 * StudyPlanView — shared component used by AIToolsPage and DocumentCard
 * Renders studyPlan object: title, totalEstimatedHours, topics[]
 */
const StudyPlanView = ({ studyPlan }) => {
  if (!studyPlan) return (
    <div className="sf-card p-8 text-center">
      <Target className="w-10 h-10 text-surface-400 mx-auto mb-3" />
      <p className="text-surface-500 text-sm">No study plan data available.</p>
    </div>
  );

  const COLORS = [
    '#6C5CE7','#4FACFE','#00D2A0','#FECA57','#FF6B6B',
    '#22c55e','#ec4899','#06b6d4','#f97316','#a855f7'
  ];

  return (
    <div className="space-y-5">
      <div className="sf-card p-5">
        <h3 className="text-lg font-semibold text-surface-900 mb-1">{studyPlan.title || 'Study Plan'}</h3>
        {studyPlan.totalEstimatedHours && (
          <div className="flex items-center gap-2 text-sm text-surface-500">
            <Clock className="w-4 h-4 text-primary-500" />
            Total Estimated:
            <span className="text-primary-500 font-semibold">{studyPlan.totalEstimatedHours} hours</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(studyPlan.topics || []).map((topic, index) => (
          <div key={index} className="sf-card p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${COLORS[index % COLORS.length]}, transparent)` }}
              >
                {topic.order || index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-surface-900 font-semibold text-sm">{topic.name}</h4>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {topic.priority && (
                    <span className={`badge ${
                      topic.priority === 'high' ? 'badge-hard'
                      : topic.priority === 'low' ? 'badge-easy'
                      : 'badge-medium'
                    }`}>{topic.priority}</span>
                  )}
                  {topic.estimatedHours != null && (
                    <span className="flex items-center gap-1 text-xs text-surface-500">
                      <Clock className="w-3 h-3" />{topic.estimatedHours}h
                    </span>
                  )}
                </div>
              </div>
            </div>
            {topic.keyPoints?.length > 0 && (
              <ul className="space-y-1 pl-1">
                {topic.keyPoints.map((point, pIdx) => (
                  <li key={pIdx} className="flex items-start gap-2 text-sm text-surface-500">
                    <span className="text-primary-500 mt-1.5 flex-shrink-0">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StudyPlanView;
