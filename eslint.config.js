module.exports = [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
    },
    rules: {
      // Customize rules as needed
      'no-unused-vars': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn'],
      'semi': ['error', 'always'],
      'quotes': ['error', 'single'],
    },
  },
];
