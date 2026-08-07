/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/*.spec.ts'],
  collectCoverageFrom: ['**/*.ts', '!**/index.ts'],
  coverageThreshold: {
    // Ce paquet ne contient que des règles pures : le seuil y est élevé.
    global: { branches: 90, functions: 90, lines: 90, statements: 90 },
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'CommonJS', isolatedModules: false } }],
  },
};
