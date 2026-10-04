<script setup lang="ts">
/**
 * Le compte : adresse, pseudo, déconnexion, accès accordés à un assistant
 * IA (avec révocation) et suppression du compte.
 *
 * Sous /groups : rendu client seulement (routeRules), comme le reste de la
 * couche en ligne, et l'onglet Groupes reste actif.
 */
import { useAuthStore } from '~/stores/auth'
import { useGroupStore } from '~/stores/group'
import { LIENS_LEGAUX, origineApi } from '~/utils/liensLegaux'

const authStore = useAuthStore()
const groupStore = useGroupStore()
const config = useRuntimeConfig()
const { acces, charge, charger, revoquer } = useAccesAssistant()

const adresseAssistant = `${origineApi(String(config.public.supabaseUrl))}/mcp`
const erreurSession = ref<string | null>(null)
const erreurAcces = ref<string | null>(null)
const annonce = ref('')
const confirmeSuppression = ref(false)
const isSuppression = ref(false)
const erreurSuppression = ref<string | null>(null)
const compteSupprime = ref(false)

const dateCourte = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'jamais'

async function chargerAcces() {
  erreurAcces.value = null
  try {
    await charger()
  }
  catch {
    erreurAcces.value = 'Impossible de charger les accès accordés.'
  }
}

onMounted(async () => {
  try {
    if (!authStore.isReady) await authStore.ensureSession()
    if (authStore.estConnecte) await chargerAcces()
  }
  catch {
    erreurSession.value = 'Connexion impossible. Vérifie ta connexion internet.'
  }
})

async function copier() {
  try {
    await navigator.clipboard.writeText(adresseAssistant)
    annonce.value = 'Adresse copiée.'
  }
  catch {
    annonce.value = 'La copie n\'a pas marché : sélectionne l\'adresse à la main.'
  }
}

async function retirer(id: string, assistant: string) {
  erreurAcces.value = null
  try {
    await revoquer(id)
    annonce.value = `L'accès de ${assistant} est retiré.`
  }
  catch {
    erreurAcces.value = 'La révocation n\'a pas abouti. Réessaie.'
  }
}

async function seDeconnecter() {
  await authStore.deconnexion()
  groupStore.oublier()
  await navigateTo('/groups')
}

async function supprimerLeCompte() {
  isSuppression.value = true
  erreurSuppression.value = null
  try {
    await authStore.deleteMyData()
    groupStore.oublier()
    compteSupprime.value = true
  }
  catch {
    erreurSuppression.value = 'La suppression n\'a pas abouti. Vérifie ta connexion, puis réessaie.'
  }
  finally {
    isSuppression.value = false
  }
}
</script>

