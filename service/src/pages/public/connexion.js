/**
 * Connexion à un compte Arpente depuis une page du service (accord d'un
 * assistant, suppression du compte), sans bibliothèque : appels REST à
 * GoTrue, sur la même origine (`/auth/v1/*`, derrière Caddy).
 *
 * Choix non évidents :
 * - **La session ne vit qu'en mémoire** : rien dans localStorage ni dans un
 *   cookie. La page s'en sert pour une décision, puis se déconnecte
 *   (`/logout?scope=local`, aussi à `pagehide`) — la session de l'app sur le
 *   téléphone n'est pas touchée.
 * - **Turnstile et Google ne se chargent qu'au moment où ils servent**
 *   (bonnes-pratiques §D) : le CAPTCHA à l'affichage du formulaire, Google au
 *   clic.
 * - **Nonce Google** : Google reçoit l'empreinte SHA-256, GoTrue la valeur
 *   brute, qu'il hache pour comparer — un jeton Google intercepté ne se
 *   rejoue pas.
 * - **Messages par code d'erreur**, jamais le texte brut du serveur.
 *
 *   const connexion = creerConnexion({ surConnecte: (session) => … })
 */

const VERSION_API = '2024-01-01'
const ATTENTE_RENVOI = 60

const MESSAGES = {
  validation_failed: 'Vérifie l\'adresse e-mail ou le code.',
  email_address_invalid: 'Cette adresse e-mail n\'est pas valable.',
  captcha_failed: 'La vérification anti-robot a échoué : réessaie.',
  over_request_rate_limit: 'Trop d\'essais : attends quelques minutes avant de réessayer.',
  over_email_send_rate_limit: 'Trop d\'envois : attends une minute avant de redemander un code.',
  otp_expired: 'Ce code est faux ou a expiré.',
  default: 'La connexion n\'a pas abouti. Réessaie dans un instant.',
}

function message(code) {
  return MESSAGES[code] ?? MESSAGES.default
}

async function appeler(chemin, corps, jeton) {
  const entetes = { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': VERSION_API }
  if (jeton) entetes.Authorization = `Bearer ${jeton}`
  const reponse = await fetch(chemin, { method: 'POST', headers: entetes, body: JSON.stringify(corps ?? {}) })
  const texte = await reponse.text()
  let donnees = {}
  try { donnees = texte ? JSON.parse(texte) : {} }
  catch { donnees = {} }
  return { ok: reponse.ok, statut: reponse.status, donnees }
}

function chargerScript(url) {
  return new Promise((resoudre, rejeter) => {
    const s = document.createElement('script')
    s.src = url
    s.async = true
    s.onload = () => resoudre()
    s.onerror = () => rejeter(new Error('script indisponible'))
    document.head.append(s)
  })
}

async function empreinte(texte) {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte))
  return [...new Uint8Array(octets)].map(o => o.toString(16).padStart(2, '0')).join('')
}

function aleatoire() {
  const octets = crypto.getRandomValues(new Uint8Array(32))
  return [...octets].map(o => o.toString(16).padStart(2, '0')).join('')
}

function afficherErreur(champ, zone, texte) {
  zone.textContent = texte
  zone.hidden = !texte
  if (texte) champ.setAttribute('aria-invalid', 'true')
  else champ.removeAttribute('aria-invalid')
}

/**
 * Câble le bloc de connexion de la page. `surConnecte` reçoit la session
 * (`{ jeton, email }`) quand la connexion aboutit.
 */
