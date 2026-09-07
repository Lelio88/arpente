<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const emit = defineEmits<{
  handleSet: []
}>()

const authStore = useAuthStore()

const handleInput = ref('')
const isSaving = ref(false)
const error = ref<string | null>(null)

async function submit() {
  const trimmed = handleInput.value.trim()
  if (trimmed.length < 2) {
    error.value = "Choisis un pseudo d'au moins 2 caracteres."
    return
  }

  isSaving.value = true
  error.value = null

  try {
    await authStore.setHandle(trimmed)
    emit('handleSet')
  } catch {
    error.value = 'Ce pseudo est peut-etre deja pris, essaie-en un autre.'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div class="handle-prompt">
    <h2>Choisis ton pseudo</h2>
    <p class="handle-hint">Il sera visible par les membres de tes groupes. Il est lie a cet appareil.</p>

    <input
      v-model="handleInput"
      type="text"
      placeholder="Pseudo"
      maxlength="24"
      class="handle-input"
      @keyup.enter="submit"
    />

    <p v-if="error" class="handle-error">{{ error }}</p>

    <button class="handle-submit" :disabled="isSaving" @click="submit">
      {{ isSaving ? 'Enregistrement...' : 'Valider' }}
    </button>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.handle-prompt {
  padding: $spacing-lg;
  text-align: center;

  h2 {
    font-size: $font-size-xl;
    font-weight: 700;
    margin-bottom: $spacing-xs;
  }
}

.handle-hint {
  color: $color-text-muted;
  font-size: $font-size-sm;
  margin-bottom: $spacing-lg;
}

.handle-input {
  width: 100%;
  padding: $spacing-md;
  background: $color-surface-elevated;
  border-radius: $radius-md;
  color: $color-text;
  font-size: $font-size-md;
  text-align: center;
  margin-bottom: $spacing-sm;
}

.handle-error {
  color: $color-highlight;
  font-size: $font-size-sm;
  margin-bottom: $spacing-sm;
}

.handle-submit {
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
