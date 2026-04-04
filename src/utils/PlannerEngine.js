/**
 * =====================================================
 * PlannerEngine.js — Core Study Plan Generation Logic
 * =====================================================
 * 
 * ALGORITHM OVERVIEW:
 * 
 * 1. PRIORITY CALCULATION:
 *    For each subject, a priority score is calculated using:
 *    
 *    priority = (difficulty_weight * 0.35) + (syllabus_weight * 0.30) + (urgency_weight * 0.35)
 *    
 *    Where:
 *    - difficulty_weight: Easy=1, Medium=2, Hard=3 (or 1-5 scale)
 *    - syllabus_weight: Small=1, Medium=2, Large=3 (or numeric)
 *    - urgency_weight: inverse of days remaining (closer exam = higher urgency)
 *      Calculated as: max_days / days_remaining (capped to avoid infinity)
 *    
 * 2. HOUR DISTRIBUTION:
 *    Each day's available hours (weekday/weekend) are split among subjects
 *    proportionally to their normalized priority scores. Subjects whose
 *    exam has passed are excluded.
 * 
 * 3. AUTO-ADJUSTMENT:
 *    When actual hours differ from planned hours:
 *    - Deficit hours are redistributed across remaining days
 *    - Surplus hours reduce future allocations
 *    - Priorities are recalculated with updated urgency
 * 
 * 4. MISSED DAYS:
 *    If a day is marked as missed, its planned hours are redistributed
 *    across remaining days proportionally.
 */

/**
 * Calculate the day of week: 0 = Sunday, 6 = Saturday
 * @param {string} dateStr - ISO date string (YYYY-MM-DD)
 * @returns {number} Day of week
 */
const getDayOfWeek = (dateStr) => {
  return new Date(dateStr).getDay();
};

/**
 * Check if a date falls on a weekend (Saturday or Sunday)
 * @param {string} dateStr - ISO date string
 * @returns {boolean}
 */
const isWeekend = (dateStr) => {
  const day = getDayOfWeek(dateStr);
  return day === 0 || day === 6;
};

/**
 * Generate array of dates from start to end (inclusive)
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {string[]} Array of ISO date strings
 */
const getDateRange = (startDate, endDate) => {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
};

/**
 * Calculate days remaining until an exam from a given date
 * @param {string} fromDate - Start date
 * @param {string} examDate - Exam date
 * @returns {number} Days remaining (min 0)
 */
