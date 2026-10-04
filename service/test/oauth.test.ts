/**
 * Le serveur d'autorisation de bout en bout, sur l'application entière et
 * des doubles en mémoire : inscription, autorisation, accord connecté,
 * échange PKCE, rafraîchissement tournant, révocation — et chacun des refus.
 */
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { appelMcp, brancherAssistant, monterBanc, pkce, RETOUR_CLAUDE, type Banc } from './aides'

let banc: Banc

before(async () => {
  banc = await monterBanc()
  banc.personnes['session-alice'] = { id: 'alice', email: 'alice@exemple.test', anonyme: false, connecteLe: 0 }
  banc.personnes['session-anonyme'] = { id: 'anonyme', email: '', anonyme: true, connecteLe: 0 }
})
after(() => banc.fermer())

async function inscrire(corps: unknown): Promise<Response> {
  return fetch(`${banc.url}/oauth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps),
  })
}

async function demander(clientId: string, defi: string, extra: Record<string, string> = {}): Promise<Response> {
  return fetch(`${banc.url}/oauth/authorize?${new URLSearchParams({
    client_id: clientId, response_type: 'code', redirect_uri: RETOUR_CLAUDE, code_challenge: defi,
    code_challenge_method: 'S256', state: 'etat-1', ...extra,
  })}`, { redirect: 'manual' })
}

async function accorder(demande: string, jeton: string | null, decision = 'autoriser'): Promise<Response> {
  const entetes: Record<string, string> = { 'content-type': 'application/json' }
  if (jeton) entetes.authorization = `Bearer ${jeton}`
  return fetch(`${banc.url}/oauth/accord`, { method: 'POST', headers: entetes, body: JSON.stringify({ demande, decision }) })
}

async function echanger(champs: Record<string, string>): Promise<Response> {
  return fetch(`${banc.url}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(champs),
  })
}

async function clientEtDemande(): Promise<{ clientId: string, demande: string, verificateur: string }> {
  const r = await inscrire({ client_name: 'Claude', redirect_uris: [RETOUR_CLAUDE], token_endpoint_auth_method: 'none' })
  const { client_id: clientId } = await r.json() as { client_id: string }
  const { verificateur, defi } = pkce()
  const a = await demander(clientId, defi)
  const demande = new URL(a.headers.get('location')!, banc.url).searchParams.get('demande')!
  return { clientId, demande, verificateur }
}

describe('découverte', () => {
  test('annonce S256 seul, iss et les points d\'entrée', async () => {
    const m = await (await fetch(`${banc.url}/.well-known/oauth-authorization-server`)).json() as Record<string, unknown>
    assert.deepEqual(m.code_challenge_methods_supported, ['S256'])
    assert.equal(m.authorization_response_iss_parameter_supported, true)
    assert.equal(m.registration_endpoint, 'http://localhost/oauth/register')
  })

  test('ressource protégée publiée aux deux chemins', async () => {
    for (const chemin of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
      const m = await (await fetch(banc.url + chemin)).json() as Record<string, unknown>
      assert.equal(m.resource, 'http://localhost/mcp')
      assert.deepEqual(m.authorization_servers, ['http://localhost'])
    }
  })
})

describe('inscription', () => {
  test('refuse une adresse de retour inconnue', async () => {
    const r = await inscrire({ client_name: 'Claude', redirect_uris: ['https://claude.ai.mechant.example/api/mcp/auth_callback'] })
    assert.equal(r.status, 400)
    assert.equal((await r.json() as { error: string }).error, 'invalid_redirect_uri')
  })

  test('nettoie le nom déclaré et rend un secret pour un client confidentiel', async () => {
    const r = await inscrire({ client_name: 'Claude‮\u0007 mé\nchant', redirect_uris: [RETOUR_CLAUDE] })
    assert.equal(r.status, 201)
    const c = await r.json() as { client_name: string, client_secret?: string }
    assert.equal(c.client_name, 'Claude mé chant')
    assert.ok(c.client_secret)
  })
})

