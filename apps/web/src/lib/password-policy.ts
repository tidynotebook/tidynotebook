/**
 * The words of the one password policy of this product.
 *
 * Every screen that sets a new password reads the rule here: first-run
 * setup, an accepted invitation, and the publish dialog, which guards a
 * published link. The bounds come from `passwordBounds` of `@notesapp/core`,
 * which the server and the contract state too (record 0116).
 *
 * The rule is stated under a field from the start, and the refusal names the
 * same rule in the same words, so nobody learns a requirement from a failure.
 */

import {
  passwordBounds,
  passwordProblem as boundsProblem,
} from '@notesapp/core';

/** The shortest password that the server accepts. */
export const minPasswordLength: number = passwordBounds.minLength;

/**
 * The longest password that the server accepts.
 *
 * A person does not reach this bound by typing, but a paste from a password
 * manager can. The screen states it here rather than letting the server
 * answer a refusal that names no rule.
 */
export const maxPasswordLength: number = passwordBounds.maxLength;

/** The rule of a password field, stated before anything is submitted. */
export const passwordRule = `Use at least ${String(minPasswordLength)} characters.`;

/**
 * States why a password is refused, or `null` when it is accepted.
 *
 * The caller decides whether an empty value reaches this function. A field
 * that needs a password calls it with every value, and a field that treats an
 * empty value as "no password" calls {@link optionalPasswordProblem}.
 */
export function passwordProblem(password: string): string | null {
  const problem = boundsProblem(password);
  if (problem === 'too_short') return 'This password is too short.';
  if (problem === 'too_long') return 'This password is too long.';
  return null;
}

/**
 * The same rule for a field where an empty value means no password.
 *
 * The publish dialog offers a link that opens without a password, so an empty
 * field is an answer there and not an omission.
 */
export function optionalPasswordProblem(password: string): string | null {
  return password === '' ? null : passwordProblem(password);
}
