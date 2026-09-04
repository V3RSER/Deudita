'use client';

import React from 'react';
import Image from 'next/image';
import { Profile } from '@/lib/types';

export type AvatarBadge = 'debe' | 'aportó' | 'pago' | null;

interface UserAvatarProps {
  profile?: Partial<Profile> | null;
  name?: string | null;
  email?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  badge?: AvatarBadge;
  className?: string;
}

export function UserAvatar({
  profile,
  name,
  email,
  size = 'md',
  badge,
  className = '',
}: UserAvatarProps) {
  const displayName = profile?.full_name || name || profile?.email || email || 'Usuario';
  const initial = (displayName.trim()[0] || 'U').toUpperCase();
  const avatarUrl = profile?.avatar_url;

  const sizeStyles = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-10 h-10 text-base',
    xl: 'w-12 h-12 text-lg',
  };

  const imageSizes = {
    xs: 24,
    sm: 28,
    md: 36,
    lg: 40,
    xl: 48,
  };

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <div
        className={`${sizeStyles[size]} rounded-full bg-white border border-zinc-300 overflow-hidden flex items-center justify-center font-bold text-zinc-900 select-none shadow-2xs`}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={displayName}
            width={imageSizes[size]}
            height={imageSizes[size]}
            className="w-full h-full object-cover"
            unoptimized
          />
        ) : (
          <span>{initial}</span>
        )}
      </div>

      {badge === 'debe' && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-[#dc2626] sm:bg-[#e11d48] text-white text-[8px] font-bold px-1.5 py-0.2 rounded-full leading-tight shadow-xs whitespace-nowrap lowercase">
          debe
        </span>
      )}

      {(badge === 'aportó' || badge === 'pago') && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[8px] font-bold px-1.5 py-0.2 rounded-full leading-tight shadow-xs whitespace-nowrap lowercase">
          {badge === 'pago' ? 'pagó' : 'aportó'}
        </span>
      )}
    </div>
  );
}
