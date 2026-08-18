'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { KeyRound, CheckCircle2, AlertCircle, Loader2, ArrowRight, Copy, Check, Terminal, Info } from 'lucide-react';

export default function AuthBypassPage() {
  const router = useRouter();
  const [sessionInput, setSessionInput] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [activeTab, setActiveTab] = useState<'json' | 'manual'>('json');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const localConsoleScript = `(() => {
  try {
    // 1. Buscar en LocalStorage
    for (let i = 0; i < localStorage.length; i++) {
      try {
        const item = JSON.parse(localStorage.getItem(localStorage.key(i)) || '');
        if (item?.access_token && item?.refresh_token) {
          copy(JSON.stringify(item));
          console.log("¡Sesión encontrada en LocalStorage y copiada!", item);
          return "¡Sesión de LocalStorage copiada al portapapeles!";
        }
      } catch(e) {}
    }

    // 2. Buscar en Cookies (reconstruyendo todos los fragmentos .0, .1, .2...)
    const cookieList = document.cookie.split(';').map(c => c.trim());
    const authChunks = [];

    for (const c of cookieList) {
      const eqIdx = c.indexOf('=');
      if (eqIdx === -1) continue;
      const name = c.slice(0, eqIdx).trim();
      const val = c.slice(eqIdx + 1).trim();

      // Debe coincidir con auth-token o auth-token.N pero NO con flow o verifier
      if (name.includes('auth-token') && !name.includes('flow') && !name.includes('verifier') && !name.includes('code')) {
        const match = name.match(/\.(\d+)$/);
        const index = match ? parseInt(match[1], 10) : 0;
        authChunks.push({ name, index, val });
      }
    }

    authChunks.sort((a, b) => a.index - b.index);

    if (authChunks.length > 0) {
      let combinedVal = authChunks.map(chunk => chunk.val).join('');
      combinedVal = decodeURIComponent(combinedVal);
      if (combinedVal.startsWith('base64-')) {
        combinedVal = atob(combinedVal.slice(7));
      }
      try {
        const parsed = JSON.parse(combinedVal);
        copy(JSON.stringify(parsed));
        console.log("¡Sesión reconstruida desde cookies y copiada!", parsed);
        return "¡Sesión de Cookies copiada al portapapeles!";
      } catch(err) {
        // Si no parsea directo a JSON, copiar el valor combinado
        copy(combinedVal);
        console.log("¡Valor de token copiado!", combinedVal);
        return "¡Token copiado al portapapeles!";
      }
    }

    // 3. Si no se encontró estructurado, copiar todas las cookies
    copy(document.cookie);
    console.log("¡Cookies copiadas!", document.cookie);
    return "¡Cookies copiadas al portapapeles!";
  } catch(e) {
    console.error("Error al obtener sesión:", e);
    copy(document.cookie);
    return "¡Cookies copiadas!";
  }
})()`;

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(localConsoleScript);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2500);
    } catch {
      // Ignored if clipboard is blocked
    }
  };

  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    console.log('[BypassAuth]', msg);
    setDebugLogs((prev) => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
  };

  const extractTokens = (input: string): { accessToken: string; refreshToken: string } | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Helper to inspect parsed object
    const findTokensInObj = (obj: unknown): { accessToken: string; refreshToken: string } | null => {
      if (!obj || typeof obj !== 'object') return null;
      const anyObj = obj as Record<string, unknown>;

      if (typeof anyObj.access_token === 'string' && typeof anyObj.refresh_token === 'string') {
        return { accessToken: anyObj.access_token, refreshToken: anyObj.refresh_token };
      }
      if (Array.isArray(anyObj) && anyObj.length >= 2 && typeof anyObj[0] === 'string' && typeof anyObj[1] === 'string') {
        if (anyObj[0].length > 20) {
          return { accessToken: anyObj[0], refreshToken: anyObj[1] };
        }
      }
      if (anyObj.currentSession && typeof anyObj.currentSession === 'object') {
        return findTokensInObj(anyObj.currentSession);
      }
      if (anyObj.session && typeof anyObj.session === 'object') {
        return findTokensInObj(anyObj.session);
      }
      if (typeof anyObj.rawCookie === 'string') {
        return parseFromCookies(anyObj.rawCookie);
      }
      return null;
    };

    const parseFromCookies = (cookieStr: string): { accessToken: string; refreshToken: string } | null => {
      const parts = cookieStr.split(';');
      const chunks: { name: string; index: number; val: string }[] = [];
      for (const part of parts) {
        const item = part.trim();
        const eqIdx = item.indexOf('=');
        if (eqIdx === -1) continue;
        const name = item.slice(0, eqIdx).trim();
        const val = item.slice(eqIdx + 1).trim();

        if (name.includes('auth-token') && !name.includes('flow') && !name.includes('verifier') && !name.includes('code')) {
          const match = name.match(/\.(\d+)$/);
          const index = match ? parseInt(match[1], 10) : 0;
          chunks.push({ name, index, val });
        }
      }
      chunks.sort((a, b) => a.index - b.index);
      if (chunks.length > 0) {
        let combined = chunks.map((c) => c.val).join('');
        try {
          combined = decodeURIComponent(combined);
          if (combined.startsWith('base64-')) {
            combined = atob(combined.slice(7));
          }
          const parsed = JSON.parse(combined);
          const res = findTokensInObj(parsed);
          if (res) return res;
        } catch {
          // Fall through
        }
      }
      return null;
    };

    // 1. Try direct JSON parsing
    try {
      const parsed = JSON.parse(trimmed);
      const res = findTokensInObj(parsed);
      if (res) return res;
    } catch {
      // Not direct JSON
    }

    // 2. Try Base64 format (often base64-...)
    try {
      let b64 = trimmed;
      if (b64.startsWith('base64-')) b64 = b64.slice(7);
      const decoded = atob(b64);
      const parsed = JSON.parse(decoded);
      const res = findTokensInObj(parsed);
      if (res) return res;
    } catch {
      // Not base64
    }

    // 3. Try parsing as raw cookie string
    if (trimmed.includes('auth-token') || trimmed.includes('sb-')) {
      const res = parseFromCookies(trimmed);
      if (res) return res;
    }

    // 4. Try Regex matching for access_token and refresh_token
    const tokenMatch = trimmed.match(/access_token["']?\s*[:=]\s*["']([^"'\s]+)["']/i);
    const refreshMatch = trimmed.match(/refresh_token["']?\s*[:=]\s*["']([^"'\s]+)["']/i);
    if (tokenMatch?.[1] && refreshMatch?.[1]) {
      return { accessToken: tokenMatch[1], refreshToken: refreshMatch[1] };
    }

    return null;
  };

  const handleRestoreSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      setDebugLogs([]);
      addLog('Iniciando proceso de restauración...');
      let finalAccessToken = '';
      let finalRefreshToken = '';

      if (activeTab === 'json') {
        const tokens = extractTokens(sessionInput);
        if (!tokens) {
          addLog('ERROR: No se encontraron tokens en el texto ingresado.');
          setErrorMessage(
            'No se encontraron access_token y refresh_token válidos en los datos pegados. Verifica que hayas copiado la sesión de tu entorno local.'
          );
          setLoading(false);
          return;
        }
        finalAccessToken = tokens.accessToken;
        finalRefreshToken = tokens.refreshToken;
        addLog(`Tokens extraídos con éxito (Access token length: ${finalAccessToken.length}).`);
      } else {
        finalAccessToken = accessToken.trim();
        finalRefreshToken = refreshToken.trim();

        if (!finalAccessToken || !finalRefreshToken) {
          addLog('ERROR: Faltan campos en los inputs manuales.');
          setErrorMessage('Debes ingresar tanto el Access Token como el Refresh Token.');
          setLoading(false);
          return;
        }
      }

      // 1. Sincronizar la sesión en el servidor para que se emitan las cookies HTTP
      addLog('Paso 1: Enviando tokens al endpoint del servidor (/api/auth/bypass)...');
      const apiRes = await fetch('/api/auth/bypass', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: finalAccessToken,
          refresh_token: finalRefreshToken,
        }),
      });

      const apiData = await apiRes.json().catch(() => null);
      addLog(`Paso 1 Respuesta HTTP ${apiRes.status}: ${JSON.stringify(apiData ?? {})}`);

      if (!apiRes.ok) {
        setErrorMessage(apiData?.error ?? 'No fue posible registrar la sesión en el servidor.');
        setLoading(false);
        return;
      }

      // 2. Establecer la sesión en el cliente de Supabase
      addLog('Paso 2: Fijando sesión en supabase.auth.setSession() en el navegador...');
      const supabase = createClient();
      const { data, error } = await supabase.auth.setSession({
        access_token: finalAccessToken,
        refresh_token: finalRefreshToken,
      });

      if (error) {
        addLog(`ERROR Supabase Client: ${error.message}`);
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      if (data.session) {
        const userEmail = data.session.user.email ?? 'Usuario identificado';
        addLog(`Paso 2 completado: Sesión local para ${userEmail} (ID: ${data.session.user.id}).`);
        
        // 3. Probar si el endpoint de sincronización (/api/sync) responde como usuario autenticado
        addLog('Paso 3: Verificando autorización en /api/sync...');
        try {
          const syncRes = await fetch('/api/sync');
          const syncData = await syncRes.json().catch(() => null);
          addLog(`Paso 3 Resultado /api/sync [HTTP ${syncRes.status}]: ${syncRes.ok ? 'AUTORIZADO (Perfil sincronizado correctamente)' : JSON.stringify(syncData ?? {})}`);
        } catch (syncErr: any) {
          addLog(`ERROR comprobando /api/sync: ${syncErr?.message}`);
        }

        // 4. Probar verificación en servidor /api/auth/bypass
        try {
          const serverCheckRes = await fetch('/api/auth/bypass');
          const serverCheckData = await serverCheckRes.json().catch(() => null);
          addLog(`Paso 4 Verificación en servidor [HTTP ${serverCheckRes.status}]: ${JSON.stringify(serverCheckData ?? {})}`);
        } catch (serverErr: any) {
          addLog(`ERROR en comprobación de servidor: ${serverErr?.message}`);
        }

        setSuccessMessage(`Sesión iniciada correctamente para: ${userEmail}. Puedes ingresar pulsando el botón verde.`);
        setLoading(false);
      } else {
        addLog('ERROR: data.session es nulo tras setSession.');
        setErrorMessage('No se pudo establecer la sesión con las credenciales provistas.');
        setLoading(false);
      }
    } catch (err: any) {
      addLog(`ERROR fatal en bypass: ${err?.message}`);
      setErrorMessage('Ocurrió un inconveniente al procesar la sesión.');
      setLoading(false);
    }
  };

  return (
    <div id="bypass-root" className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4">
      <div id="bypass-card" className="w-full max-w-xl bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
        <div id="bypass-header" className="p-6 border-b border-zinc-100 bg-zinc-900 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Acceso Directo de Sesión</h1>
              <p className="text-xs text-zinc-400">Importa tu sesión activa de local para ingresar de inmediato</p>
            </div>
          </div>
        </div>

        <div id="bypass-body" className="p-6 space-y-6">
          <div id="bypass-guide" className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-700">
                <Terminal className="w-4 h-4 text-zinc-500" />
                <span>Comando para tu consola local</span>
              </div>
              <button
                type="button"
                id="btn-copy-script"
                onClick={handleCopyScript}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 rounded-lg transition-colors cursor-pointer"
              >
                {copiedSnippet ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-600 font-semibold">¡Comando copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Copiar comando</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              1. En tu pestaña local logueada, abre la consola (F12 o Clic derecho &gt; Inspeccionar &gt; Consola).<br />
              2. Pega el comando y pulsa <strong>Enter</strong>.<br />
              3. Vuelve a esta página y pega (<kbd className="px-1 py-0.5 bg-zinc-200 rounded text-[10px] font-mono">Ctrl+V</kbd> / <kbd className="px-1 py-0.5 bg-zinc-200 rounded text-[10px] font-mono">Cmd+V</kbd>) en el cuadro de abajo.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200/60">
              <Info className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Nota: La consola del navegador siempre muestra &quot;undefined&quot; tras ejecutar copy(), pero los datos ya quedan en el portapapeles listos para pegar.</span>
            </div>
          </div>

          <div id="bypass-tabs" className="flex border-b border-zinc-200 gap-4">
            <button
              type="button"
              id="tab-json"
              onClick={() => setActiveTab('json')}
              className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'json'
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-400 hover:text-zinc-600'
              }`}
            >
              Pegar datos copiados
            </button>
            <button
              type="button"
              id="tab-manual"
              onClick={() => setActiveTab('manual')}
              className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'manual'
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-400 hover:text-zinc-600'
              }`}
            >
              Tokens individuales
            </button>
          </div>

          {errorMessage && (
            <div id="bypass-error" className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-3 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div id="bypass-success" className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl space-y-3">
              <div className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-600" />
                <span>{successMessage}</span>
              </div>
              <button
                type="button"
                id="btn-goto-groups"
                onClick={() => {
                  window.location.href = '/groups';
                }}
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                <span>Acceder a Mis Grupos</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <form id="bypass-form" onSubmit={handleRestoreSession} className="space-y-4">
            {activeTab === 'json' ? (
              <div className="space-y-1.5">
                <label htmlFor="session-json-input" className="block text-xs font-semibold text-zinc-700">
                  Contenido copiado (JSON, Cookies o Tokens)
                </label>
                <textarea
                  id="session-json-input"
                  rows={6}
                  value={sessionInput}
                  onChange={(e) => setSessionInput(e.target.value)}
                  placeholder='Pega aquí lo que copiaste (Ctrl+V / Cmd+V)...'
                  className="w-full p-3 font-mono text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 text-zinc-800"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="access-token-input" className="block text-xs font-semibold text-zinc-700">
                    Access Token
                  </label>
                  <textarea
                    id="access-token-input"
                    rows={3}
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full p-3 font-mono text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 text-zinc-800"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="refresh-token-input" className="block text-xs font-semibold text-zinc-700">
                    Refresh Token
                  </label>
                  <input
                    id="refresh-token-input"
                    type="text"
                    value={refreshToken}
                    onChange={(e) => setRefreshToken(e.target.value)}
                    placeholder="Token de actualización"
                    className="w-full p-3 font-mono text-xs bg-zinc-50 border border-zinc-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 text-zinc-800"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              id="btn-submit-session"
              disabled={loading}
              className="w-full bg-zinc-900 text-white rounded-xl py-3 px-4 font-medium hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99] shadow-sm cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verificando e ingresando...</span>
                </>
              ) : (
                <>
                  <span>Ingresar a la aplicación</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {debugLogs.length > 0 && (
            <div id="bypass-debug-log" className="p-4 bg-zinc-900 text-zinc-200 rounded-xl space-y-2 border border-zinc-800">
              <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold border-b border-zinc-800 pb-2">
                <span>Registro de Diagnóstico en Tiempo Real:</span>
                <span className="font-mono text-[10px] text-zinc-500">{debugLogs.length} eventos</span>
              </div>
              <div className="max-h-48 overflow-y-auto font-mono text-[11px] space-y-1.5 pt-1 text-zinc-300">
                {debugLogs.map((log, idx) => (
                  <div key={idx} className={`leading-relaxed break-all ${log.includes('ERROR') ? 'text-red-400 font-bold' : log.includes('ADVERTENCIA') ? 'text-amber-400' : 'text-zinc-300'}`}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
