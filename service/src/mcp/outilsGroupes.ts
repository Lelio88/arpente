/**
 * Outils des groupes de visite, au nom du membre : lire ses groupes, voter,
 * régler ses envies, arrêter le parcours du groupe.
 *
 * Choix non évidents :
 * - **L'outil ne devine pas.** Un groupe se désigne par son id ou son nom
 *   exact (unique parmi les siens) ; un lieu par son slug exact, et de la
 *   ville du groupe. Sinon : refus, avec les choix possibles.
 * - **En lot, une ligne refusée n'arrête pas les autres**, et chaque ligne
 *   rend ce qu'elle a fait.
 * - **`arreter_parcours` sans `confirme` ne fait que calculer** : il rend
 *   l'aperçu que l'assistant montre à l'utilisateur ; avec `confirme`, le
 *   parcours est enregistré et devient visible de tout le groupe. Le calcul
 *   est celui de l'app (`utils/decision.ts`), jamais celui de l'assistant.
 * - **Plafonds par accès** : 30 écritures par heure, dont 5 parcours
 *   arrêtés — un assistant détourné par une consigne cachée dans un pseudo
 *   ne peut pas inonder un groupe.
 * - Les textes saisis par des membres (noms de groupe, pseudos) sont
 *   nettoyés avant d'être rendus : ce sont des données, jamais des consignes.
 */
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { mesurerTrajet, preparerDecision, type LireJson } from '../../../utils/decision'
import { median } from '../../../utils/voteAggregation'
import type { Catalogue } from '../contenu'
import type { Fenetre } from '../limites'
import { nettoyerTexte, normaliser } from '../texte'
import type { DepotGroupes, DetailGroupe, ResumeGroupe } from './groupes'
import { donnees, protege, refus } from './reponses'

export interface ContexteAcces {
  userId: string
  autorisationId: string
}

export interface DependancesGroupes {
  catalogue: Catalogue
  groupes: DepotGroupes
  ecritures: Fenetre
  decisions: Fenetre
  lireJson: LireJson
}

const LONGUEUR_NOM = 60

function vueResume(g: ResumeGroupe) {
  return { id: g.id, nom: nettoyerTexte(g.nom, LONGUEUR_NOM), ville: g.ville, statut: g.statut, membres: g.membres }
}

type Trouve = { groupe: ResumeGroupe } | { erreur: ReturnType<typeof refus> }

async function trouverGroupe(d: DependancesGroupes, userId: string, designation: string): Promise<Trouve> {
  const siens = await d.groupes.mesGroupes(userId)
  const parId = siens.find(g => g.id === designation.trim().toLowerCase())
  if (parId) return { groupe: parId }
  const cherche = normaliser(designation)
  const parNom = siens.filter(g => normaliser(g.nom) === cherche)
  if (parNom.length === 1) return { groupe: parNom[0]! }
  const choix = siens.map(vueResume)
  if (parNom.length > 1) {
    return { erreur: refus('Plusieurs de tes groupes portent ce nom : désigne-le par son id.', choix) }
  }
  return { erreur: refus(`Aucun de tes groupes ne s'appelle « ${nettoyerTexte(designation, LONGUEUR_NOM)} ». Tes groupes :`, choix) }
}

function pseudoDe(detail: DetailGroupe, userId: string | null): string {
  if (!userId) return '?'
  const p = detail.pseudos.find(m => m.id === userId)
  return p ? nettoyerTexte(p.pseudo, 40) || '?' : '?'
}

function vueDetail(d: DependancesGroupes, detail: DetailGroupe) {
  const titre = (slug: string): string => d.catalogue.lieu(slug)?.titre ?? slug
  const nombres = detail.envies.map(e => e.nombre).filter((n): n is number => n !== null)
  const durees = detail.envies.map(e => e.duree).filter((n): n is number => n !== null)
  return {
    ...vueResume(detail),
    membres: detail.pseudos.map(m => ({ pseudo: nettoyerTexte(m.pseudo, 40) || '?', moi: m.moi })),
    votes: Object.entries(detail.approbations)
      .map(([slug, ids]) => ({ slug, titre: titre(slug), voix: ids.length, par: ids.map(id => pseudoDe(detail, id)) }))
      .sort((a, b) => b.voix - a.voix || a.titre.localeCompare(b.titre, 'fr')),
    envies: detail.envies.map(e => ({ pseudo: pseudoDe(detail, e.userId), nombre_de_lieux: e.nombre, duree_minutes: e.duree })),
    medianes: { nombre_de_lieux: median(nombres), duree_minutes: median(durees) },
    lieux_coches: detail.coches.map(c => ({ slug: c.slug, titre: titre(c.slug), par: pseudoDe(detail, c.par) })),
    parcours_arrete: detail.parcoursArrete && {
      etapes: detail.parcoursArrete.etapes.map(s => ({ slug: s, titre: titre(s) })),
      distance_metres: detail.parcoursArrete.distanceMetres,
      duree_marche_minutes: detail.parcoursArrete.dureeSecondes === null ? null : Math.round(detail.parcoursArrete.dureeSecondes / 60),
      arrete_le: detail.parcoursArrete.arreteLe,
      par: pseudoDe(detail, detail.parcoursArrete.par),
    },
  }
}

