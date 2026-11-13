module.exports = {
  root: true,
  extends: 'airbnb-base',
  env: {
    browser: true,
  },
  parser: '@babel/eslint-parser',
  parserOptions: {
    allowImportExportEverywhere: true,
    sourceType: 'module',
    requireConfigFile: false,
  },
  overrides: [{
    files: ['services/search/**/*.mjs'],
    env: { node: true, browser: false, es2022: true },
    globals: { fetch: 'readonly', Response: 'readonly' },
    rules: {
      'import/extensions': ['error', { js: 'always', mjs: 'always' }],
    },
  }],
  rules: {
    'import/extensions': ['error', { js: 'always' }], // require js file extensions in imports
    'linebreak-style': ['error', 'unix'], // enforce unix linebreaks
    'no-param-reassign': [2, { props: false }], // allow modifying properties of param
  },
};
