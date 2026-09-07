<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useGroupStore } from '~/stores/group'

const router = useRouter()
const authStore = useAuthStore()
const groupStore = useGroupStore()

const sessionError = ref<string | null>(null)
const groupsError = ref<string | null>(null)
const isLoadingGroups = ref(false)
const showCreateModal = ref(false)
const showJoinModal = ref(false)

async function loadGroups() {
  isLoadingGroups.value = true
  groupsError.value = null
  try {
    await groupStore.loadMyGroups()
  } catch {
    groupsError.value = 'Impossible de charger tes groupes.'
  } finally {
    isLoadingGroups.value = false
  }
}

onMounted(async () => {
  try {
    await authStore.ensureSession()
    if (authStore.hasHandle) await loadGroups()
  } catch {
    sessionError.value = 'Connexion impossible. Verifie ta connexion internet.'
  }
})

async function onHandleSet() {
  await loadGroups()
}

function onGroupReady(code: string) {
  showCreateModal.value = false
  showJoinModal.value = false
  router.push(`/groups/${code}`)
}
</script>

<template>
  <div class="page-groups safe-top">
    <header class="groups-header">
      <h1>Groupes</h1>
      <p>Decidez ensemble d'un parcours, votez, suivez votre progression.</p>
    </header>

    <p v-if="sessionError" class="groups-error">{{ sessionError }}</p>
    <p v-else-if="!authStore.isReady" class="groups-loading">Connexion...</p>
    <HandlePrompt v-else-if="!authStore.hasHandle" @handle-set="onHandleSet" />

    <template v-else>
      <div class="groups-actions">
        <button class="action-button primary" @click="showCreateModal = true">Creer un groupe</button>
        <button class="action-button" @click="showJoinModal = true">Rejoindre avec un code</button>
      </div>

      <p v-if="groupsError" class="groups-error">{{ groupsError }}</p>
      <p v-else-if="isLoadingGroups" class="groups-loading">Chargement...</p>
      <p v-else-if="groupStore.myGroups.length === 0" class="groups-empty">
        Tu n'es dans aucun groupe pour l'instant.
      </p>
      <div v-else class="groups-list">
        <GroupCard v-for="group in groupStore.myGroups" :key="group.id" :group="group" />
      </div>
    </template>

    <CreateGroupModal
      v-if="showCreateModal"
      @close="showCreateModal = false"
      @created="onGroupReady"
    />
    <JoinGroupModal
      v-if="showJoinModal"
      @close="showJoinModal = false"
      @joined="onGroupReady"
    />
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.page-groups {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-lg;
  padding-bottom: calc(60px + #{$spacing-lg});
}

.groups-header {
  margin-bottom: $spacing-xl;

  h1 {
    font-size: $font-size-2xl;
    font-weight: 700;
    margin-bottom: $spacing-xs;
  }

  p {
    color: $color-text-muted;
    font-size: $font-size-sm;
  }
}

.groups-error {
  color: $color-highlight;
  text-align: center;
}

.groups-loading {
  color: $color-text-muted;
  text-align: center;
}

.groups-empty {
  color: $color-text-muted;
  text-align: center;
  padding: $spacing-xl 0;
}

.groups-actions {
  display: flex;
  gap: $spacing-sm;
  margin-bottom: $spacing-lg;
}

.action-button {
  flex: 1;
  padding: $spacing-md;
  border-radius: $radius-md;
  background: $color-surface-elevated;
  color: $color-text;
  font-weight: 700;
  font-size: $font-size-sm;

  &.primary {
    background: $color-highlight;
    color: white;
  }
}

.groups-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}
</style>
