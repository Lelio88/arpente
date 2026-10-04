/**
 * Codes d'autorisation en attente d'échange : en mémoire, 5 minutes, usage
 * unique, 200 au plus. Port de `codeStore` de Lumis.
 *
 * Choix non évidents :
 * - en mémoire : un code ne naît qu'après un accord authentifié et ne vit que
 *   le temps d'un échange ; un redémarrage n'en perd que quelques-uns ;
 * - `prendre` retire le code AVANT toute vérification : un code sert une
 *   fois, même quand son échange échoue (PKCE faux, client différent) ;
 * - au-delà de 200, les plus anciens partent : une rafale d'accords ne peut
 *   pas épuiser la mémoire.
 */
import { randomBytes } from 'node:crypto'

export interface CodeAutorisation {
  cleClient: string
  retour: string
  /** L'adresse de retour figurait dans la demande (sinon, la seule inscrite). */
  explicite: boolean
  defi: string
  autorisationId: string
  expire: number
}

const MAX_CODES = 200

export class Codes {
  private readonly codes = new Map<string, CodeAutorisation>()

  constructor(private readonly maintenant: () => number = () => Date.now()) {}

  creer(contenu: Omit<CodeAutorisation, 'expire'>, dureeMs: number): string {
    const code = randomBytes(32).toString('base64url')
    const maintenant = this.maintenant()
    for (const [cle, c] of this.codes) {
      if (c.expire <= maintenant) this.codes.delete(cle)
    }
    while (this.codes.size >= MAX_CODES) {
      const plusAncien = [...this.codes.entries()].sort((a, b) => a[1].expire - b[1].expire)[0]
      if (!plusAncien) break
      this.codes.delete(plusAncien[0])
    }
    this.codes.set(code, { ...contenu, expire: maintenant + dureeMs })
    return code
  }

  prendre(code: string): CodeAutorisation | null {
    const c = this.codes.get(code)
    this.codes.delete(code)
    return c && c.expire > this.maintenant() ? c : null
  }
}
