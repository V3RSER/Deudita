# Módulo Temporal de Bypass de Autenticación

Este módulo permite sincronizar una sesión de desarrollo activa pegando los tokens desde la consola o almacenamiento local.

## Archivos que componen esta funcionalidad:
1. `/app/auth/bypass/page.tsx` — Vista y formulario para importar la sesión.
2. `/app/api/auth/bypass/route.ts` — Endpoint de API para registrar las cookies de sesión en el servidor.
3. `/components/AuthView.tsx` — Contiene un botón delimitado con comentarios `[TEMPORARY DEV BYPASS BUTTON - EASY TO REMOVE]` en la parte inferior.
4. `TEMPORARY_BYPASS_README.md` — Esta guía.

## ¿Cómo borrarlo por completo?
Para remover toda esta funcionalidad sin dejar ningún rastro en la aplicación:

1. Elimina las carpetas temporales y esta guía:
```bash
rm -rf app/auth/bypass
rm -rf app/api/auth/bypass
rm -f TEMPORARY_BYPASS_README.md
```

2. En `/components/AuthView.tsx`, elimina el bloque marcado:
```tsx
{/* --- [TEMPORARY DEV BYPASS BUTTON - EASY TO REMOVE] --- */}
...
{/* ----------------------------------------------------- */}
```
