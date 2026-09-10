'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export interface SelectOption {
    value: string;
    label: string;
    description?: string;
    icon?: React.ReactNode;
    disabled?: boolean;
}

export interface SelectGroup {
    group: string;
    options: SelectOption[];
}

export type SelectItem = SelectOption | SelectGroup;

export interface CustomSelectProps {
    id?: string;
    value?: string;
    onChange: (value: string) => void;
    options: SelectItem[];
    placeholder?: string;
    disabled?: boolean;
    searchable?: boolean;
    className?: string;
    triggerClassName?: string;
    dropdownClassName?: string;
    size?: 'sm' | 'md' | 'lg';
    ariaLabel?: string;
    renderTrigger?: (selected: SelectOption | undefined, isOpen: boolean) => React.ReactNode;
}

function isGroup(item: SelectItem): item is SelectGroup {
    return 'group' in item && Array.isArray((item as SelectGroup).options);
}

function getFirstEnabledIndex(options: SelectOption[], preferredIndex = 0) {
    if (options.length === 0) return -1;
    if (preferredIndex >= 0 && preferredIndex < options.length && !options[preferredIndex].disabled) {
        return preferredIndex;
    }
    const forward = options.findIndex((option) => !option.disabled);
    return forward >= 0 ? forward : -1;
}

function getNextEnabledIndex(options: SelectOption[], currentIndex: number, direction: 1 | -1) {
    if (options.length === 0) return -1;

    let nextIndex = currentIndex;
    for (let step = 0; step < options.length; step += 1) {
        nextIndex = (nextIndex + direction + options.length) % options.length;
        if (!options[nextIndex].disabled) return nextIndex;
    }

    return currentIndex;
}

