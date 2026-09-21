module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    // Notice we add 'prettier' at the end! This turns off conflicting ESLint rules.
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
    env: { node: true, es2022: true },
    rules: {
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'eqeqeq': ['error', 'always', { null: 'ignore' }],
        'no-console': ['warn', { allow: ['warn', 'error'] }]
    },
    ignorePatterns: ['dist', 'node_modules', '*.config.js']
};
