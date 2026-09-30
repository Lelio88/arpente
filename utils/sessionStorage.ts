/**
 * Stockage de la session Supabase sur mobile : un coffre chiffré, avec reprise
 * unique de l'ancienne session rangée en clair.
 *
 * Pourquoi : la session (jeton de rafraîchissement compris) ouvre l'identité
 * anonyme de la couche groupes. Elle vivait dans @capacitor/preferences, en
 * clair dans le bac à sable de l'app ; elle passe dans un coffre chiffré par le
 * Keystore d'Android (plugin branché dans plugins/supabase.client.ts). Les
 * versions précédentes l'ont écrite en clair : la première lecture la reprend
 * dans le coffre puis efface la copie en clair, sans changer d'identité (le
 * pseudo et les groupes restent).
 *
 * Invariants :
 * - Le coffre fait foi ; l'ancien stockage n'est plus jamais écrit.
 * - Si le coffre refuse l'écriture, la session en clair est conservée et
 *   renvoyée : mieux vaut une session en clair qu'une identité perdue.
 * - Pur (aucune dépendance Capacitor ou Vue) : vérifié par verif/session.ts.
 *
 * Usage : createClient(url, clé, { auth: { storage: stockageSessionMigrant(coffre, préférences) } })
 */

/** Un stockage clé → texte, asynchrone (coffre chiffré, préférences…). */
export interface StockageCle {
  get(cle: string): Promise<string | null>
  set(cle: string, valeur: string): Promise<void>
  remove(cle: string): Promise<void>
}

/** L'adaptateur attendu par supabase-js (`auth.storage`). */
export interface StockageSession {
  getItem(cle: string): Promise<string | null>
  setItem(cle: string, valeur: string): Promise<void>
  removeItem(cle: string): Promise<void>
}

export function stockageSessionMigrant(coffre: StockageCle, ancien: StockageCle): StockageSession {
  return {
    async getItem(cle) {
      const valeur = await coffre.get(cle)
      if (valeur !== null) return valeur
      const heritee = await ancien.get(cle)
      if (heritee === null) return null
      try {
        await coffre.set(cle, heritee)
      } catch {
        return heritee // coffre indisponible : on garde la copie en clair
      }
      await ancien.remove(cle)
      return heritee
    },
    async setItem(cle, valeur) {
      await coffre.set(cle, valeur)
      await ancien.remove(cle)
    },
    async removeItem(cle) {
      await coffre.remove(cle)
      await ancien.remove(cle)
    },
  }
}

/** Codes GoTrue qui signifient « cette identité n'existe plus pour le serveur ». */
const CODES_IDENTITE_DISPARUE = new Set(['user_not_found', 'session_not_found', 'bad_jwt'])

/**
 * Faut-il repartir d'une identité neuve ? Oui si le serveur ne reconnaît plus
 * celle de la session gardée : purgée (30 jours sans groupe), supprimée par
 * « Supprimer mes données » depuis un autre appareil, ou jeton révoqué. Non
 * pour une panne réseau ou serveur, qui ne dit rien de l'identité : on garde
 * alors la session, et le pseudo avec.
 */
export function identiteDisparue(erreur: { status?: number, code?: string } | null): boolean {
  if (!erreur) return false
  if (erreur.code && CODES_IDENTITE_DISPARUE.has(erreur.code)) return true
  return erreur.status === 401 || erreur.status === 403 || erreur.status === 404
}
