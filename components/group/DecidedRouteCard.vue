<script setup lang="ts">
import type { DecidedRoute, Poi } from '~/types'

const props = defineProps<{
  decision: DecidedRoute
  pois: Poi[]
  auteur: string
}>()

// L'ordre de `poiSlugs` est celui du parcours : il ne doit pas etre retrie.
const etapes = computed(() =>
  props.decision.poiSlugs
    .map(slug => props.pois.find(p => p.slug === slug))
    .filter((p): p is Poi => p !== undefined))

const distanceLisible = computed(() => {
  const m = props.decision.distanceMeters
  if (m === null) return null
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`
})

const dureeLisible = computed(() => {
  const s = props.decision.durationSeconds
  if (s === null) return null
  const minutes = Math.round(s / 60)
  const h = Math.floor(minutes / 60)
  const reste = minutes % 60
  if (h === 0) return `${reste} min`
  return reste === 0 ? `${h} h` : `${h} h ${String(reste).padStart(2, '0')}`
})

// Sans duree OSRM, la distance vient de la somme a vol d'oiseau : le dire,
// plutot que de laisser croire a une mesure du trajet reel.
const estEstimee = computed(() => props.decision.durationSeconds === null)
</script>

<template>
  <div class="parcours">
    <div class="parcours-chiffres">
      <span v-if="distanceLisible" class="chiffre">
        <strong>{{ distanceLisible }}</strong>
        <em>{{ estEstimee ? 'a vol d\'oiseau' : 'a pied' }}</em>
      </span>
      <span v-if="dureeLisible" class="chiffre">
        <strong>{{ dureeLisible }}</strong>
        <em>de marche</em>
      </span>
      <span class="chiffre">
        <strong>{{ etapes.length }}</strong>
        <em>{{ etapes.length > 1 ? 'etapes' : 'etape' }}</em>
      </span>
    </div>

    <p v-if="estEstimee" class="parcours-reserve">
      Distance estimee : le calculateur d'itineraire n'a pas repondu, le trajet
      reel sera plus long.
    </p>

    <ol class="parcours-etapes">
      <li v-for="(poi, index) in etapes" :key="poi.slug" class="etape">
        <span class="etape-rang">{{ index + 1 }}</span>
        <span class="etape-corps">
          <NuxtLink :to="`/poi/${poi.slug}`" class="etape-titre">{{ poi.title }}</NuxtLink>
          <span v-if="poi.epoch" class="etape-epoque">{{ poi.epoch }}</span>
        </span>
      </li>
    </ol>

    <p class="parcours-signature">
      Decide par {{ auteur }}
      <span v-if="decision.targetDurationMinutes">
        · envie du groupe : {{ Math.round(decision.targetDurationMinutes) }} min
      </span>
    </p>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.parcours {
  padding: $spacing-md;
  background: $color-surface-elevated;
  border-radius: $radius-sm;
  border: 1px solid $color-success;
}

.parcours-chiffres {
  display: flex;
  gap: $spacing-lg;
  margin-bottom: $spacing-md;
}

.chiffre {
  display: flex;
  flex-direction: column;

  strong {
    font-size: $font-size-lg;
    color: $color-success;
    font-variant-numeric: tabular-nums;
  }

  em {
    font-size: $font-size-xs;
    color: $color-text-muted;
    font-style: normal;
  }
}

.parcours-reserve {
  font-size: $font-size-xs;
  color: $color-text-muted;
  margin-bottom: $spacing-md;
}

.parcours-etapes {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  list-style: none;
  padding: 0;
  margin: 0 0 $spacing-md;
}

.etape {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
}

.etape-rang {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: $radius-full;
  background: $color-accent;
  color: $color-text;
  font-size: $font-size-xs;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.etape-corps {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.etape-titre {
  font-size: $font-size-sm;
  font-weight: 600;
  color: $color-text;
}

.etape-epoque {
  font-size: $font-size-xs;
  color: $color-text-muted;
}

.parcours-signature {
  font-size: $font-size-xs;
  color: $color-text-muted;
  margin: 0;
}
</style>
