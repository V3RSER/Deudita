'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    Check,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Inbox,
    Loader2,
    MailCheck,
    Search,
    Trash2,
    Users,
} from 'lucide-react';
import { useExpense } from '@/lib/expense-context';
import { Expense, ExpenseDraft } from '@/lib/types';
import { formatCurrency } from '@/lib/balance-utils';

interface UnifiedDraftsAndTemplatesViewProps {
    initialTab?: 'drafts' | 'catalog';
    onOpenConfirmDraft: (draft: ExpenseDraft) => void;
}

function formatEntity(entity?: string | null): string {
    if (!entity) return 'BANCO';
    const clean = entity.trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
        return 'BANCO';
    }
    return clean.toUpperCase();
}

function formatDraftDateTime(dateStr?: string | null, timeStr?: string | null): string {
    if (!dateStr && !timeStr) return 'Sin fecha';

    let displayDate = '';
    if (dateStr) {
        const cleanDate = dateStr.trim();
        try {
            const parts = cleanDate.split('-');
            if (parts.length === 3) {
                const [y, m, d] = parts;
                const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
                displayDate = dateObj.toLocaleDateString('es-CO', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                });
            } else {
                displayDate = cleanDate;
            }
        } catch {
            displayDate = cleanDate;
        }
    }

    let displayTime = '';
    if (timeStr) {
        const cleanT = timeStr.trim();
        if (cleanT.includes('T')) {
            const dateFromIso = new Date(cleanT);
            if (!isNaN(dateFromIso.getTime())) {
                const hh = String(dateFromIso.getUTCHours()).padStart(2, '0');
                const mm = String(dateFromIso.getUTCMinutes()).padStart(2, '0');
                displayTime = `${hh}:${mm}`;
            }
        } else {
            const m = cleanT.match(/\b\d{2}:\d{2}\b/);
            displayTime = m ? m[0] : cleanT.slice(0, 5);
        }
    }

    if (displayDate && displayTime) {
        return `${displayDate} · ${displayTime}`;
    }
    return displayDate || displayTime || 'Sin fecha';
}

