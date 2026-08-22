import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isTempEmail(email?: string | null): boolean {
  if (!email) return true;
  const e = email.trim().toLowerCase();
  return e.startsWith('temp_') || e.endsWith('@deudita.app');
}

export function formatDisplayEmail(email?: string | null): string {
  if (!email || typeof email !== 'string') return '';
  const clean = email.trim();
  if (!clean || isTempEmail(clean)) {
    return '';
  }
  return clean;
}

export function isTempProfile(profile?: { is_temp?: boolean; email?: string | null } | null): boolean {
  if (!profile) return false;
  if (typeof profile.is_temp === 'boolean') {
    return profile.is_temp;
  }
  return isTempEmail(profile.email);
}

export function getBaseUrl(req?: Request | Headers): string {
  // 1. Check environment variables
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.replace(/\/+$/, '');
  }

  // 2. Derive dynamically from request headers if available
  if (req) {
    const headers = 'headers' in req ? req.headers : req;
    const origin = headers.get('origin');
    if (origin && origin.trim() !== '') {
      return origin.replace(/\/+$/, '');
    }

    const host = headers.get('x-forwarded-host') || headers.get('host');
    if (host && host.trim() !== '') {
      const proto = headers.get('x-forwarded-proto') || 'https';
      return `${proto}://${host}`.replace(/\/+$/, '');
    }
  }

  // 3. Browser environment fallback
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return '';
}


