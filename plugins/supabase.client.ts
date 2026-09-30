import { createClient } from '@supabase/supabase-js'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { stockageSessionMigrant, type StockageCle } from '~/utils/sessionStorage'

// Sur natif, la session vit dans un coffre chiffré par le Keystore d'Android
// (@aparajita/capacitor-secure-storage) : elle ouvre l'identité anonyme de la
// couche groupes. Le localStorage d'une WebView, lui, peut être purgé sous
// pression mémoire ou stockage. Les versions précédentes rangeaient la session
// en clair dans @capacitor/preferences : stockageSessionMigrant la reprend une
// fois dans le coffre puis l'efface, sans changer d'identité.
// Méthodes « texte brut » du plugin (getItem/setItem) : get/set convertiraient
// en JSON ou en dates, et abîmeraient la session.
const coffre: StockageCle = {
  get: key => SecureStorage.getItem(key),
  set: (key, value) => SecureStorage.setItem(key, value),
  remove: async (key) => { await SecureStorage.removeItem(key) },
}
const preferences: StockageCle = {
  get: async key => (await Preferences.get({ key })).value,
  set: (key, value) => Preferences.set({ key, value }),
  remove: key => Preferences.remove({ key }),
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
        storage: Capacitor.isNativePlatform() ? stockageSessionMigrant(coffre, preferences) : undefined,
      },
    })
    : null

  return {
    provide: { supabase },
  }
})
