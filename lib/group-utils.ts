import { Group } from './types';

export function getGroupImage(group: Group): string | undefined {
  if (group.image_url && group.image_url.trim().length > 0) {
    return group.image_url.trim();
  }
  if (group.description && group.description.includes('[img:')) {
    const match = group.description.match(/\[img:(.*?)\]/);
    if (match && match[1] && match[1].trim().length > 0) {
      return match[1].trim();
    }
  }
  return undefined;
}

export function getCleanGroupDescription(description?: string): string {
  if (!description) return '';
  return description.replace(/\[img:.*?\]/g, '').trim();
}
