/**
 * =====================================================
 * storage.js — localStorage Persistence Layer
 * =====================================================
 * Handles saving/loading all study planner data.
 * All data is stored under the key 'studyflow_data'.
 */

const STORAGE_KEY = 'studyflow_data';

/**
 * Save all planner data to localStorage
 * @param {Object} data - Complete planner state
 */
export const saveData = (data) => {
  try {
    const serialized = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch (error) {
    console.error('Failed to save data to localStorage:', error);
  }
};

/**
 * Load all planner data from localStorage
 * @returns {Object|null} Stored data or null if none exists
 */
export const loadData = () => {
  try {
    const serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) return null;
    return JSON.parse(serialized);
  } catch (error) {
    console.error('Failed to load data from localStorage:', error);
    return null;
  }
};

/**
 * Clear all stored planner data
 */
export const clearData = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear localStorage:', error);
  }
};

/**
 * Check if stored data exists
 * @returns {boolean}
 */
export const hasData = () => {
  return localStorage.getItem(STORAGE_KEY) !== null;
};
