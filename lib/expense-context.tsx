'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  Profile,
  Group,
  GroupMember,
  Expense,
  ExpenseDraft,
  Settlement,
  ExpenseItem,
  ExpenseSplit,
} from './types';
import {
  INITIAL_PROFILES,
  INITIAL_GROUPS,
  INITIAL_MEMBERS,
  INITIAL_EXPENSES,
  INITIAL_DRAFTS,
  INITIAL_SETTLEMENTS,
} from './seed-data';

interface ExpenseContextType {
  currentProfile: Profile;
  setCurrentProfile: (p: Profile) => void;
  profiles: Profile[];
  addProfile: (fullName: string, email?: string) => Profile;
  groups: Group[];
  members: GroupMember[];
  expenses: Expense[];
  drafts: ExpenseDraft[];
  settlements: Settlement[];
  createGroup: (name: string, category: GroupCategory, description?: string, memberIds?: string[]) => void;
  addMemberToGroup: (groupId: string, userId: string) => void;
  addExpense: (expense: Omit<Expense, 'id' | 'created_at'>) => void;
  deleteExpense: (id: string) => void;
  addSettlement: (settlement: Omit<Settlement, 'id' | 'created_at'>) => void;
  confirmDraft: (draftId: string, groupId: string, paidBy: string, splits: ExpenseSplit[]) => void;
  discardDraft: (draftId: string) => void;
  addDraft: (draft: Omit<ExpenseDraft, 'id' | 'created_at' | 'user_id' | 'status'>) => void;
  resetDataToSeed: () => void;
}

type GroupCategory = 'home' | 'trip' | 'couple' | 'event' | 'work' | 'other';

const LOCAL_STORAGE_KEY = 'gastos_compartidos_app_state_v1';

const ExpenseContext = createContext<ExpenseContextType | undefined>(undefined);

