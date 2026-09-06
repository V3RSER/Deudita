import React from 'react';
import { SplitSquareHorizontal } from 'lucide-react';

export type DeuditaLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface DeuditaLogoProps {
  size?: DeuditaLogoSize;
  className?: string;
  iconClassName?: string;
  withHoverEffect?: boolean;
  showText?: boolean;
  textClassName?: string;
}

const sizeConfig: Record<
  DeuditaLogoSize,
  { container: string; icon: string; text: string }
> = {
  xs: {
    container: 'w-6 h-6 rounded-lg',
    icon: 'w-3.5 h-3.5',
    text: 'text-sm',
  },
  sm: {
    container: 'w-8 h-8 rounded-lg',
    icon: 'w-4 h-4',
    text: 'text-base',
  },
  md: {
    container: 'w-9 h-9 rounded-xl',
    icon: 'w-5 h-5',
    text: 'text-lg',
  },
  lg: {
    container: 'w-12 h-12 rounded-xl',
    icon: 'w-6 h-6',
    text: 'text-2xl',
  },
  xl: {
    container: 'w-16 h-16 rounded-2xl',
    icon: 'w-8 h-8',
    text: 'text-3xl',
  },
  '2xl': {
    container: 'w-20 h-20 rounded-3xl',
    icon: 'w-10 h-10',
    text: 'text-4xl',
  },
};

export function DeuditaLogo({
  size = 'md',
  className = '',
  iconClassName = '',
  withHoverEffect = false,
  showText = false,
  textClassName = '',
}: DeuditaLogoProps) {
  const config = sizeConfig[size] || sizeConfig.md;

  const logoIcon = (
    <div
      className={`bg-zinc-950 flex items-center justify-center shadow-xs shrink-0 ${config.container} ${
        withHoverEffect ? 'group-hover:scale-105 transition-transform duration-300' : ''
      } ${className}`}
    >
      <SplitSquareHorizontal className={`text-white ${config.icon} ${iconClassName}`} />
    </div>
  );

  if (!showText) {
    return logoIcon;
  }

  return (
    <div className="flex items-center space-x-2.5">
      {logoIcon}
      <span
        className={`font-bold text-zinc-900 leading-tight tracking-tight ${config.text} ${textClassName}`}
      >
        Deudita
      </span>
    </div>
  );
}

export default DeuditaLogo;
