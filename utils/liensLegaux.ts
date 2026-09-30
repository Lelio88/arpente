/**
 * Pages légales d'Arpente, publiées par GitHub Pages depuis docs/ sous notre
 * domaine (docs/CNAME ; l'ancienne adresse lelio88.github.io/arpente redirige).
 *
 * Invariants : `confidentialite` est l'URL déclarée sur la fiche Play — la
 * changer, c'est changer la fiche le même jour. Chaque URL a sa page dans docs/.
 * Ouvertes par un simple lien : Capacitor envoie toute adresse externe au
 * navigateur du téléphone.
 */
const BASE = 'https://arpente.heianenterprise.com'

export const LIENS_LEGAUX = {
  confidentialite: `${BASE}/privacy.html`,
  mentions: `${BASE}/mentions-legales.html`,
} as const