export function ExpenseProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    if (typeof window === 'undefined') return INITIAL_PROFILES;
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.profiles) && parsed.profiles.length > 0) return parsed.profiles;
      }
    } catch {}
    return INITIAL_PROFILES;
  });

  const [currentProfile, setCurrentProfile] = useState<Profile>(() => {
    if (typeof window === 'undefined') return INITIAL_PROFILES[0];
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.currentProfileId) {
          const profileList = Array.isArray(parsed.profiles) ? parsed.profiles : INITIAL_PROFILES;
          const found = profileList.find(
            (p: Profile) => p.id === parsed.currentProfileId
          );
          if (found) return found;
        }
      }
    } catch {}
    return INITIAL_PROFILES[0];
  });

  const [groups, setGroups] = useState<Group[]>(() => {
    if (typeof window === 'undefined') return INITIAL_GROUPS;
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.groups)) return parsed.groups;
      }
    } catch {}
    return INITIAL_GROUPS;
  });

  const [members, setMembers] = useState<GroupMember[]>(() => {
    if (typeof window === 'undefined') return INITIAL_MEMBERS;
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.members)) return parsed.members;
      }
    } catch {}
    return INITIAL_MEMBERS;
  });

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    if (typeof window === 'undefined') return INITIAL_EXPENSES;
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.expenses)) return parsed.expenses;
      }
    } catch {}
    return INITIAL_EXPENSES;
  });

  const [drafts, setDrafts] = useState<ExpenseDraft[]>(() => {
    if (typeof window === 'undefined') return INITIAL_DRAFTS;
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.drafts)) return parsed.drafts;
      }
    } catch {}
    return INITIAL_DRAFTS;
  });

  const [settlements, setSettlements] = useState<Settlement[]>(() => {
    if (typeof window === 'undefined') return INITIAL_SETTLEMENTS;
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.settlements)) return parsed.settlements;
      }
    } catch {}
    return INITIAL_SETTLEMENTS;
  });

  const [isInitialized, setIsInitialized] = useState<boolean>(true);

  // Sync to localStorage
  useEffect(() => {
    if (!isInitialized) return;
    try {
      const stateToSave = {
        profiles,
        currentProfileId: currentProfile.id,
        groups,
        members,
        expenses,
        drafts,
        settlements,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
    } catch {
      // Silent error handling for storage
    }
  }, [profiles, currentProfile, groups, members, expenses, drafts, settlements, isInitialized]);

  const addProfile = (fullName: string, email?: string): Profile => {
    const trimmedName = fullName.trim();
    const cleanEmail = email && email.trim().length > 0
      ? email.trim()
      : `${trimmedName.toLowerCase().replace(/\s+/g, '.')}@ejemplo.com`;

    const newProfile: Profile = {
      id: `usr_${Date.now()}`,
      full_name: trimmedName,
      email: cleanEmail,
      avatar_url: `https://picsum.photos/seed/${encodeURIComponent(trimmedName)}/120/120`,
      created_at: new Date().toISOString(),
    };
    setProfiles((prev) => [...prev, newProfile]);
    return newProfile;
  };

  const createGroup = (
    name: string,
    category: GroupCategory,
    description?: string,
    memberIds: string[] = []
  ) => {
    const newGroup: Group = {
      id: `grp_${Date.now()}`,
      name: name.trim(),
      description: description && description.trim().length > 0 ? description.trim() : undefined,
      category,
      owner_id: currentProfile.id,
      created_at: new Date().toISOString(),
    };

    const newMembers: GroupMember[] = [
      {
        group_id: newGroup.id,
        user_id: currentProfile.id,
        role: 'owner',
        joined_at: new Date().toISOString(),
      },
    ];

    memberIds.forEach((uid) => {
      if (uid !== currentProfile.id) {
        newMembers.push({
          group_id: newGroup.id,
          user_id: uid,
          invited_by: currentProfile.id,
          role: 'member',
          joined_at: new Date().toISOString(),
        });
      }
    });

    setGroups((prev) => [newGroup, ...prev]);
    setMembers((prev) => [...prev, ...newMembers]);
  };

  const addMemberToGroup = (groupId: string, userId: string) => {
    const exists = members.some((m) => m.group_id === groupId && m.user_id === userId);
    if (exists) return;

    const newMember: GroupMember = {
      group_id: groupId,
      user_id: userId,
      invited_by: currentProfile.id,
      role: 'member',
      joined_at: new Date().toISOString(),
    };

    setMembers((prev) => [...prev, newMember]);
  };

  const addExpense = (newExpenseData: Omit<Expense, 'id' | 'created_at'>) => {
    const newExpense: Expense = {
      ...newExpenseData,
      id: `exp_${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    setExpenses((prev) => [newExpense, ...prev]);
  };

  const deleteExpense = (id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  const addSettlement = (data: Omit<Settlement, 'id' | 'created_at'>) => {
    const newSettlement: Settlement = {
      ...data,
      id: `settle_${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    setSettlements((prev) => [newSettlement, ...prev]);
  };

  const confirmDraft = (
    draftId: string,
    groupId: string,
    paidBy: string,
    splits: ExpenseSplit[]
  ) => {
    const draft = drafts.find((d) => d.id === draftId);
    if (!draft) return;

    const expenseId = `exp_${Date.now()}`;

    const itemsList: ExpenseItem[] = (draft.extracted_items || []).map((item, idx) => ({
      id: `item_${expenseId}_${idx}`,
      expense_id: expenseId,
      description: item.description,
      amount: item.amount,
      created_at: new Date().toISOString(),
    }));

    const formattedSplits: ExpenseSplit[] = splits.map((s, idx) => ({
      ...s,
      id: `s_${expenseId}_${idx}`,
      expense_id: expenseId,
      created_at: new Date().toISOString(),
    }));

    const newExpense: Expense = {
      id: expenseId,
      group_id: groupId,
      paid_by: paidBy,
      total_amount: draft.detected_amount,
      description: draft.detected_merchant,
      category: 'Detectado Gmail',
      expense_date: draft.detected_date,
      source: 'gmail',
      source_draft_id: draft.id,
      created_by: currentProfile.id,
      created_at: new Date().toISOString(),
      items: itemsList,
      splits: formattedSplits,
    };

    setExpenses((prev) => [newExpense, ...prev]);
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === draftId
          ? { ...d, status: 'confirmed', confirmed_expense_id: expenseId }
          : d
      )
    );
  };

  const discardDraft = (draftId: string) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === draftId ? { ...d, status: 'discarded' } : d))
    );
  };

  const addDraft = (data: Omit<ExpenseDraft, 'id' | 'created_at' | 'user_id' | 'status'>) => {
    const newDraft: ExpenseDraft = {
      ...data,
      id: `draft_${Date.now()}`,
      user_id: currentProfile.id,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    setDrafts((prev) => [newDraft, ...prev]);
  };

  const resetDataToSeed = () => {
    setProfiles(INITIAL_PROFILES);
    setCurrentProfile(INITIAL_PROFILES[0]);
    setGroups(INITIAL_GROUPS);
    setMembers(INITIAL_MEMBERS);
    setExpenses(INITIAL_EXPENSES);
    setDrafts(INITIAL_DRAFTS);
    setSettlements(INITIAL_SETTLEMENTS);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  };

  return (
    <ExpenseContext.Provider
      value={{
        currentProfile,
        setCurrentProfile,
        profiles,
        addProfile,
        groups,
        members,
        expenses,
        drafts,
        settlements,
        createGroup,
        addMemberToGroup,
        addExpense,
        deleteExpense,
        addSettlement,
        confirmDraft,
        discardDraft,
        addDraft,
        resetDataToSeed,
      }}
    >
      {children}
    </ExpenseContext.Provider>
  );
}

export function useExpense() {
  const context = useContext(ExpenseContext);
  if (!context) {
    throw new Error('useExpense debe usarse dentro de un ExpenseProvider');
  }
  return context;
}
