<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useGroupStore } from '~/stores/group'
import { LIENS_LEGAUX } from '~/utils/liensLegaux'

const router = useRouter()
const authStore = useAuthStore()
const groupStore = useGroupStore()

const sessionError = ref<string | null>(null)
const groupsError = ref<string | null>(null)
const isLoadingGroups = ref(false)
const showCreateModal = ref(false)
const showJoinModal = ref(false)
const confirmeEffacement = ref(false)
const isEffacement = ref(false)
const effacementError = ref<string | null>(null)
const donneesEffacees = ref(false)

async function effacerMesDonnees() {
  isEffacement.value = true
  effacementError.value = null
  try {
    await authStore.deleteMyData()
    groupStore.oublier()
    confirmeEffacement.value = false
    donneesEffacees.value = true
  } catch {
    effacementError.value = 'La suppression n\'a pas abouti. Vérifie ta connexion, puis réessaie.'
  } finally {
    isEffacement.value = false
  }
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

    <p v-if="donneesEffacees" class="groups-empty" role="status">
      Tes données de groupe sont effacées : ton pseudo, tes groupes et tes votes.
      Rouvre cette page pour repartir de zéro.
    </p>
    <p v-else-if="sessionError" class="groups-error">{{ sessionError }}</p>
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

      <section class="groups-donnees" aria-labelledby="titre-donnees">
        <h2 id="titre-donnees">Tes données</h2>
        <p>
          Ton pseudo, tes groupes et tes votes sont gardés sur notre serveur, en Allemagne.
          Un groupe inactif depuis 6 mois est effacé tout seul.
          <a :href="LIENS_LEGAUX.confidentialite" target="_blank" rel="noopener">Politique de confidentialité</a>
        </p>
        <p v-if="effacementError" class="groups-error">{{ effacementError }}</p>
        <button
          v-if="!confirmeEffacement"
          class="action-button danger"
          type="button"
          @click="confirmeEffacement = true"
        >
          Supprimer mes données
        </button>
        <template v-else>
          <p>
            Ton pseudo, tes adhésions et tes votes seront effacés définitivement.
            Les groupes que tu as créés restent aux autres membres.
          </p>
          <button class="action-button danger" type="button" :disabled="isEffacement" @click="effacerMesDonnees">
            {{ isEffacement ? 'Suppression...' : 'Confirmer la suppression' }}
          </button>
          <button class="action-button" type="button" :disabled="isEffacement" @click="confirmeEffacement = false">
            Annuler
          </button>
        </template>
      </section>
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

  // Action destructrice : contour et texte rouges, jamais un aplat qui la ferait
  // passer pour l'action principale.
  &.danger {
    background: transparent;
    border: 1px solid $color-highlight;
    color: $color-highlight;
  }
}

.groups-donnees {
  margin-top: $spacing-xl;
  padding-top: $spacing-lg;
  border-top: 1px solid $color-surface-elevated;
  color: $color-text-muted;
  font-size: $font-size-sm;

  h2 {
    color: $color-text;
    font-size: $font-size-md;
    margin-bottom: $spacing-sm;
  }

  p { margin-bottom: $spacing-md; }
  a { color: $color-text; }
  .action-button { width: 100%; margin-bottom: $spacing-sm; }
}

.groups-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}
</style>
