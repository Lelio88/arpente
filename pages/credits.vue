<script setup lang="ts">
/**
 * Crédits des contenus tiers embarqués dans l'application.
 *
 * **Pourquoi cette page existe.** Les photographies des fiches proviennent de
 * Wikimedia Commons. La plupart sont sous licence CC BY-SA ou CC BY, qui
 * imposent de **nommer l'auteur et la licence** partout où l'œuvre est
 * rediffusée — une obligation juridique, pas une convention de politesse. Une
 * app publiée sur un store rediffuse. Sans cette page, l'application serait en
 * infraction avec les licences de 34 de ses images.
 *
 * Le fond de carte y figure aussi : la licence ODbL d'OpenStreetMap impose la
 * même attribution. Elle est déjà portée par la couche Leaflet, on la rappelle
 * ici pour que tout tienne au même endroit.
 *
 * **Invariant** : `assets/credits-images.json` est régénéré à partir des
 * métadonnées de Commons quand des images sont ajoutées. Une image livrée sans
 * sa ligne de crédit est un défaut de conformité, pas un oubli cosmétique.
 */
import credits from '~/assets/credits-images.json'

const VILLES: Record<string, string> = { caen: 'Caen', troyes: 'Troyes' }
</script>

<template>
  <div class="page-credits safe-top">
    <header class="credits-header">
      <button class="back-link" @click="$router.back()">
        ← Retour
      </button>
      <h1>Crédits</h1>
      <p>
        Arpente s'appuie sur des contenus libres. Chaque auteur est nommé, comme
        les licences l'exigent.
      </p>
    </header>

    <section class="bloc">
      <h2>Fond de carte</h2>
      <p>
        Données <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>,
        sous licence ODbL. Tuiles vectorielles extraites du basemap
        <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>.
      </p>
    </section>

    <section class="bloc">
      <h2>Photographies</h2>
      <p class="chapo">
        {{ credits.length }} illustrations issues de Wikimedia Commons.
      </p>
      <ul class="liste">
        <li v-for="c in credits" :key="c.slug">
          <span class="lieu">{{ c.titre }}</span>
          <span class="ville">{{ VILLES[c.ville] || c.ville }}</span>
          <span class="auteur">{{ c.auteur }}</span>
          <a v-if="c.page" :href="c.page" target="_blank" rel="noopener" class="licence">
            {{ c.licence }}
          </a>
          <span v-else class="licence">{{ c.licence }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style lang="scss" scoped>
@use '~/assets/styles/variables' as *;

.page-credits {
  padding: $spacing-md;
  padding-bottom: $spacing-xl;
  overflow-y: auto;
}

.credits-header {
  margin-bottom: $spacing-lg;

  h1 {
    margin: $spacing-sm 0 $spacing-xs;
  }

  p {
    color: $color-text-muted;
    line-height: 1.5;
  }
}

.back-link {
  background: none;
  border: none;
  color: $color-text-muted;
  padding: 0;
  font-size: 0.95rem;
  cursor: pointer;
}

.bloc {
  margin-bottom: $spacing-lg;

  h2 {
    font-size: 1.1rem;
    margin-bottom: $spacing-sm;
  }

  p {
    color: $color-text-muted;
    line-height: 1.6;
  }
}

.chapo {
  margin-bottom: $spacing-md;
}

.liste {
  list-style: none;
  padding: 0;
  margin: 0;

  li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px $spacing-sm;
    padding: $spacing-sm 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    font-size: 0.85rem;
  }
}

.lieu {
  font-weight: 600;
}

.ville,
.licence {
  color: $color-text-muted;
  font-size: 0.78rem;
  text-align: right;
}

.auteur {
  color: $color-text-muted;
  // L'auteur est parfois une phrase entiere sur Commons : on la borne pour ne
  // pas casser la grille sur un ecran etroit.
  overflow-wrap: anywhere;
}

a {
  color: $color-highlight;
}
</style>
