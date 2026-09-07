<script setup lang="ts">
import type { Poi } from '~/types'
import { useVoteStore } from '~/stores/vote'

const props = defineProps<{
  pois: Poi[]
  groupId: string
  userId: string
  memberCount: number
}>()

const voteStore = useVoteStore()
const enCours = ref<string | null>(null)
const erreur = ref<string | null>(null)

// Les POI deja soutenus remontent : sur une liste de 80 lieux, l'interet est de
// voir ce que le groupe choisit, pas de faire defiler l'alphabet.
const triees = computed(() => [...props.pois].sort((a, b) => {
  const ecart = voteStore.approvalCount(b.slug) - voteStore.approvalCount(a.slug)
  return ecart !== 0 ? ecart : a.title.localeCompare(b.title)
}))

async function basculer(poi: Poi) {
  if (enCours.value) return
  enCours.value = poi.slug
  erreur.value = null
  try {
    await voteStore.toggleApproval(props.groupId, props.userId, poi.slug)
  }
  catch {
    erreur.value = `Impossible d'enregistrer le vote pour ${poi.title}.`
  }
  finally {
    enCours.value = null
  }
}
</script>

<template>
  <div class="vote-list">
    <p v-if="erreur" class="vote-erreur">{{ erreur }}</p>

    <button
      v-for="poi in triees"
      :key="poi.slug"
      class="vote-item"
      :class="{ 'is-approved': voteStore.hasApproved(poi.slug, userId) }"
      :disabled="enCours === poi.slug"
      type="button"
      :aria-pressed="voteStore.hasApproved(poi.slug, userId)"
      @click="basculer(poi)"
    >
      <span class="vote-check" aria-hidden="true">
        {{ voteStore.hasApproved(poi.slug, userId) ? '✓' : '' }}
      </span>

      <span class="vote-corps">
        <span class="vote-titre">{{ poi.title }}</span>
        <span v-if="poi.epoch" class="vote-epoque">{{ poi.epoch }}</span>
      </span>

      <span
        class="vote-compteur"
        :class="{ 'is-unanime': voteStore.approvalCount(poi.slug) === memberCount && memberCount > 0 }"
        :title="`${voteStore.approvalCount(poi.slug)} sur ${memberCount} membre(s)`"
      >
        {{ voteStore.approvalCount(poi.slug) }}/{{ memberCount }}
      </span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.vote-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

.vote-erreur {
  color: $color-highlight;
  font-size: $font-size-sm;
  margin-bottom: $spacing-sm;
}

.vote-item {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  width: 100%;
  padding: $spacing-sm $spacing-md;
  background: $color-surface-elevated;
  border: 1px solid transparent;
  border-radius: $radius-sm;
  color: $color-text;
  text-align: left;
  cursor: pointer;
  transition: background $transition-fast, border-color $transition-fast;

  &.is-approved {
    border-color: $color-success;
    background: color-mix(in srgb, $color-success 12%, $color-surface-elevated);
  }

  &:disabled {
    opacity: 0.5;
  }
}

.vote-check {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: $radius-sm;
  border: 2px solid $color-text-muted;
  color: $color-success;
  font-weight: 700;
  font-size: $font-size-sm;
  display: flex;
  align-items: center;
  justify-content: center;

  .is-approved & {
    border-color: $color-success;
  }
}

.vote-corps {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.vote-titre {
  font-size: $font-size-sm;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vote-epoque {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.vote-compteur {
  flex-shrink: 0;
  font-size: $font-size-xs;
  font-weight: 700;
  color: $color-text-muted;
  font-variant-numeric: tabular-nums;

  &.is-unanime {
    color: $color-success;
  }
}
</style>
