/**
 * La lecture du claim `amr`, sur laquelle repose la fraîcheur de l'accord :
 * la date de la connexion la plus récente que porte le jeton GoTrue.
 *
 * Éprouvé aussi contre un vrai GoTrue (v2.195) : un rafraîchissement de
 * session garde la date de la connexion d'origine — un jeton volé puis
 * rafraîchi ne passe donc pas pour une connexion faite sur la page d'accord.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { derniereConnexion } from '../src/gotrue'

function jeton(charge: unknown): string {
  return `entete.${Buffer.from(JSON.stringify(charge)).toString('base64url')}.signature`
}

test('rend la connexion la plus récente du claim amr', () => {
  assert.equal(derniereConnexion(jeton({ amr: [{ method: 'otp', timestamp: 100 }, { method: 'oauth', timestamp: 250 }] })), 250)
})

test('sans amr lisible : zéro, donc jamais assez frais', () => {
  assert.equal(derniereConnexion(jeton({ sub: 'x' })), 0)
  assert.equal(derniereConnexion(jeton({ amr: 'otp' })), 0)
  assert.equal(derniereConnexion(jeton({ amr: [{ method: 'otp', timestamp: 'demain' }] })), 0)
  assert.equal(derniereConnexion('pas-un-jwt'), 0)
})