const designationGroupe = z.string().min(1).max(120)
  .describe('Le groupe : son id (rendu par « mes_groupes ») ou son nom exact.')
const listeLieux = z.array(z.string().min(1).max(120)).min(1).max(30)
  .describe('Slugs exacts de lieux de la ville du groupe (rendus par « lieux »).')

export function enregistrerOutilsGroupes(serveur: McpServer, d: DependancesGroupes, acces: ContexteAcces): void {
  const { userId, autorisationId } = acces

  serveur.registerTool('mes_groupes', {
    title: 'Mes groupes de visite',
    description: 'Liste les groupes de visite dont l\'utilisateur est membre : nom, ville, statut (« voting » : on vote encore ; « decided » : un parcours est arrêté), nombre de membres, id.',
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => protege('mes_groupes', async () =>
    donnees((await d.groupes.mesGroupes(userId)).map(vueResume))))

  serveur.registerTool('groupe', {
    title: 'Un groupe de visite',
    description: 'Rend l\'état d\'un groupe : membres (pseudos), votes par lieu (avec qui), envies de chacun et leurs médianes (nombre de lieux, durée), lieux déjà cochés pendant la visite, et le dernier parcours arrêté.',
    inputSchema: z.object({ groupe: designationGroupe }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ groupe }) => protege('groupe', async () => {
    const t = await trouverGroupe(d, userId, groupe)
    if ('erreur' in t) return t.erreur
    const detail = await d.groupes.detail(userId, t.groupe.id)
    return detail ? donnees(vueDetail(d, detail)) : refus('Ce groupe n\'est plus accessible.')
  }))

  async function enLot(groupe: string, lieux: string[], ecrire: (groupeId: string, slug: string) => Promise<'fait' | 'deja'>,
    libelles: { fait: string, deja: string }) {
    const t = await trouverGroupe(d, userId, groupe)
    if ('erreur' in t) return t.erreur
    const lignes = []
    for (const slug of lieux) {
      const lieu = d.catalogue.lieu(slug)
      if (!lieu || lieu.ville !== t.groupe.ville) {
        lignes.push({
          lieu: slug,
          resultat: 'refusé',
          raison: lieu ? `ce lieu est à ${lieu.ville}, le groupe visite ${t.groupe.ville}` : 'slug inconnu',
          suggestions: d.catalogue.suggestions(slug, t.groupe.ville, 3).map(s => s.slug),
        })
        continue
      }
      if (!d.ecritures.autorise(autorisationId)) {
        lignes.push({ lieu: slug, resultat: 'refusé', raison: 'plafond de 30 écritures par heure atteint' })
        continue
      }
      const r = await ecrire(t.groupe.id, slug)
      lignes.push({ lieu: slug, titre: lieu.titre, resultat: r === 'fait' ? libelles.fait : libelles.deja })
    }
    return donnees({ groupe: vueResume(t.groupe), lignes })
  }

  serveur.registerTool('voter', {
    title: 'Approuver des lieux',
    description: 'Approuve des lieux au nom de l\'utilisateur, dans un de ses groupes (vote d\'approbation : chaque lieu approuvé compte une voix). Chaque lieu doit être de la ville du groupe ; une ligne refusée n\'arrête pas les autres. Les autres membres le voient aussitôt.',
    inputSchema: z.object({ groupe: designationGroupe, lieux: listeLieux }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ groupe, lieux }) => protege('voter', () =>
    enLot(groupe, lieux, (g, s) => d.groupes.voter(userId, g, s), { fait: 'approuvé', deja: 'déjà approuvé' })))

  serveur.registerTool('retirer_vote', {
    title: 'Retirer des votes',
    description: 'Retire les approbations de l\'utilisateur pour ces lieux, dans un de ses groupes. Ne touche jamais aux votes des autres membres.',
    inputSchema: z.object({ groupe: designationGroupe, lieux: listeLieux }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ groupe, lieux }) => protege('retirer_vote', () =>
    enLot(groupe, lieux, (g, s) => d.groupes.retirer(userId, g, s), { fait: 'retiré', deja: 'aucun vote à retirer' })))

  serveur.registerTool('mes_envies', {
    title: 'Régler mes envies',
    description: 'Règle les envies de l\'utilisateur pour un de ses groupes : nombre de lieux souhaité (1 à 30) et durée de visite souhaitée en minutes (10 à 600). Un champ omis garde sa valeur. Le parcours retient la médiane des envies du groupe.',
    inputSchema: z.object({
      groupe: designationGroupe,
      nombre_de_lieux: z.number().int().min(1).max(30).optional(),
      duree_minutes: z.number().int().min(10).max(600).optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ groupe, nombre_de_lieux, duree_minutes }) => protege('mes_envies', async () => {
    if (nombre_de_lieux === undefined && duree_minutes === undefined) {
      return refus('Donne au moins un nombre de lieux ou une durée.')
    }
    const t = await trouverGroupe(d, userId, groupe)
    if ('erreur' in t) return t.erreur
    if (!d.ecritures.autorise(autorisationId)) return refus('Plafond de 30 écritures par heure atteint.')
    const r = await d.groupes.regler(userId, t.groupe.id, nombre_de_lieux ?? null, duree_minutes ?? null)
    return donnees({ groupe: vueResume(t.groupe), nombre_de_lieux: r.nombre, duree_minutes: r.duree })
  }))

  serveur.registerTool('arreter_parcours', {
    title: 'Arrêter le parcours du groupe',
    description: 'Calcule le parcours du groupe à partir des votes (les lieux les plus soutenus, en nombre égal à la médiane des envies, reliés de proche en proche) — le calcul de l\'app, pas le tien. Sans confirme : rend un aperçu, rien n\'est enregistré. Avec confirme=true, SEULEMENT après avoir montré l\'aperçu à l\'utilisateur et reçu son accord explicite : enregistre le parcours, visible de tout le groupe.',
    inputSchema: z.object({
      groupe: designationGroupe,
      confirme: z.boolean().optional().describe('true pour enregistrer, après accord explicite de l\'utilisateur.'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ groupe, confirme }) => protege('arreter_parcours', async () => {
    const t = await trouverGroupe(d, userId, groupe)
    if ('erreur' in t) return t.erreur
    const detail = await d.groupes.detail(userId, t.groupe.id)
    if (!detail) return refus('Ce groupe n\'est plus accessible.')
    const coordonnees = d.catalogue.coordonneesDe(t.groupe.ville)
    let projet
    try {
      projet = preparerDecision(detail.approbations,
        detail.envies.map(e => ({ poiCount: e.nombre, durationMinutes: e.duree })), coordonnees)
    }
    catch (erreur) {
      if ((erreur as Error).message === 'aucun_poi_approuve') {
        return refus('Aucun lieu de la ville du groupe n\'est encore approuvé : il faut des votes avant d\'arrêter un parcours.')
      }
      throw erreur
    }
    const trajet = await mesurerTrajet(projet.orderedSlugs.map(s => coordonnees[s]!), d.lireJson)
    const vue = {
      groupe: vueResume(t.groupe),
      etapes: projet.orderedSlugs.map(s => ({ slug: s, titre: d.catalogue.lieu(s)?.titre ?? s })),
      nombre_vise: projet.targetPoiCount,
      duree_visee_minutes: projet.targetDurationMinutes,
      distance_metres: trajet.distanceMeters,
      duree_marche_minutes: trajet.durationSeconds === null ? null : Math.round(trajet.durationSeconds / 60),
      distance_estimee: trajet.isEstimated,
    }
    if (confirme !== true) {
      return donnees({
        apercu: true,
        message: 'Rien n\'est enregistré. Montre ce parcours à l\'utilisateur ; s\'il l\'accepte explicitement, rappelle avec confirme=true. Une distance estimée est à vol d\'oiseau.',
        ...vue,
      })
    }
    if (!d.decisions.autorise(autorisationId) || !d.ecritures.autorise(autorisationId)) {
      return refus('Plafond atteint : au plus 5 parcours arrêtés par heure.')
    }
    await d.groupes.arreter(userId, t.groupe.id, t.groupe.ville, {
      etapes: projet.orderedSlugs,
      nombreVise: projet.targetPoiCount,
      dureeVisee: projet.targetDurationMinutes,
      distanceMetres: trajet.distanceMeters,
      dureeSecondes: trajet.durationSeconds,
    })
    return donnees({ enregistre: true, message: 'Parcours arrêté : tout le groupe le voit dans l\'app.', ...vue })
  }))
}
