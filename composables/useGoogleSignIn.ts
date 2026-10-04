/**
 * « Continuer avec Google » dans l'app Android, par le greffon natif maison
 * `GoogleSignIn` (android/app/src/main/java/app/arpente/GoogleSignInPlugin.java),
 * qui ouvre Credential Manager et rend un jeton d'identité Google.
 *
 * Choix non évidents :
 * - **Rien dans un navigateur** : ni bouton ni script de Google sur le web —
 *   Google refuse la connexion dans une WebView, et le bouton n'apparaît que
 *   dans l'app qui embarque le greffon.
 * - **Nonce** : une valeur tirée au hasard ; Google reçoit son empreinte
 *   SHA-256, GoTrue la valeur brute, qu'il hache pour comparer. Un jeton
 *   intercepté ne se rejoue donc pas.
 * - `disponible` n'est calculé qu'au montage : le rendu statique ne sait pas
 *   s'il tourne dans l'app, et un bouton présent d'un seul côté casserait
 *   l'hydratation.
 * - Une feuille Google refermée n'est pas une erreur : `null`.
 *
 *   const { disponible, obtenirJeton } = useGoogleSignIn()
 *   const resultat = await obtenirJeton()   // { idToken, nonce } ou null
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

interface GreffonGoogle {
  signIn(options: { serverClientId: string, nonce: string }): Promise<{ idToken: string }>
}

const GoogleSignIn = registerPlugin<GreffonGoogle>('GoogleSignIn')

function hex(octets: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(octets)].map(o => o.toString(16).padStart(2, '0')).join('')
}

export function useGoogleSignIn() {
  const config = useRuntimeConfig()
  const disponible = ref(false)

  onMounted(() => {
    disponible.value = Capacitor.isNativePlatform()
      && Capacitor.isPluginAvailable('GoogleSignIn')
      && Boolean(config.public.googleWebClientId)
  })

  /** Jeton d'identité Google et nonce brut, ou null si la feuille est refermée. */
  async function obtenirJeton(): Promise<{ idToken: string, nonce: string } | null> {
    const nonce = hex(crypto.getRandomValues(new Uint8Array(32)))
    const empreinte = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)))
    try {
      const { idToken } = await GoogleSignIn.signIn({
        serverClientId: String(config.public.googleWebClientId),
        nonce: empreinte,
      })
      return { idToken, nonce }
    }
    catch (e: unknown) {
      if ((e as { code?: string })?.code === 'canceled') return null
      throw e
    }
  }

  return { disponible, obtenirJeton }
}
