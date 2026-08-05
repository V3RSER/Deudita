import { Group, GroupMember, Profile, Expense, ExpenseDraft, Settlement } from './types';

export const INITIAL_PROFILES: Profile[] = [
  {
    id: 'usr_me',
    email: 'carlos.mendoza@gmail.com',
    full_name: 'Carlos Mendoza (Tú)',
    avatar_url: 'https://picsum.photos/seed/carlos/120/120',
    created_at: '2026-01-10T10:00:00Z',
  },
  {
    id: 'usr_ana',
    email: 'ana.silva@gmail.com',
    full_name: 'Ana Silva',
    avatar_url: 'https://picsum.photos/seed/ana/120/120',
    created_at: '2026-01-12T11:30:00Z',
  },
  {
    id: 'usr_mateo',
    email: 'mateo.rossi@gmail.com',
    full_name: 'Mateo Rossi',
    avatar_url: 'https://picsum.photos/seed/mateo/120/120',
    created_at: '2026-01-15T14:20:00Z',
  },
  {
    id: 'usr_sofia',
    email: 'sofia.gomez@gmail.com',
    full_name: 'Sofía Gómez',
    avatar_url: 'https://picsum.photos/seed/sofia/120/120',
    created_at: '2026-01-18T09:15:00Z',
  },
  {
    id: 'usr_lucas',
    email: 'lucas.fernandez@gmail.com',
    full_name: 'Lucas Fernández',
    avatar_url: 'https://picsum.photos/seed/lucas/120/120',
    created_at: '2026-01-20T16:45:00Z',
  },
];

export const INITIAL_GROUPS: Group[] = [];

export const INITIAL_MEMBERS: GroupMember[] = [];

export const INITIAL_EXPENSES: Expense[] = [];

export const INITIAL_SETTLEMENTS: Settlement[] = [];

export const INITIAL_DRAFTS: ExpenseDraft[] = [];
