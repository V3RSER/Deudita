import { Expense, Payment } from './types';

const ZERO_DECIMAL_CURRENCIES = new Set(['CLP', 'COP', 'JPY', 'KRW', 'VND']);

function parseLocalDateOnly(dateStr: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}


export type DateFilterMode = 'expense_date' | 'entry_date';

/**
 * Returns today's date formatted as YYYY-MM-DD in local time
 */
export function getTodayDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Returns current local time formatted as HH:mm
 */
export function getCurrentTimeString(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * Assigns automatic time based on whether date is today:
 * - If date is today -> current local time (HH:mm)
 * - If date is not today -> '00:00'
 */
export function getDefaultTimeForDate(dateStr: string): string {
    if (!dateStr || dateStr === getTodayDateString()) {
        return getCurrentTimeString();
    }
    return '00:00';
}

/**
 * Combines a YYYY-MM-DD date and a HH:mm time into an ISO 8601 string with local timezone
 */
export function combineDateAndTimeToISO(dateStr: string, timeStr?: string): string {
    if (!dateStr) {
        dateStr = getTodayDateString();
    }
    const time = timeStr && timeStr.trim() !== '' ? timeStr.trim() : '00:00';
    if (!/^\d{2}:\d{2}$/.test(time)) return '';
    const cleanDate = dateStr.split('T')[0];
    const [yearStr, monthStr, dayStr] = cleanDate.split('-');
    const [hourStr, minuteStr] = time.split(':');

    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;
    const day = parseInt(dayStr, 10);
    const hour = parseInt(hourStr || '0', 10);
    const minute = parseInt(minuteStr || '0', 10);

    const validDateParts = Number.isInteger(year) && Number.isInteger(monthIndex) && Number.isInteger(day) && Number.isInteger(hour) && Number.isInteger(minute)
        && monthIndex >= 0 && monthIndex <= 11 && day >= 1 && day <= 31 && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
    if (!validDateParts) return '';

    const dateObj = new Date(year, monthIndex, day, hour, minute, 0, 0);
    if (dateObj.getFullYear() !== year || dateObj.getMonth() !== monthIndex || dateObj.getDate() !== day) return '';
    return dateObj.toISOString();
}

/**
 * Extracts HH:mm local time from an ISO timestamp or timestamptz
 */
export function extractTimeFromISO(isoStr?: string | null): string {
    if (!isoStr) return '';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return '';
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    } catch {
        return '';
    }
}

/**
 * Computes the Entry/Registration date according to requirements:
 * - Uses created_at
 * - If updated_at is present and differs from created_at, uses updated_at
 */
export function getRecordEntryDateInfo(record: {
    created_at: string;
    updated_at?: string | null;
}): { timestamp: string; dateObj: Date; isUpdated: boolean } {
    const createdDate = new Date(record.created_at);
    const hasValidCreatedDate = !isNaN(createdDate.getTime());
    if (record.updated_at) {
        const updatedDate = new Date(record.updated_at);
        // Prefer a valid update timestamp when creation metadata is invalid, or when
        // the update is meaningfully newer than the creation timestamp.
        if (!isNaN(updatedDate.getTime()) && (!hasValidCreatedDate || updatedDate.getTime() - createdDate.getTime() > 2000)) {
            return {
                timestamp: record.updated_at,
                dateObj: updatedDate,
                isUpdated: hasValidCreatedDate,
            };
        }
    }
    return {
        timestamp: hasValidCreatedDate ? record.created_at : '',
        dateObj: createdDate,
        isUpdated: false,
    };
}

/**
 * Computes the Expense/Payment date & time:
 * - Uses expense_time / payment_time if available
 * - Otherwise parses expense_date / payment_date (at midnight local time)
 */
