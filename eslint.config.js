const typescriptEslint = require('@typescript-eslint/eslint-plugin')
const tsParser = require('@typescript-eslint/parser')

module.exports = [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    rules: {
      // Base ESLint rules
      'prefer-const': 'error',
      'no-var': 'error',
      'semi': ['error', 'never'],
      
      // TypeScript ESLint rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/'],
  },
] 