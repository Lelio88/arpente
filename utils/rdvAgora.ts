/**
 * « Mettre dans Agora » : le lien qui ouvre Agora (agendas partagés) sur un rdv
 * prérempli — la sortie d'un parcours de groupe. Protocole commun :
 * docs/liens-inter-apps.md du dépôt méta, § « Ajouter un rdv dans Agora ».
 *
 * Le lien va dans un seul sens : pas de jeton, pas de réponse. Dans Agora, la
 * personne choisit son agenda ou un de ses groupes, et vérifie le rdv dans
 * l'éditeur habituel avant de l'enregistrer.
 *
 * Choix non évidents :
 * - l'heure part en ISO 8601 AVEC le décalage de l'appareil
 *   (`2026-10-10T14:00:00+02:00`) : c'est l'heure que la personne a choisie,
 *   lisible telle quelle, et l'instant reste exact quel que soit le fuseau
 *   d'Agora. `toISOString()` donnerait le bon instant, mais en UTC ;
 * - la durée est bornée à ce qu'Agora accepte (5 à 1440 minutes) plutôt que
 *   refusée : un lien hors bornes serait ignoré en entier de l'autre côté ;
 * - les textes sont coupés à leur longueur ici, avant l'envoi : Agora les
 *   recoupe, mais un lien trop long ne s'ouvre pas partout ;
 * - `groupe` n'est posé que si le code a le format d'Agora : ce code vient de
 *   la base, mais on ne l'envoie pas les yeux fermés.
 *
 * Invariant : aucun code de groupe n'entre dans le titre, le lieu ou la
 * description — Agora les montre aux membres, à son bot Discord et aux
 * assistants IA (règle 6). Le code du jumeau voyage seul, dans `groupe`.
 *
 * Fonctions pures, sans Vue ni Nuxt : vérifiées par verif/rdvAgora.ts.
 *
 * @example
 * const adresse = lienRdvAgora({
 *   titre: 'Sortie — Caen', debut: new Date(), dureeMinutes: 150,
 *   lieu: 'Château', description: '1. Château', codeGroupeAgora: 'WXYZ2345',
 * })
 */
import { nettoyerTexte } from './jumelage'

/** L'écran d'Agora qui reçoit un rdv : Agora route « par dièse ». */
const ADRESSE_RDV = 'https://agora.heianenterprise.com/#/event?'

const LONGUEUR_TITRE = 200
const LONGUEUR_LIEU = 300
const LONGUEUR_DESCRIPTION = 2000
export const DUREE_RDV_MIN = 5
export const DUREE_RDV_MAX = 1440
const FORMAT_CODE_AGORA = /^[A-HJ-NP-Z2-9]{8}$/

export interface RdvPourAgora {
  titre: string
  debut: Date
  dureeMinutes: number
  lieu?: string | null
  description?: string | null
  /** Le code Agora du groupe jumeau : le groupe choisi d'avance, s'il y en a un. */
  codeGroupeAgora?: string | null
}

/**
 * L'instant `date` en ISO 8601, à l'heure locale de l'appareil, suivi de son
 * décalage (`+02:00`, `-05:30`, ou `+00:00`).
 */
export function isoAvecDecalage(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const decalage = -date.getTimezoneOffset()
  const signe = decalage >= 0 ? '+' : '-'
  const absolu = Math.abs(decalage)
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
    + `T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
    + `${signe}${p(Math.floor(absolu / 60))}:${p(absolu % 60)}`
}

/** Une durée en minutes, entière et ramenée dans ce qu'Agora accepte. */
export function dureeBornee(minutes: number): number {
  if (!Number.isFinite(minutes)) return DUREE_RDV_MIN
  return Math.min(DUREE_RDV_MAX, Math.max(DUREE_RDV_MIN, Math.round(minutes)))
}

/**
 * L'adresse qui ouvre Agora sur ce rdv, ou `null` s'il n'y a rien à envoyer
 * (titre vide, date invalide) — Agora ignorerait le lien.
 */
export function lienRdvAgora(rdv: RdvPourAgora): string | null {
  const titre = nettoyerTexte(rdv.titre, LONGUEUR_TITRE)
  if (!titre || Number.isNaN(rdv.debut.getTime())) return null

  const parametres = new URLSearchParams({
    de: 'arpente',
    titre,
    debut: isoAvecDecalage(rdv.debut),
    duree: String(dureeBornee(rdv.dureeMinutes)),
  })
  const lieu = nettoyerTexte(rdv.lieu ?? null, LONGUEUR_LIEU)
  if (lieu) parametres.set('lieu', lieu)
  const description = nettoyerTexte(rdv.description ?? null, LONGUEUR_DESCRIPTION, true)
  if (description) parametres.set('description', description)
  const groupe = rdv.codeGroupeAgora?.trim().toUpperCase() ?? ''
  if (FORMAT_CODE_AGORA.test(groupe)) parametres.set('groupe', groupe)

  return ADRESSE_RDV + parametres.toString()
}
