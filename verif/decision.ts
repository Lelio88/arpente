/**
 * Vérifie utils/decision.ts, le cœur d'une décision de groupe partagé par
 * l'app et par le service de l'assistant IA.
 *
 * Même principe que verif/agregation.ts : exécuté par tsx contre la vraie
 * implémentation. La mesure OSRM reçoit de fausses réponses, jamais le réseau.
 */
import { MAX_POINTS_OSRM, mesurerTrajet, preparerDecision } from '../utils/decision'

let echecs = 0
function verifie(intitule: string, condition: boolean, detail = '') {
  console.log(`  ${condition ? 'OK  ' : 'ECHEC'} ${intitule}${detail ? ' — ' + detail : ''}`)
  if (!condition) echecs++
}

const coords = {
  a: { lat: 48.3, lng: 4.00 },
  b: { lat: 48.3, lng: 4.01 },
  c: { lat: 48.3, lng: 4.02 },
}

async function principal(): Promise<void> {
  console.log('\n--- Préparation ---')
  const projet = preparerDecision(
    { a: ['u1', 'u2'], b: ['u1'], c: ['u2'] },
    [{ poiCount: 2, durationMinutes: 90 }, { poiCount: null, durationMinutes: null }],
    coords,
  )
  verifie('retient les lieux les mieux soutenus', projet.orderedSlugs.length === 2,
    projet.orderedSlugs.join(', '))
  verifie('ignore les envies laissées vides', projet.targetDurationMinutes === 90,
    String(projet.targetDurationMinutes))

  const inconnu = preparerDecision({ a: ['u1'], fantome: ['u1', 'u2'] }, [], coords)
  verifie('ignore un vote sur un lieu sans position', !inconnu.orderedSlugs.includes('fantome'),
    inconnu.orderedSlugs.join(', '))

  let refus = ''
  try { preparerDecision({ a: [] }, [], coords) }
  catch (e) { refus = (e as Error).message }
  verifie('refuse un groupe sans lieu approuvé', refus === 'aucun_poi_approuve', refus)

  console.log('\n--- Mesure du trajet ---')
  const points = [coords.a, coords.b, coords.c]
  let urlDemandee = ''
  const mesure = await mesurerTrajet(points, async (url) => {
    urlDemandee = url
    return { code: 'Ok', routes: [{ distance: 1520.4, duration: 1100.6 }] }
  })
  verifie('mesure OSRM arrondie', mesure.distanceMeters === 1520 && mesure.durationSeconds === 1101
    && !mesure.isEstimated, JSON.stringify(mesure))
  verifie('OSRM reçoit longitude,latitude', urlDemandee.includes('/4,48.3;4.01,48.3;4.02,48.3?'),
    urlDemandee)

  const panne = await mesurerTrajet(points, async () => { throw new Error('hors ligne') })
  verifie('panne réseau -> estimation à vol d\'oiseau', panne.isEstimated
    && panne.durationSeconds === null && panne.distanceMeters > 1400 && panne.distanceMeters < 1600,
    JSON.stringify(panne))

  const refusOsrm = await mesurerTrajet(points, async () => ({ code: 'NoRoute' }))
  verifie('réponse OSRM sans route -> estimation', refusOsrm.isEstimated)

  const absurde = await mesurerTrajet(points, async () => ({ code: 'Ok', routes: [{ distance: 'x' }] }))
  verifie('réponse OSRM mal formée -> estimation', absurde.isEstimated)

  let appels = 0
  const trop = Array.from({ length: MAX_POINTS_OSRM + 1 }, (_, i) => ({ lat: 48.3, lng: 4 + i / 1000 }))
  const long = await mesurerTrajet(trop, async () => { appels++; return {} })
  verifie('au-delà de la limite d\'OSRM, pas d\'appel', appels === 0 && long.isEstimated)

  const seul = await mesurerTrajet([coords.a], async () => { appels++; return {} })
  verifie('un seul lieu -> zéro mètre, sans appel', appels === 0 && seul.distanceMeters === 0)

  console.log(echecs === 0 ? '\nTous les controles passent.' : `\n${echecs} echec(s).`)
  process.exit(echecs === 0 ? 0 : 1)
}

void principal()
