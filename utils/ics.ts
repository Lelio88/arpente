/**
 * Génération de fichiers iCalendar (RFC 5545), pour l'ajout à l'agenda depuis
 * le navigateur — là où le plugin Capacitor n'existe pas.
 *
 * Fonction pure, sans dépendance : elle s'exécute et se vérifie hors de Nuxt.
 *
 * Les trois règles du format que l'on oublie, et qui produisent un fichier
 * refusé sans message par la moitié des agendas :
 *
 * 1. **Les fins de ligne sont CRLF**, pas LF. La RFC l'impose ; Google Agenda
 *    tolère, Outlook non.
 * 2. **Les caractères `\ ; ,` et les retours à la ligne s'échappent** dans les
 *    champs texte. Une virgule non échappée dans un titre coupe la valeur.
 * 3. **Les lignes dépassant 75 octets se plient**, la suite étant préfixée d'une
 *    espace. Le compte est en OCTETS, pas en caractères : « Cathédrale » pèse
 *    plus que sa longueur apparente, et couper au milieu d'un caractère UTF-8
 *    produit un fichier illisible.
 */

export interface EvenementIcs {
  titre: string
  debut: Date
  finOuDuree: Date | number
  lieu?: string
  description?: string
  /** Identifiant stable : rejouer l'ajout met l'événement à jour au lieu de le dupliquer. */
  uid: string
}

/** `YYYYMMDDTHHMMSSZ` — l'heure UTC évite toute déclaration de fuseau. */
export function versHorodatageIcs(date: Date): string {
  const p = (n: number, taille = 2) => String(n).padStart(taille, '0')
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}`
    + `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
}

export function echapperTexteIcs(valeur: string): string {
  return valeur
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Plie une ligne à 75 octets, la suite préfixée d'une espace.
 * La découpe se fait sur les octets UTF-8 mais jamais au milieu d'un caractère :
 * on avance caractère par caractère tant que le budget le permet.
 */
export function plierLigneIcs(ligne: string): string {
  const encodeur = new TextEncoder()
  if (encodeur.encode(ligne).length <= 75) return ligne

  const morceaux: string[] = []
  let courant = ''
  let budget = 75

  for (const caractere of ligne) {
    const poids = encodeur.encode(caractere).length
    if (encodeur.encode(courant).length + poids > budget) {
      morceaux.push(courant)
      courant = caractere
      budget = 74 // les lignes suivantes perdent un octet pour l'espace de pliage
    }
    else {
      courant += caractere
    }
  }
  if (courant) morceaux.push(courant)

  return morceaux.map((m, i) => (i === 0 ? m : ` ${m}`)).join('\r\n')
}

export function construireIcs(evenement: EvenementIcs): string {
  const fin = typeof evenement.finOuDuree === 'number'
    ? new Date(evenement.debut.getTime() + evenement.finOuDuree * 60_000)
    : evenement.finOuDuree

  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Arpente//Guide de visite//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${evenement.uid}`,
    `DTSTAMP:${versHorodatageIcs(new Date())}`,
    `DTSTART:${versHorodatageIcs(evenement.debut)}`,
    `DTEND:${versHorodatageIcs(fin)}`,
    `SUMMARY:${echapperTexteIcs(evenement.titre)}`,
  ]

  if (evenement.lieu) lignes.push(`LOCATION:${echapperTexteIcs(evenement.lieu)}`)
  if (evenement.description) lignes.push(`DESCRIPTION:${echapperTexteIcs(evenement.description)}`)

  lignes.push('END:VEVENT', 'END:VCALENDAR')

  // CRLF, y compris en fin de fichier : certains agendas ignorent le dernier
  // composant si le fichier ne se termine pas par une rupture de ligne.
  return lignes.map(plierLigneIcs).join('\r\n') + '\r\n'
}
