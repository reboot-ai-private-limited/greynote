/**
 * Shared flat ESLint config for every workspace package.
 *
 * Deliberately small. The architectural rules that matter live in
 * `apps/api/.dependency-cruiser.cjs`, because they are properties of the resolved dependency
 * GRAPH and ESLint can only see one import string at a time — see
 * docs/hld/03-system-architecture.md for why both exist.
 *
 * Flat config, not `.eslintrc.*`: ESLint 10 (root `package.json`) no longer reads the legacy
 * format at all, so this exports an array of flat config objects rather than the old
 * `{ extends, env, ... }` shape.
 */
const js = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
    js.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
            globals: { ...globals.node, ...globals.es2022 },
        },
        plugins: { '@typescript-eslint': tsPlugin },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

            /*
             * `import type` must be spelled as such. tsconfig sets verbatimModuleSyntax, so a
             * value import of a type-only symbol is an ERROR at build time rather than a
             * nuisance — this rule surfaces it in the editor instead of in CI.
             */
            '@typescript-eslint/consistent-type-imports': [
                'error',
                { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
            ],

            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'no-console': ['warn', { allow: ['warn', 'error'] }],
        },
    },
    prettier,
    { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.config.js'] },
];
