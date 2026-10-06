/**
 * Store `jumelage` — les jumelages lancés depuis cet appareil, en attente de la
 * réponse de l'autre app (Agora, DewDrop), par jeton envoyé.
 *
 * Pourquoi : une réponse n'est acceptée que si elle répond à une demande partie
 * D'ICI (même jeton, même app, même code, moins de 24 h) — sinon un membre qui
 * connaît le code du groupe pourrait forger une réponse et faire rattacher un
 * groupe de l'autre app à lui. La règle elle-même est pure : `demandeCorrespondante`
 * (utils/jumelage.ts).
 *
 * Choix non évident : les demandes vivent dans le localStorage, pas en mémoire.
 * Ouvrir l'autre app met Arpente en arrière-plan, et Android peut le fermer avant que
 * la réponse revienne. Les demandes périmées sont retirées à chaque lecture.
 *
 * Invariant : ne contient que des jetons et des codes de groupes que l'on
 * gère ; rien d'autre ne part dans ce stockage.
 */
import { defineStore } from 'pinia'
import {
  DUREE_DEMANDE_MS,
  demandeCorrespondante,
  type DemandeEnvoyee,
  type ReponseJumelage,
} from '~/utils/jumelage'

const CLE = 'arpente-jumelages'

function lire(): Record<string, DemandeEnvoyee> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? '{}') as Record<string, DemandeEnvoyee>
    const maintenant = Date.now()
    return Object.fromEntries(
      Object.entries(brut).filter(([, d]) => maintenant - d.envoyeeLe <= DUREE_DEMANDE_MS))
  }
  catch {
    return {}
  }
}

function ecrire(demandes: Record<string, DemandeEnvoyee>): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(CLE, JSON.stringify(demandes))
}

export const useJumelageStore = defineStore('jumelage', () => {
  /** Retient une demande au moment où elle part vers l'autre app. */
  function retenir(etat: string, demande: DemandeEnvoyee): void {
    ecrire({ ...lire(), [etat]: demande })
  }

  /** La demande à laquelle répond `reponse`, ou `null`. */
  function trouver(reponse: ReponseJumelage): DemandeEnvoyee | null {
    return demandeCorrespondante(lire(), reponse, Date.now())
  }

  function oublier(etat: string): void {
    const { [etat]: _, ...reste } = lire()
    ecrire(reste)
  }

  return { retenir, trouver, oublier }
})
