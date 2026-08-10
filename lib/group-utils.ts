import { Group } from './types';

export const DEFAULT_GROUP_IMAGE =
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&auto=format&fit=crop&q=80';

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
  return DEFAULT_GROUP_IMAGE;
}

export function getCleanGroupDescription(description?: string): string {
  if (!description) return '';
  return description.replace(/\[img:.*?\]/g, '').trim();
}
