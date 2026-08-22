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
  addExpense: (expense: Omit<Expense, 'id' | 'created_at'>, items?: any[], splits?: any[]) => Promise<Expense>;
  updateExpense: (id: string, expense: Omit<Expense, 'id' | 'created_at'>, items?: any[], splits?: any[]) => Promise<Expense>;
  deleteExpense: (id: string) => Promise<void>;
  addPayment: (payment: Omit<Payment, 'id' | 'created_at'>) => Promise<Payment>;
  updatePayment: (id: string, payment: Omit<Payment, 'id' | 'created_at'>) => Promise<Payment>;
  deletePayment: (id: string) => Promise<void>;
  confirmDraft: (draftId: string, groupId: string, paidBy: string, splits: ExpenseSplit[]) => Promise<{ expense: Expense; draftId: string }>;
  discardDraft: (draftId: string) => Promise<void>;
  addDraft: (draft: Omit<ExpenseDraft, 'id' | 'created_at' | 'user_id' | 'status'>) => Promise<ExpenseDraft>;
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

  // Compute the current user's group IDs for Realtime filtering
  const currentUserId = currentProfile?.id;
  const userGroupIds = useMemo(() => {
    if (!currentUserId) return [];
    const set = new Set<string>();
    members.forEach((m) => {
      if (m.user_id === currentUserId) {
        set.add(m.group_id);
      }
    });
    groups.forEach((g) => {
      if (g.owner_id === currentUserId) {
        set.add(g.id);
      }
    });
    return Array.from(set);
  }, [currentUserId, members, groups]);

  const userGroupIdsKey = useMemo(() => [...userGroupIds].sort().join(','), [userGroupIds]);

  // Realtime subscription for expenses and payments across user's groups
  useEffect(() => {
    if (!currentUserId || userGroupIds.length === 0) {
      return;
    }

    const groupIdsSet = new Set(userGroupIds);
    const channelName = `realtime-group-sync-${currentUserId}-${userGroupIdsKey.slice(0, 32)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses',
        },
        async (payload) => {
          const eventType = payload.eventType;

          if (eventType === 'INSERT') {
            const newRecord = payload.new as Expense;
            if (!newRecord?.id) return;
            if (newRecord.group_id && !groupIdsSet.has(newRecord.group_id)) return;

            // 1. Evitar duplicados por id (por ejemplo si ya fue insertado optimistamente)
            setExpenses((prev) => {
              if (prev.some((e) => e.id === newRecord.id)) {
                return prev;
              }
              return [newRecord, ...prev];
            });

            // 2. Si el gasto fue creado por otro usuario, hidratar items y splits asociados
            try {
              const { data: fullExp } = await supabase
                .from('expenses')
                .select('*, items:expense_items(*), splits:expense_splits(*)')
                .eq('id', newRecord.id)
                .maybeSingle();

              if (fullExp) {
                setExpenses((prev) => {
                  const exists = prev.some((e) => e.id === fullExp.id);
                  if (exists) {
                    return prev.map((e) => (e.id === fullExp.id ? (fullExp as Expense) : e));
                  }
                  return [fullExp as Expense, ...prev];
                });
              }
            } catch (fetchErr) {
              console.warn('[Realtime] Error al hidratar gasto nuevo:', fetchErr);
            }
          } else if (eventType === 'UPDATE') {
            const updatedRecord = payload.new as Expense;
            if (!updatedRecord?.id) return;
            if (updatedRecord.group_id && !groupIdsSet.has(updatedRecord.group_id)) return;

            // Reemplazar por id manteniendo splits/items existentes
            setExpenses((prev) => {
              const exists = prev.some((e) => e.id === updatedRecord.id);
              if (!exists) {
                return [updatedRecord, ...prev];
              }
              return prev.map((e) => {
                if (e.id === updatedRecord.id) {
                  return {
                    ...e,
                    ...updatedRecord,
                    items: e.items,
                    splits: e.splits,
                  };
                }
                return e;
              });
            });

            // Hidratar posibles cambios en splits o items
            try {
              const { data: fullExp } = await supabase
                .from('expenses')
                .select('*, items:expense_items(*), splits:expense_splits(*)')
                .eq('id', updatedRecord.id)
                .maybeSingle();

              if (fullExp) {
                setExpenses((prev) =>
                  prev.map((e) => (e.id === fullExp.id ? (fullExp as Expense) : e))
                );
              }
            } catch (fetchErr) {
              console.warn('[Realtime] Error al actualizar hidratación del gasto:', fetchErr);
            }
          } else if (eventType === 'DELETE') {
            const deletedId = payload.old?.id;
            if (deletedId) {
              setExpenses((prev) => prev.filter((e) => e.id !== deletedId));
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
        },
        (payload) => {
          const eventType = payload.eventType;

          if (eventType === 'INSERT') {
            const newRecord = payload.new as Payment;
            if (!newRecord?.id) return;
            if (newRecord.group_id && !groupIdsSet.has(newRecord.group_id)) return;

            // Evitar duplicados por id
            setPayments((prev) => {
              if (prev.some((p) => p.id === newRecord.id)) {
                return prev;
              }
              return [newRecord, ...prev];
            });
          } else if (eventType === 'UPDATE') {
            const updatedRecord = payload.new as Payment;
            if (!updatedRecord?.id) return;
            if (updatedRecord.group_id && !groupIdsSet.has(updatedRecord.group_id)) return;

            // Reemplazar por id
            setPayments((prev) =>
              prev.map((p) => (p.id === updatedRecord.id ? { ...p, ...updatedRecord } : p))
            );
          } else if (eventType === 'DELETE') {
            const deletedId = payload.old?.id;
            if (deletedId) {
              setPayments((prev) => prev.filter((p) => p.id !== deletedId));
            }
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentUserId, userGroupIdsKey, userGroupIds, supabase]);

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
        let message = 'No se pudo crear el grupo';
        try {
          const errData = await res.json();
          if (errData?.error) message = String(errData.error);
        } catch {
          // fallback
        }
        console.error('[ExpenseContext] Error in createGroup:', message);
        throw new Error(message);
      }

      let createdGroup: Group;
      try {
        createdGroup = await res.json();
      } catch {
        throw new Error('Respuesta inválida del servidor al crear el grupo');
      }

      await reloadFromSupabase(false);
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
        let message = 'No se pudo actualizar el grupo';
        try {
          const errData = await res.json();
          if (errData?.error) message = String(errData.error);
        } catch {
          // fallback
        }
        console.error('[ExpenseContext] Error in updateGroup:', message);
        throw new Error(message);
      }

      let updatedGroup: Group;
      try {
        updatedGroup = await res.json();
      } catch {
        throw new Error('Respuesta inválida del servidor al actualizar el grupo');
      }

      await reloadFromSupabase(false);
      return updatedGroup;
    });
  };

  const deleteGroup = async (id: string): Promise<void> => {
    await runOperation('Eliminando grupo...', async () => {
      const res = await fetch(`/api/groups/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        let message = 'No se pudo eliminar el grupo';
        try {
          const errData = await res.json();
          if (errData?.error) message = String(errData.error);
        } catch {
          // fallback
        }
        console.error('[ExpenseContext] Error in deleteGroup:', message);
        throw new Error(message);
      }

      try {
        await res.json();
      } catch {
        throw new Error('Respuesta inválida del servidor al eliminar el grupo');
      }

      await reloadFromSupabase(false);
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
        let message = 'No se pudo enviar la invitación';
        try {
          const errData = await res.json();
          if (errData?.error) message = String(errData.error);
        } catch {
          // fallback
        }
        console.error('[ExpenseContext] Error in addGroupInvite:', message);
        throw new Error(message);
      }

      let data: { inviteUrl: string; message: string; memberId?: string };
      try {
        data = await res.json();
      } catch {
        throw new Error('Respuesta inválida del servidor al enviar la invitación');
      }

      await reloadFromSupabase(false);
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
      let message = 'No se pudo obtener el enlace de invitación';
      try {
        const errData = await res.json();
        if (errData?.error) message = String(errData.error);
      } catch {
        // fallback
      }
      throw new Error(message);
    }
    try {
      return await res.json();
    } catch {
      throw new Error('Respuesta inválida del servidor al obtener el enlace');
    }
  }, []);

  const regenerateGroupInviteLink = useCallback(async (groupId: string): Promise<{ inviteUrl: string; expiresAt: string; token: string; inviteId: string; isNew: boolean; message: string }> => {
    const res = await fetch(`/api/groups/${groupId}/invite-link`, {
      method: 'POST',
    });
    if (!res.ok) {
      let message = 'No se pudo generar el enlace';
      try {
        const errData = await res.json();
        if (errData?.error) message = String(errData.error);
      } catch {
        // fallback
      }
      throw new Error(message);
    }
    try {
      return await res.json();
    } catch {
      throw new Error('Respuesta inválida del servidor al generar el enlace');
    }
  }, []);

  const deleteFriend = async (friendId: string): Promise<void> => {
    await runOperation('Eliminando amigo...', async () => {
      const res = await fetch(`/api/friends/${friendId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        let message = 'No se pudo eliminar al amigo';
        try {
          const errData = await res.json();
          if (errData?.error) message = String(errData.error);
        } catch {
          // fallback
        }
        throw new Error(message);
      }

      try {
        await res.json();
      } catch {
        throw new Error('Respuesta inválida del servidor al eliminar al amigo');
      }

      await reloadFromSupabase(false);
    });
  };

  const acceptGroupInvite = async (inviteId: string): Promise<string> => {
    return await runOperation('Aceptando invitación...', async () => {
      const res = await fetch(`/api/invites/${inviteId}/accept`, {
        method: 'POST',
      });

      if (!res.ok) {
        let message = 'No se pudo aceptar la invitación';
        try {
          const errData = await res.json();
          if (errData?.error) message = String(errData.error);
        } catch {
          // fallback
        }
        throw new Error(message);
      }

      let data: { groupId: string };
      try {
        data = await res.json();
      } catch {
        throw new Error('Respuesta inválida del servidor al aceptar la invitación');
      }

      await reloadFromSupabase(false);
      return data.groupId;
    });
  };

  const rejectGroupInvite = async (inviteId: string): Promise<void> => {
    await runOperation('Rechazando invitación...', async () => {
      const res = await fetch(`/api/invites/${inviteId}/reject`, {
        method: 'POST',
      });

      if (!res.ok) {
        let message = 'No se pudo rechazar la invitación';
        try {
          const errData = await res.json();
          if (errData?.error) message = String(errData.error);
        } catch {
          // fallback
        }
        throw new Error(message);
      }

      try {
        await res.json();
      } catch {
        throw new Error('Respuesta inválida del servidor al rechazar la invitación');
      }

      await reloadFromSupabase(false);
    });
  };

  const markNotificationAsRead = async (notificationId?: string): Promise<void> => {
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notificationId,
        markAll: !notificationId,
      }),
    });

    if (!res.ok) {
      let message = 'Error al actualizar notificaciones';
      try {
        const errData = await res.json();
        if (errData?.error) message = String(errData.error);
      } catch {
        // fallback
      }
      console.error('[ExpenseContext] Error in markNotificationAsRead:', message);
      throw new Error(message);
    }

    try {
      await res.json();
    } catch {
      throw new Error('Respuesta inválida del servidor al actualizar notificaciones');
    }

    setNotifications((prev) =>
      prev.map((n) => {
        if (!notificationId || n.id === notificationId) {
          return { ...n, is_read: true };
        }
        return n;
      })
    );
  };

  const addExpense = async (
    expense: Omit<Expense, 'id' | 'created_at'>,
    items?: any[],
    splits?: any[]
  ): Promise<Expense> => {
    return await runOperation('Guardando gasto...', async () => {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expense, items, splits }),
      });

      if (!res.ok) {
        let message = 'No se pudo registrar el gasto';
        try {
          const errData = await res.json();
          if (errData?.error) message = String(errData.error);
        } catch {
          // fallback
        }
        console.error('[ExpenseContext] Error in addExpense:', message);
        throw new Error(message);
      }

      let createdExpense: Expense;
      try {
        createdExpense = await res.json();
      } catch {
        throw new Error('Respuesta inválida del servidor al crear el gasto');
      }

      setExpenses((prev) => [createdExpense, ...prev.filter((e) => e.id !== createdExpense.id)]);
      return createdExpense;
    });
  };

  const updateExpense = async (
    id: string,
    expense: Omit<Expense, 'id' | 'created_at'>,
    items?: any[],
    splits?: any[]
  ): Promise<Expense> => {
    return await runOperation('Actualizando gasto y participantes...', async () => {
      const res = await fetch(`/api/expenses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expense, items, splits }),
      });

      if (!res.ok) {
        let message = 'No se pudo actualizar el gasto';
        try {
          const errData = await res.json();
          if (errData?.error) message = String(errData.error);
        } catch {
          // fallback
        }
        console.error('[ExpenseContext] Error in updateExpense:', message);
        throw new Error(message);
      }

      let updatedExpense: Expense;
      try {
        updatedExpense = await res.json();
      } catch {
        throw new Error('Respuesta inválida del servidor al actualizar el gasto');
      }

      setExpenses((prev) =>
        prev.map((e) => (e.id === updatedExpense.id ? updatedExpense : e))
      );
      return updatedExpense;
    });
  };

  const deleteExpense = async (id: string): Promise<void> => {
    await runOperation('Eliminando gasto...', async () => {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });

      if (!res.ok) {
        let message = 'No se pudo eliminar el gasto';
        try {
          const errData = await res.json();
          if (errData?.error) message = String(errData.error);
        } catch {
          // fallback
        }
        console.error('[ExpenseContext] Error in deleteExpense:', message);
        throw new Error(message);
      }

      try {
        await res.json();
      } catch {
        throw new Error('Respuesta inválida del servidor al eliminar el gasto');
      }

      setExpenses((prev) => prev.filter((e) => e.id !== id));
    });
  };

  const addPayment = async (payment: Omit<Payment, 'id' | 'created_at'>): Promise<Payment> => {
    return await runOperation('Registrando pago...', async () => {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payment),
      });

      if (!res.ok) {
        let message = 'No se pudo registrar el pago';
        try {
          const errData = await res.json();
          if (errData?.error) message = String(errData.error);
        } catch {
          // fallback
        }
        console.error('[ExpenseContext] Error in addPayment:', message);
        throw new Error(message);
      }

      let createdPayment: Payment;
      try {
        createdPayment = await res.json();
      } catch {
        throw new Error('Respuesta inválida del servidor al registrar el pago');
      }

      setPayments((prev) => [createdPayment, ...prev.filter((p) => p.id !== createdPayment.id)]);
      return createdPayment;
    });
  };

  const updatePayment = async (id: string, payment: Omit<Payment, 'id' | 'created_at'>): Promise<Payment> => {
    return await runOperation('Actualizando pago...', async () => {
      const res = await fetch(`/api/payments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payment),
      });

      if (!res.ok) {
        let message = 'No se pudo actualizar el pago';
        try {
          const errData = await res.json();
          if (errData?.error) message = String(errData.error);
        } catch {
          // fallback
        }
        console.error('[ExpenseContext] Error in updatePayment:', message);
        throw new Error(message);
      }

      let updatedPayment: Payment;
      try {
        updatedPayment = await res.json();
      } catch {
        throw new Error('Respuesta inválida del servidor al actualizar el pago');
      }

      setPayments((prev) =>
        prev.map((p) => (p.id === updatedPayment.id ? updatedPayment : p))
      );
      return updatedPayment;
    });
  };

  const deletePayment = async (id: string): Promise<void> => {
    await runOperation('Eliminando pago...', async () => {
      const res = await fetch(`/api/payments/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        let message = 'No se pudo eliminar el pago';
        try {
          const errData = await res.json();
          if (errData?.error) message = String(errData.error);
        } catch {
          // fallback
        }
        console.error('[ExpenseContext] Error in deletePayment:', message);
        throw new Error(message);
      }

      try {
        await res.json();
      } catch {
        throw new Error('Respuesta inválida del servidor al eliminar el pago');
      }

      setPayments((prev) => prev.filter((p) => p.id !== id));
    });
  };

  const confirmDraft = async (
    draftId: string,
    groupId: string,
    paidBy: string,
    splits: ExpenseSplit[]
  ): Promise<{ expense: Expense; draftId: string }> => {
    return await runOperation('Confirmando borrador...', async () => {
      const res = await fetch('/api/drafts/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId, groupId, paidBy, splits }),
      });

      if (!res.ok) {
        let message = 'No se pudo confirmar el borrador';
        try {
          const errData = await res.json();
          if (errData?.error) message = String(errData.error);
        } catch {
          // fallback
        }
        console.error('[ExpenseContext] Error in confirmDraft:', message);
        throw new Error(message);
      }

      let data: { expense: Expense; draftId: string };
      try {
        data = await res.json();
      } catch {
        throw new Error('Respuesta inválida del servidor al confirmar el borrador');
      }

      const { expense, draftId: confirmedDraftId } = data;
      const targetDraftId = confirmedDraftId || draftId;

      if (expense) {
        setExpenses((prev) => [expense, ...prev.filter((e) => e.id !== expense.id)]);
      }
      setDrafts((prev) => prev.filter((d) => d.id !== targetDraftId));

      return data;
    });
  };

  const discardDraft = async (draftId: string): Promise<void> => {
    await runOperation('Descartando borrador...', async () => {
      const res = await fetch(`/api/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'discarded' }),
      });

      if (!res.ok) {
        let message = 'No se pudo descartar el borrador';
        try {
          const errData = await res.json();
          if (errData?.error) message = String(errData.error);
        } catch {
          // fallback
        }
        console.error('[ExpenseContext] Error in discardDraft:', message);
        throw new Error(message);
      }

      try {
        await res.json();
      } catch {
        throw new Error('Respuesta inválida del servidor al descartar el borrador');
      }

      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    });
  };

  const addDraft = async (
    draft: Omit<ExpenseDraft, 'id' | 'created_at' | 'user_id' | 'status'>
  ): Promise<ExpenseDraft> => {
    return await runOperation('Agregando borrador...', async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Usuario no autenticado');
      }

      const { data, error } = await supabase
        .from('expense_drafts')
        .insert({
          ...draft,
          user_id: user.id,
          status: 'pending'
        })
        .select()
        .single();

      if (error) {
        console.error('[ExpenseContext] Error in addDraft:', error.message);
        throw new Error(error.message);
      }

      const newDraft = data as ExpenseDraft;
      setDrafts((prev) => [newDraft, ...prev.filter((d) => d.id !== newDraft.id)]);
      return newDraft;
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
