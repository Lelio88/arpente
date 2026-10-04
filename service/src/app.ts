/**
 * Assemblage du service : routes, en-têtes, et ce qui ne s'ouvre qu'avec
 * `OAUTH_ACTIF`. Sans réseau ni base à la construction : tout arrive par
 * `Dependances`, ce qui permet aux tests de monter l'application entière
 * sur des doubles.
 *
 * Routes :
 * - toujours : `/sante`, la passerelle `/auth/v1/otp` et `/auth/v1/verify`,
 *   `/captcha` (cadre de l'app), `/suppression-compte`, `/connexion/*` ;
 * - avec `OAUTH_ACTIF` : découverte OAuth, `/oauth/*`, la ressource protégée
 *   et `/mcp`.
 *
 * Choix non évidents :
 * - **`trust proxy` limité à la boucle locale et aux réseaux privés** : le
 *   service n'écoute que derrière Caddy (via le pont Docker), et c'est
 *   l'adresse posée par Caddy qui compte pour les plafonds.
 * - **`/mcp` sans session** : `createMcpHandler` reçoit l'accès vérifié par
 *   `requireBearerAuth`, et fabrique un serveur par requête. Le protocole de
 *   2026 reçoit du JSON ; un client de 2025 (claude.ai, ChatGPT aujourd'hui)
 *   passe par le repli sans session du SDK, qui répond en un flux SSE d'un
 *   seul message — tous les clients MCP le lisent, et le repli n'a pas
 *   d'option JSON.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import express, { type NextFunction, type Request, type Response } from 'express'
import { hostHeaderValidation, requireBearerAuth } from '@modelcontextprotocol/express'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createMcpHandler, type AuthInfo } from '@modelcontextprotocol/server'
import type { Config } from './config'
import type { Catalogue } from './contenu'
import type { JugeJeton } from './gotrue'
import { journal, messageErreur } from './journal'
import { Fenetre } from './limites'
import type { DepotGroupes } from './mcp/groupes'
import type { LireJson } from '../../utils/decision'
import { creerServeurMcp, verificateur } from './mcp/serveur'
import type { DepotAutorisations } from './oauth/autorisations'
import type { Signataire } from './oauth/jetons'
import { CHEMINS, SCOPE, routeurOAuth } from './oauth/serveur'
import { ENTETES_CAPTCHA, ENTETES_PAGES, pageAccord, pageCaptcha, pageSuppression } from './pages/gabarits'
import { routeurPasserelle } from './passerelle'

export interface Dependances {
  config: Config
  catalogue: Catalogue
  signataire: Signataire
  autorisations: DepotAutorisations
  groupes: DepotGroupes
  juge: JugeJeton
  lireJson: LireJson
  maintenant?: () => number
}

const ici = dirname(fileURLToPath(import.meta.url))

function accesDe(info: AuthInfo | undefined): { userId: string, autorisationId: string } {
  const userId = info?.extra?.userId
  const autorisationId = info?.extra?.autorisationId
  if (typeof userId !== 'string' || typeof autorisationId !== 'string') {
    throw new Error('accès non vérifié')
  }
  return { userId, autorisationId }
}

export function creerApp(d: Dependances): express.Express {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', ['loopback', 'uniquelocal'])
  const cles = { turnstile: d.config.cleTurnstile, google: d.config.clientGoogle }

  app.get('/sante', (_req, res) => { res.json({ ok: true }) })
  app.use(routeurPasserelle(d.config.urlGotrue, d.maintenant, d.config.examen))
  app.use('/connexion', express.static(join(ici, 'pages', 'public'), {
    index: false,
    maxAge: '1h',
    setHeaders: res => res.set('X-Content-Type-Options', 'nosniff'),
  }))
  app.get('/suppression-compte', (_req, res) => {
    res.set(ENTETES_PAGES).type('html').send(pageSuppression(cles))
  })
  app.get('/captcha', (_req, res) => {
    res.set(ENTETES_CAPTCHA).type('html').send(pageCaptcha(cles))
  })

  if (d.config.oauthActif) monterAssistant(app, d, cles)

  app.use((_req, res) => { res.status(404).json({ erreur: 'introuvable' }) })
  app.use((erreur: unknown, req: Request, res: Response, _next: NextFunction) => {
    journal.erreur('requete_erreur', { route: req.path, message: messageErreur(erreur) })
    if (!res.headersSent) res.status(500).json({ erreur: 'erreur interne' })
  })
  return app
}

function monterAssistant(app: express.Express, d: Dependances, cles: { turnstile: string, google: string }): void {
  const { config, signataire, autorisations } = d
  const metadonneesRessource = {
    resource: config.urlRessource,
    authorization_servers: [config.urlPublique],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Arpente',
    resource_documentation: config.urlDocumentation,
  }
  const servirRessource = (_req: Request, res: Response): void => {
    res.set('Cache-Control', 'no-store').json(metadonneesRessource)
  }
  app.get(CHEMINS.ressourceProtegee, servirRessource)
  app.get(`${CHEMINS.ressourceProtegee}${CHEMINS.ressource}`, servirRessource)

  app.get(CHEMINS.accord, (_req, res, next) => { res.set(ENTETES_PAGES); next() })
  app.use(routeurOAuth({
    signataire,
    autorisations,
    juge: d.juge,
    pageAccord: vue => pageAccord(vue, cles),
    maintenant: d.maintenant,
  }))

  const dependancesOutils = {
    catalogue: d.catalogue,
    groupes: d.groupes,
    ecritures: new Fenetre(30, 60 * 60 * 1000),
    decisions: new Fenetre(5, 60 * 60 * 1000),
    lireJson: d.lireJson,
    empreinteApercu: (valeur: string) => signataire.empreinte('apercu', valeur),
  }
  const gestionnaire = createMcpHandler(
    ctx => creerServeurMcp(accesDe(ctx.authInfo), dependancesOutils, config.urlDocumentation),
    {
      responseMode: 'json',
      legacy: 'stateless',
      onerror: erreur => journal.erreur('mcp_erreur', { message: messageErreur(erreur) }),
    },
  )
  const versNode = toNodeHandler(gestionnaire, {
    onerror: erreur => journal.erreur('mcp_adaptateur', { message: messageErreur(erreur) }),
  })
  const hotes = [new URL(config.urlPublique).hostname, 'localhost', '127.0.0.1']

  app.post(CHEMINS.ressource,
    hostHeaderValidation(hotes),
    requireBearerAuth({
      verifier: verificateur(signataire, autorisations, d.maintenant),
      resourceMetadataUrl: `${config.urlPublique}${CHEMINS.ressourceProtegee}${CHEMINS.ressource}`,
      expectedResource: new URL(config.urlRessource),
    }),
    express.json({ limit: '256kb' }),
    (req, res) => { void versNode(req, res, req.body) })
  app.all(CHEMINS.ressource, (_req, res) => { res.set('Allow', 'POST').status(405).json({ erreur: 'méthode non permise' }) })
}
