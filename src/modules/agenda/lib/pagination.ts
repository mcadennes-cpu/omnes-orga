/**
 * Lecture par tranches — contourner le plafond de 1 000 lignes de Supabase.
 *
 * LE PROBLEME
 * PostgREST (la couche HTTP de Supabase) ne renvoie jamais plus de 1 000
 * lignes par requete. Ce plafond ne produit NI erreur NI avertissement : la
 * requete reussit, et le code recoit 1 000 lignes en croyant les avoir toutes.
 * Un export tronque ressemble donc exactement a un export complet.
 *
 * Mesure du 22/09/2026 : 2 691 gardes sur l'annee 2026. Exporter l'annee
 * donnait 1 000 lignes, soit 37 % du planning, sans rien signaler.
 *
 * LE PIEGE DE LA PAGINATION : L'ORDRE DOIT ETRE TOTAL
 * On lit la tranche 0-999, puis 1000-1999, etc. Entre deux appels, la base
 * doit trier les lignes exactement pareil, sinon une ligne peut passer d'une
 * tranche a l'autre — et se retrouver en double, ou disparaitre.
 * Un `order('date')` seul ne suffit PAS : toutes les gardes d'une meme
 * journee sont alors a egalite, et PostgreSQL n'est pas tenu de les ranger
 * dans le meme ordre d'un appel a l'autre. Chaque appelant doit donc
 * terminer son tri par une colonne unique — `id` ici.
 * Corriger la troncature avec un tri partiel remplacerait un oubli visible
 * par un oubli silencieux : exactement le defaut qu'on repare.
 */

/** Ce que Supabase renvoie : des lignes, ou une erreur. */
type Reponse<T> = { data: T[] | null; error: unknown };

/** Plafond de PostgREST. Une tranche ne peut pas etre plus grande. */
const TAILLE_TRANCHE = 1000;

/**
 * Garde-fou : au-dela, on considere qu'on boucle pour de mauvaises raisons
 * plutot que de remplir la memoire du navigateur. 500 tranches = 500 000
 * lignes, soit ~180 ans de planning au rythme actuel.
 */
const TRANCHES_MAX = 500;

/**
 * Appelle `construireRequete` autant de fois qu'il le faut et rend TOUTES
 * les lignes, sans plafond a 1 000.
 *
 * La requete est reconstruite a chaque tranche : un builder Supabase se
 * consomme a l'execution et ne peut pas etre rejoue.
 *
 * @param construireRequete recoit les bornes d'une tranche et rend la requete
 *   correspondante, deja triee sur une colonne UNIQUE en dernier critere.
 *
 * @example
 *   const { data, error } = await lireToutesLesLignes((debut, fin) =>
 *     supabase.from('shifts').select('*')
 *       .gte('date', debutPeriode)
 *       .order('date').order('id')   // <- `id` rend le tri total
 *       .range(debut, fin))
 */
export async function lireToutesLesLignes<T>(
  construireRequete: (debut: number, fin: number) => PromiseLike<Reponse<T>>,
): Promise<{ data: T[]; error: unknown | null; tranches: number }> {
  const lignes: T[] = [];
  let tranches = 0;

  for (;;) {
    const debut = tranches * TAILLE_TRANCHE;
    const { data, error } = await construireRequete(
      debut,
      debut + TAILLE_TRANCHE - 1,
    );
    if (error) return { data: [], error, tranches };

    tranches += 1;
    if (data && data.length > 0) lignes.push(...data);

    // Une tranche incomplete signifie qu'on a atteint la fin. C'est le seul
    // signal disponible : PostgREST ne dit pas combien de lignes restent.
    if (!data || data.length < TAILLE_TRANCHE) break;

    if (tranches >= TRANCHES_MAX) {
      return {
        data: lignes,
        error: new Error(
          `Lecture interrompue apres ${TRANCHES_MAX} tranches ` +
            `(${lignes.length} lignes). Periode trop large, ou tri non unique.`,
        ),
        tranches,
      };
    }
  }

  return { data: lignes, error: null, tranches };
}