export function getRecordEventDateInfo(record: {
    expense_date?: string;
    expense_time?: string | null;
    payment_date?: string;
    payment_time?: string | null;
    created_at: string;
}): { timestamp: string; dateObj: Date; hasExplicitTime: boolean } {
    // Expense check
    if ('expense_date' in record && record.expense_date) {
        if (record.expense_time) {
            const d = new Date(record.expense_time);
            if (!isNaN(d.getTime())) {
                const timeStr = extractTimeFromISO(record.expense_time);
                return { timestamp: record.expense_time, dateObj: d, hasExplicitTime: timeStr !== '00:00' };
            }
        }
        const d = parseLocalDateOnly(record.expense_date);
        if (d) {
            return { timestamp: d.toISOString(), dateObj: d, hasExplicitTime: false };
        }
    }

    // Payment check
    if ('payment_date' in record && record.payment_date) {
        if (record.payment_time) {
            const d = new Date(record.payment_time);
            if (!isNaN(d.getTime())) {
                const timeStr = extractTimeFromISO(record.payment_time);
                return { timestamp: record.payment_time, dateObj: d, hasExplicitTime: timeStr !== '00:00' };
            }
        }
        const d = parseLocalDateOnly(record.payment_date);
        if (d) {
            return { timestamp: d.toISOString(), dateObj: d, hasExplicitTime: false };
        }
    }

    // Fallback to created_at
    const d = new Date(record.created_at);
    if (!isNaN(d.getTime())) {
        return { timestamp: record.created_at, dateObj: d, hasExplicitTime: false };
    }
    return { timestamp: '', dateObj: new Date(NaN), hasExplicitTime: false };
}

/**
 * Returns the effective timestamp and sorting Date object for any transaction under the given filter mode
 */
export function getEffectiveTransactionDate(
    tx: Expense | Payment,
    mode: DateFilterMode = 'expense_date'
): { dateObj: Date; timestamp: string; isUpdated: boolean; hasExplicitTime: boolean; mode: DateFilterMode } {
    if (mode === 'entry_date') {
        const info = getRecordEntryDateInfo(tx);
        return {
            dateObj: info.dateObj,
            timestamp: info.timestamp,
            isUpdated: info.isUpdated,
            hasExplicitTime: true,
            mode: 'entry_date',
        };
    }

    const info = getRecordEventDateInfo(tx);
    return {
        dateObj: info.dateObj,
        timestamp: info.timestamp,
        isUpdated: false,
        hasExplicitTime: info.hasExplicitTime,
        mode: 'expense_date',
    };
}

/**
 * Formats a date object or ISO string into a human-friendly Spanish format
 * e.g., "15 may 2026, 14:30" or "15 may 2026"
 */
export function formatHumanDate(
    dateInput: Date | string,
    options?: { includeTime?: boolean; uppercaseMonth?: boolean }
): string {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '';

    const day = d.getDate();
    const monthNames = [
        'ene', 'feb', 'mar', 'abr', 'may', 'jun',
        'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
    ];
    let month = monthNames[d.getMonth()] || '';
    if (options?.uppercaseMonth) {
        month = month.charAt(0).toUpperCase() + month.slice(1);
    }
    const year = d.getFullYear();

    let formatted = `${day} ${month} ${year}`;
    if (options?.includeTime) {
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        formatted += `, ${hours}:${minutes}`;
    }
    return formatted;
}

/**
 * Formats month name for grouping headers (e.g., "Marzo 2026")
 */
