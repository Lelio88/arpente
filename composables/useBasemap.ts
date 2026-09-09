import { PMTiles, FileSource } from 'pmtiles'
import type { City } from '~/types'

/**
 * Charge l'archive PMTiles qui sert de fond de carte a une ville.
 *
 * Le fichier `public/basemaps/<ville>.pmtiles` est produit hors-app par
 * `npm run download-basemap` (extrait du basemap Protomaps, derive d'OpenStreetMap
 * sous ODbL). Il pese environ 4 Mo par ville et couvre les bornes du centre-ville.
 *
 * Pourquoi l'archive est chargee **entierement** en memoire plutot que lue par plages :
 * PMTiles est concu pour etre interroge par requetes HTTP Range, mais le serveur d'assets
 * local de Capacitor ne garantit pas leur prise en charge, et mettre en cache des reponses
 * partielles dans le service worker imposerait un plugin supplementaire. Un `fetch` unique
 * suivi d'une lecture en memoire se comporte de facon identique en web et en natif, et
 * rend le cache hors ligne trivial. Le cout est de 4 Mo de memoire par ville consultee.
 *
 * Invariant : le cache indexe des **promesses**, pas des resultats. Deux appels concurrents
 * pour la meme ville partagent donc un seul telechargement. Une promesse rejetee est retiree
 * du cache, sans quoi un echec reseau passager condamnerait la ville pour toute la session.
 */

const archives = new Map<City, Promise<PMTiles>>()

async function fetchArchive(city: City): Promise<PMTiles> {
  const url = `/basemaps/${city}.pmtiles`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Fond de carte introuvable (HTTP ${response.status}) : ${url}`)
  }

  const blob = await response.blob()
  return new PMTiles(new FileSource(new File([blob], `${city}.pmtiles`)))
}

/**
 * Retourne l'archive PMTiles de la ville, en la telechargeant au premier appel.
 * Rejette si le fichier est absent — l'appelant doit le signaler a l'utilisateur
 * plutot que d'afficher une carte vide sans explication.
 */
export function loadCityBasemap(city: City): Promise<PMTiles> {
  const cached = archives.get(city)
  if (cached) return cached

  const pending = fetchArchive(city).catch((error: unknown) => {
    archives.delete(city)
    throw error
  })

  archives.set(city, pending)
  return pending
}
