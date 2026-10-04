import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { identiteDisparue } from '~/utils/sessionStorage'

/**
 * Le compte de l'utilisateur, pour la couche groupes : connexion par code
 * reçu par e-mail ou par Google, pseudo, suppression.
 *
 * Choix non évidents :
 * - **Pas de compte, pas de groupes** : il n'y a plus d'identité anonyme. Une
 *   session anonyme restée dans le coffre d'une version précédente est
 *   fermée en local à la reprise — ses groupes n'ont pas été repris
 *   (décision de la bascule), l'utilisateur se connecte et les rejoint.
 * - **Une session reprise est vérifiée** (`getUser`) : elle peut viser un
 *   compte que le serveur a effacé (purge, suppression depuis le web). Hors
 *   ligne, `getUser` échoue sans statut : on garde la session.
 * - **Déconnexion locale seulement** (`scope: 'local'`) : se déconnecter du
 *   téléphone ne ferme pas les autres appareils ni les accès d'assistant.
 *
 * Invariant : `userId` n'est renseigné que pour un compte (jamais anonyme).
 */
export const useAuthStore = defineStore('auth', () => {
  const userId = ref<string | null>(null)
  const email = ref<string | null>(null)
  const handle = ref<string | null>(null)
  const isReady = ref(false)

  const estConnecte = computed(() => !!userId.value)
  const hasHandle = computed(() => !!handle.value)

  function oublier() {
    userId.value = null
    email.value = null
    handle.value = null
  }

  /** Reprend la session d'un compte s'il y en a une ; n'en crée jamais. */
  async function ensureSession() {
    const supabase = useSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    oublier()

    if (session) {
      const { data, error } = await supabase.auth.getUser()
      const anonyme = data.user?.is_anonymous ?? session.user.is_anonymous ?? false
      if (identiteDisparue(error) || anonyme) {
        await supabase.auth.signOut({ scope: 'local' })
      }
      else {
        userId.value = session.user.id
        email.value = session.user.email ?? null
        await loadProfile()
      }
    }
    isReady.value = true
  }

  /** Après une connexion réussie : la session est posée, on lit le profil. */
  async function adopter(session: { user: { id: string, email?: string } } | null) {
    if (!session) throw new Error('session_absente')
    userId.value = session.user.id
    email.value = session.user.email ?? null
    await loadProfile()
    isReady.value = true
  }

  /** Demande un code par e-mail. La réponse est la même que l'adresse ait un compte ou non. */
  async function envoyerCode(adresse: string, jetonCaptcha?: string) {
    const { error } = await useSupabase().auth.signInWithOtp({
      email: adresse,
      options: { shouldCreateUser: true, captchaToken: jetonCaptcha },
    })
    if (error) throw error
  }

  async function verifierCode(adresse: string, code: string) {
    const { data, error } = await useSupabase().auth.verifyOtp({ email: adresse, token: code, type: 'email' })
    if (error) throw error
    await adopter(data.session)
  }

  /** Connexion par un jeton d'identité Google (greffon natif) et son nonce brut. */
  async function connexionGoogle(idToken: string, nonce: string) {
    const { data, error } = await useSupabase().auth.signInWithIdToken({ provider: 'google', token: idToken, nonce })
    if (error) throw error
    await adopter(data.session)
  }

  async function deconnexion() {
    await useSupabase().auth.signOut({ scope: 'local' })
    oublier()
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
   * Supprime le compte et tout ce qui s'y rattache (pseudo, adhésions, votes,
   * préférences, accès d'assistant) par la fonction serveur delete_my_account ;
   * les groupes créés et les étapes cochées restent aux autres membres. La
   * session locale est ensuite oubliée.
   */
  async function deleteMyData() {
    const supabase = useSupabase()
    const { error } = await supabase.rpc('delete_my_account')
    if (error) throw error
    await supabase.auth.signOut({ scope: 'local' })
    oublier()
  }

  return {
    userId,
    email,
    handle,
    isReady,
    estConnecte,
    hasHandle,
    ensureSession,
    envoyerCode,
    verifierCode,
    connexionGoogle,
    deconnexion,
    setHandle,
    deleteMyData,
  }
})
