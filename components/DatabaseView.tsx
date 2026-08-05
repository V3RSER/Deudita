'use client';

import React, { useState } from 'react';
import { useExpense } from '@/lib/expense-context';
import {
  Database,
  Copy,
  Check,
  Shield,
  Layers,
  RotateCcw,
  Download,
  FileCode,
  HardDrive,
} from 'lucide-react';

const SUPABASE_SQL_SCHEMA = `-- ==========================================
-- ARCHITECTURAL DATABASE SCHEMA (Supabase / Postgres)
-- App de Gastos Compartidos Multi-Grupo
-- ==========================================

-- 1. Tablas de Usuarios & Perfiles Públicos
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Grupos y Membresías (Tabla Puente N:M)
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'other',
  owner_id UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.group_members (
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES public.profiles(id),
  role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member'
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- 3. Gastos e Ítems Desglosados
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  paid_by UUID NOT NULL REFERENCES public.profiles(id),
  total_amount NUMERIC(12,2) NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'gmail'
  source_draft_id UUID REFERENCES public.expense_drafts(id),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Divisiones del Gasto (Montos Calculados por Usuario)
CREATE TABLE public.expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  amount_owed NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (expense_id, user_id)
);

-- 5. Pagos de Saldo / Liquidación de Deudas (Settlements)
CREATE TABLE public.settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  payer_id UUID NOT NULL REFERENCES public.profiles(id),
  receiver_id UUID NOT NULL REFERENCES public.profiles(id),
  amount NUMERIC(12,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Borradores de Gastos (Integración Gmail & AI)
CREATE TABLE public.expense_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id), -- dueño del correo
  gmail_message_id TEXT NOT NULL UNIQUE,
  raw_snippet TEXT,
  detected_amount NUMERIC(12,2),
  detected_merchant TEXT,
  detected_date DATE,
  confidence NUMERIC(3,2), -- 0.00 a 1.00
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'confirmed' | 'discarded'
  confirmed_expense_id UUID REFERENCES public.expenses(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Vista SQL Calculada para Balances Rápidos
CREATE OR REPLACE VIEW public.balances AS
SELECT
  e.group_id,
  e.paid_by AS creditor,
  s.user_id AS debtor,
  SUM(s.amount_owed) AS amount
FROM public.expenses e
JOIN public.expense_splits s ON s.expense_id = e.id
WHERE s.user_id <> e.paid_by
GROUP BY e.group_id, e.paid_by, s.user_id;

-- 8. Seguridad a Nivel de Fila (Row Level Security - RLS)
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_drafts ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura/escritura por grupo
CREATE POLICY "select_own_groups" ON public.groups
  FOR SELECT USING (
    id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "select_group_expenses" ON public.expenses
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "insert_group_expenses" ON public.expenses
  FOR INSERT WITH CHECK (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "manage_own_drafts" ON public.expense_drafts
  FOR ALL USING (user_id = auth.uid());
`;

export function DatabaseView() {
  const { resetDataToSeed, groups, expenses, drafts, profiles, currentProfile } = useExpense();
  const [copied, setCopied] = useState(false);

  const handleCopySQL = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportJSON = () => {
    const data = {
      exported_at: new Date().toISOString(),
      profiles,
      groups,
      expenses,
      drafts,
    };
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(data, null, 2)
    )}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', 'gastos_compartidos_backup.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white border border-indigo-900/50 shadow-lg">
        <div className="flex items-center space-x-2 text-indigo-300 font-bold text-xs uppercase tracking-wider mb-2">
          <Database className="w-4 h-4 text-indigo-400" />
          <span>Arquitectura & Esquema de Base de Datos</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Supabase Postgres DDL & RLS
        </h1>

        <p className="text-indigo-100/80 text-sm mt-2 max-w-3xl leading-relaxed">
          Este DDL refleja fielmente la estructura relacional recomendada en la especificación técnica. Incluye las tablas principales, las llaves foráneas, las políticas RLS y la separación clara entre <code>expense_drafts</code> y <code>expenses</code>.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={handleCopySQL}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md transition"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? '¡Copiado al portapapeles!' : 'Copiar Código SQL'}</span>
          </button>

          <button
            onClick={handleExportJSON}
            className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 text-indigo-100 px-4 py-2.5 rounded-xl text-sm font-semibold border border-white/10 transition"
          >
            <Download className="w-4 h-4 text-indigo-300" />
            <span>Exportar Estado JSON</span>
          </button>

          <button
            onClick={resetDataToSeed}
            className="flex items-center space-x-2 bg-white/10 hover:bg-rose-950/40 text-indigo-200 hover:text-rose-300 px-4 py-2.5 rounded-xl text-sm font-semibold border border-white/10 transition"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Restablecer Datos Semilla</span>
          </button>
        </div>
      </div>

      {/* SQL Code Box */}
      <div className="bg-slate-950 rounded-3xl border border-slate-800 p-6 text-slate-300 shadow-2xl relative">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center space-x-2">
            <FileCode className="w-5 h-5 text-indigo-400" />
            <span className="font-mono text-xs font-bold text-slate-400 uppercase tracking-wider">
              schema.sql (Postgres 15+ / Supabase)
            </span>
          </div>

          <button
            onClick={handleCopySQL}
            className="text-xs text-slate-400 hover:text-emerald-400 flex items-center space-x-1"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado' : 'Copiar SQL'}</span>
          </button>
        </div>

        <pre className="font-mono text-xs leading-relaxed text-emerald-300/90 overflow-x-auto p-2 rounded-xl bg-slate-900/60 max-h-[500px]">
          {SUPABASE_SQL_SCHEMA}
        </pre>
      </div>
    </div>
  );
}