export function CustomSelect({
    id,
    value,
    onChange,
    options,
    placeholder = 'Seleccionar...',
    disabled = false,
    searchable,
    className = '',
    triggerClassName = '',
    dropdownClassName = '',
    size = 'md',
    ariaLabel,
    renderTrigger,
}: Readonly<CustomSelectProps>) {
    const [isOpen, setIsOpen] = useState(false);
    const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
    const [searchQuery, setSearchQuery] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const triggerRef = useRef<HTMLElement>(null);
    const generatedId = useId();
    const selectId = id || generatedId;
    const listboxId = `${selectId}-listbox`;

    const flatOptions = useMemo(() => {
        const list: SelectOption[] = [];
        options.forEach((item) => {
            if (isGroup(item)) {
                item.options.forEach((opt) => list.push(opt));
            } else {
                list.push(item);
            }
        });
        return list;
    }, [options]);

    const selectedOption = useMemo(
        () => flatOptions.find((opt) => opt.value === value),
        [flatOptions, value]
    );

    const shouldShowSearch = searchable ?? flatOptions.length > 7;

    const filteredOptions = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return options;

        const result: SelectItem[] = [];
        options.forEach((item) => {
            if (isGroup(item)) {
                const matchingGroupOpts = item.options.filter(
                    (opt) =>
                        opt.label.toLowerCase().includes(query) ||
                        opt.description?.toLowerCase().includes(query) ||
                        item.group.toLowerCase().includes(query)
                );
                if (matchingGroupOpts.length > 0) {
                    result.push({ group: item.group, options: matchingGroupOpts });
                }
            } else if (
                item.label.toLowerCase().includes(query) ||
                item.description?.toLowerCase().includes(query)
            ) {
                result.push(item);
            }
        });
        return result;
    }, [options, searchQuery]);

    const filteredFlatList = useMemo(() => {
        const list: SelectOption[] = [];
        filteredOptions.forEach((item) => {
            if (isGroup(item)) {
                item.options.forEach((opt) => list.push(opt));
            } else {
                list.push(item);
            }
        });
        return list;
    }, [filteredOptions]);

    const openDropdown = () => {
        if (disabled) return;

        if (typeof window !== 'undefined' && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            setPlacement(spaceBelow < 280 && rect.top > 280 ? 'top' : 'bottom');
        }

        const selectedIndex = filteredFlatList.findIndex((opt) => opt.value === value);
        setHighlightedIndex(getFirstEnabledIndex(filteredFlatList, selectedIndex >= 0 ? selectedIndex : 0));
        setSearchQuery('');
        setIsOpen(true);
    };

    const closeDropdown = () => {
        setIsOpen(false);
        setSearchQuery('');
    };

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchQuery('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !shouldShowSearch) return;
        const timer = window.setTimeout(() => searchInputRef.current?.focus(), 50);
        return () => window.clearTimeout(timer);
    }, [isOpen, shouldShowSearch]);

    useEffect(() => {
        if (!isOpen) return;
        setHighlightedIndex((current) => getFirstEnabledIndex(filteredFlatList, current));
    }, [filteredFlatList, isOpen]);

    const handleSelect = (option: SelectOption) => {
        if (option.disabled) return;
        onChange(option.value);
        closeDropdown();
        triggerRef.current?.focus();
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (disabled) return;

        if (!isOpen) {
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                openDropdown();
            }
            return;
        }

        switch (event.key) {
            case 'Escape':
                event.preventDefault();
                closeDropdown();
                triggerRef.current?.focus();
                break;
            case 'ArrowDown':
                event.preventDefault();
                setHighlightedIndex((prev) => getNextEnabledIndex(filteredFlatList, prev, 1));
                break;
            case 'ArrowUp':
                event.preventDefault();
                setHighlightedIndex((prev) => getNextEnabledIndex(filteredFlatList, prev, -1));
                break;
            case 'Enter':
                event.preventDefault();
                if (highlightedIndex >= 0 && highlightedIndex < filteredFlatList.length) {
                    handleSelect(filteredFlatList[highlightedIndex]);
                }
                break;
            default:
                break;
        }
    };

    const sizeStyles = {
        sm: 'h-8 px-2.5 text-xs rounded-lg',
        md: 'h-9 px-3 text-xs sm:text-[13px] rounded-xl',
        lg: 'h-11 px-3.5 text-sm rounded-xl',
    };

    let flatIndex = -1;

    return (
        <div
            ref={containerRef}
            className={`relative inline-block w-full text-left select-none ${className}`}
            onKeyDown={handleKeyDown}
        >
            {renderTrigger ? (
                <div
                    id={selectId}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? listboxId : undefined}
                    aria-label={ariaLabel || selectedOption?.label || placeholder}
                    onClick={() => !disabled && (isOpen ? closeDropdown() : openDropdown())}
                    className={`cursor-pointer ${disabled ? 'opacity-50 pointer-events-none' : ''} ${triggerClassName}`}
                >
                    {renderTrigger(selectedOption, isOpen)}
                </div>
            ) : (
                <button
                    type="button"
                    id={selectId}
                    ref={triggerRef}
                    aria-haspopup="listbox"
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? listboxId : undefined}
                    aria-label={ariaLabel || selectedOption?.label || placeholder}
                    disabled={disabled}
                    onClick={() => !disabled && (isOpen ? closeDropdown() : openDropdown())}
                    className={`w-full flex items-center justify-between gap-2 border bg-white text-zinc-900 shadow-2xs transition-all duration-150 cursor-pointer ${sizeStyles[size]}
                        ${isOpen ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50'}
                        ${disabled ? 'opacity-50 cursor-not-allowed bg-zinc-100' : ''} ${triggerClassName}`}
                >
                    <div className="flex items-center gap-2 min-w-0 flex-1 text-left">
                        {selectedOption?.icon && <span className="shrink-0 text-zinc-500">{selectedOption.icon}</span>}
                        <span className={`truncate font-semibold ${selectedOption ? 'text-zinc-900' : 'text-zinc-400 font-normal'}`}>
                            {selectedOption ? selectedOption.label : placeholder}
                        </span>
                    </div>
                    <ChevronDown className={`shrink-0 w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-600' : ''}`} />
                </button>
            )}

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: placement === 'top' ? 4 : -4, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: placement === 'top' ? 4 : -4, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className={`absolute z-50 left-0 right-0 ${placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} min-w-[180px] bg-white border border-zinc-200/90 rounded-xl shadow-xl overflow-hidden backdrop-blur-xs p-1 ${dropdownClassName}`}
                        style={{ maxHeight: '280px' }}
                    >
                        {shouldShowSearch && (
                            <div className="p-1.5 border-b border-zinc-100">
                                <div className="relative flex items-center">
                                    <Search className="absolute left-2.5 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        value={searchQuery}
                                        onChange={(event) => setSearchQuery(event.target.value)}
                                        placeholder="Buscar..."
                                        aria-label="Buscar opciones"
                                        className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:bg-white"
                                    />
                                </div>
                            </div>
                        )}

                        <div
                            id={listboxId}
                            role="listbox"
                            aria-labelledby={selectId}
                            aria-activedescendant={highlightedIndex >= 0 ? `${selectId}-option-${filteredFlatList[highlightedIndex]?.value}` : undefined}
                            className="max-h-56 overflow-y-auto overscroll-contain py-0.5 space-y-0.5 no-scrollbar"
                        >
                            {filteredOptions.length === 0 ? (
                                <div className="py-4 text-center text-xs text-zinc-400 font-medium">No se encontraron resultados</div>
                            ) : (
                                filteredOptions.map((item, groupIndex) => {
                                    if (isGroup(item)) {
                                        return (
                                            <div key={`group-${item.group}-${groupIndex}`} className="pt-1.5 first:pt-0">
                                                <div className="px-2.5 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                                    {item.group}
                                                </div>
                                                <div className="space-y-0.5">
                                                    {item.options.map((option) => {
                                                        flatIndex += 1;
                                                        const optionIndex = flatIndex;
                                                        const isSelected = option.value === value;
                                                        return (
                                                            <OptionRow
                                                                key={option.value}
                                                                option={option}
                                                                isSelected={isSelected}
                                                                isHighlighted={optionIndex === highlightedIndex}
                                                                onSelect={() => handleSelect(option)}
                                                                optionId={`${selectId}-option-${optionIndex}`}
                                                                onMouseEnter={() => !option.disabled && setHighlightedIndex(optionIndex)}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    }

                                    flatIndex += 1;
                                    const optionIndex = flatIndex;
                                    const isSelected = item.value === value;
                                    return (
                                        <OptionRow
                                            key={item.value}
                                            option={item}
                                            isSelected={isSelected}
                                            isHighlighted={optionIndex === highlightedIndex}
                                            onSelect={() => handleSelect(item)}
                                            optionId={`${selectId}-option-${item.value}`}
                                            onMouseEnter={() => !item.disabled && setHighlightedIndex(optionIndex)}
                                        />
                                    );
                                })
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function OptionRow({
    option,
    isSelected,
    isHighlighted,
    onSelect,
    optionId,
    onMouseEnter,
}: {
    option: SelectOption;
    isSelected: boolean;
    isHighlighted: boolean;
    onSelect: () => void;
    optionId: string;
    onMouseEnter: () => void;
}) {
    return (
        <button
            type="button"
            role="option"
            id={optionId}
            aria-selected={isSelected}
            aria-disabled={option.disabled || undefined}
            disabled={option.disabled}
            onClick={onSelect}
            onMouseEnter={onMouseEnter}
            className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors duration-100 text-left ${option.disabled
                ? 'opacity-40 cursor-not-allowed text-zinc-400'
                : isSelected
                    ? 'bg-emerald-50 text-emerald-950 font-semibold'
                    : isHighlighted
                        ? 'bg-zinc-100 text-zinc-900'
                        : 'text-zinc-700 hover:bg-zinc-100/80 hover:text-zinc-900'
                }`}
        >
            <span className="flex items-center gap-2 min-w-0 flex-1">
                {option.icon && <span className="shrink-0">{option.icon}</span>}
                <span className="truncate">
                    <span className="block truncate">{option.label}</span>
                    {option.description && <span className="block text-[10px] text-zinc-400 font-normal truncate">{option.description}</span>}
                </span>
            </span>
            {isSelected && <Check className="shrink-0 w-3.5 h-3.5 text-emerald-600 ml-1.5" />}
        </button>
    );
}
