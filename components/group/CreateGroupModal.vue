<script setup lang="ts">
import { useCityStore } from '~/stores/city'
import { useGroupStore } from '~/stores/group'
import type { City } from '~/types'

const emit = defineEmits<{
  close: []
  created: [code: string]
}>()

const cityStore = useCityStore()
const groupStore = useGroupStore()

const name = ref('')
const city = ref<City>(cityStore.currentCity)
const isSaving = ref(false)
const error = ref<string | null>(null)

async function submit() {
  const trimmed = name.value.trim()
  if (trimmed.length < 2) {
    error.value = "Choisis un nom d'au moins 2 caracteres."
    return
  }

  isSaving.value = true
  error.value = null

  try {
    const group = await groupStore.createGroup(trimmed, city.value)
    emit('created', group.code)
  } catch {
    error.value = 'Impossible de creer le groupe. Reessaie.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-panel">
      <div class="modal-header">
        <h3>Nouveau groupe</h3>
        <button class="modal-close" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <input
          v-model="name"
          type="text"
          placeholder="Nom du groupe"
          maxlength="40"
          class="modal-input"
        />

        <div class="city-choice">
          <button
            v-for="option in cityStore.cities"
            :key="option.slug"
            class="city-option"
            :class="{ active: city === option.slug }"
            @click="city = option.slug"
          >
            {{ option.name }}
          </button>
        </div>

        <p v-if="error" class="modal-error">{{ error }}</p>

        <button class="modal-submit" :disabled="isSaving" @click="submit">
          {{ isSaving ? 'Creation...' : 'Creer le groupe' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: $z-modal;
  display: flex;
  align-items: flex-end;
}

.modal-panel {
  width: 100%;
  background: $color-surface;
  border-radius: $radius-lg $radius-lg 0 0;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  padding: $spacing-lg;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  h3 {
    flex: 1;
    font-size: $font-size-md;
    font-weight: 700;
  }
}

.modal-close {
  font-size: $font-size-lg;
  opacity: 0.6;
  padding: $spacing-xs;
}

.modal-body {
  padding: $spacing-lg;
}

.modal-input {
  width: 100%;
  padding: $spacing-md;
  background: $color-surface-elevated;
  border-radius: $radius-md;
  color: $color-text;
  font-size: $font-size-md;
  margin-bottom: $spacing-md;
}

.city-choice {
  display: flex;
  gap: $spacing-sm;
  margin-bottom: $spacing-lg;
}

.city-option {
  flex: 1;
  padding: $spacing-sm;
  border-radius: $radius-md;
  background: $color-surface-elevated;
  color: $color-text-muted;
  font-size: $font-size-sm;
  font-weight: 600;

  &.active {
    background: $color-highlight;
    color: white;
  }
}

.modal-error {
  color: $color-highlight;
  font-size: $font-size-sm;
  margin-bottom: $spacing-sm;
}

.modal-submit {
  width: 100%;
  padding: $spacing-md;
  border-radius: $radius-md;
  background: $color-highlight;
  color: white;
  font-weight: 700;
  font-size: $font-size-md;

  &:disabled {
    opacity: 0.6;
  }
}
</style>
