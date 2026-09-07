/** Verifie utils/ics.ts contre la vraie implementation, hors de Nuxt. */
import { construireIcs, echapperTexteIcs, plierLigneIcs, versHorodatageIcs } from '../utils/ics'

let echecs = 0
function verifie(intitule: string, condition: boolean, detail = '') {
  console.log(`  ${condition ? 'OK  ' : 'ECHEC'} ${intitule}${detail ? ' — ' + detail : ''}`)
  if (!condition) echecs++
}

console.log('\n--- Horodatage ---')
verifie('format UTC compact',
  versHorodatageIcs(new Date(Date.UTC(2026, 8, 12, 14, 5, 3))) === '20260912T140503Z',
  versHorodatageIcs(new Date(Date.UTC(2026, 8, 12, 14, 5, 3))))
verifie('mois et jours sur deux chiffres',
  versHorodatageIcs(new Date(Date.UTC(2026, 0, 5, 9, 0, 0))) === '20260105T090000Z')

console.log('\n--- Echappement ---')
verifie('virgule echappee', echapperTexteIcs('a,b') === 'a\\,b', echapperTexteIcs('a,b'))
verifie('point-virgule echappe', echapperTexteIcs('a;b') === 'a\\;b')
verifie('antislash echappe en premier', echapperTexteIcs('a\\b') === 'a\\\\b', echapperTexteIcs('a\\b'))
verifie('retour a la ligne echappe', echapperTexteIcs('a\nb') === 'a\\nb')
verifie('CRLF echappe une seule fois', echapperTexteIcs('a\r\nb') === 'a\\nb', echapperTexteIcs('a\r\nb'))

console.log('\n--- Pliage a 75 octets ---')
const courte = 'SUMMARY:Balade'
verifie('ligne courte inchangee', plierLigneIcs(courte) === courte)

const longue = 'DESCRIPTION:' + 'a'.repeat(200)
const plie = plierLigneIcs(longue)
verifie('ligne longue pliee', plie.includes('\r\n'))
verifie('les suites sont prefixees d\'une espace',
  plie.split('\r\n').slice(1).every(l => l.startsWith(' ')))
const encodeur = new TextEncoder()
verifie('aucun morceau ne depasse 75 octets',
  plie.split('\r\n').every(l => encodeur.encode(l).length <= 75),
  String(Math.max(...plie.split('\r\n').map(l => encodeur.encode(l).length))))
verifie('le contenu est integralement conserve',
  plie.split('\r\n').map((l, i) => (i === 0 ? l : l.slice(1))).join('') === longue)

// Le cas qui casse une implementation naive : des caracteres multi-octets
// pile a la frontiere de pliage.
const accents = 'DESCRIPTION:' + 'Cathédrale Saint-Pierre-et-Saint-Paul, ruelle des Chats, cité du Vitrail'.repeat(3)
const plieAccents = plierLigneIcs(accents)
verifie('aucun caractere accentue coupe en deux',
  plieAccents.split('\r\n').map((l, i) => (i === 0 ? l : l.slice(1))).join('') === accents)
verifie('les morceaux accentues respectent 75 octets',
  plieAccents.split('\r\n').every(l => encodeur.encode(l).length <= 75),
  String(Math.max(...plieAccents.split('\r\n').map(l => encodeur.encode(l).length))))

console.log('\n--- Fichier complet ---')
const ics = construireIcs({
  titre: 'Weekend a Troyes, edition 2026',
  debut: new Date(Date.UTC(2026, 8, 12, 12, 0, 0)),
  finOuDuree: 150,
  lieu: 'Ruelle des Chats',
  description: 'Parcours de 3 lieux.\n1. Ruelle des Chats\n2. Cathédrale',
  uid: 'arpente-test@heianenterprise.com',
})
verifie('enveloppe VCALENDAR', ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.includes('END:VCALENDAR'))
verifie('un seul VEVENT',
  (ics.match(/BEGIN:VEVENT/g) || []).length === 1 && (ics.match(/END:VEVENT/g) || []).length === 1)
verifie('toutes les fins de ligne sont CRLF', !/[^\r]\n/.test(ics))
verifie('se termine par CRLF', ics.endsWith('\r\n'))
verifie('duree en minutes convertie en DTEND',
  ics.includes('DTSTART:20260912T120000Z') && ics.includes('DTEND:20260912T143000Z'),
  (ics.match(/DTEND:[^\r]+/) || [''])[0])
verifie('titre echappe', ics.includes('SUMMARY:Weekend a Troyes\\, edition 2026'))
verifie('description sur une seule ligne logique', !ics.includes('DESCRIPTION:Parcours de 3 lieux.\r\n1.'))
verifie('UID present', ics.includes('UID:arpente-test@heianenterprise.com'))
verifie('DTSTAMP present', /DTSTAMP:\d{8}T\d{6}Z/.test(ics))

console.log('\n--- Fin explicite ---')
const avecFin = construireIcs({
  titre: 'T', debut: new Date(Date.UTC(2026, 0, 1, 10, 0, 0)),
  finOuDuree: new Date(Date.UTC(2026, 0, 1, 12, 30, 0)), uid: 'u@x',
})
verifie('une Date de fin est utilisee telle quelle', avecFin.includes('DTEND:20260101T123000Z'))

console.log(echecs === 0 ? '\nTous les controles passent.' : `\n${echecs} echec(s).`)
process.exit(echecs === 0 ? 0 : 1)
