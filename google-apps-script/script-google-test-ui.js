/**
 * PANEL DE PRUEBAS — Apps Script
 *
 * Este archivo únicamente expone la bandeja de Gmail al frontend.
 * Al seleccionar un correo, el frontend llama al flujo de producción
 * syncExpenseEmails(messageId), definido en script-google-cron-job.js.
 */
function renderEmailTestApp() {
  return HtmlService
    .createHtmlOutputFromFile('test-ui')
    .setTitle('Deudita — Prueba de correo')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getTestEmails(options) {
  options = options || {};

  const mode = options.mode === 'search' ? 'search' : 'recent';
  const count = Math.min(Math.max(Number(options.count) || 10, 1), 50);
  const query = String(options.query || '').trim();

  if (mode === 'search' && !query) {
    throw new Error('Escribe algo para buscar.');
  }

  // GmailApp.search devuelve hilos. Para el panel necesitamos mensajes,
  // por eso recuperamos los mensajes de esos hilos y ordenamos al final.
  const searchQuery = mode === 'search' ? query : 'in:anywhere';
  const threads = GmailApp.search(searchQuery, 0, count);
  const emails = [];

  threads.forEach(thread => {
    thread.getMessages().forEach(message => {
      emails.push({
        id: message.getId(),
        threadId: thread.getId(),
        date: message.getDate().toISOString(),
        from: message.getFrom(),
        to: message.getTo(),
        subject: message.getSubject(),
        snippet: String(message.getPlainBody() || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 220),
      });
    });
  });

  emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return emails.slice(0, count);
}
