/**
 * Les accès accordés à un assistant IA, vus depuis l'app : la liste (table
 * `assistant_grants`, ses propres lignes seulement par la RLS) et la
 * révocation.
 *
 * Choix non évidents :
 * - **Révoquer, c'est supprimer la ligne** : le service relit l'accès à
 *   chaque appel de l'assistant, qui tombe donc à l'appel suivant.
 * - Le compteur de rotation des jetons (`refresh_gen`) n'est jamais lu :
 *   l'app n'en a pas le droit (grant par colonne).
 * - Sous la RLS, un `DELETE` refusé n'est pas une erreur mais zéro ligne :
 *   on relit ce qui a été supprimé, comme `groupStore.deleteGroup`.
 * - **L'assistant ouvert ou fermé se lit en ligne**, pas au build : le service
 *   ne publie sa ressource protégée (RFC 9728) qu'avec `OAUTH_ACTIF=true`, et
 *   répond 404 sinon. Ouvrir l'assistant ne demande donc aucune mise à jour de
 *   l'app ; tant qu'il est fermé, l'écran ne propose pas une adresse morte.
 *   Une sonde qui échoue (hors ligne, délai) vaut « fermé ».
 *
 *   const { acces, ouvert, charger, sonder, revoquer } = useAccesAssistant()
 */

/** Au-delà, la sonde abandonne : l'écran du compte ne doit pas attendre. */
const DELAI_SONDE_MS = 5000

export interface AccesAssistant {
  id: string
  nomClient: string
  assistant: string
  accordeLe: string
  utiliseLe: string | null
  expireLe: string
}

interface Ligne {
  id: string
  client_name: string
  assistant: string
  created_at: string
  last_used_at: string | null
  expires_at: string
}

export function useAccesAssistant() {
  const acces = ref<AccesAssistant[]>([])
  const charge = ref(false)

  async function charger(): Promise<void> {
    const { data, error } = await useSupabase()
      .from('assistant_grants')
      .select('id, client_name, assistant, created_at, last_used_at, expires_at')
      .order('created_at', { ascending: false })
    if (error) throw error
    acces.value = ((data ?? []) as Ligne[]).map(l => ({
      id: l.id,
      nomClient: l.client_name,
      assistant: l.assistant,
      accordeLe: l.created_at,
      utiliseLe: l.last_used_at,
      expireLe: l.expires_at,
    }))
    charge.value = true
  }

  async function revoquer(id: string): Promise<void> {
    const { data, error } = await useSupabase().from('assistant_grants').delete().eq('id', id).select('id')
    if (error) throw error
    if (!data?.length) throw new Error('acces_introuvable')
    acces.value = acces.value.filter(a => a.id !== id)
  }

  const ouvert = ref(false)

  /** `origine` : celle de l'API (`origineApi`) ; vide, l'assistant reste fermé. */
  async function sonder(origine: string): Promise<void> {
    if (!origine) return
    try {
      const reponse = await fetch(`${origine}/.well-known/oauth-protected-resource/mcp`, {
        signal: AbortSignal.timeout(DELAI_SONDE_MS),
      })
      ouvert.value = reponse.ok
    }
    catch {
      ouvert.value = false
    }
  }

  return { acces, charge, ouvert, charger, sonder, revoquer }
}
