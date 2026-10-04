/**
 * Messages de la connexion (code par e-mail, Google), choisis par CODE
 * d'erreur de GoTrue — jamais le texte brut du serveur (bonnes-pratiques C2).
 *
 * Aucun message ne dit si une adresse a déjà un compte : la passerelle du
 * service répond pareil dans les deux cas, et l'app ne doit pas réintroduire
 * la différence.
 */

const MESSAGES: Record<string, string> = {
  validation_failed: 'Vérifie l\'adresse e-mail ou le code.',
  email_address_invalid: 'Cette adresse e-mail n\'est pas valable.',
  captcha_failed: 'La vérification anti-robot a échoué : réessaie.',
  over_request_rate_limit: 'Trop d\'essais : attends quelques minutes avant de réessayer.',
  over_email_send_rate_limit: 'Trop d\'envois : attends une minute avant de redemander un code.',
  otp_expired: 'Ce code est faux ou a expiré.',
  email_not_confirmed: 'Cette adresse Google n\'est pas vérifiée chez Google.',
}

const PAR_DEFAUT = 'La connexion n\'a pas abouti. Vérifie ta connexion, puis réessaie.'

/** Le message à montrer pour une erreur de connexion, d'après son code. */
export function messageConnexion(erreur: unknown): string {
  const code = (erreur as { code?: unknown } | null)?.code
  return typeof code === 'string' && MESSAGES[code] ? MESSAGES[code] : PAR_DEFAUT
}
