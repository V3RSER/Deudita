'use client';

import React, { useState } from 'react';
import { useExpense } from '@/lib/expense-context';
import { X, ScanLine, Sparkles, Upload, FileText, Loader2 } from 'lucide-react';

interface ScanReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ScanReceiptModal({ isOpen, onClose }: ScanReceiptModalProps) {
  const { addDraft } = useExpense();

  const [inputMode, setInputMode] = useState<'text' | 'image'>('text');
  const [emailText, setEmailText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mime = file.type ? file.type : 'image/jpeg';
    setImageMimeType(mime);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Extract base64 part
      const base64Data = result.split(',')[1];
      setSelectedImage(base64Data);
    };
    reader.readAsDataURL(file);
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/gemini/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputMode === 'text' ? emailText : undefined,
          imageBase64: inputMode === 'image' ? selectedImage : undefined,
          mimeType: imageMimeType,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMsg = data.error ? data.error : 'No se pudo analizar el comprobante';
        throw new Error(errorMsg);
      }

      const draftData = data.draft;

      const snippetText = draftData.raw_snippet
        ? draftData.raw_snippet
        : (emailText ? emailText : 'Comprobante escaneado por Gemini AI');

      addDraft({
        gmail_message_id: `scanner_${Date.now()}`,
        raw_snippet: snippetText,
        detected_amount: draftData.detected_amount,
        detected_merchant: draftData.detected_merchant,
        detected_date: draftData.detected_date,
        confidence: draftData.confidence ? draftData.confidence : 0.9,
        extracted_items: draftData.extracted_items ? draftData.extracted_items : [],
      });

      setLoading(false);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al conectar con la API';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 font-bold">
              <ScanLine className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Escanear Comprobante con AI</h2>
              <p className="text-xs text-slate-400">Pegar correo o subir imagen de ticket/boleta</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleScan} className="p-6 space-y-5">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setInputMode('text')}
              className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center space-x-2 ${
                inputMode === 'text'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Pegar Texto / Email</span>
            </button>

            <button
              type="button"
              onClick={() => setInputMode('image')}
              className={`py-2 text-xs font-bold rounded-lg transition flex items-center justify-center space-x-2 ${
                inputMode === 'image'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Subir Imagen Ticket</span>
            </button>
          </div>

          {inputMode === 'text' ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Cuerpo del Correo o Notificación de Pago
              </label>
              <textarea
                rows={5}
                required
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
                placeholder="Pega aquí el texto del correo recibido (ej: 'Tu viaje con Uber por $14.500...', o la boleta de compra)."
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Fotografía o Captura de Boleta
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 cursor-pointer"
              />
              {selectedImage && (
                <p className="text-xs text-emerald-600 font-semibold mt-2">
                  ✓ Imagen seleccionada y lista para escanear
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="pt-4 border-t border-slate-100 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || (inputMode === 'image' && !selectedImage)}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition flex items-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analizando con Gemini...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Escanear y Generar Borrador</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
