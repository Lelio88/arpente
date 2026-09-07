import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

// Sur natif, @capacitor/preferences est plus durable que le localStorage
// d'une WebView (susceptible d'etre purge sous pression memoire/stockage).
const capacitorStorage = {
  async getItem(key: string) {
    const { value } = await Preferences.get({ key })
    return value
  },
  async setItem(key: string, value: string) {
    await Preferences.set({ key, value })
  },
  async removeItem(key: string) {
    await Preferences.remove({ key })
  },
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  // Le reste de l'app doit continuer a fonctionner (offline, solo) meme sans
  // Supabase configure : on ne cree le client que si l'URL/cle sont presentes,
  // createClient() validant sinon la config immediatement et plantant tout
  // l'appel a l'app (pas seulement les pages /groups).
  const isConfigured = !!config.public.supabaseUrl && !!config.public.supabaseAnonKey

  const supabase = isConfigured
    ? createClient(config.public.supabaseUrl, config.public.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: Capacitor.isNativePlatform() ? capacitorStorage : undefined,
      },
    })
    : null

  return {
    provide: { supabase },
  }
})
