// ESLint 9 flat config for the Expo app, aligned with the monorepo's ESLint 9
// setup. eslint-config-expo@8 is eslintrc-only and conflicts with ESLint 9.
// TODO(M1): adopt `eslint-config-expo/flat` once the app moves to Expo SDK 53+
// for React Native / Expo-specific lint rules.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      'web-build/**',
      'expo-env.d.ts',
      'babel.config.js',
      'metro.config.js',
      '*.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
