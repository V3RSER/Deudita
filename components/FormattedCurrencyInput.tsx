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
}: FormattedCurrencyInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [editingValue, setEditingValue] = useState<string | null>(null);

  const numVal = typeof value === 'number' ? value : parseFloat(String(value)) || 0;

  const formattedDisplay =
    value !== '' && value !== undefined && value !== null && !isNaN(numVal) && numVal > 0
      ? formatCurrency(numVal, currency)
      : '';

  const displayValue = isFocused
    ? (editingValue !== null ? editingValue : (value ? String(value) : ''))
    : formattedDisplay;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleanRaw = raw.replace(/[^0-9.,]/g, '').replace(',', '.');
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
      autoFocus={autoFocus}
      value={displayValue}
      onChange={handleInputChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
    />
  );
}
