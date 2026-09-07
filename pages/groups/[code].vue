<script setup lang="ts">
import type { Poi } from '~/types'
import { useAuthStore } from '~/stores/auth'
import { useGroupStore } from '~/stores/group'
import { useVoteStore } from '~/stores/vote'

const route = useRoute()
const code = (route.params.code as string).toUpperCase()

const authStore = useAuthStore()
const groupStore = useGroupStore()
const voteStore = useVoteStore()

const loadError = ref<string | null>(null)
const isLoading = ref(true)

// Le contenu est embarque dans le build : les POI sont disponibles hors ligne,
// meme si le vote, lui, exige le reseau.
const { data: poisRaw } = await useAsyncData('pois-vote', () => queryCollection('pois').all())

// Un groupe porte une ville, et c'est elle qui commande — pas la ville active du
// selecteur. On ne vote pas sur les lieux de Caen dans un groupe forme a Troyes.
const poisDuGroupe = computed<Poi[]>(() => {
  const ville = groupStore.currentGroup?.city
  if (!ville) return []
  return (poisRaw.value || [])
    .filter((doc: any) => doc.meta?.city === ville)
    .map((doc: any) => ({
      title: doc.title || doc.meta?.title,
      slug: slugFromStem(doc.stem),
      city: doc.meta?.city,
      category: doc.meta?.category,
      lat: doc.meta?.lat,
      lng: doc.meta?.lng,
      epoch: doc.meta?.epoch,
      tags: doc.meta?.tags || [],
      proximityRadius: doc.meta?.proximityRadius ?? 50,
    }))
})

onMounted(async () => {
  try {
    if (!authStore.isReady) await authStore.ensureSession()
    if (!authStore.hasHandle) {
      loadError.value = 'Choisis dabord un pseudo depuis l\'onglet Groupes.'
      return
    }
    await groupStore.loadGroupByCode(code)

    const groupe = groupStore.currentGroup
    if (groupe) {
      await voteStore.load(groupe.id)
      voteStore.subscribe(groupe.id)
    }
  } catch {
    loadError.value = 'Groupe introuvable ou inaccessible.'
  } finally {
    isLoading.value = false
  }
})

// Sans cela, quitter la page laisse le canal ouvert : les evenements continuent
// d'arriver et s'accumulent au groupe suivant.
onBeforeUnmount(() => {
  voteStore.reset()
})

async function rafraichir() {
  const groupe = groupStore.currentGroup
  if (!groupe) return
  await Promise.all([voteStore.load(groupe.id), groupStore.loadMembers()])
}
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

      <section class="group-section">
        <h2>Vos envies</h2>
        <PreferenceForm
          :group-id="groupStore.currentGroup.id"
          :user-id="authStore.userId!"
        />
      </section>

      <section class="group-section">
        <div class="section-entete">
          <h2>Lieux proposes</h2>
          <span class="etat-direct" :class="{ 'is-live': voteStore.isLive }">
            {{ voteStore.isLive ? 'en direct' : 'hors ligne' }}
          </span>
        </div>

        <p class="section-aide">
          Cochez tout ce qui vous tente. Les choix des autres apparaissent au fur
          et a mesure ; le parcours sera decide a partir des lieux les plus soutenus.
        </p>

        <button v-if="!voteStore.isLive" class="bouton-rafraichir" type="button" @click="rafraichir">
          Rafraichir les votes
        </button>

        <PoiVoteList
          :pois="poisDuGroupe"
          :group-id="groupStore.currentGroup.id"
          :user-id="authStore.userId!"
          :member-count="groupStore.members.length"
        />
      </section>
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

.section-entete {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: $spacing-sm;
  margin-bottom: $spacing-md;

  h2 {
    margin-bottom: 0;
  }
}

.etat-direct {
  font-size: $font-size-xs;
  color: $color-text-muted;
  padding: 2px $spacing-sm;
  border-radius: $radius-sm;
  border: 1px solid currentcolor;

  &.is-live {
    color: $color-success;
  }
}

.section-aide {
  font-size: $font-size-sm;
  color: $color-text-muted;
  margin-bottom: $spacing-md;
}

.bouton-rafraichir {
  width: 100%;
  padding: $spacing-sm;
  margin-bottom: $spacing-md;
  background: transparent;
  border: 1px solid $color-text-muted;
  border-radius: $radius-sm;
  color: $color-text;
  font-size: $font-size-sm;
  cursor: pointer;
}
</style>
