/**
 * Les pages HTML servies par le service : l'accord donné à un assistant, la
 * suppression du compte (exigée par Google Play dès que l'app a des
 * comptes), et le CAPTCHA que l'app affiche dans un cadre.
 *
 * Choix non évidents :
 * - **Aucun script ni style en ligne** : tout vient de `/connexion/*`, et la
 *   CSP n'ouvre que les origines de Cloudflare Turnstile et de Google
 *   Identity Services, chacune pour ce qu'elle charge.
 * - **Les valeurs injectées sont échappées ici**, une fois : nom vérifié de
 *   l'assistant, nom déclaré (déjà nettoyé), clés publiques.
 * - **`Referrer-Policy: strict-origin`**, jamais `no-referrer` : le bouton
 *   Google vérifie l'origine de la page (bonnes-pratiques §D).
 * - **Le CAPTCHA de l'app** se laisse encadrer par la seule WebView de l'app
 *   (`https://localhost`) et le serveur de développement.
 *
 * Invariant : rien de ce qui vient d'un assistant n'est inséré sans
 * échappement.
 */

export interface CleesPubliques {
  turnstile: string
  google: string
}

const echappements: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }

export function echapper(texte: string): string {
  return texte.replace(/[&<>"']/g, c => echappements[c]!)
}

const CSP_PAGES = [
  'default-src \'none\'',
  'script-src \'self\' https://challenges.cloudflare.com https://accounts.google.com/gsi/client',
  'style-src \'self\' https://accounts.google.com/gsi/style',
  'connect-src \'self\' https://accounts.google.com/gsi/',
  'frame-src https://challenges.cloudflare.com https://accounts.google.com/gsi/',
  'img-src \'self\' data:',
  'form-action \'none\'',
  'base-uri \'none\'',
  'frame-ancestors \'none\'',
].join('; ')

const CSP_CAPTCHA = [
  'default-src \'none\'',
  'script-src \'self\' https://challenges.cloudflare.com',
  'style-src \'self\'',
  'frame-src https://challenges.cloudflare.com',
  'connect-src \'self\'',
  'form-action \'none\'',
  'base-uri \'none\'',
  'frame-ancestors https://localhost http://localhost:* https://localhost:*',
].join('; ')

export const ENTETES_PAGES: Record<string, string> = {
  'Content-Security-Policy': CSP_PAGES,
  'Referrer-Policy': 'strict-origin',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
}

export const ENTETES_CAPTCHA: Record<string, string> = {
  'Content-Security-Policy': CSP_CAPTCHA,
  'Referrer-Policy': 'strict-origin',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
}

function page(titre: string, corps: string, script: string, cles: CleesPubliques): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${echapper(titre)} — Arpente</title>
<link rel="stylesheet" href="/connexion/pages.css">
</head>
<body>
<main id="page" data-turnstile="${echapper(cles.turnstile)}" data-google="${echapper(cles.google)}">
<p class="marque">Arpente</p>
${corps}
</main>
<script type="module" src="/connexion/${script}"></script>
</body>
</html>`
}

/** Le bloc de connexion (code par e-mail, ou Google), commun aux pages. */
function blocConnexion(cles: CleesPubliques): string {
  const google = cles.google
    ? `<p class="ou" aria-hidden="true">ou</p>
<button type="button" id="google" class="secondaire">Continuer avec Google</button>
<div id="google-secours"></div>`
    : ''
  return `<section id="connexion" aria-labelledby="titre-connexion">
<h2 id="titre-connexion">Connecte-toi à ton compte Arpente</h2>
<form id="form-adresse" novalidate>
<label for="adresse">Adresse e-mail</label>
<input id="adresse" name="adresse" type="email" autocomplete="email" required aria-describedby="erreur-adresse">
<p id="erreur-adresse" class="erreur" hidden></p>
<div id="captcha" class="captcha"></div>
<button type="submit" id="envoyer">Recevoir un code</button>
</form>
<form id="form-code" novalidate hidden>
<label for="code">Code à 6 chiffres reçu par e-mail</label>
<input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required aria-describedby="erreur-code aide-code">
<p id="aide-code" class="aide">Le code est valable 15 minutes. Pense à regarder dans les indésirables.</p>
<p id="erreur-code" class="erreur" hidden></p>
<button type="submit" id="valider">Valider</button>
<button type="button" id="renvoyer" class="lien" disabled>Renvoyer un code</button>
<p id="compte-a-rebours" class="aide" aria-live="polite"></p>
</form>
${google}
</section>`
}

/** Heure d'une demande, à Paris : « 14 h 05 ». */
function heure(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':', ' h ')
}

export function pageAccord(
  vue: { assistant: string, client: string, demandeeLe: Date } | { erreur: string },
  cles: CleesPubliques,
): string {
  if ('erreur' in vue) {
    return page('Demande expirée', `<h1>Autoriser un assistant IA</h1>
<p class="erreur-bloc" role="alert">${echapper(vue.erreur)}</p>`, 'accord.js', cles)
  }
  return page('Autoriser un assistant IA', `<h1>Autoriser un assistant IA</h1>
<p><strong>${echapper(vue.assistant)}</strong> demande à accéder à ton compte Arpente${vue.client ? ` (il se présente comme « ${echapper(vue.client)} »)` : ''}. Demande faite à ${echapper(heure(vue.demandeeLe))}.</p>
<p class="alerte">Si tu n'as pas lancé toi-même cette connexion depuis ton assistant, à l'instant, ferme cette page : quelqu'un essaie peut-être d'obtenir l'accès à ton compte.</p>
<h2>Il pourra</h2>
<ul>
<li>lire les lieux et les parcours de Caen et de Troyes ;</li>
<li>lire tes groupes de visite : pseudos des membres, votes, envies, lieux cochés, parcours arrêté ;</li>
<li>voter et régler tes envies en ton nom ;</li>
<li>arrêter le parcours d'un groupe, après ton accord dans la conversation.</li>
</ul>
<p>Il ne verra jamais ton adresse e-mail ni celle des autres membres. Tu pourras retirer cet accès à tout moment dans l'app : <em>Compte › Assistant IA</em>. N'autorise qu'un assistant que tu utilises toi-même.</p>
${blocConnexion(cles)}
<section id="decision" aria-labelledby="titre-decision" hidden>
<h2 id="titre-decision">Ta réponse</h2>
<p>Compte connecté : <strong id="compte"></strong>.</p>
<p><input type="checkbox" id="moi-meme"> <label for="moi-meme">J'ai lancé cette connexion moi-même, à l'instant, depuis ${echapper(vue.assistant)}.</label></p>
<button type="button" id="autoriser" disabled>Autoriser</button>
</section>
<button type="button" id="refuser" class="secondaire">Refuser</button>
<p id="etat" class="etat" role="status" aria-live="polite"></p>`, 'accord.js', cles)
}

export function pageSuppression(cles: CleesPubliques): string {
  return page('Supprimer mon compte', `<h1>Supprimer mon compte Arpente</h1>
<p>La suppression efface ton compte, ton pseudo, tes adhésions, tes votes, tes envies et les accès accordés à un assistant IA. Les groupes que tu as créés restent à leurs autres membres. C'est immédiat et définitif.</p>
<p>Depuis l'app : <em>Compte › Supprimer mes données</em>. Ici, connecte-toi d'abord pour prouver que le compte est le tien.</p>
${blocConnexion(cles)}
<section id="decision" aria-labelledby="titre-decision" hidden>
<h2 id="titre-decision">Confirmer la suppression</h2>
<p>Compte connecté : <strong id="compte"></strong>.</p>
<p><input type="checkbox" id="certain"> <label for="certain">Je veux supprimer définitivement mon compte.</label></p>
<button type="button" id="supprimer" class="danger" disabled>Supprimer mon compte</button>
</section>
<p id="etat" class="etat" role="status" aria-live="polite"></p>`, 'suppression.js', cles)
}

export function pageCaptcha(cles: CleesPubliques): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Vérification — Arpente</title>
<link rel="stylesheet" href="/connexion/captcha.css">
</head>
<body>
<div id="captcha" data-turnstile="${echapper(cles.turnstile)}"></div>
<script type="module" src="/connexion/captcha.js"></script>
</body>
</html>`
}
