import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const userId = ref<string | null>(null)
  const handle = ref<string | null>(null)
  const isReady = ref(false)

  const hasHandle = computed(() => !!handle.value)

  async function ensureSession() {
    const supabase = useSupabase()

    const { data: { session } } = await supabase.auth.getSession()

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

  return {
    userId,
    handle,
    isReady,
    hasHandle,
    ensureSession,
    setHandle,
  }
})