<template>
  <div class="page-compte safe-top">
    <NuxtLink to="/groups" class="retour">← Groupes</NuxtLink>
    <h1>Mon compte</h1>

    <p v-if="compteSupprime" class="compte-info" role="status">
      Ton compte est supprimé, avec ton pseudo, tes adhésions, tes votes et les accès accordés à un assistant.
    </p>
    <p v-else-if="erreurSession" class="compte-erreur">{{ erreurSession }}</p>
    <p v-else-if="!authStore.isReady" class="compte-info">Connexion…</p>
    <ConnexionPanel v-else-if="!authStore.estConnecte" @connecte="chargerAcces" />

    <template v-else>
      <section class="compte-section" aria-labelledby="titre-compte">
        <h2 id="titre-compte">Ton compte</h2>
        <p>Adresse : <strong>{{ authStore.email }}</strong></p>
        <p>Pseudo : <strong>{{ authStore.handle ?? 'pas encore choisi' }}</strong></p>
        <button type="button" class="bouton" @click="seDeconnecter">Se déconnecter de ce téléphone</button>
      </section>

      <section class="compte-section" aria-labelledby="titre-assistant">
        <h2 id="titre-assistant">Assistant IA</h2>
        <p>
          Un assistant IA (Claude, ChatGPT…) peut t'aider à préparer une visite : lire les lieux, tes groupes,
          voter et régler tes envies en ton nom, arrêter le parcours d'un groupe après ton accord.
          Il ne voit jamais ton adresse e-mail.
        </p>
        <p>Adresse à donner à l'assistant :</p>
        <p class="adresse"><code>{{ adresseAssistant }}</code></p>
        <button type="button" class="bouton" @click="copier">Copier l'adresse</button>
        <ul class="gestes">
          <li><strong>claude.ai</strong> (web, Claude Desktop, mobile) : Personnaliser › Connecteurs › + › Ajouter un connecteur personnalisé, puis colle l'adresse.</li>
          <li><strong>ChatGPT</strong> : Réglages › Sécurité et connexion › Mode développeur, puis Plugins › +.</li>
          <li><strong>Claude Code</strong> : <code>claude mcp add --transport http arpente {{ adresseAssistant }}</code>, puis <code>/mcp</code> › Authenticate.</li>
        </ul>
        <p>
          L'assistant ouvre une page Arpente où tu te connectes et l'autorises.
          <a :href="LIENS_LEGAUX.assistant" target="_blank" rel="noopener">Tout savoir sur l'assistant</a>
        </p>

        <h3>Accès accordés</h3>
        <p v-if="erreurAcces" class="compte-erreur" role="alert">{{ erreurAcces }}</p>
        <p v-else-if="!charge" class="compte-info">Chargement…</p>
        <p v-else-if="acces.length === 0" class="compte-info">Aucun assistant n'a accès à ton compte.</p>
        <ul v-else class="acces">
          <li v-for="a in acces" :key="a.id" class="acces-ligne">
            <p>
              <strong>{{ a.assistant }}</strong>
              <span v-if="a.nomClient && a.nomClient !== a.assistant"> (se présente comme « {{ a.nomClient }} »)</span>
            </p>
            <p class="compte-info">
              Accordé le {{ dateCourte(a.accordeLe) }} · dernier usage : {{ dateCourte(a.utiliseLe) }} ·
              expire le {{ dateCourte(a.expireLe) }}
            </p>
            <button type="button" class="bouton danger" @click="retirer(a.id, a.assistant)">
              Révoquer l'accès de {{ a.assistant }}
            </button>
          </li>
        </ul>
      </section>

      <section class="compte-section" aria-labelledby="titre-donnees">
        <h2 id="titre-donnees">Tes données</h2>
        <p>
          Ton adresse, ton pseudo, tes groupes et tes votes sont gardés sur notre serveur, en Allemagne.
          Un groupe inactif depuis 6 mois est effacé, un compte sans groupe ni activité depuis un an aussi.
          <a :href="LIENS_LEGAUX.confidentialite" target="_blank" rel="noopener">Politique de confidentialité</a>
        </p>
        <p v-if="erreurSuppression" class="compte-erreur" role="alert">{{ erreurSuppression }}</p>
        <button v-if="!confirmeSuppression" type="button" class="bouton danger" @click="confirmeSuppression = true">
          Supprimer mon compte
        </button>
        <template v-else>
          <p>
            Ton compte, ton pseudo, tes adhésions, tes votes et les accès d'assistant seront effacés définitivement.
            Les groupes que tu as créés restent aux autres membres.
          </p>
          <button type="button" class="bouton danger" :disabled="isSuppression" @click="supprimerLeCompte">
            {{ isSuppression ? 'Suppression…' : 'Confirmer la suppression' }}
          </button>
          <button type="button" class="bouton" :disabled="isSuppression" @click="confirmeSuppression = false">
            Annuler
          </button>
        </template>
      </section>
    </template>

    <p class="sr-only" aria-live="polite">{{ annonce }}</p>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.page-compte {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-lg;
  padding-bottom: calc(60px + #{$spacing-lg});

  h1 {
    font-size: $font-size-2xl;
    font-weight: 700;
    margin-bottom: $spacing-lg;
  }
}

.retour {
  display: inline-block;
  font-size: $font-size-sm;
  color: $color-text-muted;
  margin-bottom: $spacing-md;
}

.compte-section {
  margin-bottom: $spacing-xl;
  padding-top: $spacing-lg;
  border-top: 1px solid $color-surface-elevated;
  font-size: $font-size-sm;

  h2 {
    font-size: $font-size-lg;
    font-weight: 600;
    margin-bottom: $spacing-sm;
  }

  h3 {
    font-size: $font-size-md;
    font-weight: 600;
    margin: $spacing-lg 0 $spacing-sm;
  }

  p { margin-bottom: $spacing-sm; }
  a { color: $color-text; }
}

.compte-info { color: $color-text-muted; }
.compte-erreur { color: $color-highlight-texte; }

.adresse code {
  display: block;
  padding: $spacing-sm;
  background: $color-surface-elevated;
  border-radius: $radius-sm;
  word-break: break-all;
}

.gestes {
  margin: $spacing-md 0;
  padding-left: $spacing-lg;

  li { margin-bottom: $spacing-xs; }
  code { word-break: break-all; }
}

.acces {
  list-style: none;
  padding: 0;
}

.acces-ligne {
  padding: $spacing-sm 0;
  border-bottom: 1px solid $color-surface-elevated;
}

.bouton {
  width: 100%;
  margin-bottom: $spacing-sm;
  padding: $spacing-md;
  border-radius: $radius-md;
  background: $color-surface-elevated;
  color: $color-text;
  font-weight: 700;
  font-size: $font-size-sm;

  &.danger {
    background: transparent;
    border: 1px solid $color-highlight-texte;
    color: $color-highlight-texte;
  }

  &:disabled { opacity: 0.6; }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
