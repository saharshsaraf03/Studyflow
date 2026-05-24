import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { BookOpen, ArrowLeft, Sparkles, Clock, Calendar, AlertCircle, Library, Loader2 } from 'lucide-react';
import { generateStudyPlan } from '../utils/PlannerEngine';
import { listSubjects } from '../utils/api';

/**
 * SetupPage — reads subjects FROM Library, adds exam config, generates plan
 * Subjects are no longer entered here — they come from the Library.
 * User only adds: exam date, difficulty, syllabus size per subject.
 * Plus: weekday/weekend study hours.
 */
const SetupPage = ({ setPlanData }) => {
  const navigate = useNavigate();

  const [librarySubjects, setLibrarySubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [subjects, setSubjects] = useState([]); // enriched with exam config
  const [weekdayHours, setWeekdayHours] = useState(4);
  const [weekendHours, setWeekendHours] = useState(6);
  const [errors, setErrors] = useState({});
  const [isGenerating, setIsGenerating] = useState(false);

  // Load subjects from Library API
  useEffect(() => {
    listSubjects()
      .then(r => {
        const subs = r.subjects || [];
        setLibrarySubjects(subs);
        setSubjects(subs.map(s => ({
          name: s.name,
          difficulty: 'medium',
          syllabusSize: 'medium',
          examDate: '',
        })));
      })
      .catch(() => {})
      .finally(() => setLoadingSubjects(false));
  }, []);

  const updateSubject = (index, field, value) => {
    setSubjects(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setErrors(prev => { const n = { ...prev }; delete n[`subject_${index}_${field}`]; return n; });
  };

  const validate = () => {
    const newErrors = {};
    subjects.forEach((s, i) => {
      if (!s.examDate) {
        newErrors[`subject_${i}_examDate`] = 'Exam date is required';
      } else {
        const d = new Date(s.examDate);
        const today = new Date(); today.setHours(0,0,0,0);
        if (d <= today) newErrors[`subject_${i}_examDate`] = 'Exam date must be in the future';
      }
    });
    if (weekdayHours < 0.5 || weekdayHours > 16) newErrors.weekdayHours = 'Must be between 0.5 and 16 hours';
    if (weekendHours < 0.5 || weekendHours > 16) newErrors.weekendHours = 'Must be between 0.5 and 16 hours';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleGenerate = (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsGenerating(true);
    setTimeout(() => {
      const plan = generateStudyPlan({ subjects, weekdayHours: Number(weekdayHours), weekendHours: Number(weekendHours) });
      setPlanData(plan);
      setIsGenerating(false);
      navigate('/dashboard');
    }, 800);
  };

  const difficultyOptions = [
    { value: 'easy', label: 'Easy' },
    { value: 'medium', label: 'Medium' },
    { value: 'hard', label: 'Hard' },
  ];

  const syllabusOptions = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-surface-500 hover:text-primary-500 transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)' }}>
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-surface-900">Setup Study Plan</h1>
          </div>
          <p className="text-surface-500 text-sm mt-1">
            Your subjects are pulled from your Library. Add exam dates and configure your schedule.
          </p>
        </div>

        {/* No subjects state */}
        {!loadingSubjects && librarySubjects.length === 0 && (
          <div className="sf-card p-8 text-center mb-6">
            <Library className="w-12 h-12 text-surface-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-surface-800 mb-2">No subjects in Library yet</h3>
            <p className="text-sm text-surface-500 mb-4">
              Add your subjects and chapters in the Library first, then come back here to set up your study plan.
            </p>
            <Link to="/library" className="btn-primary inline-flex items-center gap-2 text-sm">
              <Library className="w-4 h-4" /> Go to Library
            </Link>
          </div>
        )}

        {loadingSubjects && (
          <div className="sf-card p-8 flex items-center justify-center gap-3 text-surface-400 mb-6">
            <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
            <span className="text-sm">Loading your subjects from Library...</span>
          </div>
        )}

        {!loadingSubjects && subjects.length > 0 && (
          <form onSubmit={handleGenerate} className="space-y-6">
            {/* Subjects from Library */}
            <div className="sf-card p-6">
              <div className="flex items-center gap-3 mb-1">
                <BookOpen className="w-5 h-5 text-primary-500" />
                <h2 className="text-lg font-semibold text-surface-900">Subjects from Library</h2>
              </div>
              <p className="text-xs text-surface-400 mb-5">
                These subjects were pulled from your Library.
                <Link to="/library" className="text-primary-500 hover:underline ml-1">Add more in Library →</Link>
              </p>

              <div className="space-y-4">
                {subjects.map((subject, index) => (
                  <div key={index} className="rounded-xl p-4 sm:p-5 border border-surface-200 bg-surface-50">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ background: librarySubjects[index]?.color || '#6C5CE7' }} />
                      <span className="text-sm font-semibold text-surface-800">{subject.name}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-surface-500 mb-1.5 font-medium">Difficulty</label>
                        <select value={subject.difficulty} onChange={e => updateSubject(index, 'difficulty', e.target.value)} className="sf-select">
                          {difficultyOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-surface-500 mb-1.5 font-medium">Syllabus Size</label>
                        <select value={subject.syllabusSize} onChange={e => updateSubject(index, 'syllabusSize', e.target.value)} className="sf-select">
                          {syllabusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-surface-500 mb-1.5 font-medium">Exam Date</label>
                        <input type="date" value={subject.examDate}
                          onChange={e => updateSubject(index, 'examDate', e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          className="sf-input" />
                        {errors[`subject_${index}_examDate`] && (
                          <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />{errors[`subject_${index}_examDate`]}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Study hours */}
            <div className="sf-card p-6">
              <div className="flex items-center gap-3 mb-4">
                <Clock className="w-5 h-5 text-accent-blue" />
                <h2 className="text-lg font-semibold text-surface-900">Study Hours</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {[
                  { label: 'Weekday Hours (per day)', value: weekdayHours, setter: setWeekdayHours, error: errors.weekdayHours },
                  { label: 'Weekend Hours (per day)', value: weekendHours, setter: setWeekendHours, error: errors.weekendHours },
                ].map(({ label, value, setter, error }) => (
                  <div key={label}>
                    <label className="block text-sm text-surface-600 mb-2 font-medium">
                      <Calendar className="w-4 h-4 inline mr-1.5 text-surface-400" />{label}
                    </label>
                    <div className="flex items-center gap-3">
                      <input type="range" min="0.5" max="12" step="0.5" value={value}
                        onChange={e => setter(Number(e.target.value))} className="flex-1 accent-primary-500" />
                      <input type="number" min="0.5" max="16" step="0.5" value={value}
                        onChange={e => setter(Number(e.target.value))} className="sf-input w-16 text-center !py-2 !px-2" />
                      <span className="text-sm text-surface-500">hrs</span>
                    </div>
                    {error && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button type="submit" disabled={isGenerating} className="btn-primary flex items-center gap-2 text-base disabled:opacity-50 disabled:cursor-not-allowed">
                {isGenerating ? (
                  <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generating Plan...</>
                ) : (
                  <><Sparkles className="w-5 h-5" />Generate Study Plan</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default SetupPage;
