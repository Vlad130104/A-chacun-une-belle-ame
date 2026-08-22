/**
 * Lecture d'un champ de formulaire, en chaîne.
 *
 * `FormData.get` rend `string | File | null` : un champ de fichier renverrait
 * un objet, dont la conversion en chaîne donnerait `[object Object]` — une
 * valeur absurde envoyée au serveur sans que rien ne l'ait signalé. Le typage
 * force ici à traiter le cas plutôt qu'à l'ignorer.
 */
export function champTexte(donnees: FormData, nom: string): string {
  const valeur = donnees.get(nom);
  return typeof valeur === 'string' ? valeur : '';
}
