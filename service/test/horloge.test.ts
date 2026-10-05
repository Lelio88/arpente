/**
 * Horloge injectée et SDK MCP : `requireBearerAuth` recontrôle l'échéance d'un
 * jeton contre Date.now(), pas contre notre horloge. Le vérificateur doit donc
 * lui transmettre la durée restante mesurée sur l'horloge injectée, quelle que
 * soit l'heure réelle — sans quoi le banc, figé au 5 octobre 2026 à 10 h UTC,
 * voyait tous ses jetons refusés dès 11 h ce jour-là.
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { verificateur } from '../src/mcp/serveur'
import { Signataire } from '../src/oauth/jetons'
import { AutorisationsMemoire, Horloge, SECRET } from './aides'

const RESSOURCE = 'http://localhost/mcp'
const CLE_CLIENT = 'c'.repeat(64)

describe('horloge injectée et SDK', () => {
  const cas = [
    ['loin dans le passé', Date.UTC(2001, 0, 1)],
    ['loin dans le futur', Date.UTC(2099, 0, 1)],
  ] as const
  for (const [quand, ms] of cas) {
    test(`un jeton valide sur l'horloge injectée (${quand}) l'est aussi pour le SDK`, async () => {
      const horloge = new Horloge(ms)
      const autorisations = new AutorisationsMemoire(horloge)
      const signataire = new Signataire(SECRET, 'http://localhost', RESSOURCE, horloge.maintenant)
      const acces = await autorisations.remplacer({
        userId: 'alice',
        cleClient: CLE_CLIENT,
        nomClient: 'Claude',
        assistant: 'Claude',
        expireLe: new Date(ms + 86_400_000),
      })
      const jeton = await signataire.signer({ typ: 'acces', sub: acces.id, cid: CLE_CLIENT, aud: RESSOURCE }, 3600)

      const info = await verificateur(signataire, autorisations, horloge.maintenant).verifyAccessToken(jeton)

      const resteVuParLeSdk = (info.expiresAt ?? 0) - Date.now() / 1000
      assert.ok(resteVuParLeSdk > 3590 && resteVuParLeSdk <= 3600, `durée restante vue par le SDK : ${resteVuParLeSdk}`)
    })
  }
})
