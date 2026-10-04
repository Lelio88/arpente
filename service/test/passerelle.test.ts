/**
 * La passerelle devant GoTrue, face à un GoTrue simulé qui répond
 * différemment selon l'adresse — exactement ce qu'elle doit masquer.
 */
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, test } from 'node:test'
import { lireConfig, type CompteExamen } from '../src/config'
import { DELAI_ENVOI_MS, ENVOIS_PAR_IP, MAX_ECHECS_ADRESSE_IP, MAX_ECHECS_EXAMEN } from '../src/passerelle'
import { monterBanc, type Banc } from './aides'

const EXAMEN: CompteExamen = {
  adresse: 'examen.play@exemple.test',
  code: '424242',
  motDePasse: 'un-mot-de-passe-long-que-seul-le-service-connait',
}

let gotrue: Server
let banc: Banc
const recus: { chemin: string, corps: Record<string, unknown> }[] = []

before(async () => {
  gotrue = createServer((req, res) => {
    let brut = ''
    req.on('data', (m) => { brut += m })
    req.on('end', () => {
      const corps = JSON.parse(brut || '{}') as Record<string, unknown>
      recus.push({ chemin: req.url ?? '', corps })
      res.setHeader('content-type', 'application/json')
      res.setHeader('x-supabase-api-version', '2024-01-01')
      if (req.url === '/otp') {
        if (corps.gotrue_meta_security && (corps.gotrue_meta_security as { captcha_token?: string }).captcha_token === 'mauvais') {
          res.statusCode = 400
          res.end(JSON.stringify({ code: 400, error_code: 'captcha_failed', msg: 'captcha' }))
          return
        }
        if (corps.email === 'connu@exemple.test') {
          // Un compte existant : limité par adresse, une réponse que la passerelle doit masquer.
          res.statusCode = 429
          res.end(JSON.stringify({ code: 429, error_code: 'over_email_send_rate_limit', msg: 'limite' }))
          return
        }
        setTimeout(() => res.end('{}'), 50)
        return
      }
      if (req.url === '/verify') {
        if (corps.token === '123456') {
          res.end(JSON.stringify({ access_token: 'jeton', user: { email: corps.email } }))
          return
        }
        res.statusCode = 403
        res.end(JSON.stringify({ code: 403, error_code: 'otp_expired', msg: 'expiré' }))
        return
      }
      if (req.url === '/token?grant_type=password') {
        if ((corps.gotrue_meta_security as { captcha_token?: string } | undefined)?.captcha_token === 'mauvais') {
          res.statusCode = 400
          res.end(JSON.stringify({ code: 400, error_code: 'captcha_failed', msg: 'captcha' }))
          return
        }
        if (corps.email === EXAMEN.adresse && corps.password === EXAMEN.motDePasse) {
          res.end(JSON.stringify({ access_token: 'jeton-examen', refresh_token: 'r', user: { email: corps.email } }))
          return
        }
        res.statusCode = 400
        res.end(JSON.stringify({ code: 400, error_code: 'invalid_credentials', msg: 'non' }))
      }
    })
  })
  gotrue.listen(0, '127.0.0.1')
  await new Promise(r => gotrue.once('listening', r))
  banc = await monterBanc({ urlGotrue: `http://127.0.0.1:${(gotrue.address() as AddressInfo).port}` })
})
after(async () => {
  await banc.fermer()
  await new Promise(r => gotrue.close(() => r(undefined)))
})

async function otp(corps: unknown) {
  const debut = Date.now()
  const r = await fetch(`${banc.url}/auth/v1/otp`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps),
  })
  return { statut: r.status, corps: await r.text(), duree: Date.now() - debut }
}

async function verifier(email: string, token: string) {
  const r = await fetch(`${banc.url}/auth/v1/verify`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'email', email, token }),
  })
  return { statut: r.status, corps: await r.text() }
}

