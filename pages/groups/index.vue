<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useGroupStore } from '~/stores/group'
import { FORMAT_CODE_ARPENTE } from '~/utils/jumelage'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const groupStore = useGroupStore()

const sessionError = ref<string | null>(null)
const groupsError = ref<string | null>(null)
const isLoadingGroups = ref(false)
const showCreateModal = ref(false)
const showJoinModal = ref(false)

// « Rejoindre aussi dans Arpente » (lien d'Agora, rejoindre.html) : la fenêtre
// « Rejoindre » s'ouvre avec le code, une fois connecté et pseudo choisi. La page
// est clée sur son adresse : un lien reçu alors qu'elle est déjà ouverte la
// remonte, au lieu de garder l'ancien code ; fermer la fenêtre retire le code
// de l'adresse, pour qu'un rechargement ne la rouvre pas.
definePageMeta({ key: route => route.fullPath })

const rejoindre = typeof route.query.rejoindre === 'string'
  && FORMAT_CODE_ARPENTE.test(route.query.rejoindre)
  ? route.query.rejoindre
  : undefined

function ouvrirRejoindreSiLien() {
  if (rejoindre && authStore.estConnecte && authStore.hasHandle) showJoinModal.value = true
}

function fermerRejoindre() {
  showJoinModal.value = false
  if (rejoindre) router.replace('/groups')
}

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
    if (authStore.estConnecte && authStore.hasHandle) await loadGroups()
    ouvrirRejoindreSiLien()
  } catch {
    sessionError.value = 'Connexion impossible. Verifie ta connexion internet.'
  }
})

async function onHandleSet() {
  await loadGroups()
  ouvrirRejoindreSiLien()
}

async function onConnecte() {
  if (authStore.hasHandle) await loadGroups()
  ouvrirRejoindreSiLien()
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
      <div class="groups-titre">
        <h1>Groupes</h1>
        <NuxtLink v-if="authStore.estConnecte" to="/groups/compte" class="lien-compte">Mon compte</NuxtLink>
      </div>
      <p>Decidez ensemble d'un parcours, votez, suivez votre progression.</p>
    </header>

    <p v-if="sessionError" class="groups-error">{{ sessionError }}</p>
    <p v-else-if="!authStore.isReady" class="groups-loading">Connexion...</p>
    <ConnexionPanel v-else-if="!authStore.estConnecte" @connecte="onConnecte" />
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
      :code-initial="rejoindre"
      @close="fermerRejoindre"
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

  .groups-titre {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: $spacing-sm;
  }

  .lien-compte {
    font-size: $font-size-sm;
    color: $color-text;
    text-decoration: underline;
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

  // Action destructrice : contour et texte rouges, jamais un aplat qui la ferait
  // passer pour l'action principale.
  &.danger {
    background: transparent;
    border: 1px solid $color-highlight;
    color: $color-highlight;
  }
}

.groups-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}
</style>
