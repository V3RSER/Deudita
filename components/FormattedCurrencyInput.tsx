'use client';

import React, { useState } from 'react';
import { formatCurrency } from '@/lib/balance-utils';

interface FormattedCurrencyInputProps {
  value: string | number;
  onChange: (val: string) => void;
  currency?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  autoFocus?: boolean;
  hideSymbol?: boolean;
}

export function FormattedCurrencyInput({
  value,
  onChange,
  currency = 'COP',
  placeholder = '0',
  className = '',
  required = false,
  disabled = false,
  id,
  autoFocus = false,
  hideSymbol = false,
}: FormattedCurrencyInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [editingValue, setEditingValue] = useState<string | null>(null);

  const numVal = typeof value === 'number' ? value : parseFloat(String(value)) || 0;

  const formattedDisplay =
    value !== '' && value !== undefined && value !== null && !isNaN(numVal) && numVal > 0
      ? (hideSymbol ? new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(numVal) : formatCurrency(numVal, currency))
      : '';

  const displayValue = isFocused
    ? (editingValue !== null ? editingValue : (value ? String(value) : ''))
    : formattedDisplay;

  const parseRawValue = (raw: string): string => {
    let s = raw.trim();
    if (!s) return '';
    // If it has multiple dots, or dots followed by 3 digits (e.g. 150.000 or 1.500.000), treat dots as thousand separators
    if (/\.\d{3}/.test(s) && !/\.\d{1,2}$/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(',', '.');
    }
    return s.replace(/[^0-9.]/g, '');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleanRaw = parseRawValue(raw);
    setEditingValue(raw);
    onChange(cleanRaw);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setEditingValue(null);
  };

  const handleFocus = () => {
    setIsFocused(true);
    setEditingValue(value ? String(value) : '');
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      required={required}
      disabled={disabled}
      autoFocus={false}
      value={displayValue}
      onChange={handleInputChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
    />
  );
}
