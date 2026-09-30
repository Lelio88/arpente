import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { identiteDisparue } from '~/utils/sessionStorage'

export const useAuthStore = defineStore('auth', () => {
  const userId = ref<string | null>(null)
  const handle = ref<string | null>(null)
  const isReady = ref(false)

  const hasHandle = computed(() => !!handle.value)

  async function ensureSession() {
    const supabase = useSupabase()

    let { data: { session } } = await supabase.auth.getSession()

    // La session gardée peut viser une identité que le serveur a effacée
    // (purge après 30 jours sans groupe, « Supprimer mes données ») : sans ce
    // contrôle, l'app écrirait un pseudo pour un compte qui n'existe plus.
    // Hors ligne, getUser échoue sans statut : on garde la session.
    if (session) {
      const { error } = await supabase.auth.getUser()
      if (identiteDisparue(error)) {
        await supabase.auth.signOut({ scope: 'local' })
        session = null
      }
    }

    if (session) {
      userId.value = session.user.id
    } else {
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error) throw error
      userId.value = data.user?.id ?? null
    }

    if (userId.value) {
      await loadProfile()
    }

    isReady.value = true
  }

  async function loadProfile() {
    const supabase = useSupabase()

    const { data, error } = await supabase
      .from('profiles')
      .select('handle')
      .eq('id', userId.value)
      .maybeSingle()

    if (error) throw error
    handle.value = data?.handle ?? null
  }

  async function setHandle(newHandle: string) {
    if (!userId.value) return

    const supabase = useSupabase()
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId.value, handle: newHandle })

    if (error) throw error
    handle.value = newHandle
  }

  /**
   * Efface l'identité anonyme et tout ce qui s'y rattache (pseudo, adhésions,
   * votes, préférences) par la fonction serveur delete_my_account ; les groupes
   * créés et les étapes cochées restent aux autres membres. La session locale
   * est ensuite oubliée : une prochaine visite des groupes repart de zéro.
   */
  async function deleteMyData() {
    const supabase = useSupabase()
    const { error } = await supabase.rpc('delete_my_account')
    if (error) throw error
    await supabase.auth.signOut({ scope: 'local' })
    userId.value = null
    handle.value = null
    isReady.value = false
  }

  return {
    userId,
    handle,
    isReady,
    hasHandle,
    ensureSession,
    setHandle,
    deleteMyData,
  }
})
