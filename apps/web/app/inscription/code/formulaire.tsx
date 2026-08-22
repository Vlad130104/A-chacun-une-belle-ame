'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../lib/api-client';
import { validerCode } from '../../../lib/auth';
import { champTexte } from '../../../lib/formulaire';
import { ouvrirSession } from '../../../lib/session';

/**
 * Saisie et validation du code OTP (tranche F1).
 *
 * Le nombre d'essais restants n'est affiché que lorsque **le serveur** le
 * donne : le client ne compte rien de lui-même. Un compteur local mentirait
 * dès qu'une tentative aurait lieu depuis un autre appareil, et laisserait
 * croire à des essais qui n'existent plus.
 */
export function FormulaireCode({ challengeId }: { challengeId: string }) {
  const router = useRouter();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [restants, setRestants] = useState<number | null>(null);

  async function soumettre(evenement: FormEvent<HTMLFormElement>): Promise<void> {
    evenement.preventDefault();
    setErreur(null);
    setEnvoi(true);

    const code = champTexte(new FormData(evenement.currentTarget), 'code').trim();

    try {
      ouvrirSession(await validerCode(challengeId, code));
      router.push('/verification');
    } catch (cause) {
      if (cause instanceof ApiError) {
        setErreur(cause.message);
        const essais = cause.details?.essaisRestants;
        setRestants(typeof essais === 'number' ? essais : null);
      } else {
        setErreur('Une erreur est survenue. Réessayez dans un instant.');
      }
      setEnvoi(false);
    }
  }

  return (
    <form
      onSubmit={(evenement) => {
        void soumettre(evenement);
      }}
      noValidate
    >
      <p>
        <label htmlFor="code">Code à six chiffres</label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          autoFocus
        />
      </p>

      {erreur === null ? null : (
        <p role="alert" className="erreur">
          {erreur}
          {restants === null ? null : ` Il vous reste ${restants} essai${restants > 1 ? 's' : ''}.`}
        </p>
      )}

      <p>
        <button className="bouton" type="submit" disabled={envoi}>
          {envoi ? 'Vérification…' : 'Valider'}
        </button>
      </p>
    </form>
  );
}
