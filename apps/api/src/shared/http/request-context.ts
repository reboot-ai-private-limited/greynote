import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request state that every layer can read without being handed it.
 *
 * The alternative is threading a request ID through every use case, port and adapter signature
 * purely so the logger can print it — which pollutes the domain with a transport concern and
 * still fails the moment someone forgets. `AsyncLocalStorage` keeps the value attached to the
 * async execution context instead, so `logger.info(...)` deep inside a use case is correlated
 * without the use case knowing a request exists.
 *
 * Deliberately narrow. This is a correlation channel, not a place to smuggle the current user
 * or a database handle past the container — those are dependencies and belong in constructors,
 * where they can be substituted in a test.
 */
export interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with `context` visible to everything it awaits, transitively. */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * The current request's ID, or undefined outside one.
 *
 * Undefined is normal, not a bug: startup logs and the shutdown handler run with no context.
 * Callers must not assume a string.
 */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
