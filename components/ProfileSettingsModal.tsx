'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { X, Camera, User, Globe, Coins, Check, Loader2, AlertCircle, Sparkles } from 'lucide-react';

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMON_TIMEZONES = [
  { value: 'America/Mexico_City', label: 'América/Ciudad de México (GMT-6)' },
  { value: 'America/Bogota', label: 'América/Bogotá (GMT-5)' },
  { value: 'America/Lima', label: 'América/Lima (GMT-5)' },
  { value: 'America/Santiago', label: 'América/Santiago (GMT-3)' },
  { value: 'America/Buenos_Aires', label: 'América/Buenos Aires (GMT-3)' },
  { value: 'America/Caracas', label: 'América/Caracas (GMT-4)' },
  { value: 'America/New_York', label: 'América/Nueva York (GMT-5)' },
  { value: 'Europe/Madrid', label: 'Europa/Madrid (GMT+1)' },
  { value: 'UTC', label: 'Tiempo Universal Coordinado (UTC)' },
];

const CURRENCY_OPTIONS = [
  { currency: 'COP', symbol: '$', label: 'COP - Peso Colombiano ($)' },
  { currency: 'MXN', symbol: '$', label: 'MXN - Peso Mexicano ($)' },
  { currency: 'CLP', symbol: '$', label: 'CLP - Peso Chileno ($)' },
  { currency: 'ARS', symbol: '$', label: 'ARS - Peso Argentino ($)' },
  { currency: 'USD', symbol: '$', label: 'USD - Dólar Estadounidense ($)' },
  { currency: 'EUR', symbol: '€', label: 'EUR - Euro (€)' },
  { currency: 'PEN', symbol: 'S/', label: 'PEN - Sol Peruano (S/)' },
];

export function ProfileSettingsModal({ isOpen, onClose }: ProfileSettingsModalProps) {
  const { currentProfile, updateProfile } = useExpense();

  const [fullName, setFullName] = useState(currentProfile?.full_name ?? '');
  const [timezone, setTimezone] = useState(currentProfile?.timezone ?? 'America/Mexico_City');
  const [selectedCurrency, setSelectedCurrency] = useState(currentProfile?.currency ?? 'COP');
  const [paymentInstructions, setPaymentInstructions] = useState(currentProfile?.payment_instructions ?? '');
  const [avatarUrl, setAvatarUrl] = useState(currentProfile?.avatar_url ?? '');

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state when modal opens or profile changes
  const [prevProfile, setPrevProfile] = useState(currentProfile);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if ((currentProfile !== prevProfile || isOpen !== prevIsOpen) && currentProfile && isOpen) {
    setPrevProfile(currentProfile);
    setPrevIsOpen(isOpen);
    setFullName(currentProfile.full_name ?? '');
    setTimezone(currentProfile.timezone ?? 'America/Mexico_City');
    setSelectedCurrency(currentProfile.currency ?? 'COP');
    setPaymentInstructions(currentProfile.payment_instructions ?? '');
    setAvatarUrl(currentProfile.avatar_url ?? '');
  }

  if (!isOpen || !currentProfile) return null;


  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setErrorMsg(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'user_avatar');

      // Generate a numeric entity id if profile has one or use timestamp fragment
      const numericId = currentProfile.id.replace(/\D/g, '').substring(0, 9) || `${Math.floor(100000000 + Math.random() * 900000000)}`;
      formData.append('entityId', numericId);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al subir la imagen');
      }

      const data = await res.json();
      if (data.url) {
        setAvatarUrl(data.url);
        setSuccessMsg('Imagen de perfil cargada correctamente');
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err: unknown) {
      console.error('Error al subir imagen:', err);
      const msg = err instanceof Error ? err.message : 'Error al cargar imagen';
      setErrorMsg(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const currObj = CURRENCY_OPTIONS.find((c) => c.currency === selectedCurrency) || CURRENCY_OPTIONS[0];

      await updateProfile({
        full_name: fullName.trim(),
        timezone,
        currency: currObj.currency,
        currency_symbol: currObj.symbol,
        payment_instructions: paymentInstructions.trim(),
        avatar_url: avatarUrl,
      });

      setSuccessMsg('Perfil actualizado correctamente');
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1000);
    } catch (err: unknown) {
      console.error('Error al guardar perfil:', err);
      const msg = err instanceof Error ? err.message : 'Error al guardar cambios';
      setErrorMsg(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-[2.5rem] ring-1 ring-zinc-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-zinc-900 text-white p-6 sm:p-8 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-emerald-400 font-bold shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Mi Perfil</h2>
              <p className="text-xs text-zinc-400">Personaliza tus datos y preferencias</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSave} className="p-6 sm:p-8 space-y-6 max-h-[80vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-2xl text-xs flex items-center space-x-2">
              <Sparkles className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Avatar Upload */}
          <div className="flex flex-col items-center space-y-3">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-zinc-100 shadow-md bg-zinc-100 flex items-center justify-center">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt="Foto de perfil"
                    width={96}
                    height={96}
                    className="w-full h-full object-cover"
                    unoptimized
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-2xl font-bold text-zinc-400 uppercase">
                    {fullName ? fullName.charAt(0) : 'U'}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute bottom-0 right-0 bg-zinc-900 hover:bg-zinc-800 text-white p-2 rounded-full shadow-lg transition-all border-2 border-white"
                title="Cambiar foto de perfil"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
            >
              {isUploading ? 'Cargando imagen...' : 'Cambiar imagen de perfil'}
            </button>
          </div>

          {/* Full Name Input */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              Nombre Completo
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-2xl text-sm transition-all focus:ring-2 focus:ring-zinc-900"
                placeholder="Tu nombre completo"
              />
            </div>
          </div>

          {/* Timezone Select */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              Zona Horaria
            </label>
            <div className="relative">
              <Globe className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5 pointer-events-none" />
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 hover:bg-zinc-100/80 hover:border-zinc-300 rounded-2xl text-sm font-medium transition-all focus:ring-2 focus:ring-zinc-900 cursor-pointer appearance-none"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Currency / Weight type Select */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              Moneda Predeterminada
            </label>
            <div className="relative">
              <Coins className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3.5 pointer-events-none" />
              <select
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 hover:bg-zinc-100/80 hover:border-zinc-300 rounded-2xl text-sm font-medium transition-all focus:ring-2 focus:ring-zinc-900 cursor-pointer appearance-none"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.currency} value={c.currency}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Payment Instructions Field */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              Instrucciones de Cobro / Pago
            </label>
            <p className="text-xs text-zinc-500">
              Escribe tus cuentas bancarias, Nequi, Daviplata, enlaces PSE o datos de pago. Quienes te deban dinero podrán ver estos datos al saldar deudas.
            </p>
            <textarea
              rows={3}
              value={paymentInstructions}
              onChange={(e) => setPaymentInstructions(e.target.value)}
              placeholder="Ej: Nequi/Daviplata 3001234567, Bancolombia Ahorros # 12345678901 o https://pse.com/mideuda"
              className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-2xl text-sm transition-all focus:ring-2 focus:ring-zinc-900 placeholder:text-zinc-400 font-sans"
            />
          </div>

          {/* Submit Actions */}
          <div className="pt-4 border-t border-zinc-100 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full ring-1 ring-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 text-xs font-semibold transition-all duration-200 active:scale-95"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || isUploading}
              className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-full text-xs font-semibold shadow-md hover:shadow-lg transition-all duration-200 active:scale-95 disabled:opacity-50 flex items-center space-x-2"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Guardar</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
