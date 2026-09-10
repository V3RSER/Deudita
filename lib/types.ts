export type GroupCategory = 'home' | 'trip' | 'couple' | 'event' | 'work' | 'friends' | 'accounting' | 'other';

export function generateUUID(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
    country?: string;
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
        [key: string]: unknown;
    };
    is_read: boolean;
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

export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares' | 'itemized';

export type ExpenseItemInput = Pick<ExpenseItem, 'description' | 'amount'> & Partial<Pick<ExpenseItem, 'id' | 'expense_id' | 'created_at'>>;

export type ExpenseSplitInput = Pick<ExpenseSplit, 'user_id' | 'amount_owed'> & Partial<Pick<ExpenseSplit, 'id' | 'expense_id' | 'created_at'>>;

export interface ExpenseSplitConfig {
    version: 1;
    splitType: SplitType;
    mode?: 'quick' | 'itemized';
    selectedMembers?: string[];
    splits?: Record<string, {
        exact?: string;
        pct?: string;
        shares?: string;
    }>;
    items?: Array<{
        id: number;
        desc: string;
        quantity: string;
        amount: string;
        amountType: 'total' | 'each';
        assignedTo: string[];
        shares?: Record<string, string>;
    }>;
    isItemizedVerticalView?: boolean;
    savedAt?: string;
}

export interface Expense {
    id: string;
    group_id: string | null;
    paid_by: string;
    total_amount: number;
    description: string;
    category?: string;
    expense_date: string;
    expense_time?: string | null;
    source: 'manual' | 'gmail';
    source_account?: string | null;
    entity?: string | null;
    currency?: string | null;
    expense_type?: string | null;
    is_draft?: boolean;
    status?: string;
    gmail_message_id?: string | null;
    template_id?: string | null;
    raw_snippet?: string | null;
    receipt_url?: string;
    notes?: string;
    split_config?: ExpenseSplitConfig;
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
    changes?: Record<string, unknown>;
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
    status: 'pending' | 'confirmed' | 'discarded' | 'dismissed';
    confirmed_expense_id?: string;
    template_id?: string | null;
    currency?: string | null;
    entity?: string | null;
    source_account?: string | null;
    detected_time?: string | null;
    concept?: string | null;
    created_at: string;
    extracted_items?: Array<{ description: string; amount: number }>;
}

export interface Payment {
    id: string;
    group_id: string;
    paid_by: string;
    paid_to: string;
    amount: number;
    currency?: string | null;
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
    /** Currency in which the balance is denominated. Required for cross-group calculations. */
    currency?: string;
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
    /** Currency in which the summary is denominated when calculated across scopes. */
    currency?: string;
    user: Profile;
    totalPaid: number;
    totalOwedShare: number;
    netBalance: number; // positive = others owe me, negative = I owe others
    managedUsers?: Profile[];
    managedBy?: Profile;
}
