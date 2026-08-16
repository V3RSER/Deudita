'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import {
  X,
  Camera,
  Loader2,
  AlertCircle,
  User,
  Sliders,
  ChevronDown,
  Check,
  UserCheck,
} from 'lucide-react';

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOnboarding?: boolean;
  onCompleted?: () => void;
}

export const COMMON_TIMEZONES = [
  { value: 'America/Bogota', label: 'América/Bogotá (GMT-5)' },
  { value: 'America/Mexico_City', label: 'América/Ciudad de México (GMT-6)' },
  { value: 'America/Lima', label: 'América/Lima (GMT-5)' },
  { value: 'America/Santiago', label: 'América/Santiago (GMT-3)' },
  { value: 'America/Buenos_Aires', label: 'América/Buenos Aires (GMT-3)' },
  { value: 'America/Caracas', label: 'América/Caracas (GMT-4)' },
  { value: 'America/New_York', label: 'América/Nueva York (GMT-5)' },
  { value: 'Europe/Madrid', label: 'Europa/Madrid (GMT+1)' },
  { value: 'UTC', label: 'Tiempo Universal Coordinado (UTC)' },
];

export const CURRENCY_OPTIONS = [
  { currency: 'COP', symbol: '$', label: 'COP - Peso Colombiano ($)' },
  { currency: 'MXN', symbol: '$', label: 'MXN - Peso Mexicano ($)' },
  { currency: 'CLP', symbol: '$', label: 'CLP - Peso Chileno ($)' },
  { currency: 'ARS', symbol: '$', label: 'ARS - Peso Argentino ($)' },
  { currency: 'USD', symbol: '$', label: 'USD - Dólar Estadounidense ($)' },
  { currency: 'EUR', symbol: '€', label: 'EUR - Euro (€)' },
  { currency: 'PEN', symbol: 'S/', label: 'PEN - Sol Peruano (S/)' },
];