describe('envoi d\'un code', () => {
  test('adresse neuve ou connue : même statut, même corps, même délai', async () => {
    const neuve = await otp({ email: 'neuve@exemple.test', create_user: true })
    const connue = await otp({ email: 'connu@exemple.test', create_user: true })
    assert.equal(neuve.statut, 200)
    assert.equal(connue.statut, 200)
    assert.equal(neuve.corps, connue.corps)
    assert.ok(neuve.duree >= DELAI_ENVOI_MS - 20 && connue.duree >= DELAI_ENVOI_MS - 20)
    assert.ok(Math.abs(neuve.duree - connue.duree) < 250)
  })

  test('le corps relayé est reconstruit : create_user forcé, rien d\'autre', async () => {
    await otp({ email: 'neuve@exemple.test', create_user: false, data: { role: 'admin' }, email_redirect_to: 'https://mechant.example' })
    const dernier = recus.filter(r => r.chemin === '/otp').at(-1)!
    assert.deepEqual(Object.keys(dernier.corps).sort(), ['create_user', 'email', 'gotrue_meta_security'])
    assert.equal(dernier.corps.create_user, true)
  })

  test('un CAPTCHA refusé est rendu aussitôt (ne dépend que de la saisie)', async () => {
    const r = await otp({ email: 'neuve@exemple.test', gotrue_meta_security: { captcha_token: 'mauvais' } })
    assert.equal(r.statut, 400)
    assert.match(r.corps, /captcha_failed/)
    assert.ok(r.duree < DELAI_ENVOI_MS)
  })

  test('plafond par IP : le onzième envoi en dix minutes est refusé', async () => {
    const banc2 = await monterBanc({ urlGotrue: `http://127.0.0.1:${(gotrue.address() as AddressInfo).port}` })
    try {
      const envoyer = () => fetch(`${banc2.url}/auth/v1/otp`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'ip@exemple.test', gotrue_meta_security: { captcha_token: 'mauvais' } }),
      })
      for (let i = 0; i < ENVOIS_PAR_IP; i++) assert.equal((await envoyer()).status, 400)
      assert.equal((await envoyer()).status, 429)
    }
    finally {
      await banc2.fermer()
    }
  })

  test('une adresse mal formée ou un téléphone : refus local', async () => {
    assert.equal((await otp({ email: 'pas-une-adresse' })).statut, 400)
    assert.equal((await otp({ email: 'a@b.c', phone: '+33600000000' })).statut, 400)
  })
})

