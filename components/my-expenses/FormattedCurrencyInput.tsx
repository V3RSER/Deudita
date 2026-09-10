'use client';

import React, { useState } from 'react';
import { formatCurrency } from '@/lib/balance-utils';
import { parseCurrencyAmount } from '@/lib/transaction-date-utils';

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

    const numVal = parseCurrencyAmount(value, currency);

    const formattedDisplay =
        value !== '' && value !== undefined && value !== null && !isNaN(numVal) && numVal >= 0
            ? (hideSymbol ? new Intl.NumberFormat('es-CO', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }).format(numVal) : formatCurrency(numVal, currency))
            : '';

    const displayValue = isFocused
        ? (editingValue !== null ? editingValue : (value !== '' && value !== undefined && value !== null ? String(value) : ''))
        : formattedDisplay;

    const parseRawValue = (raw: string): string => {
        const input = raw.trim();
        if (!input) return '';

        const sanitized = input.replace(/[^0-9.,]/g, '');
        if (!sanitized) return '';

        const lastComma = sanitized.lastIndexOf(',');
        const lastDot = sanitized.lastIndexOf('.');
        const hasComma = lastComma >= 0;
        const hasDot = lastDot >= 0;

        let normalized: string;
        if (hasComma && hasDot) {
            const decimalSeparator = lastComma > lastDot ? ',' : '.';
            const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
            normalized = sanitized.replaceAll(thousandsSeparator, '');
            const separatorIndex = normalized.lastIndexOf(decimalSeparator);
            normalized = separatorIndex >= 0
                ? `${normalized.slice(0, separatorIndex).replaceAll(decimalSeparator, '')}.${normalized.slice(separatorIndex + 1).replaceAll(decimalSeparator, '')}`
                : normalized.replaceAll(decimalSeparator, '');
        } else if (hasComma || hasDot) {
            const separator = hasComma ? ',' : '.';
            const separatorIndex = sanitized.lastIndexOf(separator);
            const digitsAfter = sanitized.length - separatorIndex - 1;
            const occurrences = sanitized.split(separator).length - 1;

            if (occurrences > 1 || digitsAfter === 3) {
                normalized = sanitized.replaceAll(separator, '');
            } else {
                normalized = `${sanitized.slice(0, separatorIndex).replaceAll(separator, '')}.${sanitized.slice(separatorIndex + 1)}`;
            }
        } else {
            normalized = sanitized;
        }

        return normalized;
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
