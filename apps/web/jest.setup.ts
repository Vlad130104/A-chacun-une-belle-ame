import '@testing-library/jest-dom';

/**
 * Routeur de test.
 *
 * Les composants clients appellent `useRouter()` ; hors application Next, le
 * routeur n'est pas monté et le rendu échoue. La doublure enregistre les
 * navigations pour que les tests puissent vérifier OÙ le parcours emmène la
 * personne — c'est une assertion utile, pas seulement un contournement.
 */
export const navigations: string[] = [];

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: (chemin: string) => {
      navigations.push(chemin);
    },
    replace: (chemin: string) => {
      navigations.push(chemin);
    },
    back: () => undefined,
    refresh: () => undefined,
    prefetch: () => undefined,
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

beforeEach(() => {
  navigations.length = 0;
});
