<script setup lang="ts">
/**
 * Jumelage et code du groupe, sur la page d'un groupe : « Ce groupe existe aussi
 * dans Agora — Rejoindre » (ou « dans DewDrop — Demander à rejoindre ») pour
 * tous les membres ; pour le créateur, jumeler avec chaque app, défaire, et
 * changer le code du groupe.
 *
 * Choix non évidents :
 * - un jumeau au plus par app (la clé de group_twins le garantit) : chaque app
 *   sans jumeau a son bouton « Jumeler avec … », chaque jumeau le sien ;
 * - toute ouverture d'une autre app est un simple lien (<a target="_blank">) :
 *   Capacitor confie l'adresse au système, qui ouvre l'app par son App Link (ou
 *   le navigateur). Le lien suit le geste de la personne, rien ne s'ouvre après
 *   un await ;
 * - un jeton de demande par app, tiré à l'affichage et retenu au clic : la
 *   réponse de l'autre app ne sera acceptée que s'il revient (stores/jumelage) ;
 * - entrer dans un cercle DewDrop est une demande que son créateur accepte :
 *   le bouton le dit (« Demander à rejoindre »), pour ne rien promettre ;
 * - changer le code change l'adresse de la page : on y navigue aussitôt. C'est
 *   aussi le seul moyen de couper l'accès donné à une app jumelle (défaire ne
 *   retire que le bouton d'ici) — et, le code étant unique, il change pour
 *   TOUS les jumeaux : la confirmation nomme ceux qu'il faudra rejumeler.
 *
 * Invariant : les adresses des autres apps viennent de utils/jumelage.ts,
 * jamais d'un texte stocké.
 */
import type { Group, GroupTwin } from '~/types'
import { useGroupStore } from '~/stores/group'
import { useJumelageStore } from '~/stores/jumelage'
import {
  APPS_JUMELLES,
  adhesionSurDemande,
  libelleRejoindre,
  lienDemande,
  lienRejoindre,
  nomApp,
  nouvelEtat,
  type AppJumelle,
} from '~/utils/jumelage'

const props = defineProps<{
  group: Group
  estCreateur: boolean
}>()

/** Ce qu'est l'app jumelle, en quelques mots. */
const ROLE: Record<AppJumelle, string> = {
  agora: 'l\'app d\'agendas partagés',
  dewdrop: 'l\'app où l\'on s\'envoie des pensées',
}

const groupStore = useGroupStore()
const jumelageStore = useJumelageStore()

const jumeaux = computed<GroupTwin[]>(() =>
  APPS_JUMELLES.flatMap(app => groupStore.twins.filter(t => t.app === app)))
const appsSansJumeau = computed<AppJumelle[]>(() =>
  APPS_JUMELLES.filter(app => !groupStore.twins.some(t => t.app === app)))

/** « Agora », « Agora et DewDrop » : les apps jumelées, pour une phrase. */
function enumeration(apps: AppJumelle[]): string {
  const noms = apps.map(nomApp)
  return noms.length <= 1 ? (noms[0] ?? '') : `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}`
}

const etatsDemande = Object.fromEntries(
  APPS_JUMELLES.map(app => [app, nouvelEtat()])) as Record<AppJumelle, string>

function adresseDemande(app: AppJumelle): string {
  return lienDemande(app, { code: props.group.code, nom: props.group.name, etat: etatsDemande[app] })
}

function retenirDemande(app: AppJumelle) {
  jumelageStore.retenir(etatsDemande[app], {
    app,
    groupId: props.group.id,
    code: props.group.code,
    envoyeeLe: Date.now(),
  })
}

type Confirmation = { action: 'defaire', app: AppJumelle } | { action: 'code' }
const confirme = ref<Confirmation | null>(null)
const enCours = ref(false)
const erreur = ref<string | null>(null)

/** Les autres apps jumelées que `app` : changer le code les coupe aussi. */
function autresJumeaux(app: AppJumelle): AppJumelle[] {
  return jumeaux.value.map(j => j.app).filter(a => a !== app)
}