export function creerConnexion({ surConnecte, annoncer }) {
  const page = document.getElementById('page')
  const cleTurnstile = page.dataset.turnstile
  const clientGoogle = page.dataset.google
  const formAdresse = document.getElementById('form-adresse')
  const formCode = document.getElementById('form-code')
  const champAdresse = document.getElementById('adresse')
  const champCode = document.getElementById('code')
  const erreurAdresse = document.getElementById('erreur-adresse')
  const erreurCode = document.getElementById('erreur-code')
  const boutonEnvoyer = document.getElementById('envoyer')
  const boutonValider = document.getElementById('valider')
  const boutonRenvoyer = document.getElementById('renvoyer')
  const compteARebours = document.getElementById('compte-a-rebours')
  const boutonGoogle = document.getElementById('google')

  let session = null
  let adresse = ''
  let jetonCaptcha = ''
  let widget = null
  let minuteur = null

  async function preparerCaptcha() {
    if (!cleTurnstile || widget !== null) return
    try {
      await chargerScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit')
      widget = window.turnstile.render('#captcha', {
        sitekey: cleTurnstile,
        language: 'fr',
        callback: (t) => { jetonCaptcha = t },
        'expired-callback': () => { jetonCaptcha = '' },
        'error-callback': () => { jetonCaptcha = '' },
      })
    }
    catch {
      annoncer('La vérification anti-robot ne se charge pas. Vérifie ta connexion puis recharge la page.')
    }
  }

  function demarrerRebours() {
    let reste = ATTENTE_RENVOI
    boutonRenvoyer.disabled = true
    clearInterval(minuteur)
    compteARebours.textContent = `Tu pourras redemander un code dans ${reste} secondes.`
    minuteur = setInterval(() => {
      reste -= 1
      if (reste <= 0) {
        clearInterval(minuteur)
        boutonRenvoyer.disabled = false
        compteARebours.textContent = 'Tu peux redemander un code.'
      }
      else if (reste % 15 === 0) {
        compteARebours.textContent = `Tu pourras redemander un code dans ${reste} secondes.`
      }
    }, 1000)
  }

  async function envoyerCode() {
    afficherErreur(champAdresse, erreurAdresse, '')
    adresse = champAdresse.value.trim()
    if (!champAdresse.checkValidity() || !adresse) {
      afficherErreur(champAdresse, erreurAdresse, 'Saisis une adresse e-mail valable.')
      champAdresse.focus()
      return
    }
    if (cleTurnstile && !jetonCaptcha) {
      afficherErreur(champAdresse, erreurAdresse, 'Termine d\'abord la vérification anti-robot.')
      return
    }
    boutonEnvoyer.disabled = true
    const r = await appeler('/auth/v1/otp', {
      email: adresse,
      create_user: true,
      gotrue_meta_security: jetonCaptcha ? { captcha_token: jetonCaptcha } : undefined,
    })
    boutonEnvoyer.disabled = false
    jetonCaptcha = ''
    if (widget !== null) window.turnstile.reset(widget)
    if (!r.ok) {
      afficherErreur(champAdresse, erreurAdresse, message(r.donnees.error_code ?? r.donnees.code))
      return
    }
    formCode.hidden = false
    annoncer(`Si l'adresse est bonne, un code vient d'y être envoyé.`)
    champCode.focus()
    demarrerRebours()
  }

  async function validerCode() {
    afficherErreur(champCode, erreurCode, '')
    const code = champCode.value.trim()
    if (!/^\d{6}$/.test(code)) {
      afficherErreur(champCode, erreurCode, 'Le code compte 6 chiffres.')
      champCode.focus()
      return
    }
    boutonValider.disabled = true
    const r = await appeler('/auth/v1/verify', { type: 'email', email: adresse, token: code })
    boutonValider.disabled = false
    if (!r.ok || !r.donnees.access_token) {
      afficherErreur(champCode, erreurCode, message(r.donnees.error_code ?? r.donnees.code))
      champCode.focus()
      return
    }
    connecte(r.donnees)
  }

  async function connexionGoogle() {
    try {
      await chargerScript('https://accounts.google.com/gsi/client')
    }
    catch {
      annoncer('La connexion Google ne se charge pas. Utilise plutôt un code par e-mail.')
      return
    }
    const nonce = aleatoire()
    window.google.accounts.id.initialize({
      client_id: clientGoogle,
      nonce: await empreinte(nonce),
      context: 'signin',
      use_fedcm_for_prompt: true,
      callback: async ({ credential }) => {
        const r = await appeler('/auth/v1/token?grant_type=id_token',
          { provider: 'google', id_token: credential, nonce })
        if (!r.ok || !r.donnees.access_token) {
          annoncer(message(r.donnees.error_code ?? r.donnees.code))
          return
        }
        connecte(r.donnees)
      },
    })
    window.google.accounts.id.renderButton(document.getElementById('google-secours'),
      { type: 'standard', theme: 'outline', text: 'continue_with', locale: 'fr' })
    window.google.accounts.id.prompt()
  }

  function connecte(donnees) {
    clearInterval(minuteur)
    session = { jeton: donnees.access_token, email: donnees.user?.email ?? '' }
    document.getElementById('connexion').hidden = true
    surConnecte(session)
  }

  async function deconnecter() {
    if (!session) return
    const jeton = session.jeton
    session = null
    await appeler('/auth/v1/logout?scope=local', {}, jeton).catch(() => undefined)
  }

  formAdresse.addEventListener('submit', (e) => { e.preventDefault(); void envoyerCode() })
  formCode.addEventListener('submit', (e) => { e.preventDefault(); void validerCode() })
  boutonRenvoyer.addEventListener('click', () => { formCode.hidden = true; champAdresse.focus() })
  boutonGoogle?.addEventListener('click', () => { void connexionGoogle() })
  window.addEventListener('pagehide', () => {
    if (!session) return
    // keepalive : la requête part même si la page se ferme.
    fetch('/auth/v1/logout?scope=local', {
      method: 'POST',
      keepalive: true,
      headers: { Authorization: `Bearer ${session.jeton}`, 'X-Supabase-Api-Version': VERSION_API },
    }).catch(() => undefined)
  })
  void preparerCaptcha()

  return { session: () => session, deconnecter }
}

/** Zone d'annonce commune (role="status"). */
export function annonceur() {
  const etat = document.getElementById('etat')
  return (texte) => { etat.textContent = texte }
}
