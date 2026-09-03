import { Expense, Payment } from './types';

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
  const cleanDate = dateStr.split('T')[0];
  const [yearStr, monthStr, dayStr] = cleanDate.split('-');
  const [hourStr, minuteStr] = time.split(':');

  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  const hour = parseInt(hourStr || '0', 10);
  const minute = parseInt(minuteStr || '0', 10);

  const dateObj = new Date(year, monthIndex, day, hour, minute, 0, 0);
  return isNaN(dateObj.getTime()) ? new Date().toISOString() : dateObj.toISOString();
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
  if (record.updated_at) {
    const updatedDate = new Date(record.updated_at);
    // If updatedDate is valid and differs by more than 2 seconds
    if (!isNaN(updatedDate.getTime()) && Math.abs(updatedDate.getTime() - createdDate.getTime()) > 2000) {
      return {
        timestamp: record.updated_at,
        dateObj: updatedDate,
        isUpdated: true,
      };
    }
  }
  return {
    timestamp: record.created_at,
    dateObj: isNaN(createdDate.getTime()) ? new Date() : createdDate,
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
    const [year, month, day] = record.expense_date.split('-').map(Number);
    const d = new Date(year, (month || 1) - 1, day || 1, 0, 0, 0);
    return { timestamp: d.toISOString(), dateObj: d, hasExplicitTime: false };
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
    const [year, month, day] = record.payment_date.split('-').map(Number);
    const d = new Date(year, (month || 1) - 1, day || 1, 0, 0, 0);
    return { timestamp: d.toISOString(), dateObj: d, hasExplicitTime: false };
  }

  // Fallback to created_at
  const d = new Date(record.created_at);
  return { timestamp: record.created_at, dateObj: isNaN(d.getTime()) ? new Date() : d, hasExplicitTime: true };
}

/**
 * Returns the effective timestamp and sorting Date object for any transaction under the given filter mode
 */
export function getEffectiveTransactionDate(
  tx: Expense | Payment | any,
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
  if (isNaN(dateObj.getTime())) return true;
  if (!preset || preset === 'all') return true;

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
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    return dateObj.getTime() >= sevenDaysAgo.getTime() && dateObj.getTime() <= now.getTime() + 86400000;
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
    return isNaN(val) ? 0 : val;
  }
  if (!val) return 0;
  const str = String(val).trim();
  if (!str) return 0;

  // Remove currency signs, spaces and non-numeric/non-separator chars
  const clean = str.replace(/[^0-9.,]/g, '');
  if (!clean) return 0;

  const hasComma = clean.includes(',');
  const hasDot = clean.includes('.');

  if (hasComma && hasDot) {
    const lastCommaIndex = clean.lastIndexOf(',');
    const lastDotIndex = clean.lastIndexOf('.');
    if (lastCommaIndex > lastDotIndex) {
      // e.g. 1.250,50 -> dot is thousand separator, comma is decimal
      const numStr = clean.replace(/\./g, '').replace(',', '.');
      return parseFloat(numStr) || 0;
    } else {
      // e.g. 1,250.50 -> comma is thousand separator, dot is decimal
      const numStr = clean.replace(/,/g, '');
      return parseFloat(numStr) || 0;
    }
  }

  if (hasDot && !hasComma) {
    const parts = clean.split('.');
    if (parts.length > 2) {
      // Multiple dots e.g. 1.500.000 -> thousands separator
      return parseFloat(clean.replace(/\./g, '')) || 0;
    }
    // Single dot: e.g. 50.000 vs 50.00
    const decimalPart = parts[1] || '';
    const isZeroDecimalCurrency = currency === 'COP' || currency === 'CLP' || currency === 'KRW' || currency === 'JPY' || !currency;
    if (decimalPart.length === 3 || (isZeroDecimalCurrency && decimalPart.length > 2)) {
      // e.g. 50.000 in COP/CLP -> 50000
      return parseFloat(clean.replace(/\./g, '')) || 0;
    }
    return parseFloat(clean) || 0;
  }

  if (hasComma && !hasDot) {
    const parts = clean.split(',');
    if (parts.length > 2) {
      // Multiple commas e.g. 1,500,000 -> thousands separator
      return parseFloat(clean.replace(/,/g, '')) || 0;
    }
    const decimalPart = parts[1] || '';
    const isZeroDecimalCurrency = currency === 'COP' || currency === 'CLP' || currency === 'KRW' || currency === 'JPY' || !currency;
    if (decimalPart.length === 3 || (isZeroDecimalCurrency && decimalPart.length > 2)) {
      // e.g. 50,000 in COP
      return parseFloat(clean.replace(/,/g, '')) || 0;
    }
    // Single comma with 1 or 2 digits e.g. 50,50 -> 50.50
    return parseFloat(clean.replace(',', '.')) || 0;
  }

  return parseFloat(clean) || 0;
}

