import base from '@greynote/config/eslint.base.cjs';

/**
 * ESLint is the fast echo of the module boundary; `.dependency-cruiser.cjs` is the authority.
 *
 * `no-restricted-imports` matches the literal source STRING, so it can only catch the aliased
 * spelling of a cross-module reach. It cannot see a relative escape (`../../identity/domain/x.js`)
 * and it cannot see a cycle at all. It stays because it flags the common case in the editor,
 * seconds after you type it, rather than minutes later in CI.
 */
export default [
  ...base,
  {
    files: ['src/**/*.ts'],
    rules: {
      /**
       * Log messages must be static strings; data goes in the object argument.
       *
       * This is a REDACTION rule, not a style rule. pino's `redact` matches object paths —
       * it cannot see inside a string, so `logger.info(`otp ${otp} sent`)` defeats every
       * path in the list and writes the value to stdout anyway. Enforcing static messages
       * closes the one hole path-based redaction cannot.
       *
       *   bad:   logger.info(`${event} received`)
       *   good:  logger.info({ event }, 'event received')
       */
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='logger'][arguments.0.type='TemplateLiteral'][arguments.0.expressions.length>0]",
          message:
            'Log messages must be static — pino redaction cannot see inside a string. ' +
            "Put the value in the object argument: logger.info({ value }, 'message').",
        },
        {
          selector:
            "CallExpression[callee.object.name='logger'][arguments.0.type='BinaryExpression'][arguments.0.operator='+']",
          message:
            'Log messages must be static — pino redaction cannot see inside a string. ' +
            'Put the value in the object argument.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/modules/*/domain/*',
                '@/modules/*/application/*',
                '@/modules/*/infrastructure/*',
                '@/modules/*/interface/*',
                '@/modules/*/*.container*',
              ],
              message:
                "A module's internals are private. Import its '<name>.public.js' contract " +
                'instead — see docs/hld/03-system-architecture.md.',
            },
          ],
        },
      ],
    },
  },
  {
    /*
     * `src/container.ts` is the composition root — building every module container and
     * wiring contracts between them IS its job. `src/app.ts`/`server.ts` bootstrap it.
     * `src/scripts/seed.ts` is a SECOND composition root (docs/engineering/module-anatomy.md's
     * "a worker process, a script" case) — it builds the same containers `container.ts` does,
     * just to run their seed methods instead of serving HTTP.
     *
     * Every other `src/scripts/` file is the same kind of standalone process (seeds, migrations, one-off reports), and a
     * migration has to read a module's raw collection through its schema. Nothing in `src/modules/` or `src/shared/` may
     * import a script (dependency-cruiser's `scripts-are-entry-points`), so the exemption cannot leak into the app.
     *
     * `src/routes.ts` is deliberately NOT exempted: it only mounts routers it's handed and
     * needs no module internals, so the boundary rule keeps watching the file most likely
     * to grow a shortcut.
     */
    files: ['src/container.ts', 'src/app.ts', 'src/server.ts', 'src/worker.ts', 'src/scripts/**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
];
