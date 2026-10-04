/**
 * PKCE, en S256 seulement (OAuth 2.1) : `plain` n'est jamais annoncé ni
 * accepté. La comparaison se fait en temps constant.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

const BASE64URL = /^[A-Za-z0-9_-]+$/

/** Un défi S256 : base64url sans remplissage, 43 à 128 caractères. */
export function defiValide(defi: string): boolean {
  return defi.length >= 43 && defi.length <= 128 && BASE64URL.test(defi)
}

export function pkceCorrespond(verificateur: string, defi: string): boolean {
  if (verificateur.length < 43 || verificateur.length > 128) return false
  const attendu = Buffer.from(createHash('sha256').update(verificateur).digest('base64url'))
  const recu = Buffer.from(defi)
  return attendu.length === recu.length && timingSafeEqual(attendu, recu)
}