describe('vérification du code', () => {
  test('cinq échecs pour une adresse : pause, même avec le bon code', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await verifier('cible@exemple.test', '000000')).statut, 403)
    const bloque = await verifier('cible@exemple.test', '123456')
    assert.equal(bloque.statut, 429)
    assert.equal((await verifier('autre@exemple.test', '123456')).statut, 200, 'une autre adresse n\'est pas touchée')
  })

  test('une variante d\'écriture partage le compteur, ou est refusée', async () => {
    assert.equal((await verifier('CIBLE@Exemple.Test', '123456')).statut, 429, 'majuscules : même adresse, même pause')
    for (const variante of ['<cible@exemple.test>', '"cible"@exemple.test', 'cİble@exemple.test', 'cible@exemple']) {
      assert.equal((await verifier(variante, '123456')).statut, 400, variante)
    }
  })

  test('l\'adresse part à GoTrue en minuscules', async () => {
    await verifier('Casse@Exemple.TEST', '000000')
    assert.equal(recus.filter(r => r.chemin === '/verify').at(-1)!.corps.email, 'casse@exemple.test')
  })

  test('seul le code à 6 chiffres passe', async () => {
    const r = await fetch(`${banc.url}/auth/v1/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'email', email: 'a@b.c', token_hash: 'abc', token: '123456' }),
    })
    assert.equal(r.status, 400)
    assert.equal((await verifier('a@b.c', '12345')).statut, 400)
  })
})

describe('compte d\'examen (Google Play)', () => {
  let examen: Banc

  before(async () => {
    examen = await monterBanc({ urlGotrue: `http://127.0.0.1:${(gotrue.address() as AddressInfo).port}`, examen: EXAMEN })
  })
  after(async () => { await examen.fermer() })

  const appeler = async (chemin: string, corps: unknown) => {
    const debut = Date.now()
    const r = await fetch(`${examen.url}${chemin}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps),
    })
    return { statut: r.status, corps: await r.text(), duree: Date.now() - debut }
  }
  const nombreRecus = () => recus.length

  test('envoi d\'un code : même réponse, même délai, et aucun e-mail ne part', async () => {
    const avant = nombreRecus()
    const r = await appeler('/auth/v1/otp', { email: 'Examen.Play@exemple.test' })
    assert.equal(r.statut, 200)
    assert.equal(r.corps, '{}')
    assert.ok(r.duree >= DELAI_ENVOI_MS - 20)
    assert.equal(nombreRecus(), avant, 'GoTrue n\'est pas appelé : rien à envoyer')
  })

  test('le code fixe ouvre une session par mot de passe, côté serveur', async () => {
    const r = await appeler('/auth/v1/verify', { type: 'email', email: EXAMEN.adresse, token: EXAMEN.code })
    assert.equal(r.statut, 200)
    assert.match(r.corps, /jeton-examen/)
    const dernier = recus.at(-1)!
    assert.equal(dernier.chemin, '/token?grant_type=password')
    assert.deepEqual(dernier.corps, { email: EXAMEN.adresse, password: EXAMEN.motDePasse })
  })

  test('un mauvais code : le refus d\'un code expiré, sans appel à GoTrue', async () => {
    const avant = nombreRecus()
    const r = await appeler('/auth/v1/verify', { type: 'email', email: EXAMEN.adresse, token: '000001' })
    assert.equal(r.statut, 403)
    assert.match(r.corps, /otp_expired/)
    assert.equal(nombreRecus(), avant)
  })

  test('avec le CAPTCHA : le jeton donné à l\'envoi accompagne la connexion, une seule fois', async () => {
    await appeler('/auth/v1/otp', { email: EXAMEN.adresse, gotrue_meta_security: { captcha_token: 'jeton-turnstile' } })
    assert.equal((await appeler('/auth/v1/verify', { type: 'email', email: EXAMEN.adresse, token: EXAMEN.code })).statut, 200)
    assert.deepEqual(recus.at(-1)!.corps.gotrue_meta_security, { captcha_token: 'jeton-turnstile' })
    assert.equal((await appeler('/auth/v1/verify', { type: 'email', email: EXAMEN.adresse, token: EXAMEN.code })).statut, 200)
    assert.equal(recus.at(-1)!.corps.gotrue_meta_security, undefined, 'un jeton Turnstile ne sert qu\'une fois')
  })

  test('un CAPTCHA refusé par GoTrue revient tel quel, pour que l\'app le dise', async () => {
    await appeler('/auth/v1/otp', { email: EXAMEN.adresse, gotrue_meta_security: { captcha_token: 'mauvais' } })
    const r = await appeler('/auth/v1/verify', { type: 'email', email: EXAMEN.adresse, token: EXAMEN.code })
    assert.equal(r.statut, 400)
    assert.match(r.corps, /captcha_failed/)
  })

  test('le code fixe ne vaut que pour l\'adresse d\'examen', async () => {
    const r = await appeler('/auth/v1/verify', { type: 'email', email: 'autre@exemple.test', token: EXAMEN.code })
    assert.equal(r.statut, 403)
    assert.equal(recus.at(-1)!.chemin, '/verify', 'une autre adresse suit le chemin ordinaire')
  })

  test('un code fixe ne s\'use pas : au plus MAX_ECHECS_EXAMEN échecs par jour, toutes IP confondues', async () => {
    const banc3 = await monterBanc({ urlGotrue: `http://127.0.0.1:${(gotrue.address() as AddressInfo).port}`, examen: EXAMEN })
    try {
      const essai = (token: string) => fetch(`${banc3.url}/auth/v1/verify`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'email', email: EXAMEN.adresse, token }),
      })
      let echecs = 0
      while (echecs < MAX_ECHECS_EXAMEN) {
        for (let i = 0; i < MAX_ECHECS_ADRESSE_IP && echecs < MAX_ECHECS_EXAMEN; i++, echecs++) {
          assert.equal((await essai('000002')).status, 403)
        }
        banc3.horloge.avancer(16 * 60) // la pause par adresse et IP est levée
      }
      assert.equal((await essai(EXAMEN.code)).status, 429, 'le plafond du jour tient, même avec le bon code')
      banc3.horloge.avancer(24 * 3600)
      assert.equal((await essai(EXAMEN.code)).status, 200, 'le lendemain, il revient')
    }
    finally {
      await banc3.fermer()
    }
  })
})

describe('configuration du compte d\'examen', () => {
  const base = {
    PUBLIC_URL: 'https://api.exemple.test',
    DATABASE_URL: 'postgres://x',
    GOTRUE_URL: 'http://auth:9999',
    ASSISTANT_SECRET: 'x'.repeat(40),
  }

  test('absent : pas de compte d\'examen', () => {
    assert.equal(lireConfig(base).examen, null)
  })

  test('complet : adresse en minuscules', () => {
    const c = lireConfig({ ...base, EXAMEN_ADRESSE: ' Examen@Exemple.Test ', EXAMEN_CODE: '123456', EXAMEN_MOT_DE_PASSE: 'y'.repeat(40) })
    assert.deepEqual(c.examen, { adresse: 'examen@exemple.test', code: '123456', motDePasse: 'y'.repeat(40) })
  })

  test('incomplet ou faible : refus au démarrage', () => {
    for (const partiel of [
      { EXAMEN_ADRESSE: 'examen@exemple.test' },
      { EXAMEN_ADRESSE: 'examen@exemple.test', EXAMEN_CODE: '12345', EXAMEN_MOT_DE_PASSE: 'y'.repeat(40) },
      { EXAMEN_ADRESSE: 'examen@exemple.test', EXAMEN_CODE: '123456', EXAMEN_MOT_DE_PASSE: 'court' },
    ]) {
      assert.throws(() => lireConfig({ ...base, ...partiel }), /EXAMEN_/)
    }
  })
})
