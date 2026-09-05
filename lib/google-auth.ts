export interface TokenVerificationResult {
  valid: boolean;
  hasGmailScope: boolean;
  email: string | null;
  gmailApiEnabled: boolean;
  serviceDisabled: boolean;
  activationUrl?: string;
  projectId?: string;
  error?: string;
}

/**
 * Verifica un token de Google OAuth consultando tokeninfo y el estado de la API de Gmail.
 * Identifica si el token es válido, si tiene permisos de Gmail, y si la API de Gmail
 * está habilitada en la consola de Google Cloud del proyecto.
 */
export async function verifyGoogleToken(token: string): Promise<TokenVerificationResult> {
  if (!token || typeof token !== 'string') {
    return {
      valid: false,
      hasGmailScope: false,
      email: null,
      gmailApiEnabled: false,
      serviceDisabled: false,
      error: 'Token no proporcionado',
    };
  }

  try {
    // 1. Consultar tokeninfo para comprobar validez de la sesión y scopes otorgados
    const infoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
      { cache: 'no-store' }
    );

    if (!infoRes.ok) {
      return {
        valid: false,
        hasGmailScope: false,
        email: null,
        gmailApiEnabled: false,
        serviceDisabled: false,
        error: 'El token de Google ha caducado o es inválido',
      };
    }

    const info = await infoRes.json();
    const scopes = typeof info.scope === 'string' ? info.scope : '';
    const hasGmailScope = scopes.includes('gmail.readonly') || scopes.includes('gmail');
    const email = typeof info.email === 'string' ? info.email : null;

    // 2. Comprobar si la API de Gmail está activa en el proyecto de Google Cloud
    let gmailApiEnabled = false;
    let serviceDisabled = false;
    let activationUrl: string | undefined;
    let projectId: string | undefined;

    try {
      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });

      if (profileRes.ok) {
        gmailApiEnabled = true;
      } else {
        const errJson = await profileRes.json().catch(() => null);
        const errMessage = errJson?.error?.message || '';
        const reason =
          errJson?.error?.details?.[0]?.reason ||
          errJson?.error?.errors?.[0]?.reason ||
          '';

        if (
          profileRes.status === 403 &&
          (reason === 'SERVICE_DISABLED' ||
            errMessage.includes('Gmail API has not been used in project') ||
            errMessage.includes('is disabled'))
        ) {
          serviceDisabled = true;
          const match = errMessage.match(/project (\d+)/i) || errMessage.match(/project=(\d+)/i);
          if (match) {
            projectId = match[1];
            activationUrl = `https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=${projectId}`;
          } else {
            activationUrl = 'https://console.developers.google.com/apis/api/gmail.googleapis.com/overview';
          }
        }
      }
    } catch (gErr) {
      console.warn('[verifyGoogleToken] Error al consultar perfil de Gmail:', gErr);
    }

    return {
      valid: true,
      hasGmailScope,
      email,
      gmailApiEnabled,
      serviceDisabled,
      activationUrl,
      projectId,
    };
  } catch (err: unknown) {
    console.error('[verifyGoogleToken] Error inesperado:', err);
    return {
      valid: false,
      hasGmailScope: false,
      email: null,
      gmailApiEnabled: false,
      serviceDisabled: false,
      error: err instanceof Error ? err.message : 'Error al verificar token',
    };
  }
}
