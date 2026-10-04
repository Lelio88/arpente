/**
 * Page d'accord d'un assistant IA : connexion au compte Arpente, puis
 * Autoriser ou Refuser. La décision part à `/oauth/accord` avec le jeton de
 * session en en-tête (pas de cookie, donc rien à forger depuis un autre
 * site) ; la page se déconnecte, puis rend la main à l'assistant.
 */
import { annonceur, creerConnexion } from './connexion.js'

const demande = new URLSearchParams(location.search).get('demande') ?? ''
const annoncer = annonceur()
const boutonRefuser = document.getElementById('refuser')
const boutonAutoriser = document.getElementById('autoriser')

async function decider(decision, connexion) {
  const session = connexion?.session()
  boutonRefuser.disabled = true
  if (boutonAutoriser) boutonAutoriser.disabled = true
  annoncer(decision === 'autoriser' ? 'Autorisation en cours…' : 'Refus en cours…')
  const entetes = { 'Content-Type': 'application/json' }
  if (session) entetes.Authorization = `Bearer ${session.jeton}`
  let reponse
  try {
    reponse = await fetch('/oauth/accord', { method: 'POST', headers: entetes, body: JSON.stringify({ demande, decision }) })
  }
  catch {
    reponse = null
  }
  const corps = reponse ? await reponse.json().catch(() => ({})) : {}
  if (!reponse?.ok || typeof corps.redirection !== 'string') {
    annoncer(corps.erreur ?? 'La réponse n\'a pas pu être enregistrée. Réessaie.')
    boutonRefuser.disabled = false
    if (boutonAutoriser) boutonAutoriser.disabled = false
    return
  }
  await connexion?.deconnecter()
  annoncer('C\'est fait : retour à ton assistant…')
  location.assign(corps.redirection)
}

if (document.getElementById('connexion')) {
  const connexion = creerConnexion({
    annoncer,
    surConnecte: (session) => {
      document.getElementById('compte').textContent = session.email
      document.getElementById('decision').hidden = false
      boutonAutoriser.focus()
    },
  })
  boutonAutoriser.addEventListener('click', () => { void decider('autoriser', connexion) })
  boutonRefuser.addEventListener('click', () => { void decider('refuser', connexion) })
}
