<script setup lang="ts">
/**
 * Jumelage et code du groupe, sur la page d'un groupe : « Ce groupe existe aussi
 * dans Agora — Rejoindre » pour tous les membres ; pour le créateur, jumeler,
 * défaire, et changer le code du groupe.
 *
 * Choix non évidents :
 * - toute ouverture d'Agora est un simple lien (<a target="_blank">) : Capacitor
 *   confie l'adresse au système, qui ouvre Agora par son App Link (ou le
 *   navigateur). Le lien suit le geste de la personne, rien ne s'ouvre après un
 *   await ;
 * - le jeton de la demande est tiré à l'affichage et retenu au clic : la réponse
 *   d'Agora ne sera acceptée que s'il revient (stores/jumelage) ;
 * - changer le code change l'adresse de la page : on y navigue aussitôt. C'est
 *   aussi le seul moyen de couper l'accès donné à Agora (défaire ne retire que
 *   le bouton d'ici) ; la confirmation le dit.
 *
 * Invariant : les adresses d'Agora viennent de utils/jumelage.ts, jamais d'un
 * texte stocké.
 */
import type { Group } from '~/types'
import { useGroupStore } from '~/stores/group'
import { useJumelageStore } from '~/stores/jumelage'
import { lienDemande, lienRejoindre, nomApp, nouvelEtat } from '~/utils/jumelage'

const props = defineProps<{
  group: Group
  estCreateur: boolean
}>()

const groupStore = useGroupStore()
const jumelageStore = useJumelageStore()

const APP = 'agora' as const
const nom = nomApp(APP)
const jumeau = computed(() => groupStore.twins.find(t => t.app === APP) ?? null)

const etatDemande = nouvelEtat()
const adresseDemande = computed(() =>
  lienDemande(APP, { code: props.group.code, nom: props.group.name, etat: etatDemande }))

function retenirDemande() {
  jumelageStore.retenir(etatDemande, {
    app: APP,
    groupId: props.group.id,
    code: props.group.code,
    envoyeeLe: Date.now(),
  })
}

const confirme = ref<'defaire' | 'code' | null>(null)
const enCours = ref(false)
const erreur = ref<string | null>(null)

async function defaire() {
  enCours.value = true
  erreur.value = null
  try {
    await groupStore.removeTwin(props.group.id, APP)
    confirme.value = null
  }
  catch {
    erreur.value = 'Le jumelage n\'a pas pu être défait. Réessaie.'
  }
  finally {
    enCours.value = false
  }
}

async function changerLeCode() {
  enCours.value = true
  erreur.value = null
  try {
    const code = await groupStore.regenerateCode(props.group.id)
    confirme.value = null
    // La page du groupe lit son code dans l'adresse : y aller la remonte (clé de
    // page par défaut, qui inclut le paramètre) et la recharge avec le nouveau.
    await navigateTo(`/groups/${code}`, { replace: true })
  }
  catch {
    erreur.value = 'Le code n\'a pas pu être changé. Réessaie.'
  }
  finally {
    enCours.value = false
  }
}
</script>

<template>
  <section v-if="jumeau || estCreateur" class="jumelage">
    <h2>Jumelage</h2>

    <template v-if="jumeau">
      <p class="aide">Ce groupe existe aussi dans {{ nom }}, l'app d'agendas partagés.</p>
      <a :href="lienRejoindre(APP, jumeau.remoteCode)" target="_blank" rel="noopener" class="bouton-lien">
        Rejoindre aussi dans {{ nom }}
      </a>
    </template>

    <template v-if="estCreateur">
      <template v-if="!jumeau">
        <p class="aide">
          Un jumeau est un groupe {{ nom }} : ses membres y verront « Rejoindre aussi dans Arpente »,
          et ceux d'ici « Rejoindre aussi dans {{ nom }} ». Chacun rejoint lui-même : personne n'est
          ajouté d'office.
        </p>
        <a :href="adresseDemande" target="_blank" rel="noopener" class="bouton-lien" @click="retenirDemande">
          Jumeler avec {{ nom }}
        </a>
      </template>

      <p v-if="erreur" class="erreur">{{ erreur }}</p>

      <template v-if="confirme === 'defaire'">
        <p class="aide">
          Le bouton disparaîtra d'ici. Dans {{ nom }}, le jumeau restera jusqu'à ce qu'on l'y retire, et son
          code ouvrira toujours ce groupe : change aussi le code pour couper cet accès.
        </p>
        <button class="bouton-danger" type="button" :disabled="enCours" @click="defaire">
          {{ enCours ? 'En cours...' : 'Confirmer' }}
        </button>
        <button class="bouton-secondaire" type="button" :disabled="enCours" @click="confirme = null">Annuler</button>
      </template>
      <template v-else-if="confirme === 'code'">
        <p class="aide">
          L'ancien code n'ouvrira plus le groupe — y compris celui donné à {{ nom }}. Les membres restent.
        </p>
        <button class="bouton-danger" type="button" :disabled="enCours" @click="changerLeCode">
          {{ enCours ? 'En cours...' : 'Confirmer' }}
        </button>
        <button class="bouton-secondaire" type="button" :disabled="enCours" @click="confirme = null">Annuler</button>
      </template>
      <template v-else>
        <button v-if="jumeau" class="bouton-secondaire" type="button" @click="confirme = 'defaire'">
          Défaire le jumelage
        </button>
        <button class="bouton-secondaire" type="button" @click="confirme = 'code'">
          Changer le code du groupe
        </button>
      </template>
    </template>
  </section>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.jumelage {
  margin-bottom: $spacing-xl;

  h2 {
    font-size: $font-size-lg;
    font-weight: 600;
    margin-bottom: $spacing-md;
  }
}

.aide {
  font-size: $font-size-sm;
  color: $color-text-muted;
  margin-bottom: $spacing-md;
}

.erreur {
  font-size: $font-size-sm;
  color: $color-highlight;
  margin-bottom: $spacing-sm;
}

.bouton-lien {
  display: block;
  text-align: center;
  text-decoration: none;
  margin-bottom: $spacing-md;
  padding: $spacing-md;
  background: $color-accent;
  border-radius: $radius-sm;
  color: $color-text;
  font-size: $font-size-md;
  font-weight: 600;
}

.bouton-secondaire,
.bouton-danger {
  width: 100%;
  padding: $spacing-sm;
  margin-bottom: $spacing-sm;
  background: transparent;
  border-radius: $radius-sm;
  font-size: $font-size-sm;
  cursor: pointer;
}

.bouton-secondaire {
  border: 1px solid $color-text-muted;
  color: $color-text;
}

.bouton-danger {
  border: 1px solid $color-highlight;
  color: $color-highlight;
  font-weight: 700;
}
</style>