describe('autorisation', () => {
  test('sans PKCE S256 : erreur renvoyée à l\'assistant, avec iss', async () => {
    const r = await inscrire({ redirect_uris: [RETOUR_CLAUDE], token_endpoint_auth_method: 'none' })
    const { client_id: clientId } = await r.json() as { client_id: string }
    const a = await demander(clientId, 'court', { code_challenge_method: 'plain' })
    const retour = new URL(a.headers.get('location')!)
    assert.equal(retour.searchParams.get('error'), 'invalid_request')
    assert.equal(retour.searchParams.get('iss'), 'http://localhost')
  })

  test('une adresse de retour non inscrite n\'est jamais suivie', async () => {
    const r = await inscrire({ redirect_uris: [RETOUR_CLAUDE], token_endpoint_auth_method: 'none' })
    const { client_id: clientId } = await r.json() as { client_id: string }
    const a = await demander(clientId, pkce().defi, { redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect' })
    assert.equal(a.status, 400)
    assert.equal(a.headers.get('location'), null)
  })

  test('une ressource étrangère est refusée', async () => {
    const r = await inscrire({ redirect_uris: [RETOUR_CLAUDE], token_endpoint_auth_method: 'none' })
    const { client_id: clientId } = await r.json() as { client_id: string }
    const a = await demander(clientId, pkce().defi, { resource: 'https://ailleurs.example/mcp' })
    assert.equal(new URL(a.headers.get('location')!).searchParams.get('error'), 'invalid_target')
  })

  test('la page d\'accord nomme l\'assistant par son adresse vérifiée', async () => {
    const { demande } = await clientEtDemande()
    const page = await fetch(`${banc.url}/oauth/accord?demande=${encodeURIComponent(demande)}`)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /Claude \(claude\.ai, Claude Desktop, mobile\)/)
    assert.match(page.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/)
  })
})

describe('accord', () => {
  test('refuser ne demande pas de connexion et rend access_denied', async () => {
    const { demande } = await clientEtDemande()
    const r = await accorder(demande, null, 'refuser')
    const { redirection } = await r.json() as { redirection: string }
    assert.equal(new URL(redirection).searchParams.get('error'), 'access_denied')
  })

  test('autoriser exige une session, un compte, et une connexion née après la demande', async () => {
    const { demande } = await clientEtDemande()
    assert.equal((await accorder(demande, null)).status, 401)
    assert.equal((await accorder(demande, 'session-anonyme')).status, 403)
    banc.personnes['session-alice']!.connecteLe = Math.floor(banc.horloge.ms / 1000) - 3600
    assert.equal((await accorder(demande, 'session-alice')).status, 401, 'un jeton d\'avant la demande ne suffit pas')
    banc.horloge.avancer(10)
    banc.personnes['session-alice']!.connecteLe = Math.floor(banc.horloge.ms / 1000)
    const ok = await accorder(demande, 'session-alice')
    assert.equal(ok.status, 200)
    const retour = new URL((await ok.json() as { redirection: string }).redirection)
    assert.ok(retour.searchParams.get('code'))
    assert.equal(retour.searchParams.get('state'), 'etat-1')
    assert.equal(retour.searchParams.get('iss'), 'http://localhost')
  })
})

describe('jetons', () => {
  test('le code sert une fois, même après un échec PKCE', async () => {
    const { clientId, demande, verificateur } = await clientEtDemande()
    banc.horloge.avancer(5)
    banc.personnes['session-alice']!.connecteLe = Math.floor(banc.horloge.ms / 1000)
    const { redirection } = await (await accorder(demande, 'session-alice')).json() as { redirection: string }
    const code = new URL(redirection).searchParams.get('code')!
    const faux = await echanger({ grant_type: 'authorization_code', code, code_verifier: 'x'.repeat(50), client_id: clientId, redirect_uri: RETOUR_CLAUDE })
    assert.equal((await faux.json() as { error: string }).error, 'invalid_grant')
    const bon = await echanger({ grant_type: 'authorization_code', code, code_verifier: verificateur, client_id: clientId, redirect_uri: RETOUR_CLAUDE })
    assert.equal((await bon.json() as { error: string }).error, 'invalid_grant')
  })

  test('accès, rotation du rafraîchissement, rejeu puni, révocation', async () => {
    const a = await brancherAssistant(banc, 'session-alice')
    assert.ok(a.acces && a.rafraichissement)

    const sans = await appelMcp(banc, null, 'tools/list')
    assert.equal(sans.statut, 401)
    assert.match(sans.entetes.get('www-authenticate') ?? '', /resource_metadata="http:\/\/localhost\/\.well-known\/oauth-protected-resource\/mcp"/)

    const liste = await appelMcp(banc, a.acces, 'tools/list')
    assert.equal(liste.statut, 200)

    const tour = await echanger({ grant_type: 'refresh_token', refresh_token: a.rafraichissement, client_id: a.clientId })
    const nouveaux = await tour.json() as { access_token: string, refresh_token: string }
    assert.ok(nouveaux.refresh_token && nouveaux.refresh_token !== a.rafraichissement)

    const rejeu = await echanger({ grant_type: 'refresh_token', refresh_token: a.rafraichissement, client_id: a.clientId })
    assert.equal((await rejeu.json() as { error: string }).error, 'invalid_grant')
    assert.equal(banc.autorisations.lignes.has(a.autorisationId), false, 'le rejeu supprime l\'accès')
    assert.equal((await appelMcp(banc, nouveaux.access_token, 'tools/list')).statut, 401)
  })

  test('un jeton de rafraîchissement ne sert pas d\'accès à /mcp', async () => {
    const a = await brancherAssistant(banc, 'session-alice')
    assert.equal((await appelMcp(banc, a.rafraichissement, 'tools/list')).statut, 401)
  })

  test('la révocation coupe l\'assistant aussitôt', async () => {
    const a = await brancherAssistant(banc, 'session-alice')
    const r = await fetch(`${banc.url}/oauth/revoke`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: a.acces, client_id: a.clientId }),
    })
    assert.equal(r.status, 200)
    assert.equal((await appelMcp(banc, a.acces, 'tools/list')).statut, 401)
  })

  test('un accès expiré ne vaut plus rien', async () => {
    const a = await brancherAssistant(banc, 'session-alice')
    const ligne = banc.autorisations.lignes.get(a.autorisationId)!
    banc.autorisations.lignes.set(a.autorisationId, { ...ligne, expireLe: new Date(banc.horloge.ms - 1000) })
    assert.equal((await appelMcp(banc, a.acces, 'tools/list')).statut, 401)
  })
})

describe('sans OAUTH_ACTIF', () => {
  test('les routes de l\'assistant n\'existent pas', async () => {
    const coupe = await monterBanc({ oauthActif: false })
    try {
      assert.equal((await fetch(`${coupe.url}/.well-known/oauth-authorization-server`)).status, 404)
      assert.equal((await fetch(`${coupe.url}/mcp`, { method: 'POST' })).status, 404)
      assert.equal((await fetch(`${coupe.url}/suppression-compte`)).status, 200)
    }
    finally {
      await coupe.fermer()
    }
  })
})
