/**
 * Page publique de suppression du compte (exigée par Google Play) :
 * connexion, case à cocher, puis la même fonction que l'app,
 * `delete_my_account`, appelée par PostgREST avec la session de la page.
 */
import { annonceur, creerConnexion } from './connexion.js'

const annoncer = annonceur()
const certain = document.getElementById('certain')
const boutonSupprimer = document.getElementById('supprimer')

const connexion = creerConnexion({
  annoncer,
  surConnecte: (session) => {
    document.getElementById('compte').textContent = session.email
    document.getElementById('decision').hidden = false
    certain.focus()
  },
})

certain.addEventListener('change', () => { boutonSupprimer.disabled = !certain.checked })

boutonSupprimer.addEventListener('click', async () => {
  const session = connexion.session()
  if (!session || !certain.checked) return
  boutonSupprimer.disabled = true
  annoncer('Suppression en cours…')
  let ok = false
  try {
    const reponse = await fetch('/rest/v1/rpc/delete_my_account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.jeton}` },
      body: '{}',
    })
    ok = reponse.ok
  }
  catch {
    ok = false
  }
  if (!ok) {
    annoncer('La suppression n\'a pas abouti. Réessaie, ou écris-nous depuis la page des mentions légales.')
    boutonSupprimer.disabled = false
    return
  }
  document.getElementById('decision').hidden = true
  annoncer('Ton compte est supprimé. Sur ton téléphone, l\'app te demandera de te reconnecter pour utiliser les groupes.')
})
