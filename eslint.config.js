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
      
      // Unused variables and imports detection
      'no-unused-vars': 'off', // Turn off base rule in favor of TypeScript version
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: true,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_'
        }
      ],
      
      // Additional import/export rules for unused detection
      '@typescript-eslint/no-unused-expressions': 'warn',
      
      // TypeScript ESLint rules
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/'],
  },
] 