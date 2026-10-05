<script setup lang="ts">
/**
 * Écran d'un lien de jumelage venu d'Agora (`jumeler.html#…`, traduit par
 * plugins/liensEntrants.client.ts) : une DEMANDE (choisir le groupe Arpente à
 * jumeler, ou en créer un) ou une RÉPONSE (relier le groupe dont le jumelage a
 * été lancé d'ici). Protocole : utils/jumelage.ts.
 *
 * Choix non évidents :
 * - le lien est validé avant tout affichage : mal formé, il n'ouvre qu'un
 *   message, jamais un bouton ;
 * - seuls les groupes que l'on a créés sont proposés (la RLS ne laisse jumeler
 *   que le créateur) ; un nouveau groupe, nommé comme le jumeau, est présélectionné ;
 * - une réponse n'est montrée que si elle répond à une demande partie de cet
 *   appareil (stores/jumelage) ;
 * - après une demande acceptée, l'ouverture d'Agora est un lien que la personne
 *   touche : Capacitor confie l'adresse au système, rien ne s'ouvre après un await ;
 * - un groupe créé ici puis un échec du jumelage : réessayer reprend ce groupe,
 *   au lieu d'en créer un second.
 */
import type { City, Group } from '~/types'
import { useAuthStore } from '~/stores/auth'
import { useCityStore } from '~/stores/city'
import { useGroupStore } from '~/stores/group'
import { useJumelageStore } from '~/stores/jumelage'
import {
  lienReponse,
  lireLienJumelage,
  nomApp,
  type DemandeJumelage,
  type ReponseJumelage,
} from '~/utils/jumelage'

// Un second lien reçu pendant que l'écran est ouvert le remplace entièrement.
definePageMeta({ key: route => route.fullPath })

const NOUVEAU = 'nouveau'
/** Longueur d'un nom de groupe, comme à la création (CreateGroupModal). */
const NOM_MIN = 2
const NOM_MAX = 40

const route = useRoute()
const authStore = useAuthStore()
const cityStore = useCityStore()
const groupStore = useGroupStore()
const jumelageStore = useJumelageStore()

const lien = lireLienJumelage(route.query)
const nom = lien ? nomApp(lien.app) : ''

const chargement = ref(true)
const besoinConnexion = ref(false)
const erreur = ref<string | null>(null)
const enCours = ref(false)

const cible = ref<string>(NOUVEAU)
const nouveauNom = ref(
  lien?.type === 'demande' ? Array.from(lien.nom ?? '').slice(0, NOM_MAX).join('').trim() : '')
const ville = ref<City>(cityStore.currentCity)
const groupeCree = ref<Group | null>(null)

/** Demande acceptée : l'adresse de la réponse à ouvrir, et le groupe jumelé. */
const termine = ref<{ retour: string, code: string } | null>(null)

const mesGroupesCrees = computed(() =>
  groupStore.myGroups.filter(g => g.createdBy === authStore.userId))

const demandeRepondue = lien?.type === 'reponse' ? jumelageStore.trouver(lien) : null
const groupeRepondu = computed(() =>
  groupStore.myGroups.find(g => g.id === demandeRepondue?.groupId) ?? null)

async function charger() {
  chargement.value = true
  erreur.value = null
  try {
    if (!authStore.isReady) await authStore.ensureSession()
    besoinConnexion.value = !authStore.estConnecte
    if (besoinConnexion.value || !authStore.hasHandle) return
    await groupStore.loadMyGroups()
  }
  catch {
    erreur.value = 'Connexion impossible. Vérifie ta connexion internet.'
  }
  finally {
    chargement.value = false
  }
}

onMounted(charger)

function messageErreur(e: unknown): string {
  return e instanceof Error && e.message === 'twin_exists'
    ? `Ce groupe est déjà jumelé avec un groupe ${nom}. Défais d'abord ce jumelage depuis la page du groupe.`
    : 'Le jumelage n\'a pas abouti. Réessaie.'
}

async function groupeChoisi(): Promise<Group | null> {
  if (groupeCree.value) return groupeCree.value
  if (cible.value !== NOUVEAU) return mesGroupesCrees.value.find(g => g.id === cible.value) ?? null
  groupeCree.value = await groupStore.createGroup(nouveauNom.value.trim(), ville.value)
  return groupeCree.value
}

async function accepter(demande: DemandeJumelage) {
  const longueur = Array.from(nouveauNom.value.trim()).length
  if (!groupeCree.value && cible.value === NOUVEAU && (longueur < NOM_MIN || longueur > NOM_MAX)) {
    erreur.value = `Choisis un nom de ${NOM_MIN} à ${NOM_MAX} caractères.`
    return
  }
  enCours.value = true
  erreur.value = null
  try {
    const groupe = await groupeChoisi()
    if (!groupe) throw new Error('group_not_found')
    await groupStore.addTwin(groupe.id, demande.app, demande.code)
    termine.value = {
      code: groupe.code,
      retour: lienReponse(demande.app, { code: groupe.code, pour: demande.code, etat: demande.etat }),
    }
  }
  catch (e) {
    erreur.value = messageErreur(e)
  }
  finally {
    enCours.value = false
  }
}

async function relier(reponse: ReponseJumelage) {
  const groupe = groupeRepondu.value
  if (!groupe) return
  enCours.value = true
  erreur.value = null
  try {
    await groupStore.addTwin(groupe.id, reponse.app, reponse.code)
    jumelageStore.oublier(reponse.etat)
    await navigateTo(`/groups/${groupe.code}`)
  }
  catch (e) {
    erreur.value = messageErreur(e)
  }
  finally {
    enCours.value = false
  }
}
</script>

