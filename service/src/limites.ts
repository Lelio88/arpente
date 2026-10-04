/**
 * Plafonds en mémoire : au plus `max` événements par clé sur une fenêtre
 * glissante de `dureeMs`.
 *
 * Choix non évidents :
 * - en mémoire, sans base : le service tourne en un seul processus, et un
 *   redémarrage qui remet les compteurs à zéro ne coûte qu'une fenêtre ;
 * - le nombre de clés suivies est borné (`maxCles`) : une rafale de clés
 *   neuves (adresses IP, adresses e-mail) n'épuise pas la mémoire, elle
 *   évince d'abord les clés les plus anciennes.
 */
export class Fenetre {
  private readonly traces = new Map<string, number[]>()

  constructor(
    private readonly max: number,
    private readonly dureeMs: number,
    private readonly maxCles = 10_000,
  ) {}

  /** Enregistre un événement s'il reste de la place, et dit s'il passe. */
  autorise(cle: string, maintenant = Date.now()): boolean {
    const recentes = this.recentes(cle, maintenant)
    if (recentes.length >= this.max) {
      this.traces.set(cle, recentes)
      return false
    }
    recentes.push(maintenant)
    this.ranger(cle, recentes)
    return true
  }

  /** Nombre d'événements encore dans la fenêtre, sans en ajouter. */
  compte(cle: string, maintenant = Date.now()): number {
    return this.recentes(cle, maintenant).length
  }

  /** Ajoute un événement sans plafond (un échec qu'on compte). */
  ajoute(cle: string, maintenant = Date.now()): number {
    const recentes = this.recentes(cle, maintenant)
    recentes.push(maintenant)
    this.ranger(cle, recentes)
    return recentes.length
  }

  oublie(cle: string): void {
    this.traces.delete(cle)
  }

  private recentes(cle: string, maintenant: number): number[] {
    const limite = maintenant - this.dureeMs
    return (this.traces.get(cle) ?? []).filter(t => t > limite)
  }

  private ranger(cle: string, recentes: number[]): void {
    // Réinsérer place la clé en dernier : l'ordre d'insertion de la Map
    // devient l'ordre d'usage, et l'éviction vise la plus ancienne.
    this.traces.delete(cle)
    this.traces.set(cle, recentes)
    while (this.traces.size > this.maxCles) {
      const premiere = this.traces.keys().next().value
      if (premiere === undefined) break
      this.traces.delete(premiere)
    }
  }
}
