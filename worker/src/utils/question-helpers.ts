/**
 * worker/src/utils/question-helpers.ts
 *
 * Helper utilities for auto-apply question answering and form filling
 * based on UserProfile preferences.
 */

import { UserProfile } from '../types';

/**
 * Calculates the target calendar Date object based on the user's start date preference.
 * Options: 'tomorrow', '1 week', '2 weeks', '3 weeks', '1 month'
 */
export function calculateTargetStartDate(preference?: string, baseDate: Date = new Date()): Date {
  const target = new Date(baseDate.getTime());
  switch (preference?.toLowerCase()) {
    case 'tomorrow':
      target.setDate(target.getDate() + 1);
      break;
    case '1 week':
    case '1week':
      target.setDate(target.getDate() + 7);
      break;
    case '2 weeks':
    case '2weeks':
      target.setDate(target.getDate() + 14);
      break;
    case '3 weeks':
    case '3weeks':
      target.setDate(target.getDate() + 21);
      break;
    case '1 month':
    case '1month':
      target.setDate(target.getDate() + 30);
      break;
    default:
      // Default to 2 weeks if unspecified
      target.setDate(target.getDate() + 14);
      break;
  }
  return target;
}

/**
 * Formats a Date object into common input formats:
 * - 'ISO': 'YYYY-MM-DD'
 * - 'US': 'MM/DD/YYYY'
 */
export function formatStartDate(date: Date, format: 'ISO' | 'US' = 'ISO'): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  if (format === 'US') {
    return `${month}/${day}/${year}`;
  }
  return `${year}-${month}-${day}`;
}

/**
 * Given a list of travel percentage options (e.g. ['0-25%', '25-50%', '50-75%', '100%']),
 * selects the lowest option if travel is required/asked.
 */
export function selectLowestTravelOption(options: string[]): string | undefined {
  if (!options || options.length === 0) return undefined;
  
  const sorted = [...options].sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, '') || '0', 10);
    const numB = parseInt(b.replace(/\D/g, '') || '0', 10);
    return numA - numB;
  });

  return sorted[0];
}

/**
 * Checks if a question is relocation-based and returns the user's preference choice.
 * Rule: If user chose 'Yes' for relocation, answer 'Yes' for any relocation question.
 */
export function shouldAcceptRelocation(questionText: string, userRelocatePref?: string): boolean {
  if (!userRelocatePref) return false;
  const isRelocationQuestion = /relocat|willing to move|re-locat/i.test(questionText);
  if (isRelocationQuestion && userRelocatePref.toLowerCase() === 'yes') {
    return true;
  }
  return userRelocatePref.toLowerCase() === 'yes';
}
