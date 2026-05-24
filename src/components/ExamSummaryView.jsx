import React from 'react';
import { FileText, Lightbulb } from 'lucide-react';

/**
 * ExamSummaryView — shared component used by AIToolsPage and DocumentCard
 * Renders examSummary object: title, sections[]
 */
const ExamSummaryView = ({ examSummary }) => {
  if (!examSummary) return (
    <div className="sf-card p-8 text-center">
      <FileText className="w-10 h-10 text-surface-400 mx-auto mb-3" />
      <p className="text-surface-500 text-sm">No exam summary available.</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="sf-card p-5">
        <h3 className="text-lg font-semibold text-surface-900">{examSummary.title || 'Exam Summary'}</h3>
      </div>

      {(examSummary.sections || []).map((section, sIdx) => (
        <div key={sIdx} className="sf-card p-5 space-y-4">
          <h4 className="text-lg font-semibold text-surface-900">{section.heading}</h4>
          {section.content && (
            <p className="text-sm text-surface-600 leading-relaxed">{section.content}</p>
          )}
          {section.keyTerms?.length > 0 && (
            <div>
              <p className="text-xs text-surface-400 uppercase tracking-wider mb-2 font-medium">Key Terms</p>
              <div className="flex flex-wrap gap-2">
                {section.keyTerms.map((term, tIdx) => (
                  <span key={tIdx} className="bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full text-xs">
                    {term}
                  </span>
                ))}
              </div>
            </div>
          )}
          {section.importantFormulas?.length > 0 && (
            <div className="rounded-xl p-3"
              style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
              <p className="text-xs text-blue-400 uppercase tracking-wider mb-2 font-medium">Important Formulas</p>
              <div className="space-y-1">
                {section.importantFormulas.map((formula, fIdx) => (
                  <p key={fIdx} className="text-sm text-surface-800 font-mono">{formula}</p>
                ))}
              </div>
            </div>
          )}
          {section.examTips?.length > 0 && (
            <div className="rounded-xl p-3"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-xs text-amber-400 uppercase tracking-wider font-medium">Exam Tips</p>
              </div>
              <ul className="space-y-1">
                {section.examTips.map((tip, tipIdx) => (
                  <li key={tipIdx} className="flex items-start gap-2 text-sm text-surface-600">
                    <span className="text-amber-500 mt-1 flex-shrink-0">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ExamSummaryView;