export function formatMonthYearHeader(dateInput: Date | string): string {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '';

    const fullMonths = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return `${fullMonths[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Returns unique month keys (YYYY-MM) and labels from a list of transactions according to filter mode
 */
export function getAvailableTransactionMonths(
    transactions: Array<Expense | Payment>,
    mode: DateFilterMode = 'expense_date'
): Array<{ value: string; label: string }> {
    const map = new Map<string, string>();

    transactions.forEach((tx) => {
        const { dateObj } = getEffectiveTransactionDate(tx, mode);
        if (!isNaN(dateObj.getTime())) {
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const key = `${year}-${month}`;
            if (!map.has(key)) {
                map.set(key, formatMonthYearHeader(dateObj));
            }
        }
    });

    return Array.from(map.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([value, label]) => ({ value, label }));
}

export type DatePreset = 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'custom';

/**
 * Checks if a Date object matches a selected date preset or custom range
 */
export function isDateMatchingFilter(
    dateObj: Date,
    preset: DatePreset | string,
    customRange?: { start?: string; end?: string }
): boolean {
    if (!preset || preset === 'all') return true;
    if (isNaN(dateObj.getTime())) return false;

    const now = new Date();
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    const todayStr = getTodayDateString();

    if (preset === 'today') {
        return dateStr === todayStr;
    }

    if (preset === 'yesterday') {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yYear = yesterday.getFullYear();
        const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
        const yDay = String(yesterday.getDate()).padStart(2, '0');
        return dateStr === `${yYear}-${yMonth}-${yDay}`;
    }

    if (preset === 'this_week') {
        const startOfWeek = new Date(now);
        startOfWeek.setHours(0, 0, 0, 0);
        const dayOfWeek = startOfWeek.getDay(); // Sunday = 0, Monday = 1
        const daysSinceMonday = (dayOfWeek + 6) % 7;
        startOfWeek.setDate(startOfWeek.getDate() - daysSinceMonday);

        const endOfToday = new Date(now);
        endOfToday.setHours(23, 59, 59, 999);
        return dateObj.getTime() >= startOfWeek.getTime() && dateObj.getTime() <= endOfToday.getTime();
    }

    if (preset === 'this_month') {
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        return `${year}-${month}` === currentMonthKey;
    }

    if (preset === 'last_month') {
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
        return `${year}-${month}` === lastMonthKey;
    }

    if (preset === 'custom' && customRange) {
        if (customRange.start && dateStr < customRange.start) return false;
        if (customRange.end && dateStr > customRange.end) return false;
        return true;
    }

    // If preset is a specific YYYY-MM string
    if (typeof preset === 'string' && /^\d{4}-\d{2}$/.test(preset)) {
        return `${year}-${month}` === preset;
    }

    return true;
}

/**
 * Robust parser for currency amount inputs across multiple locales
 * (supports COP, USD, EUR, integer currencies, dot/comma separators).
 */
export function parseCurrencyAmount(val: unknown, currency?: string): number {
    if (typeof val === 'number') {
        return Number.isFinite(val) ? val : 0;
    }
    if (val === null || val === undefined) return 0;

    const str = String(val).trim();
    if (!str) return 0;

    const negative = /^-/.test(str);
    const clean = str.replace(/[^0-9.,]/g, '');
    if (!clean) return 0;

    const hasComma = clean.includes(',');
    const hasDot = clean.includes('.');
    let parsed = 0;

    if (hasComma && hasDot) {
        const lastCommaIndex = clean.lastIndexOf(',');
        const lastDotIndex = clean.lastIndexOf('.');
        if (lastCommaIndex > lastDotIndex) {
            // 1.250,50 -> 1250.50
            parsed = Number.parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
        } else {
            // 1,250.50 -> 1250.50
            parsed = Number.parseFloat(clean.replace(/,/g, '')) || 0;
        }
    } else if (hasDot && !hasComma) {
        const parts = clean.split('.');
        if (parts.length > 2) {
            parsed = Number.parseFloat(clean.replace(/\./g, '')) || 0;
        } else {
            const decimalPart = parts[1] || '';
            const normalizedCurrency = currency?.trim().toUpperCase();
            const isZeroDecimalCurrency = normalizedCurrency ? ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency) : false;
            if (decimalPart.length === 3 || (isZeroDecimalCurrency && decimalPart.length > 2)) {
                parsed = Number.parseFloat(clean.replace(/\./g, '')) || 0;
            } else {
                parsed = Number.parseFloat(clean) || 0;
            }
        }
    } else if (hasComma && !hasDot) {
        const parts = clean.split(',');
        if (parts.length > 2) {
            parsed = Number.parseFloat(clean.replace(/,/g, '')) || 0;
        } else {
            const decimalPart = parts[1] || '';
            const normalizedCurrency = currency?.trim().toUpperCase();
            const isZeroDecimalCurrency = normalizedCurrency ? ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency) : false;
            if (decimalPart.length === 3 || (isZeroDecimalCurrency && decimalPart.length > 2)) {
                parsed = Number.parseFloat(clean.replace(/,/g, '')) || 0;
            } else {
                parsed = Number.parseFloat(clean.replace(',', '.')) || 0;
            }
        }
    } else {
        parsed = Number.parseFloat(clean) || 0;
    }

    return negative ? -parsed : parsed;
}
