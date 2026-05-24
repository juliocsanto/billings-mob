import js from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

/** @type {import("eslint").Linter.Config[]} */
export default [
  // Ignora artefatos de build e dependências
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },

  // Base JS recomendado
  js.configs.recommended,

  // Configuração para arquivos JS/JSX do projeto
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // React
      ...reactPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',   // Desnecessário com React 17+
      'react/prop-types': 'warn',           // Warn (sem TypeScript ainda)
      'react/jsx-no-target-blank': 'error', // Segurança: rel="noopener noreferrer"
      'react/no-danger': 'error',           // Previne XSS via dangerouslySetInnerHTML

      // React Hooks
      ...reactHooksPlugin.configs.recommended.rules,

      // Qualidade geral
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-debugger': 'error',
      'eqeqeq': ['error', 'always'],

      // Segurança básica (OWASP A03 — sem eval/injection)
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },

  // Configuração para arquivos de config na raiz
  {
    files: ['*.config.{js,mjs}', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
