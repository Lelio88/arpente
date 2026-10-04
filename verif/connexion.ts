/**
 * Vérifie les fonctions pures de la connexion : le message montré pour une
 * erreur de GoTrue (par code, jamais le texte du serveur), et l'origine de
 * l'API dont dépendent la page /captcha et l'adresse /mcp.
 */
import { messageConnexion } from '../utils/messagesConnexion'
import { origineApi } from '../utils/liensLegaux'

let echecs = 0
function verifie(intitule: string, condition: boolean, detail = '') {
  console.log(`  ${condition ? 'OK  ' : 'ECHEC'} ${intitule}${detail ? ' — ' + detail : ''}`)
  if (!condition) echecs++
}

console.log('\n--- Messages de connexion ---')
verifie('code connu -> message dédié', messageConnexion({ code: 'otp_expired' }) === 'Ce code est faux ou a expiré.')
const brut = messageConnexion({ code: 'user_already_exists', message: 'User already registered' })
verifie('code inconnu -> message générique, jamais le texte du serveur',
  !brut.includes('registered') && brut.startsWith('La connexion'), brut)
verifie('erreur sans code -> message générique', messageConnexion(new Error('x')).startsWith('La connexion'))
verifie('aucun message ne parle d\'un compte existant',
  ['validation_failed', 'otp_expired', 'over_email_send_rate_limit'].every(c => !/existe|déjà/.test(messageConnexion({ code: c }))))

console.log('\n--- Origine de l\'API ---')
verifie('adresse complète -> origine', origineApi('https://api.arpente.heianenterprise.com/') === 'https://api.arpente.heianenterprise.com')
verifie('non configurée -> chaîne vide, sans lever', origineApi('') === '')

console.log(echecs === 0 ? '\nConnexion : tous les cas passent.' : `\n${echecs} echec(s).`)
process.exit(echecs === 0 ? 0 : 1)
