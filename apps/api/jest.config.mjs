const tsJest = ['ts-jest', { tsconfig: { module: 'CommonJS', isolatedModules: false } }];

/**
 * Deux projets distincts (docs/09-plan-de-tests.md §1) :
 *   - `unit`        : règles pures, sans infrastructure, exécution en secondes
 *   - `integration` : cas d'usage avec PostgreSQL et Redis éphémères
 */
/** @type {import('jest').Config} */
export default {
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: 'src',
      testMatch: ['**/*.spec.ts'],
      transform: { '^.+\\.ts$': tsJest },
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: 'test',
      testMatch: ['**/*.int-spec.ts'],
      transform: { '^.+\\.ts$': tsJest },
    },
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    // Le seuil porte sur les règles, pas sur une moyenne globale qui récompenserait
    // les tests d'infrastructure sans valeur (docs/09-plan-de-tests.md §1).
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};