export function ProfileSettingsModal({
  isOpen,
  onClose,
  isOnboarding = false,
  onCompleted,
}: ProfileSettingsModalProps) {
  const { currentProfile, updateProfile } = useExpense();

  const [fullName, setFullName] = useState(currentProfile?.full_name ?? '');
  const [timezone, setTimezone] = useState(currentProfile?.timezone ?? 'America/Bogota');
  const [selectedCurrency, setSelectedCurrency] = useState(currentProfile?.currency ?? 'COP');
  const [paymentInstructions, setPaymentInstructions] = useState(currentProfile?.payment_instructions ?? '');
  const [avatarUrl, setAvatarUrl] = useState(currentProfile?.avatar_url ?? '');

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen || !currentProfile) {
      prevIsOpenRef.current = false;
      return;
    }
    if (!prevIsOpenRef.current) {
      prevIsOpenRef.current = true;
      setFullName(currentProfile.full_name ?? '');
      setTimezone(currentProfile.timezone ?? 'America/Bogota');
      setSelectedCurrency(currentProfile.currency ?? 'COP');
      setPaymentInstructions(currentProfile.payment_instructions ?? '');
      setAvatarUrl(currentProfile.avatar_url ?? '');
      setErrorMessage(null);
      setSuccessMessage(null);
      setIsSaving(false);
      setIsUploading(false);
    }
  }, [isOpen, currentProfile]);

  if (!isOpen || !currentProfile) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setErrorMessage(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'user_avatar');

      const digitsOnly = currentProfile.id.replace(/\D/g, '');
      const numericId = digitsOnly.length > 0 ? digitsOnly.substring(0, 9) : `${Math.floor(100000000 + Math.random() * 900000000)}`;
      formData.append('entityId', numericId);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ? String(errData.error) : 'Error al subir la imagen');
      }

      const data = await res.json();
      if (data.url) {
        setAvatarUrl(data.url);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar imagen';
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSaving || isUploading) return;

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setErrorMessage('Por favor, ingresa tu nombre completo.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const currObj = CURRENCY_OPTIONS.find((c) => c.currency === selectedCurrency) ?? CURRENCY_OPTIONS[0];

      await updateProfile({
        full_name: trimmedName,
        timezone,
        currency: currObj.currency,
        currency_symbol: currObj.symbol,
        payment_instructions: paymentInstructions.trim(),
        avatar_url: avatarUrl,
        onboarding_completed: true,
      });

      setSuccessMessage(isOnboarding ? '¡Registro completado!' : '¡Perfil actualizado!');
      
      setTimeout(() => {
        setSuccessMessage(null);
        if (onCompleted) {
          onCompleted();
        } else {
          onClose();
        }
      }, 600);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar los datos';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-zinc-950/40 backdrop-blur-md overflow-y-auto">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md flex flex-col my-auto max-h-[95vh] overflow-hidden transition-all duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
          <div className="flex items-center space-x-3">
            {isOnboarding ? (
              <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-700">
                <UserCheck className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700">
                <User className="w-5 h-5" />
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
                {isOnboarding ? 'Completa tu registro' : 'Editar perfil'}
              </h2>
              <p className="text-xs text-zinc-500 font-medium">
                {isOnboarding
                  ? 'Configura tu nombre y preferencias para comenzar'
                  : 'Actualiza tus datos y preferencias de cuenta'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-full hover:bg-zinc-100 text-zinc-500 transition"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="bg-rose-50 px-6 py-3 border-b border-rose-100 flex items-center text-sm font-medium text-rose-700 shrink-0">
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success Banner */}
        {successMessage && (
          <div className="bg-emerald-50 px-6 py-3 border-b border-emerald-100 flex items-center text-sm font-medium text-emerald-800 shrink-0">
            <Check className="w-4 h-4 mr-2 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Personal Info */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-zinc-900 flex items-center">
                <User className="w-4 h-4 mr-2 text-emerald-600" />
                Información personal
              </h3>
            </div>
            <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center shrink-0 border border-black/5 overflow-hidden relative group">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt="Foto de perfil"
                    fill
                    className="object-cover"
                    unoptimized
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-base font-bold text-zinc-600 uppercase">
                    {fullName.trim() ? fullName.trim().charAt(0).toUpperCase() : 'U'}
                  </span>
                )}
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tu nombre o apodo"
                  className="w-full text-left text-lg text-zinc-800 bg-transparent border-b border-dashed border-zinc-300 pb-1 focus:outline-none focus:ring-0 placeholder:text-zinc-400 focus:border-zinc-500 transition-colors font-bold"
                  autoFocus
                />
              </div>
            </div>
          </div>

          {/* Details / Preferences */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-zinc-900 flex items-center">
                <Sliders className="w-4 h-4 mr-2 text-emerald-600" />
                Preferencias y moneda
              </h3>
            </div>
            <div className="bg-white border border-zinc-200 rounded-2xl p-3 space-y-2 shadow-sm overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-0.5">
                    Zona horaria
                  </label>
                  <div className="relative shadow-sm rounded-lg bg-white border border-zinc-200">
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full pl-2.5 pr-8 py-1.5 text-xs font-semibold text-zinc-900 appearance-none bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-lg cursor-pointer"
                    >
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-0.5">
                    Moneda principal
                  </label>
                  <div className="relative shadow-sm rounded-lg bg-white border border-zinc-200">
                    <select
                      value={selectedCurrency}
                      onChange={(e) => setSelectedCurrency(e.target.value)}
                      className="w-full pl-2.5 pr-8 py-1.5 text-xs font-semibold text-zinc-900 appearance-none bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-lg cursor-pointer"
                    >
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c.currency} value={c.currency}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-zinc-100 mt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className={`w-full flex items-center justify-center space-x-1.5 py-2 text-xs font-bold transition-all ${
                    avatarUrl
                      ? 'border border-solid bg-emerald-50 border-emerald-200 text-emerald-700 rounded-xl shadow-sm'
                      : 'border border-dashed border-zinc-300 rounded-xl text-zinc-500 hover:border-emerald-300 hover:text-emerald-600 bg-zinc-50/50 hover:bg-emerald-50/50'
                  }`}
                >
                  {isUploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                  <span>{avatarUrl ? 'Cambiar foto de perfil' : 'Añadir foto de perfil (opcional)'}</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              <div className="space-y-1 pt-2 border-t border-zinc-100 mt-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-0.5">
                  Métodos de pago para tus amigos (opcional)
                </label>
                <p className="text-[11px] text-zinc-500 pl-0.5 leading-snug">
                  Indica tus cuentas o números (Nequi, Daviplata, transferencia) para que tus amigos sepan dónde transferirte al saldar cuentas.
                </p>
                <textarea
                  rows={3}
                  value={paymentInstructions}
                  onChange={(e) => setPaymentInstructions(e.target.value)}
                  placeholder="Ej: Nequi / Daviplata 3001234567, cuenta bancaria..."
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 focus:bg-white rounded-lg text-xs font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-colors resize-none placeholder:text-zinc-400"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-100 bg-zinc-50/80 shrink-0 rounded-b-[24px]">
          <button
            onClick={() => handleSave()}
            disabled={isSaving || isUploading || !fullName.trim()}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center disabled:opacity-50 cursor-pointer"
          >
            {isSaving || isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            <span>{isSaving ? 'Guardando...' : isOnboarding ? 'Completar registro' : 'Guardar cambios'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

