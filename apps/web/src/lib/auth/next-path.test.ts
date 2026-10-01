import { describe, expect, it } from 'vitest';
import { LANDING_PATH, safeNextPath } from './next-path';

/**
 * `safeNextPath` is an open-redirect check, and an open redirect on the admin login is worth
 * more to an attacker than it looks: a link to the panel's own hostname that lands on a
 * lookalike login form is exactly the phishing shape that ends in a real admin session.
 *
 * So the rejection cases below are the point of the file. The accept cases only exist to stop
 * someone "fixing" it by rejecting everything.
 */
describe('safeNextPath', () => {
  it('returns a same-origin path', () => {
    expect(safeNextPath('?next=%2Fzones')).toBe('/zones');
  });

  it('keeps the query string of the parked URL', () => {
    expect(safeNextPath('?next=%2Fzones%3Fstatus%3Dactive')).toBe('/zones?status=active');
  });

  it('tolerates a search string without the leading question mark', () => {
    expect(safeNextPath('next=%2Fzones')).toBe('/zones');
  });

  it('returns null when there is no next parameter', () => {
    expect(safeNextPath('')).toBeNull();
    expect(safeNextPath('?status=active')).toBeNull();
  });

  it('returns null for an empty next parameter', () => {
    expect(safeNextPath('?next=')).toBeNull();
  });

  it('rejects an absolute URL', () => {
    expect(safeNextPath('?next=https%3A%2F%2Fevil.com')).toBeNull();
  });

  it('rejects a protocol-relative URL', () => {
    // The one that gets past `startsWith('/')`. `//evil.com` is another host.
    expect(safeNextPath('?next=%2F%2Fevil.com')).toBeNull();
  });

  it('rejects a backslash-escaped protocol-relative URL', () => {
    // Browsers normalise the backslash to a forward slash, so this is `//evil.com` too.
    expect(safeNextPath('?next=%2F%5Cevil.com')).toBeNull();
  });

  it('rejects a path carrying control characters', () => {
    // A browser strips the tab before parsing, leaving `//evil.com`. Single-slashed here,
    // protocol-relative by the time it reaches the network.
    expect(safeNextPath('?next=%2F%09%2Fevil.com')).toBeNull();
    expect(safeNextPath('?next=%2F%0A%2Fevil.com')).toBeNull();
  });

  it('rejects a relative path with no leading slash', () => {
    expect(safeNextPath('?next=zones')).toBeNull();
  });

  it('rejects the login page itself', () => {
    // Otherwise signing in returns to the form that was just completed.
    expect(safeNextPath('?next=%2Flogin')).toBeNull();
    expect(safeNextPath('?next=%2Flogin%3Fnext%3D%2Fzones')).toBeNull();
  });

  it('does not reject a path that merely starts with the login segment', () => {
    expect(safeNextPath('?next=%2Flogins')).toBe('/logins');
  });
});

describe('LANDING_PATH', () => {
  it('is somewhere safeNextPath would itself accept', () => {
    // The invariant, not the value — this constant is expected to change when the dashboard
    // ships. What must not change is that the fallback destination is a same-origin path and
    // not the login screen, or signing in lands back on the form it just completed.
    expect(safeNextPath(`?next=${encodeURIComponent(LANDING_PATH)}`)).toBe(LANDING_PATH);
  });
});
