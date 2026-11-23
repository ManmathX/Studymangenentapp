// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const jestGlobals = Object.fromEntries(
  ['jest', 'describe', 'it', 'test', 'expect', 'beforeAll', 'beforeEach', 'afterAll', 'afterEach'].map((name) => [name, 'readonly']),
);

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['**/__tests__/**/*.js', 'jest.setup.js'],
    languageOptions: { globals: jestGlobals },
    // Tests reach into mocks (e.g. SecureStore.__reset) that the real module doesn't export.
    rules: { 'import/namespace': 'off' },
  },
]);
