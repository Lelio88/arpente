import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Etat du vote d'un groupe : approbations par POI et preferences de parcours.
 *
 * Choix non evidents :
 *
 * - **Vote d'approbation, pas de classement.** Chaque membre coche autant de POI
 *   qu'il veut ; une ligne de `poi_votes` = un membre approuve un POI. La
 *   contrainte unique (group_id, user_id, poi_slug) rend le retrait idempotent
 *   et evite les doublons quand deux appareils cochent en meme temps.
 *
 * - **L'etat local est reconstruit depuis la base, jamais devine.** Un toggle
 *   ecrit puis attend l'evenement Realtime, qui fait autorite. C'est ce qui
 *   permet a deux membres de voter simultanement sans se marcher dessus : le
 *   dernier etat affiche est toujours celui de la base, pas celui du clic.
 *
 * - **Realtime est facultatif.** Si le canal ne s'ouvre pas (reseau coupe,
 *   service absent), les votes restent enregistres et lisibles : seule la mise a
 *   jour spontanee disparait. `isLive` le dit a l'interface, qui propose alors
 *   un rafraichissement manuel.
 *
 * Invariant : un seul canal ouvert a la fois. `subscribe` ferme le precedent
 * avant d'en ouvrir un autre, sinon changer de groupe accumule les abonnements
 * et les evenements arrivent en double.
 */
export const useVoteStore = defineStore('vote', () => {
  /** poiSlug -> userIds l'ayant approuve. */
  const approvals = ref<Record<string, string[]>>({})
  /** userId -> preferences soumises. */
  const preferences = ref<Record<string, { poiCount: number | null, durationMinutes: number | null }>>({})
  const isLive = ref(false)
  const isLoading = ref(false)

  let canal: RealtimeChannel | null = null
  let groupeSuivi: string | null = null

  const approvalCount = computed(() => (poiSlug: string) => approvals.value[poiSlug]?.length ?? 0)

  const hasApproved = computed(() => (poiSlug: string, userId: string) =>
    approvals.value[poiSlug]?.includes(userId) ?? false)

  /** POI approuves par au moins un membre, du plus soutenu au moins soutenu. */
  const rankedSlugs = computed(() =>
    Object.entries(approvals.value)
      .filter(([, membres]) => membres.length > 0)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([slug]) => slug))

  async function load(groupId: string): Promise<void> {
    const supabase = useSupabase()
    isLoading.value = true

    try {
      const [votes, prefs] = await Promise.all([
        supabase.from('poi_votes').select('poi_slug, user_id').eq('group_id', groupId),
        supabase.from('preference_votes')
          .select('user_id, target_poi_count, target_duration_minutes')
          .eq('group_id', groupId),
      ])

      if (votes.error) throw votes.error
      if (prefs.error) throw prefs.error

      const parSlug: Record<string, string[]> = {}
      for (const ligne of votes.data ?? []) {
        ;(parSlug[ligne.poi_slug] ??= []).push(ligne.user_id)
      }
      approvals.value = parSlug

      const parMembre: Record<string, { poiCount: number | null, durationMinutes: number | null }> = {}
      for (const ligne of prefs.data ?? []) {
        parMembre[ligne.user_id] = {
          poiCount: ligne.target_poi_count,
          durationMinutes: ligne.target_duration_minutes,
        }
      }
      preferences.value = parMembre
    }
    finally {
      isLoading.value = false
    }
  }

  async function toggleApproval(groupId: string, userId: string, poiSlug: string): Promise<void> {
    const supabase = useSupabase()
    const dejaApprouve = approvals.value[poiSlug]?.includes(userId) ?? false

    if (dejaApprouve) {
      const { error } = await supabase.from('poi_votes').delete()
        .eq('group_id', groupId).eq('user_id', userId).eq('poi_slug', poiSlug)
      if (error) throw error
      retirerLocalement(poiSlug, userId)
    }
    else {
      const { error } = await supabase.from('poi_votes')
        .insert({ group_id: groupId, user_id: userId, poi_slug: poiSlug })
      if (error) throw error
      ajouterLocalement(poiSlug, userId)
    }
  }

  async function setPreferences(
    groupId: string,
    userId: string,
    poiCount: number | null,
    durationMinutes: number | null,
  ): Promise<void> {
    const supabase = useSupabase()

    // upsert et non insert : la table porte une contrainte unique
    // (group_id, user_id), un membre revenant sur son choix doit ecraser le sien
    // plutot que d'echouer en conflit.
    const { error } = await supabase.from('preference_votes').upsert({
      group_id: groupId,
      user_id: userId,
      target_poi_count: poiCount,
      target_duration_minutes: durationMinutes,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'group_id,user_id' })

    if (error) throw error
    preferences.value = { ...preferences.value, [userId]: { poiCount, durationMinutes } }
  }

  function ajouterLocalement(poiSlug: string, userId: string) {
    const membres = approvals.value[poiSlug] ?? []
    if (membres.includes(userId)) return
    approvals.value = { ...approvals.value, [poiSlug]: [...membres, userId] }
  }

  function retirerLocalement(poiSlug: string, userId: string) {
    const membres = approvals.value[poiSlug] ?? []
    approvals.value = { ...approvals.value, [poiSlug]: membres.filter(id => id !== userId) }
  }

  /**
   * Ouvre le flux temps reel du groupe. Les evenements font autorite sur l'etat
   * local — y compris pour ses propres votes, deja appliques optimistiquement :
   * les fonctions d'ajout et de retrait sont idempotentes, un doublon est sans
   * effet.
   */
  function subscribe(groupId: string): void {
    if (groupeSuivi === groupId && canal) return
    unsubscribe()

    const supabase = useSupabase()
    groupeSuivi = groupId

    canal = supabase
      .channel(`groupe-${groupId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'poi_votes', filter: `group_id=eq.${groupId}` },
        (charge: any) => ajouterLocalement(charge.new.poi_slug, charge.new.user_id))
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'poi_votes', filter: `group_id=eq.${groupId}` },
        // Un DELETE ne transporte que l'identite de replique : sans REPLICA
        // IDENTITY FULL sur la table, `old` ne porte que la cle primaire, pas le
        // slug. On recharge donc plutot que de deviner.
        () => { void load(groupId) })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'preference_votes', filter: `group_id=eq.${groupId}` },
        () => { void load(groupId) })
      .subscribe((statut: string) => {
        isLive.value = statut === 'SUBSCRIBED'
      })
  }

  function unsubscribe(): void {
    if (!canal) return
    const supabase = useSupabase()
    void supabase.removeChannel(canal)
    canal = null
    groupeSuivi = null
    isLive.value = false
  }

  function reset(): void {
    unsubscribe()
    approvals.value = {}
    preferences.value = {}
  }

  return {
    approvals,
    preferences,
    isLive,
    isLoading,
    approvalCount,
    hasApproved,
    rankedSlugs,
    load,
    toggleApproval,
    setPreferences,
    subscribe,
    unsubscribe,
    reset,
  }
})
