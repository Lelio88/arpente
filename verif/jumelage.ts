/** Verifie utils/jumelage.ts contre la vraie implementation, hors de Nuxt. */
import {
  DUREE_DEMANDE_MS,
  demandeCorrespondante,
  lienDemande,
  lienRejoindre,
  lienReponse,
  lireLienJumelage,
  nettoyerNom,
  nouvelEtat,
  routeDepuisLien,
} from '../utils/jumelage'

let echecs = 0
function verifie(intitule: string, condition: boolean, detail = '') {
  console.log(`  ${condition ? 'OK  ' : 'ECHEC'} ${intitule}${detail ? ' — ' + detail : ''}`)
  if (!condition) echecs++
}

const ETAT = 'etat-du-jumelage-0001'

console.log('\n--- Lire un lien ---')
const demande = lireLienJumelage({ de: 'agora', code: 'wxyz2345', nom: 'Coloc', etat: ETAT })
verifie('une demande d\'Agora est lue', demande?.type === 'demande' && demande.code === 'WXYZ2345'
  && demande.nom === 'Coloc', JSON.stringify(demande))
const reponse = lireLienJumelage({ de: 'agora', code: 'WXYZ2345', pour: 'abc234', etat: ETAT })
verifie('une reponse porte le code Arpente dans « pour »',
  reponse?.type === 'reponse' && reponse.pour === 'ABC234', JSON.stringify(reponse))

const refuses: Array<[string, Record<string, unknown>]> = [
  ['app inconnue', { de: 'dewdrop', code: 'WXYZ2345', etat: ETAT }],
  ['app héritée d\'Object', { de: 'toString', code: 'WXYZ2345', etat: ETAT }],
  ['sans app', { code: 'WXYZ2345', etat: ETAT }],
  ['code Agora trop court', { de: 'agora', code: 'ABC234', etat: ETAT }],
  ['code hors alphabet', { de: 'agora', code: 'WXYZ2340', etat: ETAT }],
  ['sans jeton', { de: 'agora', code: 'WXYZ2345' }],
  ['jeton trop court', { de: 'agora', code: 'WXYZ2345', etat: 'abc' }],
  ['jeton aux caracteres interdits', { de: 'agora', code: 'WXYZ2345', etat: 'abcdefghijklmnop<b>' }],
  ['reponse pour un code Arpente mal forme', { de: 'agora', code: 'WXYZ2345', pour: 'WXYZ2345', etat: ETAT }],
  ['parametre en tableau (requete repetee)', { de: ['agora'], code: 'WXYZ2345', etat: ETAT }],
]
for (const [raison, parametres] of refuses) {
  verifie(`refuse : ${raison}`, lireLienJumelage(parametres) === null)
}

console.log('\n--- Nom propose ---')
verifie('controles et inversion retires, espaces replies',
  nettoyerNom('  Sortie\u0000 \u202eCaen\n\tdimanche  ') === 'Sortie Caen dimanche',
  JSON.stringify(nettoyerNom('  Sortie\u0000 \u202eCaen\n\tdimanche  ')))
verifie('60 caracteres au plus', Array.from(nettoyerNom('é'.repeat(80)) ?? '').length === 60)
verifie('rien de lisible : null', nettoyerNom(' \u0007\u202e ') === null)

console.log('\n--- Liens construits ---')
const urlDemande = new URL(lienDemande('agora', { code: 'ABC234', nom: 'Sortie Caen', etat: ETAT }))
verifie('la demande vise l\'ecran de jumelage d\'Agora',
  urlDemande.origin === 'https://agora.heianenterprise.com' && urlDemande.pathname === '/'
  && urlDemande.search === '' && urlDemande.hash.startsWith('#/twin?'), urlDemande.href)
const pDemande = new URLSearchParams(urlDemande.hash.slice('#/twin?'.length))
verifie('ses parametres sont dans le fragment',
  pDemande.get('de') === 'arpente' && pDemande.get('code') === 'ABC234'
  && pDemande.get('nom') === 'Sortie Caen' && pDemande.get('etat') === ETAT, urlDemande.hash)
const pReponse = new URLSearchParams(
  new URL(lienReponse('agora', { code: 'ABC234', pour: 'WXYZ2345', etat: ETAT })).hash.slice('#/twin?'.length))
verifie('la reponse nomme le groupe Agora',
  pReponse.get('pour') === 'WXYZ2345' && pReponse.get('code') === 'ABC234')
verifie('rejoindre le jumeau Agora',
  lienRejoindre('agora', 'WXYZ2345') === 'https://agora.heianenterprise.com/#/join/WXYZ2345')

console.log('\n--- Liens recus par l\'app ---')
verifie('jumeler.html mene a l\'ecran de jumelage',
  routeDepuisLien(`https://arpente.heianenterprise.com/jumeler.html#de=agora&code=WXYZ2345&etat=${ETAT}`)
  === `/groups/jumeler?de=agora&code=WXYZ2345&etat=${ETAT}`)
verifie('rejoindre.html ouvre la fenetre Rejoindre',
  routeDepuisLien('https://arpente.heianenterprise.com/rejoindre.html#code=abc234') === '/groups?rejoindre=ABC234')
verifie('un code d\'adhesion mal forme ne prerempli rien',
  routeDepuisLien('https://arpente.heianenterprise.com/rejoindre.html#code=../x') === '/groups')
verifie('un autre domaine est ignore',
  routeDepuisLien('https://arpente.heianenterprise.com.evil.test/jumeler.html#de=agora') === null)
verifie('http est ignore', routeDepuisLien('http://arpente.heianenterprise.com/jumeler.html') === null)
verifie('une autre page est ignoree',
  routeDepuisLien('https://arpente.heianenterprise.com/privacy.html') === null)
verifie('une adresse invalide est ignoree', routeDepuisLien('pas une adresse') === null)

console.log('\n--- Demandes lancees d\'ici ---')
const maintenant = 1_000_000_000_000
const demandes = { [ETAT]: { app: 'agora' as const, groupId: 'g1', code: 'ABC234', envoyeeLe: maintenant } }
const rep = { type: 'reponse' as const, app: 'agora' as const, code: 'WXYZ2345', pour: 'ABC234', etat: ETAT }
verifie('la reponse a une demande d\'ici est acceptee',
  demandeCorrespondante(demandes, rep, maintenant + 1000)?.groupId === 'g1')
verifie('un autre jeton est refuse',
  demandeCorrespondante(demandes, { ...rep, etat: 'un-autre-etat-000000' }, maintenant) === null)
verifie('un autre groupe est refuse',
  demandeCorrespondante(demandes, { ...rep, pour: 'DEF567' }, maintenant) === null)
verifie('une demande perimee est refusee',
  demandeCorrespondante(demandes, rep, maintenant + DUREE_DEMANDE_MS + 1) === null)
verifie('un jeton herite d\'Object est refuse',
  demandeCorrespondante(demandes, { ...rep, etat: 'constructor' }, maintenant) === null)

console.log('\n--- Jeton ---')
const etat = nouvelEtat()
verifie('22 caracteres base64 URL', /^[A-Za-z0-9_-]{22}$/.test(etat), etat)
verifie('deux jetons different', nouvelEtat() !== etat)

console.log(echecs === 0 ? '\nTout est conforme.' : `\n${echecs} echec(s).`)
if (echecs > 0) process.exit(1)
