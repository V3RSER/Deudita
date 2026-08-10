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
  if (isTempEmail(email)) {
    return 'Sin correo asignado';
  }
  return email!;
}

