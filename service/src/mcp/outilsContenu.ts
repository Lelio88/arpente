/**
 * Outils de lecture du contenu public : lieux et parcours de Caen et Troyes.
 * Ils lisent le contenu compilé en mémoire, sans base ni réseau.
 *
 * Règle « l'outil ne devine pas » : un slug inconnu n'est jamais remplacé
 * par le plus proche ; l'outil refuse et propose des lieux existants.
 */
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { VILLES, type Catalogue } from '../contenu'
import { donnees, protege, refus } from './reponses'

export const PAR_PAGE = 30

const ville = z.enum(VILLES).describe('La ville : « caen » ou « troyes ».')

export function enregistrerOutilsContenu(serveur: McpServer, catalogue: Catalogue): void {
  const categories = [...new Set(catalogue.contenu.lieux.map(l => l.categorie))].sort()

  serveur.registerTool('lieux', {
    title: 'Lieux d\'une ville',
    description: `Liste les lieux à visiter d'une ville (titre, catégorie, époque, tags, résumé, position), ${PAR_PAGE} par page, triés par titre. Filtrer par catégorie (${categories.join(', ')}) ou par tag. Le slug sert à désigner un lieu dans les autres outils.`,
    inputSchema: z.object({
      ville,
      categorie: z.string().max(40).optional().describe('Une catégorie exacte, pour filtrer.'),
      tag: z.string().max(40).optional().describe('Un tag exact (ex. « medieval », « incontournable »), pour filtrer.'),
      page: z.number().int().min(1).max(50).optional().describe('Page, à partir de 1.'),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ ville: v, categorie, tag, page }) => protege('lieux', async () => {
    const tous = catalogue.lieuxDe(v)
      .filter(l => !categorie || l.categorie === categorie)
      .filter(l => !tag || l.tags.includes(tag))
    const numero = page ?? 1
    const pages = Math.max(1, Math.ceil(tous.length / PAR_PAGE))
    return donnees({
      ville: v,
      total: tous.length,
      page: numero,
      pages,
      lieux: tous.slice((numero - 1) * PAR_PAGE, numero * PAR_PAGE).map(l => ({
        slug: l.slug,
        titre: l.titre,
        categorie: l.categorie,
        epoque: l.epoque,
        tags: l.tags,
        resume: l.description,
        lat: l.lat,
        lng: l.lng,
      })),
    })
  }))

  serveur.registerTool('lieu', {
    title: 'Fiche d\'un lieu',
    description: 'Rend la fiche complète d\'un lieu : histoire, anecdotes, époque, bâtisseur, position. Le slug doit être exact (celui que rend « lieux ») ; sinon l\'outil propose des lieux proches sans en choisir un.',
    inputSchema: z.object({
      slug: z.string().min(1).max(120).describe('Le slug exact du lieu, ex. « chateau-de-caen ».'),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ slug }) => protege('lieu', async () => {
    const l = catalogue.lieu(slug)
    if (!l) {
      return refus(`Aucun lieu n'a le slug « ${slug} ». Lieux proches :`,
        catalogue.suggestions(slug).map(s => ({ slug: s.slug, titre: s.titre, ville: s.ville })))
    }
    return donnees({
      slug: l.slug,
      titre: l.titre,
      ville: l.ville,
      categorie: l.categorie,
      epoque: l.epoque,
      batisseur: l.batisseur,
      tags: l.tags,
      resume: l.description,
      lat: l.lat,
      lng: l.lng,
      fiche: l.texte,
    })
  }))

  serveur.registerTool('parcours', {
    title: 'Parcours thématiques',
    description: 'Liste les parcours thématiques tout faits d\'une ville : titre, description, durée, distance, difficulté, et leurs étapes dans l\'ordre (avec la note de chaque étape).',
    inputSchema: z.object({ ville }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ ville: v }) => protege('parcours', async () => donnees(catalogue.parcoursDe(v).map(p => ({
    slug: p.slug,
    titre: p.titre,
    description: p.description,
    duree: p.duree,
    distance: p.distance,
    difficulte: p.difficulte,
    etapes: p.etapes.map(e => ({ slug: e.slug, titre: catalogue.lieu(e.slug)?.titre ?? e.slug, note: e.note })),
  })))))
}
