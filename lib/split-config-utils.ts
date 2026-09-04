import { Expense, ExpenseSplitConfig, SplitType } from './types';

const SPLIT_CONFIG_REGEX = /<!--\s*SPLIT_CONFIG:([\s\S]*?)-->/;

/**
 * Extracts the user-written note and the machine-readable split configuration
 * from a raw `notes` string.
 */
export function extractNotesAndConfig(rawNotes?: string | null): {
  userNote: string;
  splitConfig: ExpenseSplitConfig | null;
} {
  if (!rawNotes || typeof rawNotes !== 'string') {
    return { userNote: '', splitConfig: null };
  }

  const trimmed = rawNotes.trim();

  // If rawNotes is a raw JSON string of splitConfig
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && (parsed.splitType || parsed.version || parsed.selectedMembers)) {
        return { userNote: '', splitConfig: parsed as ExpenseSplitConfig };
      }
    } catch {
      // not JSON
    }
  }

  const match = rawNotes.match(SPLIT_CONFIG_REGEX);
  let splitConfig: ExpenseSplitConfig | null = null;
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed === 'object' && parsed.splitType) {
        splitConfig = parsed as ExpenseSplitConfig;
      }
    } catch (err) {
      console.warn('[split-config-utils] Error parsing embedded split config:', err);
    }
  }

  // Remove the comment and trim whitespace
  let userNote = rawNotes.replace(SPLIT_CONFIG_REGEX, '').trim();

  // Safeguard: if userNote is still a JSON string, clear it so user never sees JSON in notes
  if (userNote.startsWith('{') && userNote.endsWith('}')) {
    userNote = '';
  }

  return { userNote, splitConfig };
}

/**
 * Combines a user-visible note with a serialized split configuration tag
 * without polluting notes with raw JSON if there's no note.
 */
export function serializeNotesWithConfig(
  userNote: string | undefined | null,
  _splitConfig?: ExpenseSplitConfig | null
): string | undefined {
  const cleanNote = (userNote || '')
    .replace(SPLIT_CONFIG_REGEX, '')
    .trim();

  if (cleanNote.startsWith('{') && cleanNote.endsWith('}')) {
    return undefined;
  }

  return cleanNote || undefined;
}

/**
 * Safely saves split configuration to browser localStorage for instant local retrieval.
 */
export function saveLocalSplitConfig(expenseId: string, config: ExpenseSplitConfig): void {
  if (!expenseId || typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(`deudita_split_config_${expenseId}`, JSON.stringify(config));
  } catch (err) {
    console.warn('[split-config-utils] Could not save local split config:', err);
  }
}

/**
 * Safely retrieves split configuration from browser localStorage.
 */
