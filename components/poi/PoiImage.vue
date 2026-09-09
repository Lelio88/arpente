<script setup lang="ts">
/**
 * Image d'illustration d'un point d'intérêt, tolérante à un fichier absent.
 *
 * **Pourquoi ce composant plutôt qu'une balise `<img>`.** 55 fiches sur 151
 * déclarent un champ `image` pointant vers `/images/pois/…`, dossier qui
 * n'existe pas encore. Une balise nue affiche alors l'icône de fichier cassé
 * suivie du texte alternatif — sur la fiche comme dans le volet de proximité,
 * c'est-à-dire aux deux endroits où un visiteur regarde. Ici, l'image
 * disparaît et la mise en page se referme sur le texte.
 *
 * **L'invariant à ne pas casser** : on affiche d'abord et on retire sur
 * `error`, jamais l'inverse. Attendre une preuve de chargement avant
 * d'afficher ferait sauter l'image à chaque navigation, y compris quand elle
 * existe.
 *
 * Le drapeau se réarme quand `src` change : sans ce `watch`, une fiche visitée
 * après une image manquante resterait muette alors que la sienne existe — les
 * pages de POI réutilisent la même instance de composant.
 */
const props = defineProps<{ src?: string | null, alt: string }>()

const chargeable = ref(true)
watch(() => props.src, () => { chargeable.value = true })
</script>

<template>
  <img
    v-if="src && chargeable"
    :src="src"
    :alt="alt"
    @error="chargeable = false"
  >
</template>
