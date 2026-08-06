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
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [drafts, setDrafts] = useState<ExpenseDraft[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const supabase = createClient();

  const reloadFromSupabase = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setCurrentProfile(null);
      return;
    }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (profile) setCurrentProfile(profile as Profile);

    const { data: allProfiles } = await supabase.from('profiles').select('*');
    if (allProfiles) setProfiles(allProfiles as Profile[]);

    const { data: allGroups } = await supabase.from('groups').select('*').order('created_at', { ascending: false });
    if (allGroups) setGroups(allGroups as Group[]);

    const { data: allMembers } = await supabase.from('group_members').select('*');
    if (allMembers) setMembers(allMembers as GroupMember[]);

    const { data: allExpenses } = await supabase.from('expenses').select('*').order('created_at', { ascending: false });
    const { data: allItems } = await supabase.from('expense_items').select('*');
    const { data: allSplits } = await supabase.from('expense_splits').select('*');

    if (allExpenses) {
      const expensesWithDetails = allExpenses.map(exp => ({
        ...exp,
        items: allItems?.filter(i => i.expense_id === exp.id) || [],
        splits: allSplits?.filter(s => s.expense_id === exp.id) || [],
      }));
      setExpenses(expensesWithDetails as Expense[]);
    }

    const { data: allPayments } = await supabase.from('payments').select('*').order('created_at', { ascending: false });
    if (allPayments) setPayments(allPayments as Payment[]);

    const { data: allDrafts } = await supabase.from('expense_drafts').select('*').order('created_at', { ascending: false });
    if (allDrafts) setDrafts(allDrafts as ExpenseDraft[]);
  }, [supabase]);

  useEffect(() => {
    reloadFromSupabase();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      reloadFromSupabase();
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
    await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, description, emails }),
    });
    await reloadFromSupabase();
  };

  const addGroupInvite = async (groupId: string, email: string) => {
    await fetch('/api/groups/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, email }),
    });
    await reloadFromSupabase();
  };

  const addExpense = async (expense: Omit<Expense, 'id' | 'created_at'>, items?: any[], splits?: any[]) => {
    await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expense, items, splits }),
    });
    await reloadFromSupabase();
  };

  const deleteExpense = async (id: string) => {
    await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    await reloadFromSupabase();
  };

  const addPayment = async (payment: Omit<Payment, 'id' | 'created_at'>) => {
    await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payment),
    });
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
