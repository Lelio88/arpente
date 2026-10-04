/**
 * La liste blanche des adresses de retour, et le nettoyage des textes —
 * les deux remparts contre un client qui se ferait appeler « Claude ».
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { reconnaitre } from '../src/oauth/retours'
import { nettoyerTexte } from '../src/texte'

describe('adresses de retour', () => {
  const reconnues: [string, RegExp][] = [
    ['https://claude.ai/api/mcp/auth_callback', /^Claude/],
    ['https://claude.com/api/mcp/auth_callback', /^Claude/],
    ['https://chatgpt.com/connector_platform_oauth_redirect', /^ChatGPT$/],
    ['https://chatgpt.com/connector/oauth/AbC_12-x', /^ChatGPT$/],
    ['https://vscode.dev/redirect', /^VS Code$/],
    ['cursor://anysphere.cursor-mcp/oauth/callback', /^Cursor$/],
    ['http://localhost:33418/callback', /ordinateur/],
    ['http://127.0.0.1:5173/', /ordinateur/],
    ['http://[::1]:8080/oauth', /ordinateur/],
  ]
  for (const [adresse, nom] of reconnues) {
    test(`reconnue : ${adresse}`, () => assert.match(reconnaitre(adresse) ?? '', nom))
  }

  const refusees = [
    'https://claude.ai@mechant.example/api/mcp/auth_callback',
    'https://claude.ai.mechant.example/api/mcp/auth_callback',
    'https://claude.ai/api/mcp/auth_callback#fragment',
    'https://claude.ai:8443/api/mcp/auth_callback',
    'http://claude.ai/api/mcp/auth_callback',
    'https://claude.ai/autre',
    'https://chatgpt.com/connector/oauth/a/b',
    'https://chatgpt.com/connector/oauth/a%2Fb',
    'https://mechant.example/redirect',
    'https://localhost/callback',
    'http://localhost.mechant.example/callback',
    'javascript:alert(1)',
    'pas une adresse',
  ]
  for (const adresse of refusees) {
    test(`refusée : ${adresse}`, () => assert.equal(reconnaitre(adresse), null))
  }
})

describe('nettoyage des textes', () => {
  test('retire contrôles et surcharges bidirectionnelles, resserre les blancs', () => {
    assert.equal(nettoyerTexte('  Bob‮evil\u0000 \n  le\tmalin ', 80), 'Bobevil le malin')
  })

  test('borne en caractères, pas en octets', () => {
    assert.equal(nettoyerTexte('ééééé', 3), 'ééé')
  })
})
