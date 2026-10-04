<script setup lang="ts">
/**
 * La vérification anti-robot (Cloudflare Turnstile) demandée avant l'envoi
 * d'un code de connexion.
 *
 * Turnstile n'accepte que les noms de domaine déclarés, et l'app tourne sous
 * `https://localhost` (WebView Capacitor) : le widget vit donc dans une page
 * du service, sous notre domaine (`<api>/captcha`), affichée ici dans un
 * cadre. Le jeton revient par `postMessage` ; on n'écoute que l'origine de
 * l'API, jamais un autre cadre.
 *
 * Invariant : un jeton ne sert qu'une fois — après chaque envoi, le parent
 * appelle `recommencer()`, qui recharge le cadre.
 */
import { origineApi as origine } from '~/utils/liensLegaux'

const emit = defineEmits<{ jeton: [valeur: string] }>()

const config = useRuntimeConfig()
const origineApi = origine(String(config.public.supabaseUrl))
const adresse = `${origineApi}/captcha`
const generation = ref(0)
const echec = ref(false)

function recevoir(evenement: MessageEvent) {
  if (evenement.origin !== origineApi) return
  const donnees = evenement.data as { source?: string, jeton?: string, erreur?: boolean }
  if (donnees?.source !== 'arpente-captcha') return
  echec.value = donnees.erreur === true
  emit('jeton', typeof donnees.jeton === 'string' ? donnees.jeton : '')
}

function recommencer() {
  echec.value = false
  emit('jeton', '')
  generation.value++
}

onMounted(() => window.addEventListener('message', recevoir))
onBeforeUnmount(() => window.removeEventListener('message', recevoir))

defineExpose({ recommencer })
</script>

<template>
  <div class="captcha">
    <iframe
      :key="generation"
      :src="adresse"
      title="Vérification anti-robot"
      class="captcha-cadre"
      sandbox="allow-scripts allow-same-origin allow-popups"
    />
    <p v-if="echec" class="captcha-erreur" role="alert">
      La vérification anti-robot ne se charge pas.
      <button type="button" class="captcha-relancer" @click="recommencer">Réessayer</button>
    </p>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.captcha {
  margin: $spacing-sm 0;
}

.captcha-cadre {
  display: block;
  width: 100%;
  height: 72px;
  border: 0;
  background: transparent;
}

.captcha-erreur {
  font-size: $font-size-sm;
  color: $color-highlight-texte;
}

.captcha-relancer {
  color: $color-text;
  text-decoration: underline;
  background: none;
  font-size: inherit;
}
</style>
