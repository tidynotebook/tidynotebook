/**
 * What the Sessions section of Settings says about one session (record 0122).
 *
 * A person reads a device and a time, and not an identifier or a user agent
 * string. The name comes from the user agent that the browser sent at sign
 * in, so it is a hint and not a proof: the section says which device it
 * probably is, and the current one is marked from the server.
 */
import type { AccountSession } from '@notesapp/api-client';
import { relativeTime } from './relative-time.ts';

/** The browser families a name can state, the most specific first. */
const browsers: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\b(?:OPR|Opera)\//, 'Opera'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

/** The systems a name can state, the most specific first. */
const systems: readonly (readonly [RegExp, string])[] = [
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMac OS X\b|\bMacintosh\b/, 'macOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bLinux\b/, 'Linux'],
];

function firstMatch(
  text: string,
  table: readonly (readonly [RegExp, string])[],
): string | null {
  for (const [pattern, name] of table) if (pattern.test(text)) return name;
  return null;
}

/** The device of a session in words, for example `Firefox on Linux`. */
export function deviceName(userAgent: string | null): string {
  const text = userAgent ?? '';
  const browser = firstMatch(text, browsers);
  const system = firstMatch(text, systems);
  if (browser !== null && system !== null) return `${browser} on ${system}`;
  if (browser !== null) return browser;
  if (system !== null) return `A browser on ${system}`;
  return 'An unknown device';
}

/** The facts of one session row, in the order that a person reads them. */
export function sessionFacts(session: AccountSession, now: number): string[] {
  const facts: string[] = [];
  if (session.current) facts.push('This device');
  else facts.push(`Active ${relativeTime(session.lastActiveAt, now)}`);
  facts.push(`Signed in ${relativeTime(session.createdAt, now)}`);
  return facts;
}

/** The notice after the other sessions end, with a whole phrase for a count. */
export function otherSessionsEndedText(revoked: number): string {
  if (revoked === 0) return 'No other device was signed in.';
  if (revoked === 1) return '1 other device is signed out.';
  return `${String(revoked)} other devices are signed out.`;
}
