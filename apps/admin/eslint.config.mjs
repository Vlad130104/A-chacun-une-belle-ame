import base from '@acuba/config/eslint';

export default [
  ...base,
  {
    files: ['**/*.tsx'],
    languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } },
  },
  {
    languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } },
  },
];
