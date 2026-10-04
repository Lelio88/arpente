<script setup lang="ts">
/**
 * Connexion au compte Arpente, préalable aux groupes : un code à 6 chiffres
 * reçu par e-mail, ou Google (dans l'app seulement).
 *
 * Choix non évidents :
 * - **Un seul chemin pour une adresse neuve ou connue** : demander un code
 *   crée le compte si besoin, et la réponse est la même dans les deux cas —
 *   l'écran ne dit jamais si une adresse a déjà un compte.
 * - **Le CAPTCHA précède chaque envoi** (quota d'e-mails partagé entre
 *   plusieurs apps) ; il est rechargé après chaque usage.
 * - **Renvoi après 60 s**, au rythme de GoTrue ; le compte à rebours est
 *   annoncé aux lecteurs d'écran par paliers, pas chaque seconde.
 */
import { useAuthStore } from '~/stores/auth'
import { messageConnexion } from '~/utils/messagesConnexion'

const emit = defineEmits<{ connecte: [] }>()

const authStore = useAuthStore()
const config = useRuntimeConfig()
const { disponible: googleDisponible, obtenirJeton } = useGoogleSignIn()
// Nuxt convertit « false » venu de l'environnement en booléen : comparer en texte.
const captchaActif = String(config.public.captcha) !== 'false'

const ATTENTE_RENVOI = 60

const etape = ref<'adresse' | 'code'>('adresse')
const adresse = ref('')
const code = ref('')
const jetonCaptcha = ref('')
const erreur = ref<string | null>(null)
const occupe = ref(false)
const reste = ref(0)
const annonce = ref('')
const captcha = ref<{ recommencer: () => void } | null>(null)
const champCode = ref<HTMLInputElement | null>(null)
let minuteur: ReturnType<typeof setInterval> | undefined

function demarrerRebours() {
  reste.value = ATTENTE_RENVOI
  clearInterval(minuteur)
  minuteur = setInterval(() => {
    reste.value--
    if (reste.value <= 0) {
      clearInterval(minuteur)
      annonce.value = 'Tu peux redemander un code.'
    }
    else if (reste.value % 20 === 0) {
      annonce.value = `Nouveau code possible dans ${reste.value} secondes.`
    }
  }, 1000)
}

onBeforeUnmount(() => clearInterval(minuteur))

async function envoyer() {
  erreur.value = null
  const saisie = adresse.value.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(saisie)) {
    erreur.value = 'Saisis une adresse e-mail valable.'
    return
  }
  if (captchaActif && !jetonCaptcha.value) {
    erreur.value = 'Termine d\'abord la vérification anti-robot.'
    return
  }
  occupe.value = true
  try {
    await authStore.envoyerCode(saisie, jetonCaptcha.value || undefined)
    etape.value = 'code'
    annonce.value = 'Si l\'adresse est bonne, un code vient d\'y être envoyé.'
    demarrerRebours()
    await nextTick()
    champCode.value?.focus()
  }
  catch (e) {
    erreur.value = messageConnexion(e)
  }
  finally {
    occupe.value = false
    captcha.value?.recommencer()
  }
}

async function valider() {
  erreur.value = null
  if (!/^\d{6}$/.test(code.value.trim())) {
    erreur.value = 'Le code compte 6 chiffres.'
    return
  }
  occupe.value = true
  try {
    await authStore.verifierCode(adresse.value.trim(), code.value.trim())
    emit('connecte')
  }
  catch (e) {
    erreur.value = messageConnexion(e)
    champCode.value?.focus()
  }
  finally {
    occupe.value = false
  }
}

async function avecGoogle() {
  erreur.value = null
  occupe.value = true
  try {
    const resultat = await obtenirJeton()
    if (!resultat) return
    await authStore.connexionGoogle(resultat.idToken, resultat.nonce)
    emit('connecte')
  }
  catch (e) {
    erreur.value = messageConnexion(e)
  }
  finally {
    occupe.value = false
  }
}

function changerAdresse() {
  etape.value = 'adresse'
  code.value = ''
  erreur.value = null
}
</script>