const avertissementCode = computed(() => {
  const apps = jumeaux.value.map(j => j.app)
  if (apps.length === 0) return 'L\'ancien code n\'ouvrira plus le groupe. Les membres restent.'
  const pluriel = apps.length > 1
  return `L'ancien code n'ouvrira plus le groupe — y compris celui donné à ${enumeration(apps)}. `
    + `Pour que ${pluriel ? 'leurs' : 'ses'} membres puissent encore rejoindre d'ici, défais `
    + `${pluriel ? 'ces jumelages' : 'ce jumelage'} des deux côtés, puis refais-${pluriel ? 'les' : 'le'}. `
    + 'Les membres d\'ici restent.'
})

async function defaire(app: AppJumelle) {
  enCours.value = true
  erreur.value = null
  try {
    await groupStore.removeTwin(props.group.id, app)
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
  <section v-if="jumeaux.length > 0 || estCreateur" class="jumelage">
    <h2>Jumelage</h2>

    <template v-for="jumeau in jumeaux" :key="jumeau.app">
      <p class="aide">
        Ce groupe existe aussi dans {{ nomApp(jumeau.app) }}, {{ ROLE[jumeau.app] }}.
        <template v-if="adhesionSurDemande(jumeau.app)">
          Son créateur y accepte chaque demande.
        </template>
      </p>
      <a :href="lienRejoindre(jumeau.app, jumeau.remoteCode)" target="_blank" rel="noopener" class="bouton-lien">
        {{ libelleRejoindre(jumeau.app) }}
      </a>
    </template>

    <template v-if="estCreateur">
      <template v-if="appsSansJumeau.length > 0">
        <p class="aide">
          Un jumeau est un groupe d'une autre app : ses membres y verront « Rejoindre aussi dans
          Arpente ». Chacun rejoint lui-même : personne n'est ajouté d'office.
          <template v-if="appsSansJumeau.includes('dewdrop')">
            Dans DewDrop, c'est le créateur du cercle qui accepte chaque demande.
          </template>
        </p>
        <a
          v-for="app in appsSansJumeau"
          :key="app"
          :href="adresseDemande(app)"
          target="_blank"
          rel="noopener"
          class="bouton-lien"
          @click="retenirDemande(app)"
        >
          Jumeler avec {{ nomApp(app) }}
        </a>
      </template>

      <p v-if="erreur" class="erreur">{{ erreur }}</p>

      <template v-if="confirme?.action === 'defaire'">
        <p class="aide">
          Le bouton « {{ libelleRejoindre(confirme.app) }} » disparaîtra d'ici. Dans {{ nomApp(confirme.app) }}, le jumeau
          restera jusqu'à ce qu'on l'y retire, et son code ouvrira toujours ce groupe : change aussi le code
          pour couper cet accès<template v-if="autresJumeaux(confirme.app).length > 0"> — il changera aussi
          pour {{ enumeration(autresJumeaux(confirme.app)) }}, à rejumeler</template>.
        </p>
        <button class="bouton-danger" type="button" :disabled="enCours" @click="defaire(confirme.app)">
          {{ enCours ? 'En cours...' : 'Confirmer' }}
        </button>
        <button class="bouton-secondaire" type="button" :disabled="enCours" @click="confirme = null">Annuler</button>
      </template>
      <template v-else-if="confirme?.action === 'code'">
        <p class="aide">{{ avertissementCode }}</p>
        <button class="bouton-danger" type="button" :disabled="enCours" @click="changerLeCode">
          {{ enCours ? 'En cours...' : 'Confirmer' }}
        </button>
        <button class="bouton-secondaire" type="button" :disabled="enCours" @click="confirme = null">Annuler</button>
      </template>
      <template v-else>
        <button
          v-for="jumeau in jumeaux"
          :key="jumeau.app"
          class="bouton-secondaire"
          type="button"
          @click="confirme = { action: 'defaire', app: jumeau.app }"
        >
          Défaire le jumelage avec {{ nomApp(jumeau.app) }}
        </button>
        <button class="bouton-secondaire" type="button" @click="confirme = { action: 'code' }">
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
