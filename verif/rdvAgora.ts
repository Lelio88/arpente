/** Verifie utils/rdvAgora.ts contre la vraie implementation, hors de Nuxt. */
import {
  DUREE_RDV_MAX,
  DUREE_RDV_MIN,
  dureeBornee,
  isoAvecDecalage,
  lienRdvAgora,
} from '../utils/rdvAgora'

let echecs = 0
function verifie(intitule: string, condition: boolean, detail = '') {
  console.log(`  ${condition ? 'OK  ' : 'ECHEC'} ${intitule}${detail ? ' — ' + detail : ''}`)
  if (!condition) echecs++
}

/** Les parametres d'un lien vers Agora, lus comme Agora les lira. */
function parametres(adresse: string): URLSearchParams {
  return new URLSearchParams(new URL(adresse).hash.slice('#/event?'.length))
}

console.log('\n--- Heure avec decalage ---')
const samedi = new Date(2026, 9, 10, 14, 0, 0)
const iso = isoAvecDecalage(samedi)
verifie('format ISO 8601 avec decalage',
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(iso), iso)
verifie('l\'heure locale choisie est celle ecrite', iso.startsWith('2026-10-10T14:00:00'), iso)
verifie('l\'instant est exact une fois relu', new Date(iso).getTime() === samedi.getTime(), iso)
const hiver = new Date(2026, 0, 10, 9, 30, 0)
verifie('l\'instant est exact en hiver aussi (autre decalage)',
  new Date(isoAvecDecalage(hiver)).getTime() === hiver.getTime(), isoAvecDecalage(hiver))

console.log('\n--- Duree ---')
verifie('arrondie a la minute', dureeBornee(150.4) === 150)
verifie('jamais sous le minimum', dureeBornee(1) === DUREE_RDV_MIN)
verifie('jamais au-dela d\'une journee', dureeBornee(5000) === DUREE_RDV_MAX)
verifie('une duree illisible retombe au minimum', dureeBornee(Number.NaN) === DUREE_RDV_MIN)

console.log('\n--- Lien construit ---')
const adresse = lienRdvAgora({
  titre: 'Sortie — Caen',
  debut: samedi,
  dureeMinutes: 185,
  lieu: 'Château de Caen',
  description: 'Parcours de 2 lieux a Caen.\n\n1. Château de Caen\n2. Abbaye aux Hommes',
  codeGroupeAgora: 'wxyz2345',
})
verifie('un lien est construit', adresse !== null)
const url = new URL(adresse ?? 'https://invalide.test/')
verifie('il vise l\'ecran des rdv d\'Agora, parametres dans le fragment',
  url.origin === 'https://agora.heianenterprise.com' && url.pathname === '/'
  && url.search === '' && url.hash.startsWith('#/event?'), url.href)
const p = parametres(adresse ?? 'https://invalide.test/#/event?')
verifie('de = arpente', p.get('de') === 'arpente')
verifie('titre', p.get('titre') === 'Sortie — Caen', String(p.get('titre')))
verifie('debut, avec decalage', p.get('debut') === iso, String(p.get('debut')))
verifie('duree en minutes', p.get('duree') === '185')
verifie('lieu', p.get('lieu') === 'Château de Caen')
verifie('description : retours a la ligne gardes',
  p.get('description') === 'Parcours de 2 lieux a Caen.\n\n1. Château de Caen\n2. Abbaye aux Hommes',
  JSON.stringify(p.get('description')))
verifie('groupe : le code du jumeau, en majuscules', p.get('groupe') === 'WXYZ2345')

console.log('\n--- Textes nettoyes et coupes ---')
const nettoye = parametres(lienRdvAgora({
  titre: ' \u202eSortie\u0000  du\tgroupe ',
  debut: samedi,
  dureeMinutes: 60,
  lieu: 'L'.repeat(400),
  description: `Ligne\u200b 1\r\nLigne 2\n\n\n\nFin ${'é'.repeat(3000)}`,
}) ?? 'https://invalide.test/#/event?')
verifie('titre : controles et inversion retires', nettoye.get('titre') === 'Sortie du groupe',
  JSON.stringify(nettoye.get('titre')))
verifie('lieu coupe a 300 caracteres', Array.from(nettoye.get('lieu') ?? '').length === 300)
const description = nettoye.get('description') ?? ''
verifie('description coupee a 2000 caracteres', Array.from(description).length === 2000)
verifie('description : CRLF ramene, lignes vides repliees',
  description.startsWith('Ligne 1\nLigne 2\n\nFin '), JSON.stringify(description.slice(0, 30)))
verifie('sans lieu ni description, les parametres sont absents',
  !nettoye.has('groupe') && parametres(lienRdvAgora({ titre: 'x', debut: samedi, dureeMinutes: 60 })
    ?? 'https://invalide.test/#/event?').has('lieu') === false)

console.log('\n--- Liens refuses ---')
verifie('titre vide : pas de lien', lienRdvAgora({ titre: ' \u0007 ', debut: samedi, dureeMinutes: 60 }) === null)
verifie('date invalide : pas de lien',
  lienRdvAgora({ titre: 'Sortie', debut: new Date(Number.NaN), dureeMinutes: 60 }) === null)
const sansGroupe = parametres(lienRdvAgora({
  titre: 'Sortie', debut: samedi, dureeMinutes: 60, codeGroupeAgora: 'ABC234',
}) ?? 'https://invalide.test/#/event?')
verifie('un code qui n\'a pas le format d\'Agora n\'est pas envoye', !sansGroupe.has('groupe'))

console.log(echecs === 0 ? '\nTout est conforme.' : `\n${echecs} echec(s).`)
if (echecs > 0) process.exit(1)