export function getLocalSplitConfig(expenseId: string): ExpenseSplitConfig | null {
  if (!expenseId || typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(`deudita_split_config_${expenseId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.splitType) {
      return parsed as ExpenseSplitConfig;
    }
  } catch (err) {
    console.warn('[split-config-utils] Could not read local split config:', err);
  }
  return null;
}

/**
 * Smart heuristic to infer split configuration from existing splits and items
 * for historical expenses created before explicit split configuration persistence.
 */
export function inferSplitConfig(expense: Partial<Expense>): ExpenseSplitConfig {
  const isItemized = Boolean(expense.items && expense.items.length > 0);
  const splits = expense.splits || [];
  const selectedMembers = splits.map((s) => s.user_id);

  if (isItemized) {
    return {
      version: 1,
      splitType: 'itemized',
      mode: 'itemized',
      selectedMembers,
      splits: {},
    };
  }

  if (splits.length === 0) {
    return {
      version: 1,
      splitType: 'equal',
      mode: 'quick',
      selectedMembers: [],
      splits: {},
    };
  }

  const amounts = splits.map((s) => {
    const val = typeof s.amount_owed === 'number'
      ? s.amount_owed
      : parseFloat(String(s.amount_owed).replace(/[^0-9.]/g, ''));
    return isNaN(val) ? 0 : val;
  });

  const minAmt = Math.min(...amounts);
  const maxAmt = Math.max(...amounts);

  // 1. Equal split test
  if (amounts.length <= 1 || (maxAmt - minAmt <= 1)) {
    const splitRecord: Record<string, { exact: string; pct: string; shares: string }> = {};
    splits.forEach((s) => {
      splitRecord[s.user_id] = { exact: '', pct: '', shares: '1' };
    });
    return {
      version: 1,
      splitType: 'equal',
      mode: 'quick',
      selectedMembers,
      splits: splitRecord,
    };
  }

  // 2. Shares / Cuotas heuristic test:
  // If amounts are proportional to small positive integers (e.g. 2:1, 3:1, 3:2, 4:1)
  if (minAmt > 0) {
    // Try candidate bases from minAmt down to minAmt / 5
    let bestShares: Record<string, number> | null = null;

    for (let testDivisor = 1; testDivisor <= 4; testDivisor++) {
      const unit = minAmt / testDivisor;
      if (unit <= 0.01) break;

      let allMatch = true;
      const candidateShares: Record<string, number> = {};

      for (let i = 0; i < splits.length; i++) {
        const amt = amounts[i];
        const ratio = amt / unit;
        const rounded = Math.round(ratio);
        // Must be between 1 and 25 shares, and within 3% tolerance or 1 currency unit
        const expectedAmt = rounded * unit;
        const diff = Math.abs(amt - expectedAmt);
        const relDiff = amt > 0 ? diff / amt : 0;

        if (rounded < 1 || rounded > 25 || (diff > 1.5 && relDiff > 0.04)) {
          allMatch = false;
          break;
        }
        candidateShares[splits[i].user_id] = rounded;
      }

      if (allMatch) {
        bestShares = candidateShares;
        break;
      }
    }

    if (bestShares) {
      const splitRecord: Record<string, { exact: string; pct: string; shares: string }> = {};
      splits.forEach((s) => {
        splitRecord[s.user_id] = {
          exact: '',
          pct: '',
          shares: String(bestShares![s.user_id] || 1),
        };
      });
      return {
        version: 1,
        splitType: 'shares',
        mode: 'quick',
        selectedMembers,
        splits: splitRecord,
      };
    }
  }

  // 3. Fallback: exact split
  const splitRecord: Record<string, { exact: string; pct: string; shares: string }> = {};
  splits.forEach((s, idx) => {
    splitRecord[s.user_id] = {
      exact: amounts[idx] > 0 ? String(amounts[idx]) : '',
      pct: '',
      shares: '1',
    };
  });

  return {
    version: 1,
    splitType: 'exact',
    mode: 'quick',
    selectedMembers,
    splits: splitRecord,
  };
}

/**
 * High-level resolver: finds the saved split config for an expense,
 * checking in order:
 * 1. embedded config in expense.split_config
 * 2. embedded config in expense.notes (<!--SPLIT_CONFIG:...-->)
 * 3. local storage cache
 * 4. smart inference fallback
 */
export function getExpenseSplitConfig(expense: Partial<Expense> | null | undefined): {
  userNote: string;
  splitConfig: ExpenseSplitConfig;
} {
  if (!expense) {
    return {
      userNote: '',
      splitConfig: {
        version: 1,
        splitType: 'equal',
        mode: 'quick',
        selectedMembers: [],
        splits: {},
      },
    };
  }

  const { userNote, splitConfig: notesConfig } = extractNotesAndConfig(expense.notes);

  if (notesConfig) {
    return { userNote, splitConfig: notesConfig };
  }

  if (expense.split_config) {
    return { userNote, splitConfig: expense.split_config };
  }

  if (expense.id) {
    const local = getLocalSplitConfig(expense.id);
    if (local) {
      return { userNote, splitConfig: local };
    }
  }

  const inferred = inferSplitConfig(expense);
  return { userNote, splitConfig: inferred };
}
