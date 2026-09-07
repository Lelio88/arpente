import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { City, Group, GroupMember } from '~/types'

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

  return {
    myGroups,
    currentGroup,
    members,
    loadMyGroups,
    createGroup,
    previewGroupByCode,
    joinGroupByCode,
    loadGroupByCode,
    loadMembers,
  }
})
