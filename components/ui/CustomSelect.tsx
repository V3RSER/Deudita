'use client';

import React, { useState, useRef, useEffect, useMemo, useId } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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
}

function isGroup(item: SelectItem): item is SelectGroup {
  return 'group' in item && Array.isArray((item as SelectGroup).options);
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
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const generatedId = useId();
  const selectId = id || generatedId;

  // Flatten options for selection logic and search
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

  // Find currently selected option
  const selectedOption = useMemo(() => {
    return flatOptions.find((opt) => opt.value === value);
  }, [flatOptions, value]);

  // Determine if search should be enabled (explicit prop or > 7 items)
  const shouldShowSearch = searchable ?? (flatOptions.length > 7);

  // Filter items based on search query
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
          result.push({
            group: item.group,
            options: matchingGroupOpts,
          });
        }
      } else {
        if (
          item.label.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query)
        ) {
          result.push(item);
        }
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
      if (spaceBelow < 280 && rect.top > 280) {
        setPlacement('top');
      } else {
        setPlacement('bottom');
      }
    }
    const idx = filteredFlatList.findIndex((opt) => opt.value === value);
    setHighlightedIndex(idx >= 0 ? idx : 0);
    setSearchQuery('');
    setIsOpen(true);
  };

  const closeDropdown = () => {
    setIsOpen(false);
    setSearchQuery('');
  };

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && shouldShowSearch) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, shouldShowSearch]);

  const handleSelect = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    closeDropdown();
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown();
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredFlatList.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredFlatList.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredFlatList.length) {
        handleSelect(filteredFlatList[highlightedIndex]);
      }
    }
  };

  // Size configurations
  const sizeStyles = {
    sm: 'h-8 px-2.5 text-xs rounded-lg',
    md: 'h-9 px-3 text-xs sm:text-[13px] rounded-xl',
    lg: 'h-11 px-3.5 text-sm rounded-xl',
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-block w-full text-left select-none ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        type="button"
        id={selectId}
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || placeholder}
        disabled={disabled}
        onClick={() => !disabled && (isOpen ? closeDropdown() : openDropdown())}
        className={`w-full flex items-center justify-between gap-2 border bg-white text-zinc-900 shadow-2xs transition-all duration-150 cursor-pointer ${
          sizeStyles[size]
        } ${
          isOpen
            ? 'border-emerald-500 ring-2 ring-emerald-500/20'
            : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/50'
        } ${disabled ? 'opacity-50 cursor-not-allowed bg-zinc-100' : ''} ${triggerClassName}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 text-left">
          {selectedOption?.icon && (
            <span className="shrink-0 text-zinc-500">{selectedOption.icon}</span>
          )}
          <span
            className={`truncate font-semibold ${
              selectedOption ? 'text-zinc-900' : 'text-zinc-400 font-normal'
            }`}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          className={`shrink-0 w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-emerald-600' : ''
          }`}
        />
      </button>

      {/* Floating Custom Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: placement === 'top' ? 4 : -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: placement === 'top' ? 4 : -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={`absolute z-50 left-0 right-0 ${
              placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
            } min-w-[180px] bg-white border border-zinc-200/90 rounded-xl shadow-xl overflow-hidden backdrop-blur-xs p-1 ${dropdownClassName}`}
            style={{ maxHeight: '280px' }}
          >
            {/* Optional search field */}
            {shouldShowSearch && (
              <div className="p-1.5 border-b border-zinc-100">
                <div className="relative flex items-center">
                  <Search className="absolute left-2.5 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setHighlightedIndex(0);
                    }}
                    placeholder="Buscar..."
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </div>
              </div>
            )}

            {/* Listbox Options Container */}
            <div
              role="listbox"
              aria-labelledby={selectId}
              className="max-h-56 overflow-y-auto overscroll-contain py-0.5 space-y-0.5 no-scrollbar"
            >
              {filteredOptions.length === 0 ? (
                <div className="py-4 text-center text-xs text-zinc-400 font-medium">
                  No se encontraron resultados
                </div>
              ) : (
                filteredOptions.map((item, groupIdx) => {
                  if (isGroup(item)) {
                    return (
                      <div key={`group-${groupIdx}`} className="pt-1.5 first:pt-0">
                        <div className="px-2.5 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                          {item.group}
                        </div>
                        <div className="space-y-0.5">
                          {item.options.map((opt) => {
                            const isSelected = opt.value === value;
                            return (
                              <OptionRow
                                key={opt.value}
                                option={opt}
                                isSelected={isSelected}
                                onSelect={() => handleSelect(opt)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  const isSelected = item.value === value;
                  return (
                    <OptionRow
                      key={item.value}
                      option={item}
                      isSelected={isSelected}
                      onSelect={() => handleSelect(item)}
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
  onSelect,
}: {
  option: SelectOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={onSelect}
      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors duration-100 ${
        option.disabled
          ? 'opacity-40 cursor-not-allowed text-zinc-400'
          : isSelected
          ? 'bg-emerald-50 text-emerald-950 font-semibold'
          : 'text-zinc-700 hover:bg-zinc-100/80 hover:text-zinc-900'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {option.icon && <span className="shrink-0">{option.icon}</span>}
        <div className="truncate">
          <span className="block truncate">{option.label}</span>
          {option.description && (
            <span className="block text-[10px] text-zinc-400 font-normal truncate">
              {option.description}
            </span>
          )}
        </div>
      </div>
      {isSelected && (
        <Check className="shrink-0 w-3.5 h-3.5 text-emerald-600 ml-1.5" />
      )}
    </div>
  );
}
