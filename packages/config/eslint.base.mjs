import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import acuba from './rules/todo-reference.mjs';

/**
 * Configuration ESLint partagée.
 *
 * Deux règles portent des exigences du cahier des charges et ne doivent pas être
 * assouplies sans décision explicite :
 *   - `@typescript-eslint/no-explicit-any` : `any` interdit sauf justification écrite
 *   - `acuba/todo-reference`               : aucun TODO silencieux
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
      },
    },
    plugins: { acuba },
    rules: {
      'acuba/todo-reference': 'error',

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-syntax': [
        'error',
        {
          // Les dates doivent être obtenues par ClockProvider : les tests de
          // conservation et de période de grâce avancent le temps au lieu de l'attendre.
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            "N'instanciez pas Date directement : injectez ClockProvider (voir docs/09-plan-de-tests.md §10).",
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/*.test.tsx', '**/seed/**', '**/scripts/**'],
    rules: {
      'no-console': 'off',
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  prettier,
);
