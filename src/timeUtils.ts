/**
 * Utility functions for time formatting and calculations
 */

import { TimeFormatOptions, TimeFormatter, DurationCalculator } from './types';

/**
 * Format milliseconds to human-readable time string
 */
export const formatTime: TimeFormatter = (milliseconds: number, options?: TimeFormatOptions): string => {
  const opts: Required<TimeFormatOptions> = {
    showSeconds: options?.showSeconds ?? true,
    shortFormat: options?.shortFormat ?? true,
    alwaysShowHours: options?.alwaysShowHours ?? false
  };

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];

  // Hours
  if (hours > 0 || opts.alwaysShowHours) {
    if (opts.shortFormat) {
      parts.push(`${hours}h`);
    } else {
      parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
    }
  }

  // Minutes
  if (minutes > 0 || (parts.length === 0 && !opts.showSeconds)) {
    if (opts.shortFormat) {
      parts.push(`${minutes}m`);
    } else {
      parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
    }
  }

  // Seconds
  if (opts.showSeconds && (seconds > 0 || parts.length === 0)) {
    if (opts.shortFormat) {
      parts.push(`${seconds}s`);
    } else {
      parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
    }
  }

  return parts.join(' ') || '0s';
};

/**
 * Calculate duration between two dates
 */
export const calculateDuration: DurationCalculator = (start: Date, end?: Date): number => {
  const endTime = end || new Date();
  return Math.max(0, endTime.getTime() - start.getTime());
};

/**
 * Format time for status bar (compact format)
 */
export const formatStatusBarTime = (milliseconds: number): string => {
  return formatTime(milliseconds, {
    showSeconds: true,
    shortFormat: true,
    alwaysShowHours: false
  });
};

/**
 * Format time for detailed display (verbose format)
 */
export const formatDetailedTime = (milliseconds: number): string => {
  return formatTime(milliseconds, {
    showSeconds: false,
    shortFormat: false,
    alwaysShowHours: false
  });
};

/**
 * Get time of day formatted as HH:MM
 */
export const formatTimeOfDay = (date: Date): string => {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

/**
 * Get date formatted as YYYY-MM-DD
 */
export const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0] ?? '';
};

/**
 * Get the start of the current week (Monday)
 */
export const getCurrentWeekStart = (): Date => {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday as first day of week
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
};

/**
 * Get the end of the current week (Sunday)
 */
export const getCurrentWeekEnd = (): Date => {
  const weekStart = getCurrentWeekStart();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return weekEnd;
};

/**
 * Get the start of the current month
 */
export const getCurrentMonthStart = (): Date => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  monthStart.setHours(0, 0, 0, 0);
  return monthStart;
};

/**
 * Get the end of the current month
 */
export const getCurrentMonthEnd = (): Date => {
  const now = new Date();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  monthEnd.setHours(23, 59, 59, 999);
  return monthEnd;
};

/**
 * Get the start of today
 */
export const getTodayStart = (): Date => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

/**
 * Get the end of today
 */
export const getTodayEnd = (): Date => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return today;
};

/**
 * Calculate the time that a session contributes to a specific date range
 * @param sessionStart Session start time
 * @param sessionTotalTime Total active time in the session (in milliseconds)
 * @param rangeStart Range start time
 * @param rangeEnd Range end time
 * @returns The amount of time (in milliseconds) that should be counted for this range
 */
export const calculateSessionTimeInRange = (
  sessionStart: Date,
  sessionTotalTime: number,
  rangeStart: Date,
  rangeEnd: Date
): number => {
  // Since sessions automatically split at midnight, each session belongs to a single day.
  // Use ISO date string comparison for more reliable day-based filtering
  
  const sessionDate = new Date(sessionStart.getFullYear(), sessionStart.getMonth(), sessionStart.getDate());
  const rangeStartDate = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate());
  const rangeEndDate = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());
  
  // For sessions within a single day (which they should be after midnight splitting),
  // we just need to check if the session date falls within the range dates
  if (sessionDate >= rangeStartDate && sessionDate <= rangeEndDate) {
    return sessionTotalTime;
  }
  
  return 0;
}; 