# Directiva de Ejecución y Desarrollo Ágil

## Regla Absoluta: Dev Server Continuo (Cero Builds Manuales)

1. **El dev server (`npm run dev`) ya está corriendo permanentemente**: Cada vez que se edita un archivo, Next.js recompila el módulo en ~1 segundo en memoria (ej. `✓ Compiled in 1358ms`), exactamente igual que en un entorno local.
2. **NUNCA ejecutar `compile_applet`**: Esta herramienta corre `npm run build` (build de producción desde cero). Destruye la caché, tarda minutos y congela el contenedor. Está estrictamente prohibido usarla salvo que el usuario escriba de forma explícita: "compila el proyecto" o "haz un build".
3. **NUNCA ejecutar comandos de build manuales**: No correr `npm run build`, `next build` ni tareas en segundo plano.
4. **Validación rápida**: Si se necesita verificar sintaxis, únicamente usar `lint_applet` (< 2 segundos).
5. **Finalización inmediata**: Tras editar el código, terminar el turno inmediatamente para que el dev server refleje el cambio de inmediato.
