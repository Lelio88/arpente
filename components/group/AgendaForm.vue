<script setup lang="ts">
import type { DecidedRoute, Poi } from '~/types'
import { useCalendar } from '~/composables/useCalendar'

const props = defineProps<{
  decision: DecidedRoute
  pois: Poi[]
  nomDuGroupe: string
  ville: string
}>()

const { isAjoutEnCours, erreur, ajouterAuCalendrier } = useCalendar()
const confirmation = ref<string | null>(null)

/**
 * Proposition par defaut : samedi prochain a 14 h. Une visite se cale un
 * week-end bien plus souvent qu'un mardi, et proposer « maintenant » obligerait
 * a tout ressaisir.
 */
function samediProchain(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7))
  d.setHours(14, 0, 0, 0)
  // Le format attendu par datetime-local est l'heure LOCALE sans fuseau :
  // passer par toISOString() decalerait la valeur affichee.
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `T${p(d.getHours())}:${p(d.getMinutes())}`
}

const debut = ref(samediProchain())

/** Durée en minutes : celle mesurée si OSRM a répondu, sinon l'envie du groupe. */
const dureeMinutes = computed(() => {
  if (props.decision.durationSeconds !== null) {
    // La marche seule ne fait pas une visite : compter du temps sur place,
    // sinon l'agenda affiche une sortie deux fois trop courte.
    const marche = Math.round(props.decision.durationSeconds / 60)
    return marche + props.decision.poiSlugs.length * 15
  }
  return props.decision.targetDurationMinutes ?? 150
})

const etapes = computed(() =>
  props.decision.poiSlugs
    .map(slug => props.pois.find(p => p.slug === slug)?.title ?? slug))

const dureeLisible = computed(() => {
  const h = Math.floor(dureeMinutes.value / 60)
  const m = dureeMinutes.value % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
})

async function ajouter() {
  confirmation.value = null
  const resultat = await ajouterAuCalendrier({
    titre: `${props.nomDuGroupe} — ${props.ville}`,
    debut: new Date(debut.value),
    finOuDuree: dureeMinutes.value,
    lieu: etapes.value[0],
    description: [
      `Parcours de ${etapes.value.length} lieux a ${props.ville}.`,
      '',
      ...etapes.value.map((nom, i) => `${i + 1}. ${nom}`),
    ].join('\n'),
    // Stable et derive du groupe : rejouer l'ajout met a jour l'evenement
    // existant au lieu d'en creer un second.
    uid: `arpente-${props.decision.groupId}@heianenterprise.com`,
  })

  if (resultat === 'natif') confirmation.value = 'Ouvert dans votre agenda.'
  else if (resultat === 'fichier') confirmation.value = 'Fichier .ics telecharge : ouvrez-le pour l\'ajouter.'
}
</script>

<template>
  <div class="agenda">
    <label class="agenda-champ">
      <span class="agenda-libelle">Date et heure de depart</span>
      <input v-model="debut" type="datetime-local">
    </label>

    <p class="agenda-duree">
      Duree prevue : <strong>{{ dureeLisible }}</strong>
      <em v-if="decision.durationSeconds !== null">marche + 15 min par lieu</em>
    </p>

    <button class="agenda-bouton" type="button" :disabled="isAjoutEnCours" @click="ajouter">
      {{ isAjoutEnCours ? 'Ouverture...' : 'Ajouter a mon agenda' }}
    </button>

    <p v-if="erreur" class="agenda-erreur">{{ erreur }}</p>
    <p v-else-if="confirmation" class="agenda-confirmation">{{ confirmation }}</p>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.agenda {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  margin-top: $spacing-md;
  padding: $spacing-md;
  background: $color-surface-elevated;
  border-radius: $radius-sm;
}

.agenda-champ {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

.agenda-libelle {
  font-size: $font-size-sm;
  color: $color-text-muted;
}

input[type='datetime-local'] {
  padding: $spacing-sm;
  background: $color-surface;
  border: 1px solid $color-accent;
  border-radius: $radius-sm;
  color: $color-text;
  font-size: $font-size-md;
  font-family: inherit;
}

.agenda-duree {
  font-size: $font-size-sm;
  color: $color-text-muted;
  margin: 0;

  strong {
    color: $color-text;
  }

  em {
    display: block;
    font-size: $font-size-xs;
    font-style: normal;
  }
}

.agenda-bouton {
  padding: $spacing-md;
  background: $color-accent;
  border: none;
  border-radius: $radius-sm;
  color: $color-text;
  font-size: $font-size-md;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.agenda-erreur {
  font-size: $font-size-sm;
  color: $color-highlight;
  margin: 0;
}

.agenda-confirmation {
  font-size: $font-size-sm;
  color: $color-success;
  margin: 0;
}
</style>
