/**
 * The `?next=` return path — where the panel gate parks the URL an anonymous user was asking
 * for, and where the login screen goes once they are through.
 *
 * Deliberately React-free. This is the one piece of the auth gate with a security property
 * worth testing, and the vitest config here is node-env with no DOM (vitest.config.ts).
 */

/**
 * The screen a user lands on with no more specific destination: after login, after a 404, and
 * from `/` itself. ONE constant imported by all three, so changing it cannot leave one behind.
 */
export const LANDING_PATH = '/dashboard';

/**
 * Tab, newline, carriage return and friends. See the note in `safeNextPath`.
 *
 * A char-code scan rather than a regex because the regex form is a character class full of
 * control characters, which `no-control-regex` rejects — the rule is right that they are almost
 * always a typo, and silencing it here would silence it for the next person's typo too.
 */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Read `next` out of a query string, returning it only if jumping there is safe.
 *
 * This is an open-redirect check, so it is an allow-list of "a path on this origin" rather than
 * a list of the bad shapes. The ones that get past a naive `startsWith('/')`:
 *
 * - `//evil.com` and `/\evil.com` are PROTOCOL-RELATIVE. Both start with a slash and both send
 *   the browser to another host.
 * - `/\t/evil.com` — browsers strip tab, newline and carriage return from a URL before parsing
 *   it, so a value that looks single-slashed here arrives at the network as `//evil.com`.
 *
 * @param search a location search string, with or without the leading `?`
 */
export function safeNextPath(search: string): string | null {
  const raw = new URLSearchParams(search).get('next');
  if (raw === null || raw === '') return null;

  // Before any shape check — the stripping happens in the browser, not here, so a value
  // carrying control characters is not the value that would actually be navigated to.
  if (hasControlChar(raw)) return null;

  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;

  // `/login?next=/login` is a redirect loop, not a destination.
  const [pathname = ''] = raw.split(/[?#]/);
  if (pathname === '/login') return null;

  return raw;
}

/** The URL to hand to `next` when turning an anonymous visitor away. Client-only. */
export function currentPath(): string {
  return window.location.pathname + window.location.search;
}

/** `/login` carrying the current URL as its return path. Client-only. */
export function loginPathFromHere(): string {
  return `/login?next=${encodeURIComponent(currentPath())}`;
}

/** Where to send a user who has just authenticated. Client-only. */
export function destinationAfterLogin(): string {
  return safeNextPath(window.location.search) ?? LANDING_PATH;
}