export function UnifiedDraftsAndTemplatesView({
    onOpenConfirmDraft,
}: UnifiedDraftsAndTemplatesViewProps) {
    const { drafts, expenses, userGroups, discardDraft } = useExpense();

    // Drafts filtering & search
    const [statusFilter, setStatusFilter] = useState<'pending' | 'confirmed' | 'all'>('pending');
    const [draftSearchQuery, setDraftSearchQuery] = useState('');
    const [expandedSnippetId, setExpandedSnippetId] = useState<string | null>(null);
    const [isDiscardingId, setIsDiscardingId] = useState<string | null>(null);

    // Gmail connection state (Google Apps Script)
    const [isCheckingGmail, setIsCheckingGmail] = useState(true);
    const [isGmailConnected, setIsGmailConnected] = useState(false);
    const [gmailConnection, setGmailConnection] = useState<{
        status?: string;
        apps_script_url?: string;
        last_sync_at?: string | null;
    } | null>(null);
    const [isConnectingGmail, setIsConnectingGmail] = useState(false);
    const [connectNotice, setConnectNotice] = useState<string | null>(null);

    const groupMap = useMemo(() => {
        const map = new Map<string, string>();
        userGroups.forEach((g) => map.set(g.id, g.name));
        return map;
    }, [userGroups]);

    useEffect(() => {
        let isMounted = true;
        const fetchStatus = async () => {
            try {
                const res = await fetch('/api/gmail-connections');
                if (res.ok && isMounted) {
                    const data = await res.json();
                    setIsGmailConnected(Boolean(data.connected));
                    setGmailConnection(data.connection || null);
                }
            } catch (err) {
                console.warn('[UnifiedDraftsAndTemplatesView] Error fetching connection status:', err);
            } finally {
                if (isMounted) {
                    setIsCheckingGmail(false);
                }
            }
        };

        fetchStatus();
        return () => {
            isMounted = false;
        };
    }, []);

    const handleConnectGmail = async () => {
        setIsConnectingGmail(true);
        setConnectNotice(null);
        try {
            const res = await fetch('/api/gmail-connections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Error al conectar');
            }

            setIsGmailConnected(true);
            setGmailConnection(data.connection);
            setConnectNotice('¡Enlace de Google Apps Script generado!');

            const scriptUrl = data.connection?.apps_script_url || data.apps_script_url;
            if (scriptUrl) {
                window.open(scriptUrl, '_blank');
            }
        } catch (err: unknown) {
            console.error('[UnifiedDraftsAndTemplatesView] Error connecting Gmail:', err);
            setConnectNotice('No se pudo generar el enlace de conexión.');
        } finally {
            setIsConnectingGmail(false);
        }
    };

    // Confirmed Gmail expenses (gastos con origen Gmail que ya fueron confirmados y asignados a grupo)
    const confirmedGmailExpenses = useMemo(() => {
        return expenses.filter(
            (e) => !e.is_draft && (Boolean(e.gmail_message_id) || e.source === 'gmail')
        );
    }, [expenses]);

    // Items combinados según filtro y búsqueda
    type UnifiedViewItem =
        | { kind: 'draft'; data: ExpenseDraft }
        | { kind: 'confirmed'; data: Expense };

    const displayedItems = useMemo<UnifiedViewItem[]>(() => {
        const q = draftSearchQuery.trim().toLowerCase();

        const pendingList: UnifiedViewItem[] = drafts.map((d) => ({
            kind: 'draft',
            data: d,
        }));

        const confirmedList: UnifiedViewItem[] = confirmedGmailExpenses.map((e) => ({
            kind: 'confirmed',
            data: e,
        }));

        let list: UnifiedViewItem[] = [];
        if (statusFilter === 'pending') {
            list = pendingList;
        } else if (statusFilter === 'confirmed') {
            list = confirmedList;
        } else {
            list = [...pendingList, ...confirmedList];
        }

        if (!q) return list;

        return list.filter((item) => {
            if (item.kind === 'draft') {
                const d = item.data;
                const matchMerchant = d.detected_merchant?.toLowerCase().includes(q);
                const matchConcept = d.concept?.toLowerCase().includes(q);
                const matchEntity = d.entity?.toLowerCase().includes(q);
                const matchType = d.expense_type?.toLowerCase().includes(q);
                const matchSource = d.source_account?.toLowerCase().includes(q);
                const matchAmount = String(d.detected_amount).includes(q);
                return matchMerchant || matchConcept || matchEntity || matchType || matchSource || matchAmount;
            } else {
                const e = item.data;
                const matchDesc = e.description?.toLowerCase().includes(q);
                const matchEntity = e.entity?.toLowerCase().includes(q);
                const matchType = e.expense_type?.toLowerCase().includes(q);
                const matchSource = e.source_account?.toLowerCase().includes(q);
                const matchAmount = String(e.total_amount).includes(q);
                const groupName = e.group_id ? groupMap.get(e.group_id)?.toLowerCase() : '';
                const matchGroup = groupName?.includes(q);
                return matchDesc || matchEntity || matchType || matchSource || matchAmount || matchGroup;
            }
        });
    }, [drafts, confirmedGmailExpenses, statusFilter, draftSearchQuery, groupMap]);

    const pendingCount = drafts.length;
    const confirmedCount = confirmedGmailExpenses.length;
    const totalCount = pendingCount + confirmedCount;

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-16">
            {/* Top Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
                        Tickets y Borradores
                    </h1>
                    <p className="text-sm text-zinc-500 mt-0.5">
                        Comprobantes bancarios detectados automáticamente desde tus correos.
                    </p>
                </div>

                {/* Connection status in header */}
                {!isCheckingGmail && isGmailConnected && (
                    <div className="flex items-center gap-2">
                        <span
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Sincronización activa</span>
                        </span>
                        <button
                            type="button"
                            onClick={handleConnectGmail}
                            disabled={isConnectingGmail}
                            title="Reconectar o cambiar cuenta de Google"
                            className="text-xs text-zinc-500 hover:text-zinc-900 font-medium px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
                        >
                            Reconectar
                        </button>
                    </div>
                )}
            </div>

            {/* Google Apps Script Connection Banner */}
            {!isCheckingGmail && !isGmailConnected && (
                <div
                    className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all">
                    <div className="flex items-start space-x-3.5">
                        <div
                            className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
                            <MailCheck className="w-5 h-5 text-amber-600" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                                <span>Sincronización de correos no conectada</span>
                                <span
                                    className="text-[10px] font-semibold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full">
                                    Acción requerida
                                </span>
                            </h3>
                            <p className="text-xs text-zinc-600 leading-relaxed max-w-xl">
                                Conecta tu cuenta de Google mediante Google Apps Script para detectar comprobantes
                                bancarios automáticamente y generar tickets listos para dividir.
                            </p>
                            {connectNotice && (
                                <p className="text-xs text-emerald-700 font-medium pt-0.5">{connectNotice}</p>
                            )}
                            {gmailConnection?.apps_script_url && (
                                <a
                                    href={gmailConnection.apps_script_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center space-x-1 text-xs text-amber-800 hover:text-amber-950 font-semibold underline pt-0.5"
                                >
                                    <span>Abrir enlace de autorización de Google</span>
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                            type="button"
                            id="connect-gmail-script-btn"
                            onClick={handleConnectGmail}
                            disabled={isConnectingGmail}
                            className="inline-flex items-center space-x-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
                        >
                            {isConnectingGmail ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <MailCheck className="w-3.5 h-3.5 text-amber-400" />
                            )}
                            <span>Conectar con Google</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Borradores y Tickets */}
            <div className="space-y-4">
                {/* Controls Bar */}
                <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-zinc-200/80 shadow-2xs">
                    {/* Status Pills */}
                    <div className="flex items-center space-x-1.5 overflow-x-auto">
                        <button
                            onClick={() => setStatusFilter('pending')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${statusFilter === 'pending'
                                ? 'bg-zinc-900 text-white shadow-xs'
                                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                                }`}
                        >
                            Pendientes ({pendingCount})
                        </button>

                        <button
                            onClick={() => setStatusFilter('confirmed')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${statusFilter === 'confirmed'
                                ? 'bg-zinc-900 text-white shadow-xs'
                                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                                }`}
                        >
                            Confirmados ({confirmedCount})
                        </button>

                        <button
                            onClick={() => setStatusFilter('all')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${statusFilter === 'all'
                                ? 'bg-zinc-900 text-white shadow-xs'
                                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                                }`}
                        >
                            Todos ({totalCount})
                        </button>
                    </div>

                    {/* Search Input */}
                    <div className="relative w-full sm:w-64">
                        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={draftSearchQuery}
                            onChange={(e) => setDraftSearchQuery(e.target.value)}
                            placeholder="Buscar por comercio, banco o monto..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200/80 rounded-xl focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-zinc-400 transition"
                        />
                    </div>
                </div>

                {/* Drafts List */}
                {displayedItems.length === 0 ? (
                    <div
                        className="bg-white border border-zinc-200/80 rounded-2xl p-12 text-center space-y-3 shadow-2xs">
                        <div
                            className="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
                            <Inbox className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-sm font-bold text-zinc-900">
                                {draftSearchQuery
                                    ? 'No hay resultados para la búsqueda'
                                    : statusFilter === 'pending'
                                        ? 'No tienes gastos pendientes por confirmar'
                                        : statusFilter === 'confirmed'
                                            ? 'Aún no has confirmado comprobantes de correo'
                                            : 'No hay registros en esta sección'}
                            </h3>
                            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                                {statusFilter === 'pending'
                                    ? 'Cuando recibas correos de compras de tus bancos, aparecerán aquí como borradores listos para asignarse a tus grupos.'
                                    : 'Los gastos detectados en correos que asignes a tus grupos quedarán guardados y confirmados.'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {displayedItems.map((item) => {
                            if (item.kind === 'draft') {
                                const draft = item.data;
                                const isExpanded = expandedSnippetId === draft.id;

                                return (
                                    <div
                                        key={`draft-${draft.id}`}
                                        className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3 shadow-2xs hover:border-zinc-300 transition"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="space-y-1.5 min-w-0">
                                                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                                    <span
                                                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700">
                                                        {formatEntity(draft.entity)}
                                                    </span>
                                                    {draft.expense_type && (
                                                        <span
                                                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                            {draft.expense_type}
                                                        </span>
                                                    )}
                                                    {draft.source_account && (
                                                        <span className="text-[11px] text-zinc-400 font-mono">
                                                            *{draft.source_account}
                                                        </span>
                                                    )}
                                                </div>
                                                <h4 className="text-sm font-bold text-zinc-900 line-clamp-1">
                                                    {draft.detected_merchant || draft.concept || 'Gasto no identificado'}
                                                </h4>
                                            </div>

                                            <div className="text-right shrink-0">
                                                <span className="text-base font-extrabold text-zinc-900 block">
                                                    {formatCurrency(draft.detected_amount, draft.currency || 'COP')}
                                                </span>
                                                <span className="text-[10px] text-zinc-400 font-mono">
                                                    {formatDraftDateTime(draft.detected_date, draft.detected_time)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Expandable Snippet / Raw text */}
                                        {draft.raw_snippet && (
                                            <div
                                                className="text-xs bg-zinc-50 border border-zinc-100 rounded-xl p-2.5 space-y-1 font-mono text-zinc-600">
                                                <div
                                                    className="flex items-center justify-between text-[10px] text-zinc-400 font-sans">
                                                    <span>Texto original detectado:</span>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setExpandedSnippetId(isExpanded ? null : draft.id)
                                                        }
                                                        className="text-indigo-600 hover:text-indigo-800 flex items-center space-x-0.5 cursor-pointer font-medium"
                                                    >
                                                        <span>{isExpanded ? 'Ver menos' : 'Ver más'}</span>
                                                        {isExpanded ? (
                                                            <ChevronUp className="w-3 h-3" />
                                                        ) : (
                                                            <ChevronDown className="w-3 h-3" />
                                                        )}
                                                    </button>
                                                </div>
                                                <p className={isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}>
                                                    {draft.raw_snippet}
                                                </p>
                                            </div>
                                        )}

                                        {/* Actions Bar */}
                                        <div
                                            className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-2">
                                            <div className="flex items-center space-x-1">
                                                <span
                                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                                    Pendiente
                                                </span>
                                            </div>

                                            <div className="flex items-center space-x-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsDiscardingId(draft.id);
                                                        discardDraft(draft.id).finally(() =>
                                                            setIsDiscardingId(null)
                                                        );
                                                    }}
                                                    disabled={isDiscardingId === draft.id}
                                                    className="px-2.5 py-1.5 text-xs font-semibold text-zinc-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer flex items-center space-x-1"
                                                    title="Descartar borrador"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                    <span className="hidden sm:inline">Descartar</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => onOpenConfirmDraft(draft)}
                                                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition shadow-2xs flex items-center space-x-1.5 cursor-pointer"
                                                >
                                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                    <span>Confirmar Gasto</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            } else {
                                const exp = item.data;
                                const groupName = exp.group_id ? groupMap.get(exp.group_id) : 'Personal / Sin grupo';

                                return (
                                    <div
                                        key={`confirmed-${exp.id}`}
                                        className="bg-white border border-zinc-200/80 rounded-2xl p-4 space-y-3 shadow-2xs opacity-90 hover:opacity-100 transition"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="space-y-1.5 min-w-0">
                                                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                                    <span
                                                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700">
                                                        {formatEntity(exp.entity)}
                                                    </span>
                                                    {exp.expense_type && (
                                                        <span
                                                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600">
                                                            {exp.expense_type}
                                                        </span>
                                                    )}
                                                    {exp.source_account && (
                                                        <span className="text-[11px] text-zinc-400 font-mono">
                                                            *{exp.source_account}
                                                        </span>
                                                    )}
                                                </div>
                                                <h4 className="text-sm font-bold text-zinc-900 line-clamp-1">
                                                    {exp.description || 'Gasto registrado'}
                                                </h4>
                                            </div>

                                            <div className="text-right shrink-0">
                                                <span className="text-base font-extrabold text-zinc-900 block">
                                                    {formatCurrency(exp.total_amount, exp.currency || 'COP')}
                                                </span>
                                                <span className="text-[10px] text-zinc-400 font-mono">
                                                    {formatDraftDateTime(exp.expense_date, exp.expense_time)}
                                                </span>
                                            </div>
                                        </div>

                                        <div
                                            className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-2">
                                            <div className="flex items-center space-x-1.5">
                                                <span
                                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                    Confirmado
                                                </span>
                                                <span className="inline-flex items-center space-x-1 text-[11px] text-zinc-500 font-medium truncate max-w-[200px]">
                                                    <Users className="w-3 h-3 text-zinc-400 shrink-0" />
                                                    <span className="truncate">{groupName}</span>
                                                </span>
                                            </div>

                                            <div className="text-right">
                                                <span className="text-[11px] font-semibold text-zinc-400">
                                                    Guardado en gastos
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
