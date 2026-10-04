/**
 * Le CAPTCHA (Cloudflare Turnstile) que l'app affiche dans un cadre avant
 * de demander un code de connexion. Turnstile n'accepte que les noms de
 * domaine déclarés : il tourne donc ici, sous le nôtre, et non dans la
 * WebView de l'app (origine https://localhost).
 *
 * Le jeton part à la fenêtre parente, et à elle seule : son origine, lue
 * dans `location.ancestorOrigins`, doit être celle de l'app ou du serveur
 * de développement — sinon rien n'est envoyé.
 */

const ORIGINES_ADMISES = /^https?:\/\/localhost(:\d+)?$/

const parent = window.location.ancestorOrigins?.[0] ?? ''
const zone = document.getElementById('captcha')

function envoyer(message) {
  if (ORIGINES_ADMISES.test(parent)) window.parent.postMessage({ source: 'arpente-captcha', ...message }, parent)
}

const script = document.createElement('script')
script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
script.async = true
script.onload = () => {
  window.turnstile.render(zone, {
    sitekey: zone.dataset.turnstile,
    language: 'fr',
    callback: (jeton) => envoyer({ jeton }),
    'expired-callback': () => envoyer({ jeton: '' }),
    'error-callback': () => envoyer({ erreur: true }),
  })
}
script.onerror = () => envoyer({ erreur: true })
document.head.append(script)
