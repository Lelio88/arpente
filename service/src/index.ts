/**
 * Point d'entrée du service d'Arpente : lit la configuration, ouvre la base,
 * charge le contenu compilé et écoute. S'arrête proprement sur SIGTERM (le
 * signal de Docker) : plus de nouvelles requêtes, connexions rendues.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AutorisationsEnBase } from './base/autorisations'
import { GroupesEnBase } from './base/groupes'
import { creerPool } from './base/pool'
import { creerApp } from './app'
import { lireConfig } from './config'
import { chargerCatalogue } from './contenu'
import { jugeGotrue } from './gotrue'
import { journal, messageErreur } from './journal'
import { Signataire } from './oauth/jetons'

const DELAI_OSRM_MS = 4_000

async function demarrer(): Promise<void> {
  const config = lireConfig()
  const ici = dirname(fileURLToPath(import.meta.url))
  const catalogue = await chargerCatalogue(join(ici, '..', 'data', 'contenu.json'))
  const pool = creerPool(config.urlBase)
  await pool.query('select 1')

  const app = creerApp({
    config,
    catalogue,
    signataire: new Signataire(config.secretAssistant, config.urlPublique, config.urlRessource),
    autorisations: new AutorisationsEnBase(pool),
    groupes: new GroupesEnBase(pool),
    juge: jugeGotrue(config.urlGotrue),
    lireJson: async (url) => {
      const reponse = await fetch(url, {
        signal: AbortSignal.timeout(DELAI_OSRM_MS),
        headers: { 'user-agent': 'arpente-service (https://arpente.heianenterprise.com)' },
      })
      if (!reponse.ok) throw new Error(`osrm : ${reponse.status}`)
      return reponse.json()
    },
  })

  const serveur = app.listen(config.port, config.hote, () => {
    journal.info('demarrage', {
      port: config.port,
      lieux: catalogue.contenu.lieux.length,
      parcours: catalogue.contenu.parcours.length,
      assistant: config.oauthActif,
    })
  })
  serveur.headersTimeout = 20_000
  serveur.requestTimeout = 30_000

  const arreter = (): void => {
    journal.info('arret')
    serveur.close(() => { void pool.end().finally(() => process.exit(0)) })
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on('SIGTERM', arreter)
  process.on('SIGINT', arreter)
}

demarrer().catch((erreur: unknown) => {
  journal.erreur('demarrage_impossible', { message: messageErreur(erreur) })
  process.exit(1)
})
