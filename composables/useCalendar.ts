import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { construireIcs, type EvenementIcs } from '~/utils/ics'

/**
 * Ajoute un parcours à l'agenda de l'appareil.
 *
 * **Deux chemins, une seule intention.** Sur mobile, le plugin natif ouvre
 * l'éditeur d'événement du système, prérempli ; sur le web, on produit un
 * fichier `.ics` que l'agenda de l'utilisateur sait ouvrir.
 *
 * **Pourquoi `createEventWithPrompt` et non `createEvent`.** Écrire directement
 * exigerait la permission d'écriture au calendrier — une demande intrusive pour
 * une action que l'utilisateur vient précisément de déclencher. Le prompt lui
 * montre l'événement, le laisse choisir son agenda et corriger l'heure, puis
 * enregistre. Aucune permission à demander, et il garde la main.
 *
 * **L'import du plugin est dynamique** : sur le web, le module natif n'a rien à
 * faire dans le bundle, et l'importer statiquement l'y ferait entrer.
 */
export function useCalendar() {
  const isAjoutEnCours = ref(false)
  const erreur = ref<string | null>(null)

  /** Le navigateur peut bloquer un téléchargement déclenché par script. */
  function telechargerIcs(contenu: string, nomFichier: string): void {
    const blob = new Blob([contenu], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const lien = document.createElement('a')
    lien.href = url
    lien.download = nomFichier
    document.body.appendChild(lien)
    lien.click()
    document.body.removeChild(lien)
    // Laisser au navigateur le temps d'amorcer le téléchargement avant de
    // révoquer l'URL : révoquer immédiatement annule le téléchargement sur
    // certains navigateurs mobiles.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  /**
   * @returns `'natif'` si l'événement a été confié à l'agenda du système,
   *          `'fichier'` si un `.ics` a été produit, `null` en cas d'échec.
   */
  async function ajouterAuCalendrier(
    evenement: EvenementIcs,
  ): Promise<'natif' | 'fichier' | null> {
    isAjoutEnCours.value = true
    erreur.value = null

    try {
      const fin = typeof evenement.finOuDuree === 'number'
        ? new Date(evenement.debut.getTime() + evenement.finOuDuree * 60_000)
        : evenement.finOuDuree

      if (Capacitor.isNativePlatform()) {
        const { CapacitorCalendar } = await import('@ebarooni/capacitor-calendar')
        await CapacitorCalendar.createEventWithPrompt({
          title: evenement.titre,
          startDate: evenement.debut.getTime(),
          endDate: fin.getTime(),
          location: evenement.lieu,
          description: evenement.description,
        })
        return 'natif'
      }

      telechargerIcs(construireIcs(evenement), 'arpente-parcours.ics')
      return 'fichier'
    }
    catch {
      erreur.value = "L'agenda n'a pas pu etre ouvert."
      return null
    }
    finally {
      isAjoutEnCours.value = false
    }
  }

  return { isAjoutEnCours, erreur, ajouterAuCalendrier }
}
