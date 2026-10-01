/**
 * Flat ESLint config for React workspaces (apps/web). Extends the base: same TypeScript rules,
 * applied to .tsx as well, plus the React rules that catch real bugs.
 *
 * `exhaustive-deps` and `no-array-index-key` are errors, not warnings: a stale closure or an
 * index key renders fine in dev and corrupts state in production.
 */
const base = require('./eslint.base.cjs');
const reactHooks = require('eslint-plugin-react-hooks');
const jsxA11y = require('eslint-plugin-jsx-a11y');
const globals = require('globals');

// The base's TypeScript block, re-targeted at .ts AND .tsx with browser globals.
const tsBlock = base.find((c) => c.files && c.files.includes('**/*.ts'));

module.exports = [
  ...base.filter((c) => c !== tsBlock),
  {
    ...tsBlock,
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ...tsBlock.languageOptions,
      parserOptions: { ...tsBlock.languageOptions.parserOptions, ecmaFeatures: { jsx: true } },
      // `process.env.NEXT_PUBLIC_*` is inlined by Next at build time, so `process` is safe.
      // `google` is the Maps JavaScript API namespace (types from @types/google.maps).
      globals: { ...globals.browser, ...globals.es2022, process: 'readonly', google: 'readonly' },
    },
  },
  {
    files: ['**/*.tsx', '**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    files: ['**/*.tsx'],
    ...jsxA11y.flatConfigs.recommended,
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // `role` on our own components is a user role (e.g. <SideNav role="ADMIN" />), not an ARIA role.
      'jsx-a11y/aria-role': ['error', { ignoreNonDOM: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='key'] Identifier[name=/^(i|idx|index)$/]",
          message: 'Do not use the array index as a React key.',
        },
      ],
    },
  },
  { ignores: ['**/.next/**'] },
];
