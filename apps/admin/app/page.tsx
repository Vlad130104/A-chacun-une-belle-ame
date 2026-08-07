/**
 * Écran 23/24 — back-office (docs/07-parcours-ux.md §2.6).
 *
 * Coquille de la phase C. Les files de vérification et de modération sont livrées
 * avec les tranches D2 et D6 : le back-office de vérification doit exister dès D2,
 * sinon aucun compte ne peut être vérifié, même en développement.
 */
export default function BackOfficePage() {
  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1>Back-office</h1>
      <p>
        Accès réservé aux comptes disposant d’un rôle, avec authentification à deux facteurs
        obligatoire et session de 8 heures.
      </p>
      <p>
        Aucune fonctionnalité n’est encore branchée : les files de vérification et de modération
        arrivent avec les tranches D2 et D6 du backlog.
      </p>
    </main>
  );
}
