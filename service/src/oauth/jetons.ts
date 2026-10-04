/**
 * Jetons de l'assistant : JWT HS256 signés par une clé dérivée
 * d'`ASSISTANT_SECRET`, chacun d'un type qui ne sert pour aucun autre.
 * Port de `tokens.go` de Lumis.
 *
 * Choix non évidents :
 * - **Rien n'est stocké avant l'accord** : l'inscription d'un assistant rend
 *   un `client_id` qui EST un jeton signé (type `client`) portant ses
 *   métadonnées bornées ; la demande d'autorisation voyage elle aussi signée
 *   (type `demande`) jusqu'à la page d'accord.
 * - **Le secret client est dérivé** du `client_id` (HMAC) : rien à garder.
 * - **Les jetons d'accès portent `aud` = la ressource `/mcp`** : ils ne valent
 *   que là. Signés avec une clé qui n'est pas celle de GoTrue, PostgREST et
 *   GoTrue les refusent d'office.
 *
 * Invariant : `verifier` refuse tout jeton d'un autre type, d'un autre
 * émetteur, expiré, sans expiration, ou signé autrement qu'en HS256.
 */
import { createHash, createHmac } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'

export type TypeJeton = 'client' | 'demande' | 'acces' | 'rafraichissement'

/** Champs de tous les types ; chacun ne remplit que les siens (noms courts :
 *  le client_id voyage dans chaque adresse). */
export interface Revendications {
  typ: TypeJeton
  // client
  n?: string
  r?: string[]
  a?: string
  // demande : client_id complet ; jetons : son empreinte
  cid?: string
  ru?: string
  rue?: boolean
  cc?: string
  st?: string
  sc?: string
  // rafraîchissement : génération, qui doit être celle de l'autorisation
  gen?: number
  sub?: string
  aud?: string
  iat?: number
  exp?: number
}

const ETIQUETTE_CLE = 'arpente-assistant/v1'

export class Signataire {
  private readonly cle: Uint8Array

  constructor(
    secret: string,
    readonly emetteur: string,
    readonly ressource: string,
    private readonly maintenant: () => number = () => Date.now(),
  ) {
    if (secret.length < 32) throw new Error('secret de l\'assistant trop court')
    this.cle = createHmac('sha256', secret).update(ETIQUETTE_CLE).digest()
  }

  async signer(revendications: Revendications, dureeSecondes: number): Promise<string> {
    const { sub, aud, iat: _iat, exp: _exp, ...reste } = revendications
    const maintenant = Math.floor(this.maintenant() / 1000)
    let jeton = new SignJWT({ ...reste })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.emetteur)
      .setIssuedAt(maintenant)
      .setExpirationTime(maintenant + dureeSecondes)
    if (sub) jeton = jeton.setSubject(sub)
    if (aud) jeton = jeton.setAudience(aud)
    return jeton.sign(this.cle)
  }

  /** Les revendications d'un jeton valide du type demandé, ou `null`. */
  async verifier(brut: string, typ: TypeJeton, audience?: string): Promise<Revendications | null> {
    if (!brut || brut.length > 8192) return null
    try {
      const { payload } = await jwtVerify(brut, this.cle, {
        algorithms: ['HS256'],
        issuer: this.emetteur,
        audience,
        requiredClaims: ['exp', 'iat'],
        currentDate: new Date(this.maintenant()),
      })
      if (payload.typ !== typ) return null
      return payload as unknown as Revendications
    }
    catch {
      return null
    }
  }

  /** Secret d'un client confidentiel : dérivé, rien à stocker. */
  secretClient(clientId: string): string {
    return createHmac('sha256', this.cle).update(`client-secret:${clientId}`).digest('hex')
  }
}

/** Empreinte d'un client_id, gardée dans les autorisations et les jetons. */
export function empreinteClient(clientId: string): string {
  return createHash('sha256').update(clientId).digest('hex')
}
