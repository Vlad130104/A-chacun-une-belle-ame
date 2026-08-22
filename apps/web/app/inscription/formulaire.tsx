'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../lib/api-client';
import { inscrire } from '../../lib/auth';
import { champTexte } from '../../lib/formulaire';

/**
 * Formulaire d'inscription (story D1-02, tranche F1).
 *
 * Ce que ce composant NE fait PAS, et qui est le cœur de sa conception :
 *
 *  - **il ne calcule aucun âge.** La minorité est refusée par le serveur, qui
 *    seul décide. Un contrôle ici ne serait qu'un confort d'affichage : il se
 *    contourne avec deux lignes de console ;
 *  - **il ne dit pas si un numéro est déjà connu.** L'API répond de façon
 *    neutre, et l'écran ne cherche pas à en déduire davantage — sinon le
 *    formulaire deviendrait un outil pour savoir qui est inscrit ;
 *  - **il n'enregistre rien localement** avant la réponse du serveur.
 */

const VERSION_DOCUMENTS = '1.0';

const CONSENTEMENTS_REQUIS = [
  {
    type: 'TERMS_OF_SERVICE',
    libelle: 'J’accepte les conditions générales d’utilisation',
  },
  {
    type: 'PRIVACY_POLICY',
    libelle: 'J’accepte la politique de confidentialité',
  },
  {
    type: 'CODE_OF_CONDUCT',
    libelle: 'Je m’engage à respecter la charte de bonne conduite',
  },
] as const;

export function FormulaireInscription({ inviteCode }: { inviteCode?: string }) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [acceptes, setAcceptes] = useState<Record<string, boolean>>({});

  const tousAcceptes = CONSENTEMENTS_REQUIS.every((c) => acceptes[c.type] === true);

  async function soumettre(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    const donnees = new FormData(evenement.currentTarget);

    try {
      const defi = await inscrire({
        phoneE164: champTexte(donnees, 'phoneE164').replace(/\s/g, ''),
        birthDate: champTexte(donnees, 'birthDate'),
        gender: champTexte(donnees, 'gender') === 'MALE' ? 'MALE' : 'FEMALE',
        ...(inviteCode === undefined ? {} : { inviteCode }),
        consents: CONSENTEMENTS_REQUIS.map((c) => ({
          type: c.type,
          documentVersion: VERSION_DOCUMENTS,
          granted: true,
        })),
      });

      // Le défi transite par l'URL : il ne contient aucune donnée personnelle,
      // seulement un identifiant opaque et sans valeur pour un tiers.
      const parametres = new URLSearchParams({
        defi: defi.challengeId,
        ...(defi.testMode ? { test: '1' } : {}),
      });
      router.push(`/inscription/code?${parametres.toString()}`);
    } catch (cause) {
      setErreur(
        cause instanceof ApiError
          ? cause.message
          : 'Une erreur est survenue. Réessayez dans un instant.',
      );
      setEnvoi(false);
    }
  }

  return (
    // `void` explicite : un gestionnaire d'événement ne doit pas rendre une
    // promesse — React ne l'attendrait pas et un rejet passerait inaperçu.
    <form
      onSubmit={(evenement) => {
        void soumettre(evenement);
      }}
      noValidate
    >
      <p>
        <label htmlFor="phoneE164">Numéro de téléphone</label>
        <input
          id="phoneE164"
          name="phoneE164"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+237690000000"
          required
        />
        <small>
          Au format international, indicatif compris. Il ne sera jamais affiché sur votre profil.
        </small>
      </p>

      <p>
        <label htmlFor="birthDate">Date de naissance</label>
        <input id="birthDate" name="birthDate" type="date" autoComplete="bday" required />
        <small>
          Le service est strictement réservé aux personnes majeures. Cette date sera comparée à
          votre pièce d’identité et ne pourra plus être modifiée après vérification.
        </small>
      </p>

      <fieldset>
        <legend>Je suis</legend>
        <label>
          <input type="radio" name="gender" value="FEMALE" defaultChecked /> Une femme
        </label>
        <label>
          <input type="radio" name="gender" value="MALE" /> Un homme
        </label>
      </fieldset>

      <fieldset>
        <legend>Engagements</legend>
        {CONSENTEMENTS_REQUIS.map((consentement) => (
          <label key={consentement.type}>
            <input
              type="checkbox"
              name={consentement.type}
              checked={acceptes[consentement.type] === true}
              onChange={(evenement) =>
                setAcceptes((precedent) => ({
                  ...precedent,
                  [consentement.type]: evenement.target.checked,
                }))
              }
            />{' '}
            {consentement.libelle}
          </label>
        ))}
        <small>
          Chaque acceptation est horodatée et conservée avec la version du document, comme la loi
          l’exige.
        </small>
      </fieldset>

      {erreur === null ? null : (
        <p role="alert" className="erreur">
          {erreur}
        </p>
      )}

      <p>
        <button className="bouton" type="submit" disabled={envoi || !tousAcceptes}>
          {envoi ? 'Envoi en cours…' : 'Recevoir mon code'}
        </button>
      </p>
    </form>
  );
}
