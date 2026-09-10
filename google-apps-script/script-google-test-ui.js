/**
 * ============================================================
 * PANEL DE PRUEBAS DE MATCHING — Apps Script
 * ============================================================
 *
 * Este archivo NO implementa matching, limpieza ni extracción.
 * Reutiliza directamente las funciones del motor compartido:
 *   - diagnoseEmailMatching()
 *   - getTemplatesWithCache()
 *   - sendCandidate()
 *
 * Uso:
 *   Abrir el Web App con ?mode=test
 *
 * Permite buscar cualquier correo de Gmail mediante una consulta de Gmail,
 * seleccionar uno y ejecutar el mismo flujo de matching sin esperar al cron.
 * También permite crear el candidato del correo seleccionado, usando el mismo
 * sendCandidate() que utiliza el cron.
 * ============================================================
 */

function getTestEmails(options) {
  options = options || {};
  const mode = options.mode || 'recent';
  const count = Math.min(Math.max(Number(options.count) || 10, 1), 50);
  const query = String(options.query || '').trim();

  let threads;

  if (mode === 'search' && query) {
    threads = GmailApp.search(query, 0, count);
  } else {
    threads = GmailApp.search('in:anywhere', 0, count);
  }

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
        snippet: String(message.getPlainBody() || '').replace(/\s+/g, ' ').trim().slice(0, 220)
      });
    });
  });

  emails.sort((a, b) => new Date(b.date) - new Date(a.date));

  return emails.slice(0, count);
}


function getTestEmailById(messageId) {
  const id = String(messageId || '').trim();
  if (!id) throw new Error('Falta el ID del correo.');

  const message = GmailApp.getMessageById(id);
  if (!message) throw new Error('No se encontró el correo.');

  return {
    id: message.getId(),
    threadId: message.getThread().getId(),
    date: message.getDate().toISOString(),
    from: message.getFrom(),
    to: message.getTo(),
    subject: message.getSubject(),
    body: message.getPlainBody() || ''
  };
}

function renderEmailTestApp() {
  return HtmlService
    .createHtmlOutputFromFile('test-ui')
    .setTitle('Deudita — Prueba de correo');
}
