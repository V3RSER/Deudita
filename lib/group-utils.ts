import {
  Users,
  Plane,
  Home,
  Heart,
  Calendar,
  Briefcase,
  Folder,
  Calculator,
  LucideIcon
} from 'lucide-react';
import { Group, GroupCategory, Expense, Payment, Settlement } from './types';
import { calculateDirectPairwiseBalance } from './balance-utils';

export interface GroupCategoryConfig {
  id: GroupCategory;
  label: string;
  icon: LucideIcon;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

export const GROUP_CATEGORY_OPTIONS: GroupCategoryConfig[] = [
  { id: 'friends', label: 'Amigos', icon: Users, bgColor: 'bg-emerald-50', textColor: 'text-emerald-700', borderColor: 'border-emerald-200' },
  { id: 'trip', label: 'Viajes', icon: Plane, bgColor: 'bg-sky-50', textColor: 'text-sky-700', borderColor: 'border-sky-200' },
  { id: 'home', label: 'Hogar', icon: Home, bgColor: 'bg-indigo-50', textColor: 'text-indigo-700', borderColor: 'border-indigo-200' },
  { id: 'couple', label: 'Pareja', icon: Heart, bgColor: 'bg-rose-50', textColor: 'text-rose-700', borderColor: 'border-rose-200' },
  { id: 'event', label: 'Eventos', icon: Calendar, bgColor: 'bg-amber-50', textColor: 'text-amber-700', borderColor: 'border-amber-200' },
  { id: 'accounting', label: 'Contabilidad', icon: Calculator, bgColor: 'bg-purple-50', textColor: 'text-purple-700', borderColor: 'border-purple-200' },
  { id: 'work', label: 'Trabajo', icon: Briefcase, bgColor: 'bg-blue-50', textColor: 'text-blue-700', borderColor: 'border-blue-200' },
  { id: 'other', label: 'Otros', icon: Folder, bgColor: 'bg-slate-50', textColor: 'text-slate-700', borderColor: 'border-slate-200' },
];

export function getGroupCategoryConfig(category?: string): GroupCategoryConfig {
  if (!category) {
    return GROUP_CATEGORY_OPTIONS[0]; // friends / general
  }
  const cat = category.toLowerCase().trim();
  switch (cat) {
    case 'friends':
    case 'amigos':
      return GROUP_CATEGORY_OPTIONS[0];
    case 'trip':
    case 'viajes':
    case 'viaje':
    case 'travel':
      return GROUP_CATEGORY_OPTIONS[1];
    case 'home':
    case 'hogar':
    case 'house':
    case 'vivienda':
      return GROUP_CATEGORY_OPTIONS[2];
    case 'couple':
    case 'pareja':
      return GROUP_CATEGORY_OPTIONS[3];
    case 'event':
    case 'eventos':
    case 'evento':
      return GROUP_CATEGORY_OPTIONS[4];
    case 'accounting':
    case 'contabilidad':
      return GROUP_CATEGORY_OPTIONS[5];
    case 'work':
    case 'trabajo':
    case 'negocio':
    case 'business':
      return GROUP_CATEGORY_OPTIONS[6];
    case 'other':
    case 'otros':
    case 'otro':
      return GROUP_CATEGORY_OPTIONS[7];
    default:
      return GROUP_CATEGORY_OPTIONS.find((opt) => opt.id === cat) || GROUP_CATEGORY_OPTIONS[7];
  }
}

const DEFAULT_GROUP_IMAGES: Record<GroupCategory, string> = {
  trip: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=600&auto=format&fit=crop&q=80',
  home: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop&q=80',
  couple: 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=600&auto=format&fit=crop&q=80',
  event: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=600&auto=format&fit=crop&q=80',
  work: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&auto=format&fit=crop&q=80',
  friends: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&auto=format&fit=crop&q=80',
  accounting: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80',
  other: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80',
};

export const DEFAULT_GROUP_IMAGE = DEFAULT_GROUP_IMAGES.friends;

export function getGroupImage(group: Group): string {
  if (group.image_url && group.image_url.trim().length > 0) {
    return group.image_url.trim();
  }
  if (group.description && group.description.includes('[img:')) {
    const match = group.description.match(/\[img:(.*?)\]/);
    if (match && match[1] && match[1].trim().length > 0) {
      return match[1].trim();
    }
  }
  return DEFAULT_GROUP_IMAGES[group.category] || DEFAULT_GROUP_IMAGE;
}

export function getCleanGroupDescription(description?: string): string {
  if (!description) return '';
  return description.replace(/\[img:.*?\]/g, '').trim();
}

export function getGroupCategoryLabel(category?: string): string {
  return getGroupCategoryConfig(category).label;
}

export function calculatePairwiseBalance(
  userAId: string,
  userBId: string,
  expenses: Expense[],
  payments: Payment[],
  groupId?: string,
  sponsorshipMap?: Map<string, string>,
  settlements?: Settlement[]
): number {
  return calculateDirectPairwiseBalance(
    userAId,
    userBId,
    expenses,
    payments,
    groupId,
    settlements,
    sponsorshipMap
  );
}