<template>
  <div class="page-jumeler safe-top">
    <NuxtLink to="/groups" class="back-link">← Groupes</NuxtLink>
    <h1>Jumelage</h1>

    <p v-if="!lien" class="message">Ce lien de jumelage n'est pas valable.</p>
    <p v-else-if="chargement" class="message">Connexion...</p>
    <ConnexionPanel v-else-if="besoinConnexion" @connecte="charger" />
    <HandlePrompt v-else-if="!authStore.hasHandle" @handle-set="charger" />

    <template v-else-if="lien.type === 'demande'">
      <template v-if="termine">
        <p class="message">
          Jumelage enregistré ici. Termine dans {{ nom }}, qui enregistrera le jumeau de son côté.
        </p>
        <a :href="termine.retour" target="_blank" rel="noopener" class="bouton-principal">Terminer dans {{ nom }}</a>
        <NuxtLink :to="`/groups/${termine.code}`" class="bouton-secondaire">Voir le groupe</NuxtLink>
      </template>

      <template v-else>
        <p class="titre">
          <template v-if="lien.nom">Le groupe {{ nom }} « {{ lien.nom }} » propose un jumelage.</template>
          <template v-else>Un groupe {{ nom }} propose un jumelage.</template>
        </p>
        <p class="aide">
          Ses membres verront « Rejoindre aussi dans Arpente », et ceux d'ici « Rejoindre aussi dans
          {{ nom }} ». Chacun rejoint lui-même : personne n'est ajouté d'office.
        </p>

        <fieldset class="choix" :disabled="!!groupeCree">
          <legend>Avec quel groupe Arpente ?</legend>
          <label class="option">
            <input v-model="cible" type="radio" :value="NOUVEAU" />
            Un nouveau groupe
          </label>
          <label v-for="groupe in mesGroupesCrees" :key="groupe.id" class="option">
            <input v-model="cible" type="radio" :value="groupe.id" />
            {{ groupe.name }}
          </label>
        </fieldset>

        <template v-if="cible === NOUVEAU && !groupeCree">
          <input v-model="nouveauNom" type="text" placeholder="Nom du groupe" :maxlength="NOM_MAX" class="champ" />
          <div class="villes">
            <button
              v-for="option in cityStore.cities"
              :key="option.slug"
              type="button"
              class="ville"
              :class="{ active: ville === option.slug }"
              @click="ville = option.slug"
            >
              {{ option.name }}
            </button>
          </div>
        </template>

        <p v-if="erreur" class="erreur">{{ erreur }}</p>
        <button class="bouton-principal" type="button" :disabled="enCours" @click="accepter(lien)">
          {{ enCours ? 'En cours...' : 'Jumeler' }}
        </button>
      </template>
    </template>

    <template v-else>
      <p v-if="!demandeRepondue || !groupeRepondu" class="message">
        Cette réponse ne correspond à aucun jumelage lancé depuis cet appareil. Relance le jumelage
        depuis la page du groupe.
      </p>
      <template v-else>
        <p class="titre">Relier « {{ groupeRepondu.name }} » au groupe {{ nom }} choisi ?</p>
        <p v-if="erreur" class="erreur">{{ erreur }}</p>
        <button class="bouton-principal" type="button" :disabled="enCours" @click="relier(lien)">
          {{ enCours ? 'En cours...' : 'Relier' }}
        </button>
      </template>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.page-jumeler {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-lg;
  padding-bottom: calc(60px + #{$spacing-lg});

  h1 {
    font-size: $font-size-xl;
    margin-bottom: $spacing-lg;
  }
}

.back-link {
  display: inline-block;
  font-size: $font-size-sm;
  color: $color-text-muted;
  margin-bottom: $spacing-md;
  text-decoration: none;
}

.titre {
  font-size: $font-size-lg;
  font-weight: 600;
  margin-bottom: $spacing-sm;
}

.message,
.aide {
  color: $color-text-muted;
  margin-bottom: $spacing-lg;
}

.choix {
  border: none;
  padding: 0;
  margin: 0 0 $spacing-md;

  legend {
    font-weight: 600;
    margin-bottom: $spacing-sm;
  }
}

.option {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-sm 0;
}

.champ {
  width: 100%;
  padding: $spacing-sm $spacing-md;
  margin-bottom: $spacing-sm;
  background: $color-surface-elevated;
  border: 1px solid $color-text-muted;
  border-radius: $radius-sm;
  color: $color-text;
  font-size: $font-size-md;
}

.villes {
  display: flex;
  gap: $spacing-sm;
  margin-bottom: $spacing-md;
}

.ville {
  flex: 1;
  padding: $spacing-sm;
  background: transparent;
  border: 1px solid $color-text-muted;
  border-radius: $radius-sm;
  color: $color-text;
  cursor: pointer;

  &.active {
    border-color: $color-accent;
    background: $color-accent;
  }
}

.erreur {
  font-size: $font-size-sm;
  color: $color-highlight;
  margin-bottom: $spacing-sm;
}

.bouton-principal,
.bouton-secondaire {
  display: block;
  width: 100%;
  text-align: center;
  text-decoration: none;
  margin-bottom: $spacing-sm;
  padding: $spacing-md;
  border-radius: $radius-sm;
  font-size: $font-size-md;
  cursor: pointer;
}

.bouton-principal {
  background: $color-accent;
  border: none;
  color: $color-text;
  font-weight: 600;

  &:disabled {
    background: $color-surface-elevated;
    color: $color-text-muted;
    cursor: not-allowed;
  }
}

.bouton-secondaire {
  background: transparent;
  border: 1px solid $color-text-muted;
  color: $color-text;
}
</style>
