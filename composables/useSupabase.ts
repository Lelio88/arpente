import type { SupabaseClient } from '@supabase/supabase-js'

export function useSupabase(): SupabaseClient {
  const { $supabase } = useNuxtApp()
  if (!$supabase) {
    throw new Error(
      "Supabase n'est pas configure (NUXT_PUBLIC_SUPABASE_URL / NUXT_PUBLIC_SUPABASE_ANON_KEY manquants).",
    )
  }
  return $supabase as SupabaseClient
}