<template>
  <section class="connexion" aria-labelledby="titre-connexion">
    <h2 id="titre-connexion">Connecte-toi pour rejoindre des groupes</h2>
    <p class="connexion-aide">
      Les groupes demandent un compte : ils te suivent d'un appareil à l'autre, et tu peux, si tu le veux,
      les ouvrir à un assistant IA. Ton adresse n'est montrée à personne, pas même aux membres de tes groupes.
    </p>

    <form v-if="etape === 'adresse'" novalidate @submit.prevent="envoyer">
      <label for="connexion-adresse">Adresse e-mail</label>
      <input
        id="connexion-adresse"
        v-model="adresse"
        type="email"
        autocomplete="email"
        inputmode="email"
        class="connexion-champ"
        :aria-invalid="erreur ? 'true' : undefined"
        aria-describedby="connexion-erreur"
      >
      <CaptchaTurnstile v-if="captchaActif" ref="captcha" @jeton="jetonCaptcha = $event" />
      <button type="submit" class="connexion-bouton" :disabled="occupe">
        {{ occupe ? 'Envoi…' : 'Recevoir un code' }}
      </button>
    </form>

    <form v-else novalidate @submit.prevent="valider">
      <label for="connexion-code">Code à 6 chiffres envoyé à {{ adresse }}</label>
      <input
        id="connexion-code"
        ref="champCode"
        v-model="code"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
        class="connexion-champ connexion-champ-code"
        :aria-invalid="erreur ? 'true' : undefined"
        aria-describedby="connexion-erreur connexion-aide-code"
      >
      <p id="connexion-aide-code" class="connexion-aide">
        Valable 15 minutes. Pense à regarder dans les indésirables.
      </p>
      <button type="submit" class="connexion-bouton" :disabled="occupe">
        {{ occupe ? 'Vérification…' : 'Valider' }}
      </button>
      <button type="button" class="connexion-lien" :disabled="reste > 0" @click="changerAdresse">
        {{ reste > 0 ? `Redemander un code (${reste} s)` : 'Redemander un code ou changer d\'adresse' }}
      </button>
    </form>

    <p id="connexion-erreur" class="connexion-erreur" role="alert">{{ erreur }}</p>

    <template v-if="googleDisponible && etape === 'adresse'">
      <p class="connexion-ou" aria-hidden="true">ou</p>
      <button type="button" class="connexion-bouton secondaire" :disabled="occupe" @click="avecGoogle">
        Continuer avec Google
      </button>
    </template>

    <p class="sr-only" aria-live="polite">{{ annonce }}</p>
  </section>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.connexion {
  padding: $spacing-lg;
  background: $color-surface;
  border-radius: $radius-md;

  h2 {
    font-size: $font-size-xl;
    font-weight: 700;
    margin-bottom: $spacing-sm;
  }

  label {
    display: block;
    font-weight: 600;
    font-size: $font-size-sm;
    margin: $spacing-md 0 $spacing-xs;
  }
}

.connexion-aide {
  color: $color-text-muted;
  font-size: $font-size-sm;
  margin-top: $spacing-xs;
}

.connexion-champ {
  width: 100%;
  padding: $spacing-md;
  background: $color-surface-elevated;
  border-radius: $radius-md;
  color: $color-text;
  font-size: $font-size-md;

  &[aria-invalid='true'] {
    outline: 2px solid $color-highlight-texte;
  }
}

.connexion-champ-code {
  letter-spacing: 0.4em;
  text-align: center;
  font-size: $font-size-lg;
}

.connexion-bouton {
  width: 100%;
  margin-top: $spacing-md;
  padding: $spacing-md;
  border-radius: $radius-md;
  background: $color-highlight-fond;
  color: white;
  font-weight: 700;
  font-size: $font-size-md;

  &.secondaire {
    background: transparent;
    border: 1px solid $color-text-muted;
    color: $color-text;
  }

  &:disabled {
    opacity: 0.6;
  }
}

.connexion-lien {
  margin-top: $spacing-sm;
  background: none;
  color: $color-text;
  text-decoration: underline;
  font-size: $font-size-sm;

  &:disabled {
    color: $color-text-muted;
    text-decoration: none;
  }
}

.connexion-erreur {
  min-height: 1.2em;
  margin-top: $spacing-sm;
  color: $color-highlight-texte;
  font-size: $font-size-sm;
}

.connexion-ou {
  text-align: center;
  color: $color-text-muted;
  margin-top: $spacing-md;
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
