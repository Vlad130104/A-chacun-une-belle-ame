import base from '@acuba/config/eslint';

export default [
  ...base,
  {
    languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } },
  },
];
