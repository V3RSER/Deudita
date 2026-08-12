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
    if (loading) return;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] ring-1 ring-zinc-200 shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-zinc-900 text-white p-8 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 ring-1 ring-zinc-700 flex items-center justify-center text-zinc-100 font-bold">
              <ScanLine className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-50">Escanear Comprobante con AI</h2>
              <p className="text-sm text-zinc-400 mt-1">Pegar correo o subir imagen de ticket/boleta</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleScan} className="p-8 space-y-6">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 bg-zinc-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setInputMode('text')}
              className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center space-x-2 ${
                inputMode === 'text'
                  ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/50'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Pegar Texto / Email</span>
            </button>

            <button
              type="button"
              onClick={() => setInputMode('image')}
              className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center space-x-2 ${
                inputMode === 'image'
                  ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/50'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Subir Imagen Ticket</span>
            </button>
          </div>

          {inputMode === 'text' ? (
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                Cuerpo del Correo o Notificación de Pago
              </label>
              <textarea
                rows={5}
                required
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
                placeholder="Pega aquí el texto del correo recibido (ej: 'Tu viaje con Uber por $14.500...', o la boleta de compra)."
                className="w-full px-4 py-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono transition-all placeholder:text-zinc-400"
              />
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                Fotografía o Captura de Boleta
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="w-full p-3 bg-zinc-50 border-none ring-1 ring-zinc-200 rounded-xl text-sm text-zinc-700 cursor-pointer transition-all focus:ring-2 focus:ring-zinc-900"
              />
              {selectedImage && (
                <p className="text-xs text-emerald-600 font-medium mt-3 flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Imagen seleccionada y lista para escanear</span>
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-50 border-none ring-1 ring-rose-200 text-rose-700 text-sm font-medium rounded-xl flex items-start space-x-2">
              <span className="block">{error}</span>
            </div>
          )}

          {/* Submit */}
          <div className="pt-6 border-t border-zinc-100 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full ring-1 ring-zinc-200 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 text-sm font-medium transition-colors active:scale-95"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || (inputMode === 'image' && !selectedImage)}
              className="px-6 py-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium shadow-sm transition-all active:scale-95 flex items-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analizando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generar Borrador</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
