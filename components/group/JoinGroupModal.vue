<script setup lang="ts">
import { useGroupStore, type GroupPreview } from '~/stores/group'

const emit = defineEmits<{
  close: []
  joined: [code: string]
}>()

const groupStore = useGroupStore()

const code = ref('')
const preview = ref<GroupPreview | null>(null)
const isPreviewing = ref(false)
const isJoining = ref(false)
const error = ref<string | null>(null)

async function lookup() {
  const trimmed = code.value.trim().toUpperCase()
  if (trimmed.length < 4) {
    error.value = 'Code invalide.'
    return
  }

  isPreviewing.value = true
  error.value = null
  preview.value = null

  try {
    const result = await groupStore.previewGroupByCode(trimmed)
    if (!result) {
      error.value = 'Aucun groupe avec ce code.'
    } else {
      preview.value = result
    }
  } catch {
    error.value = 'Impossible de verifier ce code. Reessaie.'
  } finally {
    isPreviewing.value = false
  }
}

async function confirmJoin() {
  isJoining.value = true
  error.value = null

  try {
    const group = await groupStore.joinGroupByCode(code.value.trim())
    emit('joined', group.code)
  } catch {
    error.value = 'Impossible de rejoindre ce groupe. Reessaie.'
  } finally {
    isJoining.value = false
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-panel">
      <div class="modal-header">
        <h3>Rejoindre un groupe</h3>
        <button class="modal-close" @click="emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <input
          v-model="code"
          type="text"
          placeholder="Code a 6 caracteres"
          maxlength="6"
          class="modal-input code-input"
          @keyup.enter="lookup"
        />

        <p v-if="error" class="modal-error">{{ error }}</p>

        <div v-if="preview" class="group-preview">
          <p class="preview-name">{{ preview.name }}</p>
          <p class="preview-meta">
            {{ preview.city === 'caen' ? 'Caen' : 'Troyes' }} · {{ preview.memberCount }} membre(s)
          </p>
        </div>

        <button
          v-if="!preview"
          class="modal-submit"
          :disabled="isPreviewing"
          @click="lookup"
        >
          {{ isPreviewing ? 'Recherche...' : 'Verifier le code' }}
        </button>
        <button
          v-else
          class="modal-submit"
          :disabled="isJoining"
          @click="confirmJoin"
        >
          {{ isJoining ? 'Adhesion...' : 'Rejoindre' }}
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

.code-input {
  text-align: center;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  font-weight: 700;
}

.modal-error {
  color: $color-highlight;
  font-size: $font-size-sm;
  margin-bottom: $spacing-sm;
}

.group-preview {
  padding: $spacing-md;
  background: $color-surface-elevated;
  border-radius: $radius-md;
  margin-bottom: $spacing-lg;
  text-align: center;
}

.preview-name {
  font-weight: 700;
  margin-bottom: $spacing-xs;
}

.preview-meta {
  font-size: $font-size-sm;
  color: $color-text-muted;
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
