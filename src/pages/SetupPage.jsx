import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FormComponent from '../components/FormComponent';
import { generateStudyPlan } from '../utils/PlannerEngine';
import { BookOpen, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * SetupPage — Planner configuration page
 * Wraps the FormComponent and handles plan generation.
 */
const SetupPage = ({ setPlanData }) => {
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = (formData) => {
    setIsGenerating(true);
    setTimeout(() => {
      const plan = generateStudyPlan(formData);
      setPlanData(plan);
      setIsGenerating(false);
      navigate('/dashboard');
    }, 800);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-surface-500 hover:text-primary-500 transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, #6C5CE7, #4FACFE)',
            }}>
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-surface-900">
              Setup Your Study Plan
            </h1>
          </div>
          <p className="text-surface-500 text-sm mt-1">
            Fill in your subjects, difficulty levels, and schedule preferences to generate a smart study plan.
          </p>
        </div>
        <FormComponent onGenerate={handleGenerate} isGenerating={isGenerating} />
      </div>
    </div>
  );
};

export default SetupPage;
