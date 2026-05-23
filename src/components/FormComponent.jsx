import React, { useState, useEffect } from 'react';
import { Plus, Minus, Sparkles, AlertCircle, GraduationCap, Clock, Calendar } from 'lucide-react';

/**
 * FormComponent — Subject input form
 * 
 * Collects:
 * - Number of subjects (dynamic)
 * - Subject names, difficulty, syllabus size, exam dates
 * - Weekday and weekend study hours
 * 
 * Validates all inputs before allowing plan generation.
 */
const FormComponent = ({ onGenerate, isGenerating }) => {
  const [subjectCount, setSubjectCount] = useState(3);
  const [subjects, setSubjects] = useState([]);
  const [weekdayHours, setWeekdayHours] = useState(4);
  const [weekendHours, setWeekendHours] = useState(6);
  const [errors, setErrors] = useState({});

  // Initialize subjects when count changes
  useEffect(() => {
    setSubjects(prev => {
      const newSubjects = [];
      for (let i = 0; i < subjectCount; i++) {
        newSubjects.push(prev[i] || {
          name: '',
          difficulty: 'medium',
          syllabusSize: 'medium',
          examDate: '',
        });
      }
      return newSubjects;
    });
  }, [subjectCount]);

  // Update a specific subject field
  const updateSubject = (index, field, value) => {
    setSubjects(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    // Clear error for this field
    setErrors(prev => {
      const next = { ...prev };
      delete next[`subject_${index}_${field}`];
      return next;
    });
  };

  // Validate all form inputs
  const validate = () => {
    const newErrors = {};
    
    subjects.forEach((subject, index) => {
      if (!subject.name.trim()) {
        newErrors[`subject_${index}_name`] = 'Subject name is required';
      }
      if (!subject.examDate) {
        newErrors[`subject_${index}_examDate`] = 'Exam date is required';
      } else {
        const examDate = new Date(subject.examDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (examDate <= today) {
          newErrors[`subject_${index}_examDate`] = 'Exam date must be in the future';
        }
      }
    });

    // Check for duplicate subject names
    const names = subjects.map(s => s.name.trim().toLowerCase()).filter(n => n);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    if (duplicates.length > 0) {
      subjects.forEach((s, i) => {
        if (duplicates.includes(s.name.trim().toLowerCase())) {
          newErrors[`subject_${i}_name`] = 'Duplicate subject name';
        }
      });
    }

    if (weekdayHours < 0.5 || weekdayHours > 16) {
      newErrors.weekdayHours = 'Must be between 0.5 and 16 hours';
    }
    if (weekendHours < 0.5 || weekendHours > 16) {
      newErrors.weekendHours = 'Must be between 0.5 and 16 hours';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    onGenerate({
      subjects: subjects.map(s => ({
        name: s.name.trim(),
        difficulty: s.difficulty,
        syllabusSize: s.syllabusSize,
        examDate: s.examDate,
      })),
      weekdayHours: Number(weekdayHours),
      weekendHours: Number(weekendHours),
    });
  };

  const difficultyOptions = [
    { value: 'easy', label: 'Easy', color: 'text-emerald-500' },
    { value: 'medium', label: 'Medium', color: 'text-amber-500' },
    { value: 'hard', label: 'Hard', color: 'text-red-500' },
  ];

  const syllabusOptions = [
    { value: 'small', label: 'Small', color: 'text-emerald-500' },
    { value: 'medium', label: 'Medium', color: 'text-amber-500' },
    { value: 'large', label: 'Large', color: 'text-red-500' },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-8 animate-fade-in">
      {/* ========== Subject Count ========== */}
      <div className="sf-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <GraduationCap className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-surface-900">Subjects</h2>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <label className="text-sm text-surface-600">Number of Subjects:</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSubjectCount(Math.max(1, subjectCount - 1))}
              className="w-9 h-9 rounded-lg flex items-center justify-center bg-surface-50 hover:bg-surface-100 text-surface-600 hover:text-surface-900 transition-all border border-surface-200 hover:border-primary-300"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-10 text-center text-lg font-semibold text-surface-900">{subjectCount}</span>
            <button
              type="button"
              onClick={() => setSubjectCount(Math.min(10, subjectCount + 1))}
              className="w-9 h-9 rounded-lg flex items-center justify-center bg-surface-50 hover:bg-surface-100 text-surface-600 hover:text-surface-900 transition-all border border-surface-200 hover:border-primary-300"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ========== Subject Fields ========== */}
        <div className="space-y-4">
          {subjects.map((subject, index) => (
            <div
              key={index}
              className="rounded-xl p-4 sm:p-5 border border-surface-200 transition-all duration-300 hover:border-surface-300 bg-surface-50"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{
                  background: `linear-gradient(135deg, ${['#6C5CE7', '#4FACFE', '#00D2A0', '#FECA57', '#FF6B6B', '#22c55e', '#ec4899', '#06b6d4', '#f97316', '#a855f7'][index % 10]}, transparent)`,
                }}>
                  {index + 1}
                </div>
                <span className="text-sm font-medium text-surface-600">Subject {index + 1}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Subject Name */}
                <div>
                  <label className="block text-xs text-surface-500 mb-1.5 font-medium">Subject Name</label>
                  <input
                    type="text"
                    value={subject.name}
                    onChange={(e) => updateSubject(index, 'name', e.target.value)}
                    placeholder={`e.g. Mathematics`}
                    className="sf-input"
                  />
                  {errors[`subject_${index}_name`] && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors[`subject_${index}_name`]}
                    </p>
                  )}
                </div>

                {/* Difficulty */}
                <div>
                  <label className="block text-xs text-surface-500 mb-1.5 font-medium">Difficulty</label>
                  <select
                    value={subject.difficulty}
                    onChange={(e) => updateSubject(index, 'difficulty', e.target.value)}
                    className="sf-select"
                  >
                    {difficultyOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Syllabus Size */}
                <div>
                  <label className="block text-xs text-surface-500 mb-1.5 font-medium">Syllabus Size</label>
                  <select
                    value={subject.syllabusSize}
                    onChange={(e) => updateSubject(index, 'syllabusSize', e.target.value)}
                    className="sf-select"
                  >
                    {syllabusOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Exam Date */}
                <div>
                  <label className="block text-xs text-surface-500 mb-1.5 font-medium">Exam Date</label>
                  <input
                    type="date"
                    value={subject.examDate}
                    onChange={(e) => updateSubject(index, 'examDate', e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="sf-input"
                  />
                  {errors[`subject_${index}_examDate`] && (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors[`subject_${index}_examDate`]}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ========== Study Hours ========== */}
      <div className="sf-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="w-5 h-5 text-accent-blue" />
          <h2 className="text-lg font-semibold text-surface-900">Study Hours</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Weekday Hours */}
          <div>
            <label className="block text-sm text-surface-600 mb-2 font-medium">
              <Calendar className="w-4 h-4 inline mr-1.5 text-surface-400" />
              Weekday Hours (per day)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0.5"
                max="12"
                step="0.5"
                value={weekdayHours}
                onChange={(e) => {
                  setWeekdayHours(Number(e.target.value));
                  setErrors(prev => { const n = {...prev}; delete n.weekdayHours; return n; });
                }}
                className="flex-1 accent-primary-500"
              />
              <div className="w-16 text-center">
                <input
                  type="number"
                  min="0.5"
                  max="16"
                  step="0.5"
                  value={weekdayHours}
                  onChange={(e) => {
                    setWeekdayHours(Number(e.target.value));
                    setErrors(prev => { const n = {...prev}; delete n.weekdayHours; return n; });
                  }}
                  className="sf-input text-center !py-2 !px-2"
                />
              </div>
              <span className="text-sm text-surface-500">hrs</span>
            </div>
            {errors.weekdayHours && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.weekdayHours}
              </p>
            )}
          </div>

          {/* Weekend Hours */}
          <div>
            <label className="block text-sm text-surface-600 mb-2 font-medium">
              <Calendar className="w-4 h-4 inline mr-1.5 text-surface-400" />
              Weekend Hours (per day)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0.5"
                max="12"
                step="0.5"
                value={weekendHours}
                onChange={(e) => {
                  setWeekendHours(Number(e.target.value));
                  setErrors(prev => { const n = {...prev}; delete n.weekendHours; return n; });
                }}
                className="flex-1 accent-primary-500"
              />
              <div className="w-16 text-center">
                <input
                  type="number"
                  min="0.5"
                  max="16"
                  step="0.5"
                  value={weekendHours}
                  onChange={(e) => {
                    setWeekendHours(Number(e.target.value));
                    setErrors(prev => { const n = {...prev}; delete n.weekendHours; return n; });
                  }}
                  className="sf-input text-center !py-2 !px-2"
                />
              </div>
              <span className="text-sm text-surface-500">hrs</span>
            </div>
            {errors.weekendHours && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {errors.weekendHours}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ========== Generate Button ========== */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isGenerating}
          className="btn-primary flex items-center gap-2 text-base disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating Plan...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Generate Study Plan
            </>
          )}
        </button>
      </div>
    </form>
  );
};

export default FormComponent;