const daysUntilExam = (fromDate, examDate) => {
  const from = new Date(fromDate);
  const exam = new Date(examDate);
  const diff = Math.ceil((exam - from) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
};

/**
 * Convert difficulty string/number to numeric weight
 * @param {string|number} difficulty
 * @returns {number} Weight (1-5)
 */
const getDifficultyWeight = (difficulty) => {
  if (typeof difficulty === 'number') return Math.min(5, Math.max(1, difficulty));
  const map = { easy: 1, medium: 3, hard: 5 };
  return map[difficulty?.toLowerCase()] || 3;
};

/**
 * Convert syllabus size to numeric weight
 * @param {string|number} size
 * @returns {number} Weight (1-5)
 */
const getSyllabusWeight = (size) => {
  if (typeof size === 'number') return Math.min(5, Math.max(1, size));
  const map = { small: 1, medium: 3, large: 5 };
  return map[size?.toLowerCase()] || 3;
};

/**
 * Calculate priority score for a subject on a given date
 * Priority considers: difficulty, syllabus size, and urgency (closer exam = higher priority)
 * 
 * @param {Object} subject - Subject object with difficulty, syllabusSize, examDate
 * @param {string} currentDate - Current date being planned
 * @param {number} maxDays - Maximum days until any exam (for normalization)
 * @returns {number} Priority score (higher = more important)
 */
const calculatePriority = (subject, currentDate, maxDays) => {
  const diffWeight = getDifficultyWeight(subject.difficulty);
  const syllWeight = getSyllabusWeight(subject.syllabusSize);
  const daysLeft = daysUntilExam(currentDate, subject.examDate);
  
  // If exam has passed, return 0 priority
  if (daysLeft <= 0) return 0;
  
  // Urgency: closer exam = higher urgency
  // Using inverse relationship: urgency increases exponentially as exam approaches
  const urgencyWeight = Math.min(5, (maxDays / daysLeft));
  
  // Weighted priority formula:
  // - 35% difficulty (harder subjects need more time)
  // - 30% syllabus (larger syllabus needs more time)
  // - 35% urgency (closer exams need priority)
  const priority = (diffWeight * 0.35) + (syllWeight * 0.30) + (urgencyWeight * 0.35);
  
  return priority;
};

/**
 * =====================================================
 * MAIN: Generate a complete day-by-day study plan
 * =====================================================
 * 
 * @param {Object} config - Planner configuration
 * @param {Object[]} config.subjects - Array of subject objects
 * @param {string} config.subjects[].name - Subject name
 * @param {string} config.subjects[].difficulty - 'easy'|'medium'|'hard' or 1-5
 * @param {string} config.subjects[].syllabusSize - 'small'|'medium'|'large' or 1-5
 * @param {string} config.subjects[].examDate - ISO date (YYYY-MM-DD)
 * @param {number} config.weekdayHours - Max study hours on weekdays
 * @param {number} config.weekendHours - Max study hours on weekends
 * @param {string} [config.startDate] - Plan start date (defaults to today)
 * 
 * @returns {Object} Generated study plan
 * @returns {Object[]} .plan - Array of daily plan objects
 * @returns {string} .plan[].date - Date string
 * @returns {boolean} .plan[].isWeekend - Whether it's a weekend
 * @returns {number} .plan[].maxHours - Maximum available hours
 * @returns {Object} .plan[].subjects - { subjectName: allocatedHours }
 * @returns {Object} .plan[].actual - { subjectName: actualHoursStudied }
 * @returns {string} .plan[].status - 'pending'|'completed'|'missed'
 */
export const generateStudyPlan = (config) => {
  const { subjects, weekdayHours, weekendHours, startDate } = config;
  
  // Determine the planning period: from start date to last exam date
  const start = startDate || new Date().toISOString().split('T')[0];
  const lastExamDate = subjects.reduce((latest, sub) => {
    return sub.examDate > latest ? sub.examDate : latest;
  }, subjects[0].examDate);
  
  // Generate all dates in the planning period (up to the day before last exam)
  const allDates = getDateRange(start, lastExamDate);
  
  // Calculate the maximum days until any exam (for urgency normalization)
  const maxDays = Math.max(...subjects.map(s => daysUntilExam(start, s.examDate)));
  
  // Build the day-by-day plan
  const plan = allDates.map(date => {
    const weekend = isWeekend(date);
    const maxHours = weekend ? weekendHours : weekdayHours;
    
    // Calculate priority for each subject on this date
    const priorities = {};
    let totalPriority = 0;
    
    subjects.forEach(subject => {
      const daysLeft = daysUntilExam(date, subject.examDate);
      // Only include subjects whose exam hasn't passed yet
      if (daysLeft > 0) {
        const priority = calculatePriority(subject, date, maxDays);
        priorities[subject.name] = priority;
        totalPriority += priority;
      }
    });
    
    // Distribute available hours proportionally to priorities
    const subjectHours = {};
    if (totalPriority > 0) {
      Object.entries(priorities).forEach(([name, priority]) => {
        // Proportional allocation: subject gets (its priority / total priority) * available hours
        const rawHours = (priority / totalPriority) * maxHours;
        // Round to nearest 0.25 for cleaner scheduling
        subjectHours[name] = Math.round(rawHours * 4) / 4;
      });
      
      // Adjust rounding errors: ensure total doesn't exceed maxHours
      const totalAllocated = Object.values(subjectHours).reduce((a, b) => a + b, 0);
      if (totalAllocated > maxHours) {
        // Reduce the subject with the most hours slightly
        const maxSubject = Object.entries(subjectHours).sort((a, b) => b[1] - a[1])[0];
        if (maxSubject) {
          subjectHours[maxSubject[0]] -= (totalAllocated - maxHours);
          subjectHours[maxSubject[0]] = Math.max(0, Math.round(subjectHours[maxSubject[0]] * 4) / 4);
        }
      }
      
      // Ensure minimum 0.25 hours for any included subject
      Object.keys(subjectHours).forEach(name => {
        if (subjectHours[name] < 0.25 && subjectHours[name] > 0) {
          subjectHours[name] = 0.25;
        }
      });
    }
    
    return {
      date,
      dayName: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
      isWeekend: weekend,
      maxHours,
      subjects: subjectHours,
      actual: {},      // Will be filled by user
      status: 'pending', // 'pending' | 'completed' | 'missed'
      streak: 0,
    };
  });
  
  return {
    plan,
    subjects: subjects.map(s => ({
      ...s,
      difficultyWeight: getDifficultyWeight(s.difficulty),
      syllabusWeight: getSyllabusWeight(s.syllabusSize),
    })),
    config: { weekdayHours, weekendHours, startDate: start },
    createdAt: new Date().toISOString(),
    totalPlannedHours: plan.reduce((total, day) => {
      return total + Object.values(day.subjects).reduce((a, b) => a + b, 0);
    }, 0),
  };
};

/**
 * =====================================================
 * AUTO-ADJUST: Recalculate remaining schedule
 * =====================================================
 * 
 * Called when:
 * - User edits planned hours for a day
 * - User logs actual hours studied
 * - User marks a day as missed
 * 
 * Strategy:
 * 1. For each future day, recalculate priorities with updated urgency
 * 2. Calculate deficit/surplus from past days
 * 3. Redistribute adjustments across remaining days
 * 
 * @param {Object} planData - Current plan data
 * @param {number} fromDayIndex - Index of the day that was modified
 * @returns {Object} Updated plan data
 */
export const recalculatePlan = (planData) => {
  const { plan, subjects, config } = planData;
  const today = new Date().toISOString().split('T')[0];
  
  // Calculate deficit: difference between planned and actual for completed days
  let deficitBySubject = {};
  subjects.forEach(s => { deficitBySubject[s.name] = 0; });
  
  plan.forEach(day => {
    if (day.status === 'completed' || day.status === 'missed') {
      Object.entries(day.subjects).forEach(([name, planned]) => {
        const actual = day.actual[name] || 0;
        deficitBySubject[name] = (deficitBySubject[name] || 0) + (planned - actual);
      });
    }
  });
  
  // Find future/pending days
  const futureDays = plan.filter(day => day.status === 'pending' && day.date >= today);
  
  if (futureDays.length === 0) return planData;
  
  // Maximum days for urgency calculation
  const maxDays = Math.max(...subjects.map(s => daysUntilExam(today, s.examDate)), 1);
  
  // Recalculate each future day
  futureDays.forEach(day => {
    const maxHours = day.maxHours;
    const priorities = {};
    let totalPriority = 0;
    
    subjects.forEach(subject => {
      const daysLeft = daysUntilExam(day.date, subject.examDate);
      if (daysLeft > 0) {
        let priority = calculatePriority(subject, day.date, maxDays);
        
        // Boost priority for subjects with deficit
        const deficit = deficitBySubject[subject.name] || 0;
        if (deficit > 0) {
          // Add a deficit bonus scaled to remaining days
          const remainingDaysForSubject = daysUntilExam(day.date, subject.examDate);
          const deficitBonus = (deficit / Math.max(1, remainingDaysForSubject)) * 0.5;
          priority += deficitBonus;
        }
        
        priorities[subject.name] = priority;
        totalPriority += priority;
      }
    });
    
    // Redistribute hours
    const newSubjects = {};
    if (totalPriority > 0) {
      Object.entries(priorities).forEach(([name, priority]) => {
        const rawHours = (priority / totalPriority) * maxHours;
        newSubjects[name] = Math.round(rawHours * 4) / 4;
      });
      
      // Fix rounding
      const totalAllocated = Object.values(newSubjects).reduce((a, b) => a + b, 0);
      if (totalAllocated > maxHours) {
        const maxSubject = Object.entries(newSubjects).sort((a, b) => b[1] - a[1])[0];
        if (maxSubject) {
          newSubjects[maxSubject[0]] = Math.max(0, 
            Math.round((newSubjects[maxSubject[0]] - (totalAllocated - maxHours)) * 4) / 4
          );
        }
      }
    }
    
    day.subjects = newSubjects;
  });
  
  // Recalculate total planned hours
  planData.totalPlannedHours = plan.reduce((total, day) => {
    return total + Object.values(day.subjects).reduce((a, b) => a + b, 0);
  }, 0);
  
  return { ...planData };
};

/**
 * =====================================================
 * STATISTICS: Calculate progress and analytics
 * =====================================================
 */
export const calculateStats = (planData) => {
  if (!planData || !planData.plan) {
    return {
      totalPlannedHours: 0,
      totalActualHours: 0,
      completionPercentage: 0,
      completedDays: 0,
      pendingDays: 0,
      missedDays: 0,
      currentStreak: 0,
      longestStreak: 0,
      subjectDistribution: {},
      subjectActualDistribution: {},
      dailyPlannedVsActual: [],
    };
  }
  
  const { plan, subjects } = planData;
  
  let totalPlannedHours = 0;
  let totalActualHours = 0;
  let completedDays = 0;
  let pendingDays = 0;
  let missedDays = 0;
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  
  // Subject-level tracking
  const subjectPlanned = {};
  const subjectActual = {};
  subjects.forEach(s => {
    subjectPlanned[s.name] = 0;
    subjectActual[s.name] = 0;
  });
  
  const dailyData = [];
  
  plan.forEach(day => {
    const plannedToday = Object.values(day.subjects).reduce((a, b) => a + b, 0);
    const actualToday = Object.values(day.actual).reduce((a, b) => a + b, 0);
    
    totalPlannedHours += plannedToday;
    totalActualHours += actualToday;
    
    // Subject-level accumulation
    Object.entries(day.subjects).forEach(([name, hours]) => {
      subjectPlanned[name] = (subjectPlanned[name] || 0) + hours;
    });
    Object.entries(day.actual).forEach(([name, hours]) => {
      subjectActual[name] = (subjectActual[name] || 0) + hours;
    });
    
    // Day status counting
    if (day.status === 'completed') {
      completedDays++;
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else if (day.status === 'missed') {
      missedDays++;
      tempStreak = 0;
    } else {
      pendingDays++;
    }
    
    dailyData.push({
      date: day.date,
      dayName: day.dayName,
      planned: Math.round(plannedToday * 100) / 100,
      actual: Math.round(actualToday * 100) / 100,
    });
  });
  
  // Current streak: count backwards from last completed day
  currentStreak = 0;
  for (let i = plan.length - 1; i >= 0; i--) {
    if (plan[i].status === 'completed') {
      currentStreak++;
    } else if (plan[i].status === 'missed' || plan[i].status === 'pending') {
      // Check if this pending day is in the future
      const today = new Date().toISOString().split('T')[0];
      if (plan[i].date < today && plan[i].status === 'pending') {
        break;
      }
      if (plan[i].status === 'missed') break;
    }
  }
  
  // Completion percentage based on what's been completed vs total planned for past days
  const today = new Date().toISOString().split('T')[0];
  let pastPlanned = 0;
  plan.forEach(day => {
    if (day.date <= today) {
      pastPlanned += Object.values(day.subjects).reduce((a, b) => a + b, 0);
    }
  });
  
  const completionPercentage = pastPlanned > 0 
    ? Math.min(100, Math.round((totalActualHours / pastPlanned) * 100))
    : 0;
  
  return {
    totalPlannedHours: Math.round(totalPlannedHours * 100) / 100,
    totalActualHours: Math.round(totalActualHours * 100) / 100,
    completionPercentage,
    completedDays,
    pendingDays,
    missedDays,
    currentStreak,
    longestStreak,
    subjectDistribution: subjectPlanned,
    subjectActualDistribution: subjectActual,
    dailyPlannedVsActual: dailyData,
  };
};

/**
 * Format a date string for display
 * @param {string} dateStr - ISO date string
 * @returns {string} Formatted date
 */
export const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Get color palette for subjects (consistent colors)
 */
export const SUBJECT_COLORS = [
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#ef4444', // red
  '#22c55e', // green
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#a855f7', // violet
];

export const getSubjectColor = (index) => {
  return SUBJECT_COLORS[index % SUBJECT_COLORS.length];
};
