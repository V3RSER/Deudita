'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useExpense } from '@/lib/expense-context';
import { PaymentInstructionsView } from '@/components/PaymentInstructionsView';
import { EmailTemplatesManager } from '@/components/EmailTemplatesManager';
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
  CreditCard,
  Trash2,
  Sparkles,
  Globe,
  Coins,
  MailCheck,
  CheckCircle2,
  ExternalLink,
  Layers,
  RefreshCw,
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

  // Gmail Ingest Connection state
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailConnection, setGmailConnection] = useState<{
    status?: string;
    apps_script_url?: string;
    last_sync_at?: string | null;
  } | null>(null);
  const [isConnectingGmail, setIsConnectingGmail] = useState(false);
  const [isTemplatesModalOpen, setIsTemplatesModalOpen] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const prevIsOpenRef = useRef(false);

  const fetchGmailStatus = async () => {
    try {
      const res = await fetch('/api/gmail-connections');
      if (res.ok) {
        const data = await res.json();
        setGmailConnected(Boolean(data.connected));
        setGmailConnection(data.connection);
      }
    } catch {
      // Ignorar errores silenciosos en carga inicial
    }
  };

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
      fetchGmailStatus();
    }
  }, [isOpen, currentProfile]);

  const handleConnectGmail = async () => {
    setIsConnectingGmail(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/gmail-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al conectar Gmail');

      setGmailConnected(true);
      setGmailConnection(data.connection);
      setSuccessMessage('¡Enlace de autorización de Gmail generado con éxito!');

      // Automatically open the Google authorization link if available
      if (data.connection?.apps_script_url) {
        window.open(data.connection.apps_script_url, '_blank');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al conectar Gmail');
    } finally {
      setIsConnectingGmail(false);
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSaving && !isUploading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSaving, isUploading, onClose]);

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
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl('');
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

      setSuccessMessage(isOnboarding ? '¡Registro completado con éxito!' : '¡Perfil actualizado correctamente!');
      
      setTimeout(() => {
        setSuccessMessage(null);
        if (onCompleted) {
          onCompleted();
        } else {
          onClose();
        }
      }, 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar los datos';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      id="profile-settings-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/40 backdrop-blur-md overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving && !isUploading) {
          onClose();
        }
      }}
    >
      <div
        id="profile-settings-modal"
        ref={modalRef}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col my-auto max-h-[92vh] overflow-hidden border border-zinc-200 transition-all duration-300"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0 bg-white">
          <div className="flex items-center space-x-3">
            {isOnboarding ? (
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-700 shadow-xs">
                <UserCheck className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-200/60 flex items-center justify-center text-zinc-800 shadow-xs">
                <User className="w-5 h-5" />
              </div>
            )}
            <div>
              <h2 id="profile-modal-title" className="text-base sm:text-lg font-bold text-zinc-900 tracking-tight">
                {isOnboarding ? 'Completa tu registro' : 'Editar perfil'}
              </h2>
              <p className="text-xs text-zinc-500 font-medium">
                {isOnboarding
                  ? 'Configura tu nombre y preferencias para comenzar'
                  : 'Actualiza tus datos y opciones de cobro'}
              </p>
            </div>
          </div>
          <button
            id="profile-close-btn"
            onClick={onClose}
            disabled={isSaving || isUploading}
            className="p-2 -mr-1.5 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition cursor-pointer disabled:opacity-50"
            title="Cerrar"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div id="profile-error-banner" className="bg-rose-50 px-6 py-3 border-b border-rose-100 flex items-center text-xs font-semibold text-rose-700 shrink-0">
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success Banner */}
        {successMessage && (
          <div id="profile-success-banner" className="bg-emerald-50 px-6 py-3 border-b border-emerald-100 flex items-center text-xs font-semibold text-emerald-800 shrink-0">
            <Check className="w-4 h-4 mr-2 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          {/* Section 1: Personal Info & Avatar */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-emerald-600" />
                <span>Información personal</span>
              </h3>
              {currentProfile.email && (
                <span className="text-[11px] text-zinc-500 font-medium truncate max-w-[200px]" title={currentProfile.email}>
                  {currentProfile.email}
                </span>
              )}
            </div>

            <div className="bg-zinc-50/70 border border-zinc-200/90 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-4 sm:gap-5 shadow-2xs">
              {/* Single, unified Avatar Uploader Trigger */}
              <div className="flex flex-col items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  id="profile-avatar-trigger-btn"
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  disabled={isUploading}
                  className={`w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-white flex items-center justify-center border-2 shadow-sm relative overflow-hidden transition-all group cursor-pointer disabled:opacity-50 ${
                    avatarUrl ? 'border-emerald-500/40' : 'border-zinc-200 hover:border-emerald-400'
                  }`}
                  title={avatarUrl ? 'Cambiar foto de perfil' : 'Subir foto de perfil'}
                >
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
                    <span className="text-2xl font-bold text-zinc-700 uppercase">
                      {fullName.trim() ? fullName.trim().charAt(0).toUpperCase() : 'U'}
                    </span>
                  )}

                  {/* Visual hover indicator */}
                  <div className="absolute inset-0 bg-zinc-900/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity text-white">
                    <Camera className="w-5 h-5 mb-0.5" />
                    <span className="text-[9px] font-bold">Cambiar</span>
                  </div>

                  {/* Corner indicator badge */}
                  <div className="absolute bottom-1 right-1 p-1 bg-emerald-600 text-white rounded-lg shadow-xs">
                    <Camera className="w-3 h-3" />
                  </div>

                  {isUploading && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center text-emerald-600">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  )}
                </button>

                {avatarUrl && (
                  <button
                    type="button"
                    id="profile-remove-avatar-btn"
                    onClick={handleRemoveAvatar}
                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 transition cursor-pointer pt-0.5"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Quitar foto</span>
                  </button>
                )}

                <input
                  id="profile-avatar-file-input"
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              {/* Name Input */}
              <div className="flex-1 w-full space-y-1.5 text-center sm:text-left">
                <label htmlFor="profile-full-name-input" className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider block">
                  Nombre o Apodo <span className="text-rose-500">*</span>
                </label>
                <input
                  id="profile-full-name-input"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tu nombre o apodo"
                  className="w-full px-3.5 py-2 bg-white border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition shadow-2xs placeholder:text-zinc-400 placeholder:font-normal"
                  autoFocus={isOnboarding}
                  required
                />
                <p className="text-[11px] text-zinc-500">
                  Así es como te verán los miembros de tus grupos.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Regional Preferences */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-emerald-600" />
                <span>Preferencias regionales</span>
              </h3>
            </div>

            <div className="bg-zinc-50/70 border border-zinc-200/90 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-2xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <label htmlFor="profile-timezone-select" className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider flex items-center gap-1">
                    <Globe className="w-3 h-3 text-zinc-400" />
                    <span>Zona horaria</span>
                  </label>
                  <div className="relative rounded-xl bg-white border border-zinc-200 shadow-2xs">
                    <select
                      id="profile-timezone-select"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 text-xs font-semibold text-zinc-900 appearance-none bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-xl cursor-pointer"
                    >
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="profile-currency-select" className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider flex items-center gap-1">
                    <Coins className="w-3 h-3 text-zinc-400" />
                    <span>Moneda principal</span>
                  </label>
                  <div className="relative rounded-xl bg-white border border-zinc-200 shadow-2xs">
                    <select
                      id="profile-currency-select"
                      value={selectedCurrency}
                      onChange={(e) => setSelectedCurrency(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 text-xs font-semibold text-zinc-900 appearance-none bg-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500/20 rounded-xl cursor-pointer"
                    >
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c.currency} value={c.currency}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Payment Instructions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                <span>Métodos de pago para tus amigos</span>
                <span className="text-[10px] lowercase font-semibold text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-md">
                  opcional
                </span>
              </h3>
            </div>

            <div className="bg-zinc-50/70 border border-zinc-200/90 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-2xs">
              <p className="text-xs text-zinc-600 leading-relaxed">
                Indica los medios por donde prefieres recibir transferencias al saldar cuentas, especificando la plataforma, entidad o enlace y tu respectivo número de cuenta o celular.
              </p>

              {/* Textarea */}
              <div className="space-y-1">
                <textarea
                  id="profile-payment-instructions-textarea"
                  rows={3}
                  value={paymentInstructions}
                  onChange={(e) => setPaymentInstructions(e.target.value)}
                  placeholder="Indica el medio (banco, billetera o enlace) y tu número..."
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition resize-none placeholder:text-zinc-400 shadow-2xs"
                />
              </div>

              {/* Interactive Live Preview */}
              {paymentInstructions.trim() && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-zinc-700">
                    <span className="flex items-center gap-1.5 text-emerald-800">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Vista previa interactiva para tus amigos</span>
                    </span>
                    <span className="text-[10px] text-zinc-400 font-normal">
                      Enlaces y números con copia directa
                    </span>
                  </div>

                  <PaymentInstructionsView instructions={paymentInstructions.trim()} />
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Gmail Detection & Templates */}
          {!isOnboarding && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-0.5">
                <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                  <MailCheck className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Detección Automática con Gmail</span>
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                    gmailConnected
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-zinc-100 text-zinc-600'
                  }`}
                >
                  {gmailConnected ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Conectado</span>
                    </>
                  ) : (
                    <span>No conectado</span>
                  )}
                </span>
              </div>

              <div className="bg-gradient-to-br from-indigo-50/40 via-white to-zinc-50 border border-indigo-100 rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-2xs">
                <p className="text-xs text-zinc-600 leading-relaxed">
                  Conecta tu cuenta de Gmail mediante Google Apps Script para detectar comprobantes de compra y crear borradores automáticamente.
                </p>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleConnectGmail}
                    disabled={isConnectingGmail}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isConnectingGmail ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <MailCheck className="w-3.5 h-3.5" />
                    )}
                    <span>{gmailConnected ? 'Reconectar Gmail' : 'Conectar Gmail (1 Clic)'}</span>
                  </button>

                  {gmailConnection?.apps_script_url && (
                    <a
                      href={gmailConnection.apps_script_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white border border-indigo-200 hover:bg-indigo-50/50 text-indigo-700 text-xs font-bold px-4 py-2.5 rounded-xl shadow-2xs transition flex items-center gap-1.5"
                    >
                      <span>Autorizar en Google</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsTemplatesModalOpen(true)}
                    className="bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700 text-xs font-bold px-4 py-2.5 rounded-xl shadow-2xs transition flex items-center gap-1.5 cursor-pointer ml-auto"
                  >
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Catálogo de Plantillas</span>
                  </button>
                </div>

                {gmailConnection?.last_sync_at && (
                  <p className="text-[11px] text-zinc-400 flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <span>Última sincronización: {new Date(gmailConnection.last_sync_at).toLocaleString('es-CO')}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>

        {/* Footer Actions */}
        <div className="p-4 sm:px-6 border-t border-zinc-100 bg-zinc-50/80 shrink-0 flex items-center justify-end gap-2.5">
          {!isOnboarding && (
            <button
              id="profile-cancel-btn"
              type="button"
              onClick={onClose}
              disabled={isSaving || isUploading}
              className="px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 text-xs sm:text-sm font-semibold transition cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
          <button
            id="profile-save-btn"
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving || isUploading || !fullName.trim()}
            className="flex-1 sm:flex-initial px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs sm:text-sm font-bold rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isSaving || isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>{isSaving ? 'Guardando...' : isOnboarding ? 'Completar registro' : 'Guardar cambios'}</span>
          </button>
        </div>
      </div>

      {/* Email Templates Manager Modal */}
      <EmailTemplatesManager
        isOpen={isTemplatesModalOpen}
        onClose={() => setIsTemplatesModalOpen(false)}
      />
    </div>
  );
}



