module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es6: true,
  },
  rules: {
    // Customize rules as needed
    'no-unused-vars': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn'],
    'semi': ['error', 'always'],
    'quotes': ['error', 'single'],
  },
};
