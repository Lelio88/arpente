import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { City, Group, GroupMember, GroupTwin } from '~/types'

export interface GroupPreview {
  id: string
  name: string
  city: City
  status: string
  memberCount: number
}

interface PreviewRow {
  id: string
  name: string
  city: string
  status: string
  member_count: number
}

export const useGroupStore = defineStore('group', () => {
  const myGroups = ref<Group[]>([])
  const currentGroup = ref<Group | null>(null)
  const members = ref<GroupMember[]>([])
  /** Jumeaux du groupe courant dans d'autres apps (Agora). */
  const twins = ref<GroupTwin[]>([])

  function mapGroup(row: any): Group {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      city: row.city,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }
  }

  async function loadMyGroups(): Promise<Group[]> {
    const supabase = useSupabase()
    const { data, error } = await supabase
      .from('groups')
      .select()
      .order('created_at', { ascending: false })

    if (error) throw error
    myGroups.value = (data ?? []).map(mapGroup)
    return myGroups.value
  }

  async function createGroup(name: string, city: City): Promise<Group> {
    const supabase = useSupabase()
    const authStore = useAuthStore()

    const { data, error } = await supabase
      .from('groups')
      .insert({ name, city, created_by: authStore.userId })
      .select()
      .single()

    if (error) throw error

    const group = mapGroup(data)
    await joinGroupByCode(group.code)
    return group
  }

  async function previewGroupByCode(code: string): Promise<GroupPreview | null> {
    const supabase = useSupabase()
    const { data, error } = await supabase
      .rpc('preview_group_by_code', { p_code: code })
      .maybeSingle() as { data: PreviewRow | null, error: Error | null }

    if (error) throw error
    if (!data) return null

    return {
      id: data.id,
      name: data.name,
      city: data.city as City,
      status: data.status,
      memberCount: Number(data.member_count),
    }
  }

  async function joinGroupByCode(code: string): Promise<Group> {
    const supabase = useSupabase()

    const { error: joinError } = await supabase.rpc('join_group_by_code', { p_code: code })
    if (joinError) throw joinError

    await loadGroupByCode(code)
    if (!currentGroup.value) throw new Error('group_not_found_after_join')
    return currentGroup.value
  }

  async function loadGroupByCode(code: string): Promise<void> {
    const supabase = useSupabase()

    const { data, error } = await supabase
      .from('groups')
      .select()
      .eq('code', code.toUpperCase())
      .single()

    if (error) throw error

    currentGroup.value = mapGroup(data)
    await loadMembers()
  }

  async function loadMembers(): Promise<void> {
    if (!currentGroup.value) return

    const supabase = useSupabase()
    const { data, error } = await supabase
      .from('group_members')
      .select('group_id, user_id, joined_at, profiles(handle)')
      .eq('group_id', currentGroup.value.id)
      .order('joined_at', { ascending: true })

    if (error) throw error

    members.value = (data ?? []).map((row: any) => ({
      groupId: row.group_id,
      userId: row.user_id,
      handle: row.profiles?.handle ?? '?',
      joinedAt: row.joined_at,
    }))
  }

  /** Supprime un groupe pour tous (la RLS ne l'accepte que de son créateur). */
  async function deleteGroup(groupId: string): Promise<void> {
    const supabase = useSupabase()
    const { data, error } = await supabase.from('groups').delete().eq('id', groupId).select('id')
    if (error) throw error
    if (!data?.length) throw new Error('not_group_creator')
    myGroups.value = myGroups.value.filter(g => g.id !== groupId)
    if (currentGroup.value?.id === groupId) {
      currentGroup.value = null
      members.value = []
    }
  }

  async function loadTwins(groupId: string): Promise<void> {
    const supabase = useSupabase()
    const { data, error } = await supabase
      .from('group_twins')
      .select('app, remote_code')
      .eq('group_id', groupId)
    if (error) throw error
    twins.value = ((data ?? []) as Array<{ app: GroupTwin['app'], remote_code: string }>)
      .map(row => ({ app: row.app, remoteCode: row.remote_code }))
  }

  /**
   * Jumelle le groupe (créateur seul, RLS). Un jumeau ne se remplace pas : un
   * groupe déjà jumelé lève `twin_exists`, et l'on défait d'abord.
   */
  async function addTwin(groupId: string, app: GroupTwin['app'], remoteCode: string): Promise<void> {
    const supabase = useSupabase()
    const { error } = await supabase
      .from('group_twins')
      .insert({ group_id: groupId, app, remote_code: remoteCode })
    if (error) throw new Error(error.code === '23505' ? 'twin_exists' : error.message)
    if (currentGroup.value?.id === groupId) await loadTwins(groupId)
  }

  /** Défait le jumelage (créateur seul) ; sous RLS, un refus est zéro ligne. */
  async function removeTwin(groupId: string, app: GroupTwin['app']): Promise<void> {
    const supabase = useSupabase()
    const { data, error } = await supabase
      .from('group_twins')
      .delete()
      .eq('group_id', groupId)
      .eq('app', app)
      .select('app')
    if (error) throw error
    if (!data?.length) throw new Error('not_group_creator')
    twins.value = twins.value.filter(t => t.app !== app)
  }

  /**
   * Change le code du groupe (créateur seul) : l'ancien n'ouvre plus rien, les
   * membres restent. Rend le nouveau code — l'adresse de la page en dépend.
   */
  async function regenerateCode(groupId: string): Promise<string> {
    const supabase = useSupabase()
    const { data, error } = await supabase.rpc('regenerate_join_code', { p_group_id: groupId })
    if (error) throw error
    const code = data as string
    if (currentGroup.value?.id === groupId) currentGroup.value = { ...currentGroup.value, code }
    myGroups.value = myGroups.value.map(g => (g.id === groupId ? { ...g, code } : g))
    return code
  }

  /** Oublie tout l'état local (après « Supprimer mes données »). */
  function oublier(): void {
    myGroups.value = []
    currentGroup.value = null
    members.value = []
    twins.value = []
  }

  return {
    myGroups,
    currentGroup,
    members,
    twins,
    loadTwins,
    addTwin,
    removeTwin,
    regenerateCode,
    deleteGroup,
    oublier,
    loadMyGroups,
    createGroup,
    previewGroupByCode,
    joinGroupByCode,
    loadGroupByCode,
    loadMembers,
  }
})
