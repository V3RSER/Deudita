'use client';

import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, Info, Loader2, Trash2, X } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
    isLoading?: boolean;
}

export function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmText = 'Eliminar',
    cancelText = 'Cancelar',
    variant = 'danger',
    isLoading = false,
}: Readonly<ConfirmModalProps>) {
    const titleId = useId();
    const descriptionId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    const previousActiveElementRef = useRef<HTMLElement | null>(null);
    const onCloseRef = useRef(onClose);
    const isLoadingRef = useRef(isLoading);

    useEffect(() => {
        onCloseRef.current = onClose;
        isLoadingRef.current = isLoading;
    }, [onClose, isLoading]);

    useEffect(() => {
        if (!isOpen) return;

        previousActiveElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        requestAnimationFrame(() => cancelButtonRef.current?.focus());

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (!isLoadingRef.current) {
                    event.preventDefault();
                    onCloseRef.current();
                }
                return;
            }

            if (event.key !== 'Tab' || !dialogRef.current) return;

            const focusable = Array.from(
                dialogRef.current.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )
            );

            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    useEffect(() => {
        if (isOpen || !previousActiveElementRef.current) return;
        previousActiveElementRef.current.focus();
        previousActiveElementRef.current = null;
    }, [isOpen]);

    if (!isOpen) return null;

    const variantConfig = {
        danger: {
            icon: <Trash2 className="w-6 h-6" />,
            iconClass: 'bg-rose-100 text-rose-600',
            confirmClass: 'bg-rose-600 hover:bg-rose-700',
        },
        warning: {
            icon: <AlertTriangle className="w-6 h-6" />,
            iconClass: 'bg-amber-100 text-amber-600',
            confirmClass: 'bg-amber-600 hover:bg-amber-700',
        },
        info: {
            icon: <Info className="w-6 h-6" />,
            iconClass: 'bg-sky-100 text-sky-600',
            confirmClass: 'bg-sky-600 hover:bg-sky-700',
        },
    }[variant];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm animate-in fade-in duration-150"
            aria-hidden="false"
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                className="bg-white rounded-3xl ring-1 ring-zinc-200 shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-150 p-6 space-y-5"
            >
                <div className="flex items-start justify-between">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${variantConfig.iconClass}`}>
                        {variantConfig.icon}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        aria-label="Cerrar diálogo"
                        className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-full hover:bg-zinc-100 transition-colors disabled:opacity-50"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-1.5">
                    <h3 id={titleId} className="text-base font-bold text-zinc-900 tracking-tight">{title}</h3>
                    <p id={descriptionId} className="text-xs text-zinc-500 leading-relaxed">{description}</p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-2">
                    <button
                        type="button"
                        ref={cancelButtonRef}
                        onClick={onClose}
                        disabled={isLoading}
                        className="w-full py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-semibold text-xs rounded-xl transition-all active:scale-95 disabled:opacity-50"
                    >
                        {cancelText}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={`w-full py-2.5 px-4 font-semibold text-xs rounded-xl text-white shadow-sm transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-1.5 ${variantConfig.confirmClass}`}
                    >
                        {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1 text-white" />}
                        <span>{isLoading ? 'Procesando...' : confirmText}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
