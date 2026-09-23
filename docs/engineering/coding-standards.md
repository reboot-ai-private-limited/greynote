# Coding Standards

## TypeScript

Strict mode, as configured in `packages/config/tsconfig.base.json`. Fix the code rather than
loosen the config when `tsc` complains about something that looks obviously fine — strict
optional/index-access settings catch real bugs more often than they produce false positives.

## Errors

Throw `AppError` (`shared/errors/AppError.ts`), never a bare `Error`, for anything that should
reach the HTTP layer as a specific status code. Use the static constructors
(`AppError.badRequest`, `.unauthenticated`, `.forbidden`, `.notFound`, `.conflict`,
`.internal`) rather than the constructor directly wherever one fits — they pin the status
code/fault-code pairing so it can't drift per call site.

**Two detail channels, and they are not interchangeable:**

- `publicDetails` — what the caller needs to act (which field was wrong). Returned in every
  environment.
- `details` — diagnostics for us. Logged always, stripped from production responses.

Putting a validation message in `details` looks fine in development and silently stops reaching
the client in production. Putting internal diagnostic info in `publicDetails` hands it to anyone
who can trigger the error.

Use `AppError.internal(code, details, cause)` for a violated invariant — something that should
be impossible given valid input — not for expected failure paths like "record not found." It
sets `isExpected: false`, which is what should eventually drive alerting.

## Money

**Not yet decided.** The ERD (`docs/erd/01-identity-hierarchy.md`, `09-payroll.md`,
`04-field-activity.md`) types every money field as `decimal` — `base_salary`, `da_amount`,
`Expense.amount`, `PayrollRun.net_payable` — which already rules out a JavaScript `number`/float
for storage or arithmetic (floats cannot represent currency exactly, and repeated addition across
a payroll run compounds the error). What's still open: whether that's Mongoose's `Decimal128`
end to end, or a fixed-precision integer-subunit convention the way `../driverzone` uses integer
paise (its `docs/decision-log.md` explains why float money specifically bit that project). Decide
this **before** Phase 1 (Identity's `PayBand.base_salary`) lands — it's expensive to change once
payroll math depends on it — and record the decision here and in `../decision-log.md`.

Until decided: never use a plain `number` for a money field in new code: prefer `Decimal128` (or
an equivalent fixed-precision type) so the eventual convention is a formatting/parsing change,
not a data migration.

## Naming

- Files: `camelCase.ts` for most things, `PascalCase.ts` for a file whose default export is a
  class matching that name (`AppError.ts`).
- Use cases: `<Verb><Noun>.usecase.ts`, one class per file, matching `health`'s
  `getHealth.usecases.ts` pattern (module-scoped, not shared across use cases).
- Ports: `<noun>.port.ts` in `domain/`, adapters `<adapterName>.adapter.ts` in `infrastructure/`.
- Module contract: always `<module>.public.ts`, exporting `<Module>PublicContract`.

## Comments

Explain **why**, not what — a hidden constraint, a subtle invariant, a workaround for a specific
bug. If the code is well-named enough that removing the comment wouldn't confuse a future reader,
don't write it. `AppError`'s doc comment is the model to follow: it explains the two-channel
detail split because that distinction is genuinely non-obvious, not what a constructor does.

## Logging

`pino` (`shared/logging/logger.ts`). Argument order is `logger.info({ data }, 'message')` — the
object first, the message second; getting it backwards logs the object as the message and drops
every field silently, so check this specifically in review.

Never log a raw credential, token, or anything PRD-sensitive (PII on a Doctor/Chemist record,
salary figures) without checking whether it needs `redact` — pino supports path-based redaction;
an ad hoc string-scrub is not equivalent and does not catch a field interpolated into a message.

## Commits

Prefix with the module or app touched, so `git log --oneline` stays navigable in a monorepo:

```
identity: block a 5th concurrent field-force session instead of evicting the oldest

PRD §2 requires an explicit "log out elsewhere first" prompt, not silent eviction — a
silently killed session mid-DCR-submission would look like the app crashed.

Refs: docs/hld/04-authentication-and-sessions.md
```

Not `fix stuff` or `wip`. The body explains **why**, same as a code comment would — the diff
already shows what changed.
