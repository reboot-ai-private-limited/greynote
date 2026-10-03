/**
 * What every form's pure builder returns: a request body, or a message per field. Builders live in
 * a feature's `lib/` and are tested without a browser.
 */
export type BuildResult<T> = { ok: true; body: T } | { ok: false; errors: Record<string, string> };

/** Drops the fields with no error and returns a failed result. */
export function fail(errors: Record<string, string | undefined>): { ok: false; errors: Record<string, string> } {
  return { ok: false, errors: Object.fromEntries(Object.entries(errors).filter((e): e is [string, string] => e[1] !== undefined)) };
}

/** Trim and collapse inner whitespace, as the server does: "Dr  A. Rao" must equal "Dr A. Rao". */
export function squash(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}
