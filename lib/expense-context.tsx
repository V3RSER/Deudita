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
  GroupInvite,
  Notification,
  GroupCategory,
} from './types';
import { createClient } from '@/lib/supabase/client';

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
  pendingInvites: GroupInvite[];
  notifications: Notification[];
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  addFriend: (fullName: string, email?: string) => Promise<Profile>;
  createGroup: (name: string, category: GroupCategory, description?: string, emails?: string[], imageUrl?: string, memberIds?: string[], currency?: string) => Promise<Group>;
  updateGroup: (id: string, name: string, category: GroupCategory, description?: string, imageUrl?: string, currency?: string) => Promise<Group>;
  addGroupInvite: (groupId: string, email?: string, name?: string, memberId?: string) => Promise<{ inviteUrl: string; message: string; memberId?: string }>;
  deleteFriend: (friendId: string) => Promise<void>;
  acceptGroupInvite: (inviteId: string) => Promise<string>;
  rejectGroupInvite: (inviteId: string) => Promise<void>;
  markNotificationAsRead: (notificationId?: string) => Promise<void>;
  addExpense: (expense: Omit<Expense, 'id' | 'created_at'>, items?: any[], splits?: any[]) => Promise<void>;
  updateExpense: (id: string, expense: Omit<Expense, 'id' | 'created_at'>, items?: any[], splits?: any[]) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  addPayment: (payment: Omit<Payment, 'id' | 'created_at'>) => Promise<void>;
  updatePayment: (id: string, payment: Omit<Payment, 'id' | 'created_at'>) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
  confirmDraft: (draftId: string, groupId: string, paidBy: string, splits: ExpenseSplit[]) => Promise<void>;
  discardDraft: (draftId: string) => Promise<void>;
  addDraft: (draft: Omit<ExpenseDraft, 'id' | 'created_at' | 'user_id' | 'status'>) => Promise<void>;
  reloadFromSupabase: () => Promise<void>;
  refreshData: () => Promise<void>;
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
  const [pendingInvites, setPendingInvites] = useState<GroupInvite[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const supabase = createClient();

  const reloadFromSupabase = useCallback(async () => {
    try {
      const res = await fetch('/api/sync');
      if (!res.ok) {
        if (res.status === 401) {
          setCurrentProfile(null);
        }
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (data.profile) setCurrentProfile(data.profile as Profile);
      if (data.profiles) setProfiles(data.profiles as Profile[]);
      if (data.groups) setGroups(data.groups as Group[]);
      if (data.members) setMembers(data.members as GroupMember[]);
      if (data.expenses) setExpenses(data.expenses as unknown as Expense[]);
      if (data.payments) setPayments(data.payments as Payment[]);
      if (data.drafts) setDrafts(data.drafts as ExpenseDraft[]);
      if (data.notifications) setNotifications(data.notifications as Notification[]);
      if (data.pendingInvites) setPendingInvites(data.pendingInvites as GroupInvite[]);
    } catch (err) {
      console.error('Error al sincronizar datos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const updateProfile = async (updates: Partial<Profile>): Promise<void> => {
    if (!currentProfile) return;
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', currentProfile.id);

    if (error) {
      console.error('Error al actualizar el perfil:', error);
      throw new Error(error.message || 'Error al actualizar el perfil');
    }

    await reloadFromSupabase();
  };

  const addFriend = async (fullName: string, email?: string): Promise<Profile> => {
    const res = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const message = errData.error ? String(errData.error) : 'Error al agregar amigo';
      console.error('[ExpenseContext] Error in addFriend:', message);
      throw new Error(message);
    }

    const data = await res.json();
    const newProfile = data.profile as Profile;
    
    // Actualización optimista de estado
    setProfiles((prev) => {
      if (!prev.find((p) => p.id === newProfile.id)) {
        return [...prev, newProfile];
      }
      return prev;
    });

    // Sincronizar en segundo plano
    void reloadFromSupabase();
    return newProfile;
  };

  const createGroup = async (
    name: string,
    category: GroupCategory,
    description?: string,
    emails?: string[],
    imageUrl?: string,
    memberIds?: string[],
    currency?: string
  ): Promise<Group> => {
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, description, emails, imageUrl, memberIds, currency }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const message = errData.error ? String(errData.error) : 'No se pudo crear el grupo';
      console.error('[ExpenseContext] Error in createGroup:', message);
      throw new Error(message);
    }

    const createdGroup: Group = await res.json();
    await reloadFromSupabase();
    return createdGroup;
  };

  const updateGroup = async (
    id: string,
    name: string,
    category: GroupCategory,
    description?: string,
    imageUrl?: string,
    currency?: string
  ): Promise<Group> => {
    const res = await fetch(`/api/groups/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category, description, imageUrl, currency }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const message = errData.error ? String(errData.error) : 'No se pudo actualizar el grupo';
      console.error('[ExpenseContext] Error in updateGroup:', message);
      throw new Error(message);
    }

    const updatedGroup: Group = await res.json();
    await reloadFromSupabase();
    return updatedGroup;
  };

  const addGroupInvite = async (groupId: string, email?: string, name?: string, memberId?: string): Promise<{ inviteUrl: string; message: string; memberId?: string }> => {
    const res = await fetch('/api/groups/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, email, name, memberId }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const message = errData.error ? String(errData.error) : 'No se pudo enviar la invitación';
      console.error('[ExpenseContext] Error in addGroupInvite:', message);
      throw new Error(message);
    }

    const data = await res.json();
    await reloadFromSupabase();
    return {
      inviteUrl: data.inviteUrl,
      message: data.message,
      memberId: data.memberId,
    };
  };

  const deleteFriend = async (friendId: string): Promise<void> => {
    const res = await fetch(`/api/friends/${friendId}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'No se pudo eliminar al amigo');
    }

    await reloadFromSupabase();
  };

  const acceptGroupInvite = async (inviteId: string): Promise<string> => {
    const res = await fetch(`/api/invites/${inviteId}/accept`, {
      method: 'POST',
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'No se pudo aceptar la invitación');
    }

    const data = await res.json();
    await reloadFromSupabase();
    return data.groupId;
  };

  const rejectGroupInvite = async (inviteId: string): Promise<void> => {
    const res = await fetch(`/api/invites/${inviteId}/reject`, {
      method: 'POST',
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'No se pudo rechazar la invitación');
    }

    await reloadFromSupabase();
  };

  const markNotificationAsRead = async (notificationId?: string): Promise<void> => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notificationId,
        markAll: !notificationId,
      }),
    });
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

  const updateExpense = async (id: string, expense: Omit<Expense, 'id' | 'created_at'>, items?: any[], splits?: any[]) => {
    const res = await fetch(`/api/expenses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expense, items, splits }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const message = errData.error ? String(errData.error) : 'No se pudo actualizar el gasto';
      console.error('[ExpenseContext] Error in updateExpense:', message);
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

  const updatePayment = async (id: string, payment: Omit<Payment, 'id' | 'created_at'>) => {
    const res = await fetch(`/api/payments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payment),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const message = errData.error ? String(errData.error) : 'No se pudo actualizar el pago';
      console.error('[ExpenseContext] Error in updatePayment:', message);
      throw new Error(message);
    }

    await reloadFromSupabase();
  };

  const deletePayment = async (id: string) => {
    const res = await fetch(`/api/payments/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const message = errData.error ? String(errData.error) : 'No se pudo eliminar el pago';
      console.error('[ExpenseContext] Error in deletePayment:', message);
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
        pendingInvites,
        notifications,
        updateProfile,
        addFriend,
        createGroup,
        updateGroup,
        addGroupInvite,
        deleteFriend,
        acceptGroupInvite,
        rejectGroupInvite,
        markNotificationAsRead,
        addExpense,
        updateExpense,
        deleteExpense,
        addPayment,
        updatePayment,
        deletePayment,
        confirmDraft,
        discardDraft,
        addDraft,
        reloadFromSupabase,
        refreshData: reloadFromSupabase,
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
