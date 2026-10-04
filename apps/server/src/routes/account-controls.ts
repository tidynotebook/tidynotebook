/**
 * The controls of an account at the boundary (record 0189).
 *
 * The account of a person, the accounts page of an administrator and the
 * operator API answer the controls in one shape, and an administrator and
 * the operator write them in one shape. This module turns the one into the
 * other, so the three operations cannot drift apart.
 */
import type { AccountControls, ControlsChange } from '@notesapp/core';
import { readProperty } from '../values.ts';
import { RequestContractError } from '../plugins/problem.ts';

/** A byte count as a JSON number. The contract bounds it to a safe integer. */
function byteNumber(value: bigint): number {
  return Number(value);
}

/** A limit as a JSON number, or `null` for no limit. */
function limitNumber(value: bigint | null): number | null {
  return value === null ? null : Number(value);
}

/** The public shape of the controls of one account. */
export function controlsBody(
  controls: AccountControls,
): Record<string, unknown> {
  return {
    revision: controls.revision,
    standing: controls.standing,
    removalAt: controls.removalAt,
    limitBytes: byteNumber(controls.limitBytes),
    textLimitBytes: limitNumber(controls.textLimitBytes),
    publishedTransferLimitBytes: limitNumber(
      controls.publishedTransferLimitBytes,
    ),
    downloadLimitBytes: limitNumber(controls.downloadLimitBytes),
    features: {
      teams: controls.features.teams,
      collaboration: controls.features.collaboration,
    },
  };
}

/** A member that is absent, a limit, or `null` for no limit. */
function limitMember(body: unknown, key: string): bigint | null | undefined {
  const value = readProperty(body, key);
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number' && Number.isSafeInteger(value))
    return BigInt(value);
  throw new RequestContractError('body', [
    { path: `/${key}`, message: 'name a whole number of bytes or null' },
  ]);
}

/** A boolean member that is absent or present. */
function switchMember(body: unknown, key: string): boolean | undefined {
  const value = readProperty(body, key);
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * One change of the controls from a validated `AccountControlsInput`.
 *
 * The contract validated the shape, so a member is absent or of its type.
 * The use case decides the values.
 */
export function controlsChangeOf(body: unknown): ControlsChange {
  const revision = readProperty(body, 'revision');
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision))
    throw new RequestContractError('body', [
      { path: '/revision', message: 'name the revision that you read' },
    ]);
  const standing = readProperty(body, 'standing');
  const removalAt = readProperty(body, 'removalAt');
  const limit = limitMember(body, 'limitBytes');
  const features = readProperty(body, 'features');
  return {
    revision,
    ...(typeof standing === 'string' ? { standing } : {}),
    ...(removalAt === null || typeof removalAt === 'string'
      ? { removalAt }
      : {}),
    ...(limit === undefined || limit === null ? {} : { limitBytes: limit }),
    textLimitBytes: limitMember(body, 'textLimitBytes'),
    publishedTransferLimitBytes: limitMember(
      body,
      'publishedTransferLimitBytes',
    ),
    downloadLimitBytes: limitMember(body, 'downloadLimitBytes'),
    ...(features === undefined
      ? {}
      : {
          features: {
            teams: switchMember(features, 'teams'),
            collaboration: switchMember(features, 'collaboration'),
          },
        }),
  };
}
