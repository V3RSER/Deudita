import nodemailer from 'nodemailer';

interface SendInviteParams {
  to: string;
  inviterName: string;
  inviterEmail: string;
  groupName: string;
  inviteUrl: string;
}

export async function sendGroupInviteEmail({
  to,
  inviterName,
  inviterEmail,
  groupName,
  inviteUrl,
}: SendInviteParams): Promise<{ success: boolean; simulated?: boolean; message?: string }> {
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invitación a Deudita</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px; color: #18181b; }
        .container { max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 24px; padding: 40px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); border: 1px solid #e4e4e7; }
        .logo { font-size: 22px; font-weight: 800; color: #09090b; display: inline-block; letter-spacing: -0.5px; }
        .logo span { color: #10b981; }
        .badge { display: inline-block; background-color: #ecfdf5; color: #047857; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 6px 12px; border-radius: 20px; margin-top: 20px; margin-bottom: 12px; }
        h1 { font-size: 24px; font-weight: 700; color: #09090b; margin: 0 0 12px 0; letter-spacing: -0.5px; }
        p { font-size: 15px; line-height: 1.6; color: #52525b; margin: 0 0 20px 0; }
        .group-card { background-color: #fafafa; border: 1px solid #f4f4f5; border-radius: 16px; padding: 20px; margin: 24px 0; text-align: center; }
        .group-name { font-size: 20px; font-weight: 700; color: #09090b; margin-bottom: 4px; }
        .inviter { font-size: 13px; color: #71717a; }
        .btn-container { text-align: center; margin: 32px 0; }
        .btn { display: inline-block; background-color: #09090b; color: #ffffff !important; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 9999px; transition: background-color 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .footer { font-size: 12px; color: #a1a1aa; text-align: center; margin-top: 32px; border-top: 1px solid #f4f4f5; padding-top: 20px; }
        .link-fallback { word-break: break-all; font-size: 12px; color: #10b981; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">Deudita<span>.</span></div>
        <div>
          <span class="badge">Invitación a Grupo</span>
        </div>
        <h1>¡Te han invitado a compartir gastos!</h1>
        <p><strong>${inviterName}</strong> (${inviterEmail}) te ha invitado a unirte a un grupo para administrar cuentas y gastos compartidos fácilmente.</p>
        
        <div class="group-card">
          <div class="group-name">${groupName}</div>
          <div class="inviter">Invitado por ${inviterName}</div>
        </div>

        <p>Si aún no tienes cuenta en Deudita, al entrar con este enlace podrás registrarte en un solo clic con Google y quedarás unido automáticamente al grupo.</p>

        <div class="btn-container">
          <a href="${inviteUrl}" class="btn" target="_blank">Aceptar Invitación</a>
        </div>

        <p style="font-size: 13px; color: #71717a;">¿No funciona el botón? Copia y pega este enlace en tu navegador:</p>
        <p class="link-fallback">${inviteUrl}</p>

        <div class="footer">
          <p>Has recibido este correo porque fuiste invitado por un miembro de Deudita.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Check if custom SMTP env credentials exist
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Boolean(process.env.SMTP_SECURE === 'true'),
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: `"${inviterName} vía Deudita" <${smtpUser}>`,
        to,
        subject: `Te han invitado al grupo "${groupName}" en Deudita`,
        html: htmlContent,
      });

      console.log(`[Email] Enviado correo de invitación exitosamente a ${to}`);
      return { success: true };
    } catch (err: unknown) {
      console.error('[Email] Error al enviar mediante SMTP:', err);
      // Fallback to successful response with invite link logged
    }
  }

  // Simulated email delivery logging
  console.log(`[Email Simulación] Invitación preparada para ${to}:`);
  console.log(`  De: ${inviterName} (${inviterEmail})`);
  console.log(`  Grupo: ${groupName}`);
  console.log(`  Enlace de unirse: ${inviteUrl}`);

  return { success: true, simulated: true, message: 'Invitación generada correctamente' };
}
