'use client';

import React from 'react';
import Image from 'next/image';
import { Profile } from '@/lib/types';

export type AvatarBadge = 'debe' | 'aportó' | 'pago' | null;

interface UserAvatarProps {
  profile?: Partial<Profile> | null;
  name?: string | null;
  email?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
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
  };

  const imageSizes = {
    xs: 24,
    sm: 28,
    md: 36,
    lg: 40,
  };

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`}>
      <div
        className={`${sizeStyles[size]} rounded-full bg-zinc-100 border border-zinc-200/70 overflow-hidden flex items-center justify-center font-bold text-zinc-800 select-none shadow-2xs`}
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
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-[#f43f5e] text-white text-[8.5px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full leading-tight shadow-xs whitespace-nowrap">
          DEBE
        </span>
      )}

      {(badge === 'aportó' || badge === 'pago') && (
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[8.5px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full leading-tight shadow-xs whitespace-nowrap">
          {badge === 'pago' ? 'PAGÓ' : 'APORTÓ'}
        </span>
      )}
    </div>
  );
}
