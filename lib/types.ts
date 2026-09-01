export type GroupCategory = 'home' | 'trip' | 'couple' | 'event' | 'work' | 'friends' | 'accounting' | 'other';

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
  email: string | null;
  full_name: string;
  avatar_url: string;
  is_temp?: boolean;
  created_by?: string;
  timezone?: string;
  currency?: string;
  currency_symbol?: string;
  payment_instructions?: string;
  onboarding_completed?: boolean;
  managed_user_ids?: string[];
  managed_by?: string;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  category: GroupCategory;
  currency?: string;
  owner_id: string;
  created_at: string;
  image_url?: string;
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
  email: string | null;
  invited_by: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  expires_at?: string | null;
  token?: string;
  invitee_profile_id?: string | null;
  group?: Group;
  inviter?: Profile;
}

export type NotificationType =
  | 'group_invite'
  | 'expense_added'
  | 'expense_updated'
  | 'expense_deleted'
  | 'expense_assigned'
  | 'managed_user_assigned'
  | 'member_joined'
  | 'general';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType | string;
  title: string;
  message: string;
  link?: string | null;
  data?: {
    invite_id?: string;
    group_id?: string;
    group_name?: string;
    expense_id?: string;
    expense_desc?: string;
    amount?: number;
    currency?: string;
    actor_id?: string;
    actor_name?: string;
    managed_user_id?: string;
    managed_user_name?: string;
    invited_by_name?: string;
    invited_by_email?: string;
    [key: string]: any;
  };
  is_read: boolean;
  created_at: string;
}

export interface ManagedUser {
  id: string;
  sponsor_id: string;
  managed_user_id: string;
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
  expense_time?: string;
  source: 'manual' | 'gmail';
  source_draft_id?: string;
  receipt_url?: string;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at?: string;
  updated_by?: string;
  items?: ExpenseItem[];
  splits?: ExpenseSplit[];
  audit_logs?: ExpenseAuditLog[];
}

export interface ExpenseAuditLog {
  id: string;
  expense_id: string;
  group_id: string;
  user_id: string;
  action: 'create' | 'update' | 'delete';
  changes?: Record<string, any>;
  created_at: string;
  user?: Profile;
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
  template_id?: string | null;
  currency?: string;
  entity?: string | null;
  source_account?: string | null;
  detected_time?: string | null;
  created_at: string;
  extracted_items?: Array<{ description: string; amount: number }>;
}

export interface EmailTemplate {
  id: string;
  name: string;
  sender_pattern?: string | null;
  subject_pattern?: string | null;
  amount_regex: string;
  merchant_regex?: string | null;
  date_regex?: string | null;
  date_format?: string | null;
  entity_name?: string | null;
  default_currency?: string;
  currency_regex?: string | null;
  source_account_regex?: string | null;
  time_regex?: string | null;
  created_by?: string | null;
  active: boolean;
  created_at: string;
}

export interface UserTemplatePreference {
  user_id: string;
  template_id: string;
  enabled: boolean;
}

export interface EmailTemplateWithPreference extends EmailTemplate {
  enabled: boolean;
}

export interface EmailIngestConnection {
  user_id: string;
  webhook_token: string;
  last_sync_at?: string | null;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface Payment {
  id: string;
  group_id: string;
  paid_by: string;
  paid_to: string;
  amount: number;
  payment_date: string;
  payment_time?: string;
  note?: string;
  proof_url?: string;
  created_at: string;
  updated_at?: string;
  updated_by?: string;
}

export interface ManagedContribution {
  profile: Profile;
  amount: number;
  isSelf?: boolean;
}

export interface PairwiseBalance {
  creditor: Profile;
  debtor: Profile;
  amount: number;
  group_id?: string;
  group_name?: string;
  includedDebtors?: Profile[];
  includedCreditors?: Profile[];
  debtorBreakdown?: ManagedContribution[];
  creditorBreakdown?: ManagedContribution[];
  debtorSponsor?: Profile;
  creditorSponsor?: Profile;
}

export interface UserSummaryBalance {
  user: Profile;
  totalPaid: number;
  totalOwedShare: number;
  netBalance: number; // positive = others owe me, negative = I owe others
  managedUsers?: Profile[];
  managedBy?: Profile;
}
