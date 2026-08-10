import { Group, GroupCategory, Expense, Payment } from './types';

export const DEFAULT_GROUP_IMAGES: Record<GroupCategory, string> = {
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
  if (!category) return 'General';
  const cat = category.toLowerCase().trim();
  switch (cat) {
    case 'friends':
    case 'amigos':
      return 'Amigos';
    case 'trip':
    case 'viajes':
    case 'viaje':
    case 'travel':
      return 'Viajes';
    case 'home':
    case 'hogar':
    case 'house':
    case 'vivienda':
      return 'Hogar';
    case 'couple':
    case 'pareja':
      return 'Pareja';
    case 'event':
    case 'eventos':
    case 'evento':
      return 'Eventos';
    case 'accounting':
    case 'contabilidad':
      return 'Contabilidad';
    case 'work':
    case 'trabajo':
    case 'negocio':
    case 'business':
      return 'Trabajo';
    case 'other':
    case 'otros':
    case 'otro':
      return 'Otros';
    default:
      return category.charAt(0).toUpperCase() + category.slice(1);
  }
}

export function calculatePairwiseBalance(
  userAId: string,
  userBId: string,
  expenses: Expense[],
  payments: Payment[],
  groupId?: string
): number {
  if (!userAId || !userBId || userAId === userBId) return 0;

  let balance = 0; // Positive = userB owes userA. Negative = userA owes userB.

  for (const exp of expenses) {
    if (groupId && exp.group_id !== groupId) continue;

    if (exp.paid_by === userAId && exp.splits) {
      const splitB = exp.splits.find((s) => s.user_id === userBId);
      if (splitB) {
        balance += Number(splitB.amount_owed || 0);
      }
    }

    if (exp.paid_by === userBId && exp.splits) {
      const splitA = exp.splits.find((s) => s.user_id === userAId);
      if (splitA) {
        balance -= Number(splitA.amount_owed || 0);
      }
    }
  }

  for (const p of payments) {
    if (groupId && p.group_id !== groupId) continue;

    if (p.paid_by === userAId && p.paid_to === userBId) {
      balance += Number(p.amount || 0);
    }

    if (p.paid_by === userBId && p.paid_to === userAId) {
      balance -= Number(p.amount || 0);
    }
  }

  return balance;
}

