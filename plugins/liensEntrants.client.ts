/**
 * Liens de nos pages ouverts dans l'app Android (App Links sur
 * arpente.heianenterprise.com) : `jumeler.html#…` (jumelage avec Agora) et
 * `rejoindre.html#code=…` (« Rejoindre aussi dans Arpente »). Android remet
 * l'adresse à l'app, qui la traduit en route interne (utils/jumelage.ts).
 *
 * Choix non évidents :
 * - deux entrées : `getLaunchUrl` pour une app démarrée par le lien, l'écouteur
 *   `appUrlOpen` pour une app déjà ouverte. Si les deux livrent le même lien, la
 *   seconde navigation vers la même route ne fait rien ;
 * - import dynamique de @capacitor/app, et rien sur le web : la version web n'est
 *   pas ouverte par un App Link, ce module n'a rien à y faire ;
 * - seule `routeDepuisLien` décide où aller : une adresse d'un autre domaine ou
 *   d'une autre page ne mène nulle part.
 */
import { Capacitor } from '@capacitor/core'
import { routeDepuisLien } from '~/utils/jumelage'

export default defineNuxtPlugin(() => {
  if (!Capacitor.isNativePlatform()) return
  const router = useRouter()

  function suivre(adresse: string | undefined) {
    if (!adresse) return
    const route = routeDepuisLien(adresse)
    if (route) router.push(route)
  }

  import('@capacitor/app').then(async ({ App }) => {
    await App.addListener('appUrlOpen', ({ url }) => suivre(url))
    suivre((await App.getLaunchUrl())?.url)
  }).catch(() => {
    // Plugin absent (build sans `cap sync`) : les liens ouvrent le navigateur, rien ne casse.
  })
})
