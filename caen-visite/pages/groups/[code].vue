<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useGroupStore } from '~/stores/group'

const route = useRoute()
const code = (route.params.code as string).toUpperCase()

const authStore = useAuthStore()
const groupStore = useGroupStore()

const loadError = ref<string | null>(null)
const isLoading = ref(true)

onMounted(async () => {
  try {
    if (!authStore.isReady) await authStore.ensureSession()
    if (!authStore.hasHandle) {
      loadError.value = 'Choisis dabord un pseudo depuis l\'onglet Groupes.'
      return
    }
    await groupStore.loadGroupByCode(code)
  } catch {
    loadError.value = 'Groupe introuvable ou inaccessible.'
  } finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="page-group safe-top">
    <NuxtLink to="/groups" class="back-link">← Retour</NuxtLink>

    <p v-if="isLoading" class="group-loading">Chargement...</p>
    <p v-else-if="loadError" class="group-error">{{ loadError }}</p>

    <template v-else-if="groupStore.currentGroup">
      <header class="group-header">
        <h1>{{ groupStore.currentGroup.name }}</h1>
        <p class="group-sub">
          {{ groupStore.currentGroup.city === 'caen' ? 'Caen' : 'Troyes' }}
          · Code {{ groupStore.currentGroup.code }}
        </p>
      </header>

      <section class="group-section">
        <h2>Membres</h2>
        <GroupMemberList :members="groupStore.members" />
      </section>

      <p class="group-todo">Le vote pour decider du parcours arrive bientot ici.</p>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.page-group {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-lg;
  padding-bottom: calc(60px + #{$spacing-lg});
}

.back-link {
  display: inline-block;
  font-size: $font-size-sm;
  color: $color-text-muted;
  margin-bottom: $spacing-md;
}

.group-loading,
.group-error {
  text-align: center;
  color: $color-text-muted;
}

.group-error {
  color: $color-highlight;
}

.group-header {
  margin-bottom: $spacing-xl;

  h1 {
    font-size: $font-size-2xl;
    font-weight: 700;
    margin-bottom: $spacing-xs;
  }
}

.group-sub {
  color: $color-text-muted;
  font-size: $font-size-sm;
}

.group-section {
  margin-bottom: $spacing-xl;

  h2 {
    font-size: $font-size-lg;
    font-weight: 600;
    margin-bottom: $spacing-md;
  }
}

.group-todo {
  color: $color-text-muted;
  font-size: $font-size-sm;
  font-style: italic;
  text-align: center;
  padding: $spacing-lg 0;
}
</style>
