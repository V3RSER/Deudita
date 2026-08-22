'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
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
  ExpenseAuditLog,
  GroupCategory,
} from './types';
import { createClient } from '@/lib/supabase/client';
import { buildSponsorshipMap } from './balance-utils';

interface ExpenseContextType {
  currentProfile: Profile | null;
  loading: boolean;
  isMutating: boolean;
  activeOperation: string | null;
  profiles: Profile[];
  userGroups: Group[];
  groups: Group[];
  members: GroupMember[];
  expenses: Expense[];
  auditLogs: ExpenseAuditLog[];
  drafts: ExpenseDraft[];
  payments: Payment[];
  pendingInvites: GroupInvite[];
  notifications: Notification[];
  hiddenFriendIds: string[];
  managedUserIds: string[];
  sponsorshipMap: Map<string, string>;
  toggleManagedUser: (targetUserId: string, shouldManage: boolean) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  addFriend: (fullName: string, email?: string) => Promise<Profile>;
  createGroup: (name: string, category: GroupCategory, description?: string, emails?: string[], imageUrl?: string, memberIds?: string[], currency?: string) => Promise<Group>;
  updateGroup: (id: string, name: string, category: GroupCategory, description?: string, imageUrl?: string, currency?: string) => Promise<Group>;
  deleteGroup: (id: string) => Promise<void>;
  addGroupInvite: (groupId: string, email?: string, name?: string, memberId?: string) => Promise<{ inviteUrl: string; message: string; memberId?: string }>;
  getGroupInviteLink: (groupId: string) => Promise<{ inviteUrl: string; expiresAt: string; token: string; inviteId: string; isNew: boolean }>;
  regenerateGroupInviteLink: (groupId: string) => Promise<{ inviteUrl: string; expiresAt: string; token: string; inviteId: string; isNew: boolean; message: string }>;
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
  reloadFromSupabase: (fullSync?: boolean) => Promise<void>;
  refreshData: (fullSync?: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const ExpenseContext = createContext<ExpenseContextType | undefined>(undefined);

export function ExpenseProvider({ children }: { children: React.ReactNode }) {
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isMutating, setIsMutating] = useState<boolean>(false);
  const [activeOperation, setActiveOperation] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [auditLogs, setAuditLogs] = useState<ExpenseAuditLog[]>([]);
  const [drafts, setDrafts] = useState<ExpenseDraft[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pendingInvites, setPendingInvites] = useState<GroupInvite[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [hiddenFriendIds, setHiddenFriendIds] = useState<string[]>([]);

  const supabase = createClient();

  const runOperation = async <T,>(operationLabel: string, action: () => Promise<T>): Promise<T> => {
    setIsMutating(true);
    setActiveOperation(operationLabel);
    try {
      return await action();
    } finally {
      setIsMutating(false);
      setActiveOperation(null);
    }
  };

  const reloadFromSupabase = useCallback(async (fullSync: boolean = false) => {
    try {
      const url = fullSync ? '/api/sync?full=true' : '/api/sync';
      const res = await fetch(url);
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
      if (data.auditLogs) setAuditLogs(data.auditLogs as ExpenseAuditLog[]);
      if (data.hiddenFriendIds) setHiddenFriendIds(data.hiddenFriendIds as string[]);

      if (data.profile && typeof window !== 'undefined') {
        let pendingInvite =
          window.sessionStorage.getItem('deudita_invite_token') ??
          window.localStorage.getItem('deudita_pending_invite');

        if (!pendingInvite && typeof document !== 'undefined') {
          const match = document.cookie.match(/(?:^|;\s*)deudita_invite_token=([^;]*)/);
          if (match && match[1]) {
            pendingInvite = decodeURIComponent(match[1]);
          }
        }

        if (pendingInvite) {
          try {
            const claimRes = await fetch('/api/invites/claim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: pendingInvite }),
            });
            if (claimRes.ok) {
              const claimData = await claimRes.json();
              window.sessionStorage.removeItem('deudita_invite_token');
              window.localStorage.removeItem('deudita_pending_invite');
              document.cookie = 'deudita_invite_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
              if (claimData?.groupId) {
                if (window.location.pathname.startsWith('/login') || window.location.pathname.startsWith('/join')) {
                  window.location.href = `/groups/${claimData.groupId}`;
                  return;
                }
              }
              // Fetch latest data to include the newly joined group
              const refreshRes = await fetch('/api/sync');
              if (refreshRes.ok) {
                const refreshed = await refreshRes.json();
                if (refreshed.groups) setGroups(refreshed.groups as Group[]);
                if (refreshed.members) setMembers(refreshed.members as GroupMember[]);
                if (refreshed.profiles) setProfiles(refreshed.profiles as Profile[]);
                if (refreshed.expenses) setExpenses(refreshed.expenses as unknown as Expense[]);
              }
            }
          } catch (claimErr) {
            console.warn('Could not auto-claim pending invite:', claimErr);
          }
        }
      }
    } catch (err) {
      console.error('Error al sincronizar datos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadFromSupabase(true);
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event !== 'INITIAL_SESSION') {
        void reloadFromSupabase(true);
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

  const completeOnboarding = async (): Promise<void> => {
    if (!currentProfile) return;
    setCurrentProfile((prev) => (prev ? { ...prev, onboarding_completed: true } : null));
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarding_completed: true }),
      });
    } catch (err) {
      console.warn('[ExpenseContext] Could not persist onboarding status:', err);
    }
  };

