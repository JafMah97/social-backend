import js from '@eslint/js'
import parser from '@typescript-eslint/parser'
import plugin from '@typescript-eslint/eslint-plugin'
import path from 'path'

export default [
  {
    ignores: ['dist/**'],
    files: ['**/*.ts'],
    languageOptions: {
      parser,
      parserOptions: {
        project: './tsconfig.lint.json',
        tsconfigRootDir: path.resolve(),
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
      '@typescript-eslint/no-explicit-any': 'warn', // ✅ Add missing rule
    },
  },
  {
    ignores: ['dist/**'],
    files: ['**/*.js'],
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
