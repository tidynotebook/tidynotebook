/**
 * The one password policy of the product (record 0116).
 *
 * NIST SP 800-63B revision 4 sets the rule for a password that is the only
 * factor: a minimum of 15 characters, a maximum that allows a passphrase, no
 * composition rule, and no forced rotation. The server, the operator commands
 * and the web client read the bounds here, and the `Password` component of
 * the contract states the same bounds. A contract test fails when the two
 * differ, so no copy of the rule can drift.
 *
 * The rule applies when a password is set or changed. A password that an
 * earlier release accepted still signs in.
 */

/** The bounds of a new password, in characters. */
export const passwordBounds = {
  /** The minimum of revision 4 for a password that is the only factor. */
  minLength: 15,
  /** Long enough for a passphrase and for a paste from a password manager. */
  maxLength: 512,
} as const;

/** Why a new password is refused. */
export type PasswordProblem = 'too_short' | 'too_long';

/** Why a new password is refused, or `null` when it is accepted. */
export function passwordProblem(password: string): PasswordProblem | null {
  if (password.length < passwordBounds.minLength) return 'too_short';
  if (password.length > passwordBounds.maxLength) return 'too_long';
  return null;
}