  const updateProfile = async (updates: Partial<Profile>): Promise<void> => {
    if (!currentProfile) return;
    await runOperation('Guardando perfil...', async () => {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? 'Error al actualizar el perfil');
      }

      const data = await res.json();
      if (data.profile) {
        const updated = data.profile as Profile;
        setCurrentProfile(updated);
        setProfiles((prev) =>
          prev.map((p) => (p.id === updated.id ? updated : p))
        );
      }

      await reloadFromSupabase();
    });
  };

  const managedUserIds = useMemo(() => {
    return Array.isArray(currentProfile?.managed_user_ids) ? currentProfile.managed_user_ids : [];
  }, [currentProfile]);

  const sponsorshipMap = useMemo(() => {
    return buildSponsorshipMap(profiles);
  }, [profiles]);

  const toggleManagedUser = async (targetUserId: string, shouldManage: boolean): Promise<void> => {
    if (!currentProfile || !targetUserId || targetUserId === currentProfile.id) return;
    
    const currentList = Array.isArray(currentProfile.managed_user_ids) ? currentProfile.managed_user_ids : [];
    let updatedList: string[];
    
    if (shouldManage) {
      updatedList = Array.from(new Set([...currentList, targetUserId]));
    } else {
      updatedList = currentList.filter((id) => id !== targetUserId);
    }

    const optimisticProfile = {
      ...currentProfile,
      managed_user_ids: updatedList,
    };
    setCurrentProfile(optimisticProfile);
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id === currentProfile.id) return optimisticProfile;
        if (p.id === targetUserId) {
          return { ...p, managed_by: shouldManage ? currentProfile.id : undefined };
        }
        return p;
      })
    );

    try {
      const res = await fetch('/api/managed-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, shouldManage }),
      });
      if (!res.ok) {
        await updateProfile({ managed_user_ids: updatedList });
      }
    } catch {
      await updateProfile({ managed_user_ids: updatedList });
    }

    await reloadFromSupabase();
  };

  const addFriend = async (fullName: string, email?: string): Promise<Profile> => {
    return await runOperation('Agregando amigo...', async () => {
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
      
      // Actualización de estado
      setProfiles((prev) => {
        if (!prev.find((p) => p.id === newProfile.id)) {
          return [...prev, newProfile];
        }
        return prev;
      });

      // Sincronizar
      void reloadFromSupabase();
      return newProfile;
    });
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
    return await runOperation('Creando grupo...', async () => {
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
    });
  };

  const updateGroup = async (
    id: string,
    name: string,
    category: GroupCategory,
    description?: string,
    imageUrl?: string,
    currency?: string
  ): Promise<Group> => {
    return await runOperation('Actualizando grupo...', async () => {
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
    });
  };

  const deleteGroup = async (id: string): Promise<void> => {
    await runOperation('Eliminando grupo...', async () => {
      const res = await fetch(`/api/groups/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const message = errData.error ? String(errData.error) : 'No se pudo eliminar el grupo';
        console.error('[ExpenseContext] Error in deleteGroup:', message);
        throw new Error(message);
      }

      await reloadFromSupabase();
    });
  };

  const addGroupInvite = async (groupId: string, email?: string, name?: string, memberId?: string): Promise<{ inviteUrl: string; message: string; memberId?: string }> => {
    return await runOperation('Añadiendo integrante...', async () => {
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
    });
  };

  const getGroupInviteLink = useCallback(async (groupId: string): Promise<{ inviteUrl: string; expiresAt: string; token: string; inviteId: string; isNew: boolean }> => {
    const res = await fetch(`/api/groups/${groupId}/invite-link`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const message = errData.error ? String(errData.error) : 'No se pudo obtener el enlace de invitación';
      throw new Error(message);
    }
    return await res.json();
  }, []);

  const regenerateGroupInviteLink = useCallback(async (groupId: string): Promise<{ inviteUrl: string; expiresAt: string; token: string; inviteId: string; isNew: boolean; message: string }> => {
    const res = await fetch(`/api/groups/${groupId}/invite-link`, {
      method: 'POST',
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const message = errData.error ? String(errData.error) : 'No se pudo generar el enlace';
      throw new Error(message);
    }
    return await res.json();
  }, []);

  const deleteFriend = async (friendId: string): Promise<void> => {
    await runOperation('Eliminando amigo...', async () => {
      const res = await fetch(`/api/friends/${friendId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? 'No se pudo eliminar al amigo');
      }

      await reloadFromSupabase();
    });
  };

  const acceptGroupInvite = async (inviteId: string): Promise<string> => {
    return await runOperation('Aceptando invitación...', async () => {
      const res = await fetch(`/api/invites/${inviteId}/accept`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? 'No se pudo aceptar la invitación');
      }

      const data = await res.json();
      await reloadFromSupabase();
      return data.groupId;
    });
  };

  const rejectGroupInvite = async (inviteId: string): Promise<void> => {
    await runOperation('Rechazando invitación...', async () => {
      const res = await fetch(`/api/invites/${inviteId}/reject`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? 'No se pudo rechazar la invitación');
      }

      await reloadFromSupabase();
    });
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
    await runOperation('Guardando gasto...', async () => {
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
    });
  };

  const updateExpense = async (id: string, expense: Omit<Expense, 'id' | 'created_at'>, items?: any[], splits?: any[]) => {
    await runOperation('Actualizando gasto y participantes...', async () => {
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
    });
  };

  const deleteExpense = async (id: string) => {
    await runOperation('Eliminando gasto...', async () => {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const message = errData.error ? String(errData.error) : 'No se pudo eliminar el gasto';
        console.error('[ExpenseContext] Error in deleteExpense:', message);
        throw new Error(message);
      }

      await reloadFromSupabase();
    });
  };

  const addPayment = async (payment: Omit<Payment, 'id' | 'created_at'>) => {
    await runOperation('Registrando pago...', async () => {
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
    });
  };

  const updatePayment = async (id: string, payment: Omit<Payment, 'id' | 'created_at'>) => {
    await runOperation('Actualizando pago...', async () => {
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
    });
  };

  const deletePayment = async (id: string) => {
    await runOperation('Eliminando pago...', async () => {
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
    });
  };

  const confirmDraft = async (draftId: string, groupId: string, paidBy: string, splits: ExpenseSplit[]) => {
    await runOperation('Confirmando borrador...', async () => {
      await fetch('/api/drafts/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, groupId, paidBy, splits }),
      });
      await reloadFromSupabase();
    });
  };

  const discardDraft = async (draftId: string) => {
    await runOperation('Descartando borrador...', async () => {
      await fetch(`/api/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'discarded' }),
      });
      await reloadFromSupabase();
    });
  };

  const addDraft = async (draft: Omit<ExpenseDraft, 'id' | 'created_at' | 'user_id' | 'status'>) => {
    await runOperation('Agregando borrador...', async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      await supabase.from('expense_drafts').insert({
        ...draft,
        user_id: user.id,
        status: 'pending'
      });
      await reloadFromSupabase();
    });
  };

  const userGroups = groups.filter((g) => members.some((m) => m.group_id === g.id && m.user_id === currentProfile?.id));

  return (
    <ExpenseContext.Provider
      value={{
        currentProfile,
        loading,
        isMutating,
        activeOperation,
        profiles,
        userGroups,
        groups,
        members,
        expenses,
        auditLogs,
        drafts,
        payments,
        pendingInvites,
        notifications,
        hiddenFriendIds,
        managedUserIds,
        sponsorshipMap,
        toggleManagedUser,
        completeOnboarding,
        updateProfile,
        addFriend,
        createGroup,
        updateGroup,
        deleteGroup,
        addGroupInvite,
        getGroupInviteLink,
        regenerateGroupInviteLink,
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
