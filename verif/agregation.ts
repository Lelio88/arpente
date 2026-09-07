/**
 * Verifie utils/voteAggregation.ts, la fonction pure qui decide du parcours.
 *
 * Le projet n'a pas de harnais de test, mais il embarque tsx : ce fichier
 * s'execute directement contre la vraie implementation, sans copie ni mock.
 */
import { aggregateGroupVotes, median, nearestNeighborOrder } from '../utils/voteAggregation'

let echecs = 0
function verifie(intitule: string, condition: boolean, detail = '') {
  console.log(`  ${condition ? 'OK  ' : 'ECHEC'} ${intitule}${detail ? ' — ' + detail : ''}`)
  if (!condition) echecs++
}

console.log('\n--- Mediane ---')
verifie('liste vide -> null', median([]) === null)
verifie('impair -> valeur centrale', median([3, 1, 2]) === 2, String(median([3, 1, 2])))
verifie('pair -> moyenne des deux centrales', median([1, 2, 3, 4]) === 2.5, String(median([1, 2, 3, 4])))
verifie('ne modifie pas la liste source', (() => {
  const source = [3, 1, 2]
  median(source)
  return source[0] === 3
})())

console.log('\n--- Ordonnancement au plus proche voisin ---')
// Quatre points alignes d'ouest en est, fournis dans le desordre.
const coords = {
  a: { lat: 48.3, lng: 4.00 },
  b: { lat: 48.3, lng: 4.01 },
  c: { lat: 48.3, lng: 4.02 },
  d: { lat: 48.3, lng: 4.03 },
}
const ordre = nearestNeighborOrder(['c', 'a', 'd', 'b'], coords, 'a')
verifie('part du point impose et suit la ligne', ordre.join('') === 'abcd', ordre.join(' -> '))
verifie('conserve tous les points', ordre.length === 4, String(ordre.length))

console.log('\n--- Agregation complete ---')
const resultat = aggregateGroupVotes({
  approvals: {
    a: ['u1', 'u2'],      // 2 voix
    b: ['u1'],            // 1 voix
    c: ['u1', 'u2'],      // 2 voix
    d: [],                // aucune : doit etre ecarte
  },
  poiCountPreferences: [2, 4],        // mediane 3
  durationPreferences: [120, 180],    // mediane 150
  poiCoordinates: coords,
})
verifie('ecarte les POI sans voix', !resultat.orderedSlugs.includes('d'), resultat.orderedSlugs.join(', '))
verifie('retient la mediane du nombre souhaite', resultat.targetPoiCount === 3, String(resultat.targetPoiCount))
verifie('remonte la mediane des durees', resultat.targetDurationMinutes === 150, String(resultat.targetDurationMinutes))
verifie('selectionne les mieux soutenus', resultat.orderedSlugs.length === 3, resultat.orderedSlugs.join(' -> '))
verifie('ordonne geographiquement', resultat.orderedSlugs.join('') === 'abc', resultat.orderedSlugs.join(' -> '))

console.log('\n--- Cas limites ---')
const aucunVote = aggregateGroupVotes({
  approvals: {}, poiCountPreferences: [], durationPreferences: [], poiCoordinates: coords,
})
verifie('aucun vote -> parcours vide', aucunVote.orderedSlugs.length === 0)
verifie('aucun vote -> duree nulle', aucunVote.targetDurationMinutes === null)

const sansPreference = aggregateGroupVotes({
  approvals: { a: ['u1'], b: ['u1'] },
  poiCountPreferences: [], durationPreferences: [], poiCoordinates: coords,
})
verifie('sans preference -> repli sur le nombre de POI approuves',
  sansPreference.orderedSlugs.length === 2, sansPreference.orderedSlugs.join(', '))

const egalite = aggregateGroupVotes({
  approvals: { b: ['u1'], a: ['u1'] },   // meme nombre de voix
  poiCountPreferences: [1], durationPreferences: [], poiCoordinates: coords,
})
verifie('egalite tranchee alphabetiquement, donc de facon deterministe',
  egalite.orderedSlugs[0] === 'a', egalite.orderedSlugs.join(', '))

console.log(echecs === 0 ? '\nTous les controles passent.' : `\n${echecs} echec(s).`)
process.exit(echecs === 0 ? 0 : 1)
