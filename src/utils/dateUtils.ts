import { I18n } from '../i18n';
import { TIME_CONSTANTS } from './constants';

/**
 * Date and time utility functions
 */

/** Placeholder shown when a stored date/timestamp is missing or unparseable */
const INVALID_TIME_PLACEHOLDER = '—';

/**
 * Calculate the number of days between a date and today
 * @param dateString ISO date string or any valid date string
 * @returns Number of days since the given date
 */
export function getDaysSince(dateString: string): number {
    const date = new Date(dateString);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - date.getTime());
    return Math.floor(diffTime / TIME_CONSTANTS.MILLISECONDS_PER_DAY);
}

/**
 * Format a date as a relative time string (e.g., "today", "2 days ago")
 * @param dateString ISO date string or any valid date string
 * @returns Localized relative time string
 */
export function formatRelativeTime(dateString: string): string {
    const days = getDaysSince(dateString);
    // Avoid rendering "NaN days ago" for missing/malformed dates
    if (!Number.isFinite(days)) return INVALID_TIME_PLACEHOLDER;
    if (days === 0) return I18n.getMessage('time.today');
    if (days === 1) return I18n.getMessage('time.yesterday');
    return I18n.getMessage('time.daysAgo', days.toString());
}

/**
 * Get relative time from timestamp (for clipboard history)
 * @param timestamp Unix timestamp in milliseconds
 * @returns Localized relative time string
 */
export function getRelativeTime(timestamp: number): string {
    // Avoid rendering "NaN days ago" for missing/malformed timestamps
    if (!Number.isFinite(timestamp)) return INVALID_TIME_PLACEHOLDER;
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / TIME_CONSTANTS.MILLISECONDS_PER_DAY);

    if (seconds < 30) return I18n.getMessage('time.justNow');
    if (seconds < 60) return I18n.getMessage('time.secondsAgo', seconds.toString());
    if (minutes < 60) return I18n.getMessage('time.minutesAgo', minutes.toString());
    if (hours < 24) return I18n.getMessage('time.hoursAgo', hours.toString());
    return I18n.getMessage('time.daysAgo', days.toString());
}

/**
 * Get today's date in ISO format (YYYY-MM-DD)
 * @returns Today's date string
 */
export function getTodayISOString(): string {
    return new Date().toISOString().split('T')[0];
}
