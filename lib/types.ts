export type GroupCategory = 'home' | 'trip' | 'couple' | 'event' | 'work' | 'other';

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  category: GroupCategory;
  owner_id: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  invited_by?: string;
  role: 'owner' | 'member';
  joined_at: string;
}

export interface GroupInvite {
  id: string;
  group_id: string;
  email: string;
  invited_by: string;
  status: 'pending' | 'accepted';
  created_at: string;
}

export interface ExpenseItem {
  id: string;
  expense_id: string;
  description: string;
  amount: number;
  created_at: string;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  user_id: string;
  amount_owed: number;
  created_at: string;
}

export interface Expense {
  id: string;
  group_id: string;
  paid_by: string;
  total_amount: number;
  description: string;
  category: string;
  expense_date: string;
  source: 'manual' | 'gmail';
  source_draft_id?: string;
  created_by: string;
  created_at: string;
  items?: ExpenseItem[];
  splits?: ExpenseSplit[];
}

export interface ExpenseDraft {
  id: string;
  user_id: string;
  gmail_message_id: string;
  raw_snippet: string;
  detected_amount: number;
  detected_merchant: string;
  detected_date: string;
  confidence: number;
  status: 'pending' | 'confirmed' | 'discarded';
  confirmed_expense_id?: string;
  created_at: string;
  extracted_items?: Array<{ description: string; amount: number }>;
}

export interface Payment {
  id: string;
  group_id: string;
  paid_by: string;
  paid_to: string;
  amount: number;
  payment_date: string;
  note?: string;
  created_at: string;
}

export interface PairwiseBalance {
  creditor: Profile;
  debtor: Profile;
  amount: number;
  group_id?: string;
  group_name?: string;
}

export interface UserSummaryBalance {
  user: Profile;
  totalPaid: number;
  totalOwedShare: number;
  netBalance: number; // positive = others owe me, negative = I owe others
}
