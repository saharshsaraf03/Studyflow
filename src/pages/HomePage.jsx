import React from 'react';
import { Link } from 'react-router-dom';
import { 
  CalendarClock, BarChart3, Brain, LayoutDashboard, UserCheck,
  ArrowRight, Sparkles, Zap, Target, TrendingUp, Clock
} from 'lucide-react';

/**
 * HomePage — Landing page
 * Hero section with CTA, feature cards, and visual appeal.
 */
const HomePage = ({ hasPlan }) => {
  const features = [
    {
      icon: Brain,
      title: 'Adaptive Scheduling',
      description: 'Smart algorithms distribute study hours based on difficulty, syllabus size, and exam urgency.',
      gradient: 'from-primary-500 to-primary-300',
    },
    {
      icon: TrendingUp,
      title: 'Progress Tracking',
      description: 'Log your actual study hours and track your progress with visual indicators and streaks.',
      gradient: 'from-blue-500 to-indigo-400',
    },
    {
      icon: Zap,
      title: 'Smart Reallocation',
      description: 'Missed a day? The planner automatically redistributes hours across remaining days.',
      gradient: 'from-purple-500 to-pink-400',
    },
    {
      icon: BarChart3,
      title: 'Visual Dashboard',
      description: 'Beautiful charts showing time distribution, planned vs actual hours, and completion stats.',
      gradient: 'from-amber-500 to-orange-400',
    },
    {
      icon: UserCheck,
      title: 'Personalized Planning',
      description: 'Custom weekday and weekend hours with editable schedules that adapt to your lifestyle.',
      gradient: 'from-emerald-500 to-teal-400',
    },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* ========== HERO SECTION ========== */}
      <section className="relative px-4 pt-16 pb-24 sm:pt-24 sm:pb-32 overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.05] animate-pulse-slow" style={{
          background: 'conic-gradient(from 0deg, #6C5CE7, #4FACFE, #00D2A0, #6C5CE7)',
          filter: 'blur(60px)',
        }} />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-8 animate-fade-in" style={{
            background: 'rgba(108, 92, 231, 0.08)',
            border: '1px solid rgba(108, 92, 231, 0.15)',
            color: '#6C5CE7',
          }}>
            <Sparkles className="w-3.5 h-3.5" />
            AI-Powered Study Planning
          </div>

          {/* Hero heading */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-[1.1] mb-6 animate-slide-up">
            <span className="text-surface-900">Smart Study</span>
            <br />
            <span className="gradient-text">Planner</span>
          </h1>

          {/* Description */}
          <p className="text-base sm:text-lg text-surface-500 max-w-2xl mx-auto mb-10 leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
            Create personalized study schedules powered by intelligent algorithms. 
            Balance difficulty, urgency, and your available time — then track your progress 
            with beautiful visual dashboards.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <Link to="/setup" className="btn-primary flex items-center gap-2 text-base group">
              <Target className="w-5 h-5" />
              Create Your Plan
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            {hasPlan && (
              <Link to="/dashboard" className="btn-secondary flex items-center gap-2">
                <LayoutDashboard className="w-5 h-5" />
                View Dashboard
              </Link>
            )}
          </div>

          {/* Stats preview */}
          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mt-16 animate-fade-in" style={{ animationDelay: '0.4s' }}>
            {[
              { value: 'Smart', label: 'Algorithms' },
              { value: 'Auto', label: 'Adjustment' },
              { value: 'Visual', label: 'Analytics' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-lg sm:text-xl font-bold gradient-text">{stat.value}</div>
                <div className="text-xs text-surface-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FEATURES SECTION ========== */}
      <section className="px-4 py-20 relative">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4" style={{
              background: 'rgba(79, 172, 254, 0.08)',
              border: '1px solid rgba(79, 172, 254, 0.15)',
              color: '#4FACFE',
            }}>
              <Zap className="w-3 h-3" />
              Features
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 mb-4">
              Everything You Need to <span className="gradient-text">Ace Your Exams</span>
            </h2>
            <p className="text-surface-500 max-w-xl mx-auto">
              A comprehensive toolkit designed to optimize your study routine and maximize results.
            </p>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="sf-card-hover p-6 group"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {/* Icon */}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <feature.icon className="w-6 h-6 text-white" />
                </div>

                {/* Content */}
                <h3 className="text-lg font-semibold text-surface-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-surface-500 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== HOW IT WORKS ========== */}
      <section className="px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-surface-900 mb-4">
              How It <span className="gradient-text">Works</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Input Your Subjects', desc: 'Add subjects with difficulty levels, syllabus sizes, and exam dates.', icon: BookOpen },
              { step: '02', title: 'Generate Plan', desc: 'Our algorithm creates an optimized day-by-day study schedule.', icon: CalendarClock },
              { step: '03', title: 'Track & Adapt', desc: 'Log progress, and the plan auto-adjusts to keep you on track.', icon: BarChart3 },
            ].map((item, i) => (
              <div key={i} className="text-center group">
                <div className="relative inline-flex mb-6">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center sf-card group-hover:border-primary-500/30 transition-all duration-300">
                    <span className="text-2xl font-black gradient-text">{item.step}</span>
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-surface-900 mb-2">{item.title}</h3>
                <p className="text-sm text-surface-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FOOTER CTA ========== */}
      <section className="px-4 py-20">
        <div className="max-w-2xl mx-auto text-center">
          <div className="sf-card p-10">
            <Clock className="w-10 h-10 text-primary-500 mx-auto mb-4" />
            <h2 className="text-2xl sm:text-3xl font-bold text-surface-900 mb-4">
              Ready to Start Planning?
            </h2>
            <p className="text-surface-500 mb-8">
              Don't let exam stress control you. Create a smart study plan in minutes.
            </p>
            <Link to="/setup" className="btn-primary inline-flex items-center gap-2 text-base">
              Get Started Now
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-surface-200 px-4 py-8">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-sm text-surface-400">
            Built with <span className="text-primary-500">♥</span> — StudyFlow © {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
};

const BookOpen = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);

export default HomePage;
