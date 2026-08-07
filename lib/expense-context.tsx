'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  Profile,
  Group,
  GroupMember,
  Expense,
  ExpenseDraft,
  Payment,
  ExpenseItem,
  ExpenseSplit,
} from './types';
import { createClient } from '@/lib/supabase/client';

type GroupCategory = 'home' | 'trip' | 'couple' | 'event' | 'work' | 'other';

interface ExpenseContextType {
  currentProfile: Profile | null;
  loading: boolean;
  profiles: Profile[];
  userGroups: Group[];
  groups: Group[];
  members: GroupMember[];
  expenses: Expense[];
  drafts: ExpenseDraft[];
  payments: Payment[];
  createGroup: (name: string, category: GroupCategory, description?: string, memberIds?: string[]) => Promise<void>;
  addGroupInvite: (groupId: string, email: string) => Promise<void>;
  addExpense: (expense: Omit<Expense, 'id' | 'created_at'>, items?: any[], splits?: any[]) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  addPayment: (payment: Omit<Payment, 'id' | 'created_at'>) => Promise<void>;
  confirmDraft: (draftId: string, groupId: string, paidBy: string, splits: ExpenseSplit[]) => Promise<void>;
  discardDraft: (draftId: string) => Promise<void>;
  addDraft: (draft: Omit<ExpenseDraft, 'id' | 'created_at' | 'user_id' | 'status'>) => Promise<void>;
  reloadFromSupabase: () => Promise<void>;
  logout: () => Promise<void>;
}

const ExpenseContext = createContext<ExpenseContextType | undefined>(undefined);

export function ExpenseProvider({ children }: { children: React.ReactNode }) {
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [drafts, setDrafts] = useState<ExpenseDraft[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const supabase = createClient();

  const reloadFromSupabase = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCurrentProfile(null);
        setLoading(false);
        return;
      }

      const [
        profileRes,
        profilesRes,
        groupsRes,
        membersRes,
        expensesRes,
        paymentsRes,
        draftsRes
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('profiles').select('*'),
        supabase.from('groups').select('*').order('created_at', { ascending: false }),
        supabase.from('group_members').select('*'),
        supabase.from('expenses').select('*, items:expense_items(*), splits:expense_splits(*)').order('created_at', { ascending: false }),
        supabase.from('payments').select('*').order('created_at', { ascending: false }),
        supabase.from('expense_drafts').select('*').order('created_at', { ascending: false })
      ]);

      if (profileRes.data) {
        setCurrentProfile(profileRes.data as Profile);
      } else {
        const meta = user.user_metadata ?? {};
        const fullName = meta.full_name ?? meta.name ?? (user.email ? user.email.split('@')[0] : 'Usuario');
        const avatarUrl = meta.avatar_url ?? meta.picture ?? '';
        const newProfile: Profile = {
          id: user.id,
          email: user.email ?? '',
          full_name: fullName,
          avatar_url: avatarUrl,
          created_at: new Date().toISOString(),
        };

        const { error: insertErr } = await supabase.from('profiles').insert(newProfile);
        if (insertErr) {
          console.error('Error inserting new profile:', insertErr);
        }
        setCurrentProfile(newProfile);
      }

      if (profilesRes.data) setProfiles(profilesRes.data as Profile[]);
      if (groupsRes.data) setGroups(groupsRes.data as Group[]);
      if (membersRes.data) setMembers(membersRes.data as GroupMember[]);

      if (expensesRes.data) {
        setExpenses(expensesRes.data as unknown as Expense[]);
      }

      if (paymentsRes.data) setPayments(paymentsRes.data as Payment[]);
      if (draftsRes.data) setDrafts(draftsRes.data as ExpenseDraft[]);
    } catch (err) {
      console.error('Error al sincronizar datos:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadFromSupabase();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event !== 'INITIAL_SESSION') {
        void reloadFromSupabase();
      }
    });
    
    return () => {
      subscription.unsubscribe();
    };
  }, [reloadFromSupabase, supabase]);

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentProfile(null);
  };

  const createGroup = async (name: string, category: GroupCategory, description?: string, emails?: string[]) => {
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, description, emails }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const message = errData.error ? String(errData.error) : 'No se pudo crear el grupo';
      console.error('[ExpenseContext] Error in createGroup:', message);
      throw new Error(message);
    }

    await reloadFromSupabase();
  };

  const addGroupInvite = async (groupId: string, email: string) => {
    const res = await fetch('/api/groups/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, email }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const message = errData.error ? String(errData.error) : 'No se pudo enviar la invitación';
      console.error('[ExpenseContext] Error in addGroupInvite:', message);
      throw new Error(message);
    }

    await reloadFromSupabase();
  };

  const addExpense = async (expense: Omit<Expense, 'id' | 'created_at'>, items?: any[], splits?: any[]) => {
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expense, items, splits }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const message = errData.error ? String(errData.error) : 'No se pudo registrar el gasto';
      console.error('[ExpenseContext] Error in addExpense:', message);
      throw new Error(message);
    }

    await reloadFromSupabase();
  };

  const deleteExpense = async (id: string) => {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const message = errData.error ? String(errData.error) : 'No se pudo eliminar el gasto';
      console.error('[ExpenseContext] Error in deleteExpense:', message);
      throw new Error(message);
    }

    await reloadFromSupabase();
  };

  const addPayment = async (payment: Omit<Payment, 'id' | 'created_at'>) => {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payment),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const message = errData.error ? String(errData.error) : 'No se pudo registrar el pago';
      console.error('[ExpenseContext] Error in addPayment:', message);
      throw new Error(message);
    }

    await reloadFromSupabase();
  };

  const confirmDraft = async (draftId: string, groupId: string, paidBy: string, splits: ExpenseSplit[]) => {
    await fetch('/api/drafts/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draftId, groupId, paidBy, splits }),
    });
    await reloadFromSupabase();
  };

  const discardDraft = async (draftId: string) => {
    await fetch(`/api/drafts/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'discarded' }),
    });
    await reloadFromSupabase();
  };

  const addDraft = async (draft: Omit<ExpenseDraft, 'id' | 'created_at' | 'user_id' | 'status'>) => {
    // In real app, this is created from Gmail webhook.
    // For demo purposes, we can add it here if needed.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    await supabase.from('expense_drafts').insert({
      ...draft,
      user_id: user.id,
      status: 'pending'
    });
    await reloadFromSupabase();
  };

  const userGroups = groups.filter((g) => members.some((m) => m.group_id === g.id && m.user_id === currentProfile?.id));

  return (
    <ExpenseContext.Provider
      value={{
        currentProfile,
        loading,
        profiles,
        userGroups,
        groups,
        members,
        expenses,
        drafts,
        payments,
        createGroup,
        addGroupInvite,
        addExpense,
        deleteExpense,
        addPayment,
        confirmDraft,
        discardDraft,
        addDraft,
        reloadFromSupabase,
        logout,
      }}
    >
      {children}
    </ExpenseContext.Provider>
  );
}

export function useExpense() {
  const context = useContext(ExpenseContext);
  if (context === undefined) {
    throw new Error('useExpense debe usarse dentro de un ExpenseProvider');
  }
  return context;
}
