// eslint.config.js
import js from '@eslint/js'
import parser from '@typescript-eslint/parser'
import plugin from '@typescript-eslint/eslint-plugin'

export default [
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
      globals: {
        process: true,
        console: true,
      },
    },
    plugins: {
      '@typescript-eslint': plugin,
    },
    rules: {
      ...plugin.configs.recommended.rules,
      'no-console': 'off',
      'no-unused-vars': 'warn',
    },
  },
  {
    plugins: {
      js,
    },
    languageOptions: {
      globals: {
        process: true,
        console: true,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
]
