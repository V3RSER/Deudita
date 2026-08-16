import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200/80 mb-5">
      <div className="space-y-1">
        <div className="flex items-center space-x-2.5">
          {icon && (
            <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600">
              {icon}
            </div>
          )}
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
            {title}
          </h1>
        </div>
        {subtitle && (
          <p className="text-xs sm:text-sm text-zinc-500 max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
