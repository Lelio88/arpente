/**
 * Verifie utils/sessionStorage.ts : la session Supabase vit dans le coffre
 * chiffre, et l'ancienne session en clair des preferences y est reprise une
 * seule fois, puis effacee.
 *
 * S'execute avec tsx contre la vraie implementation ; les deux stockages sont
 * des Map en memoire. Le projet est en CommonJS : pas d'await au niveau
 * racine, d'ou la fonction main().
 */
import { identiteDisparue, stockageSessionMigrant, type StockageCle } from '../utils/sessionStorage'

let echecs = 0
function verifie(intitule: string, condition: boolean, detail = '') {
  console.log(`  ${condition ? 'OK  ' : 'ECHEC'} ${intitule}${detail ? ' — ' + detail : ''}`)
  if (!condition) echecs++
}

function memoire(initial: Record<string, string> = {}, echoueEnEcriture = false): StockageCle & { donnees: Map<string, string> } {
  const donnees = new Map(Object.entries(initial))
  return {
    donnees,
    async get(cle) { return donnees.get(cle) ?? null },
    async set(cle, valeur) {
      if (echoueEnEcriture) throw new Error('coffre indisponible')
      donnees.set(cle, valeur)
    },
    async remove(cle) { donnees.delete(cle) },
  }
}

const CLE = 'sb-arpente-auth-token'

async function main() {
  console.log('\n--- Lecture ---')
  {
    const s = stockageSessionMigrant(memoire(), memoire())
    verifie('rien nulle part -> null', (await s.getItem(CLE)) === null)
  }
  {
    const s = stockageSessionMigrant(memoire({ [CLE]: 'dans-le-coffre' }), memoire())
    verifie('le coffre fait foi', (await s.getItem(CLE)) === 'dans-le-coffre')
  }

  console.log('\n--- Reprise de l\'ancienne session en clair ---')
  {
    const coffre = memoire()
    const ancien = memoire({ [CLE]: 'session-en-clair' })
    const lu = await stockageSessionMigrant(coffre, ancien).getItem(CLE)
    verifie('la session existante est retrouvee (pas de nouvelle identite)', lu === 'session-en-clair')
    verifie('elle est desormais dans le coffre', coffre.donnees.get(CLE) === 'session-en-clair')
    verifie('la copie en clair est effacee', !ancien.donnees.has(CLE))
  }
  {
    const coffre = memoire({}, true)
    const ancien = memoire({ [CLE]: 'session-en-clair' })
    const lu = await stockageSessionMigrant(coffre, ancien).getItem(CLE)
    verifie('coffre en panne : la session reste utilisable', lu === 'session-en-clair')
    verifie('coffre en panne : la copie en clair n\'est pas perdue', ancien.donnees.get(CLE) === 'session-en-clair')
  }

  console.log('\n--- Ecriture et effacement ---')
  {
    const coffre = memoire()
    const ancien = memoire({ [CLE]: 'vieille' })
    const s = stockageSessionMigrant(coffre, ancien)
    await s.setItem(CLE, 'neuve')
    verifie('une session ecrite va au coffre', coffre.donnees.get(CLE) === 'neuve')
    verifie('et ne laisse aucune copie en clair', !ancien.donnees.has(CLE))
    await s.removeItem(CLE)
    verifie('la deconnexion efface le coffre', !coffre.donnees.has(CLE))
  }

  console.log('\n--- Identite disparue cote serveur ---')
  verifie('identite purgee (user_not_found) -> en recreer une', identiteDisparue({ status: 403, code: 'user_not_found' }))
  verifie('session revoquee -> en recreer une', identiteDisparue({ status: 403, code: 'session_not_found' }))
  verifie('jeton refuse (401) -> en recreer une', identiteDisparue({ status: 401 }))
  verifie('hors ligne (pas de statut) -> garder la session', !identiteDisparue({ code: undefined }))
  verifie('serveur en panne (503) -> garder la session', !identiteDisparue({ status: 503 }))
  verifie('pas d\'erreur -> garder la session', !identiteDisparue(null))
}

main().then(() => {
  console.log(echecs === 0 ? '\nSession : tous les cas passent.' : `\nSession : ${echecs} echec(s).`)
  process.exit(echecs === 0 ? 0 : 1)
})
