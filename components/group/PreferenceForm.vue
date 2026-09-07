<script setup lang="ts">
import { useVoteStore } from '~/stores/vote'

const props = defineProps<{
  groupId: string
  userId: string
}>()

const voteStore = useVoteStore()

// Bornes alignees sur les CHECK de preference_votes : depasser cote client
// donnerait une erreur 400 illisible au lieu d'un curseur qui bute.
const POI_MIN = 1
const POI_MAX = 30
const DUREE_MIN = 10
const DUREE_MAX = 600

const nombrePoi = ref(8)
const dureeMinutes = ref(150)
const enregistre = ref(false)
const erreur = ref<string | null>(null)
let minuteur: ReturnType<typeof setTimeout> | null = null

onMounted(() => {
  const sienne = voteStore.preferences[props.userId]
  if (sienne) {
    nombrePoi.value = sienne.poiCount ?? 8
    dureeMinutes.value = sienne.durationMinutes ?? 150
    enregistre.value = true
  }
})

const dureeLisible = computed(() => {
  const h = Math.floor(dureeMinutes.value / 60)
  const m = dureeMinutes.value % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
})

/** Mediane des souhaits deja exprimes — c'est elle qui decidera (voteAggregation). */
const medianeGroupe = computed(() => {
  const valeurs = Object.values(voteStore.preferences)
    .map(p => p.poiCount)
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b)
  if (valeurs.length === 0) return null
  const milieu = Math.floor(valeurs.length / 2)
  return valeurs.length % 2 === 0
    ? (valeurs[milieu - 1]! + valeurs[milieu]!) / 2
    : valeurs[milieu]!
})

// Anti-rebond : glisser un curseur emet une dizaine d'evenements, on n'ecrit
// qu'une fois le doigt releve. Sans cela, chaque parcours du curseur produirait
// autant d'upserts et autant de diffusions Realtime aux autres membres.
function planifierEnregistrement() {
  enregistre.value = false
  if (minuteur) clearTimeout(minuteur)
  minuteur = setTimeout(() => { void enregistrer() }, 600)
}

async function enregistrer() {
  erreur.value = null
  try {
    await voteStore.setPreferences(props.groupId, props.userId, nombrePoi.value, dureeMinutes.value)
    enregistre.value = true
  }
  catch {
    erreur.value = 'Preferences non enregistrees.'
  }
}

onBeforeUnmount(() => {
  if (minuteur) clearTimeout(minuteur)
})
</script>

<template>
  <div class="pref-form">
    <label class="pref-champ">
      <span class="pref-libelle">
        Nombre de lieux souhaite
        <strong>{{ nombrePoi }}</strong>
      </span>
      <input
        v-model.number="nombrePoi"
        type="range"
        :min="POI_MIN"
        :max="POI_MAX"
        @change="planifierEnregistrement"
      >
    </label>

    <label class="pref-champ">
      <span class="pref-libelle">
        Duree souhaitee
        <strong>{{ dureeLisible }}</strong>
      </span>
      <input
        v-model.number="dureeMinutes"
        type="range"
        :min="DUREE_MIN"
        :max="DUREE_MAX"
        step="10"
        @change="planifierEnregistrement"
      >
    </label>

    <p v-if="erreur" class="pref-erreur">{{ erreur }}</p>
    <p v-else-if="enregistre" class="pref-etat">Preferences enregistrees</p>

    <p v-if="medianeGroupe !== null" class="pref-mediane">
      Mediane du groupe : <strong>{{ medianeGroupe }}</strong> lieux
    </p>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.pref-form {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
  padding: $spacing-md;
  background: $color-surface-elevated;
  border-radius: $radius-sm;
}

.pref-champ {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

.pref-libelle {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: $font-size-sm;
  color: $color-text-muted;

  strong {
    color: $color-text;
    font-size: $font-size-md;
  }
}

input[type='range'] {
  width: 100%;
  accent-color: $color-highlight;
}

.pref-etat,
.pref-mediane {
  font-size: $font-size-xs;
  color: $color-text-muted;
  margin: 0;
}

.pref-erreur {
  font-size: $font-size-xs;
  color: $color-highlight;
  margin: 0;
}
</style>
