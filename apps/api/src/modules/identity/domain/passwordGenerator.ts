import { randomInt } from 'node:crypto';

/** No 0/O, 1/l/I: the password is read out or typed from a message. */
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALL = LOWER + UPPER + DIGITS;

const pick = (chars: string): string => chars.charAt(randomInt(chars.length));

/** A random password of `length` characters (at least 8) with at least one lower-case, upper-case and digit. */
export function generatePassword(length = 12): string {
  const size = Math.max(8, length);
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS)];
  while (chars.length < size) chars.push(pick(ALL));
  // Fisher–Yates, so the three guaranteed characters are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join('');
}
