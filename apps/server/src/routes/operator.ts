/**
 * Handlers of the operator API (record 0190).
 *
 * A service of the operator reaches these operations with the operator token
 * and no session. The identity hook has checked the token before a handler
 * runs, so a handler maps validated input to one use case of
 * `@notesapp/core` and maps the result back. No handler here reads or writes
 * a note, a workspace or a published link, and the port of the use cases has
 * no method that could.
 */
import type { FastifyRequest } from 'fastify';
import {
  findOperatorAccount,
  listAccountEvents,
  readOperatorAccount,
  readOperatorTotals,
  redeemHandoff,
  removeOperatorAccount,
  setOperatorControls,
  type OperatorAccountRecord,
  type OperatorStore,
} from '@notesapp/core';
import { secretDigest } from '../auth/publication-secrets.ts';
import type { HandlerMap, HandlerResult } from '../plugins/register.ts';
import { unwrapDomain } from '../plugins/problem.ts';
import { readProperty } from '../values.ts';
import { controlsBody, controlsChangeOf } from './account-controls.ts';
import { readParameter, readString } from './accounts.ts';

/** Media type of every answer in this module. */
const jsonMediaType = 'application/json';

/** What the operator handlers need. */
export type OperatorDependencies = {
  readonly store: OperatorStore;
  readonly clock: () => Date;
};

/** The public shape of one account for the operator. */
function operatorAccountBody(
  record: OperatorAccountRecord,
): Record<string, unknown> {
  return {
    accountId: record.accountId,
    email: record.email,
    state: record.state,
    createdAt: record.createdAt,
    controls: controlsBody(record.controls),
    usage: {
      usedBytes: Number(record.usage.usedBytes),
      textBytes: Number(record.usage.textBytes),
      month: record.usage.month,
      publishedTransferBytes: Number(record.usage.publishedTransferBytes),
      downloadBytes: Number(record.usage.downloadBytes),
    },
  };
}

/** A validated query member that may be left out. */
function queryValue(request: FastifyRequest, key: string): unknown {
  return readProperty(request.query, key);
}

/** One account answer of the operator. */
function accountAnswer(record: OperatorAccountRecord): HandlerResult {
  return {
    status: 200,
    mediaType: jsonMediaType,
    body: operatorAccountBody(record),
  };
}

/** Builds the operator handlers. */
export function createOperatorHandlers(
  dependencies: OperatorDependencies,
): HandlerMap {
  const { store, clock } = dependencies;
  return {
    findOperatorAccount: async (request): Promise<HandlerResult> => {
      const address = queryValue(request, 'address');
      return accountAnswer(
        unwrapDomain(
          await findOperatorAccount(
            store,
            typeof address === 'string' ? address : '',
            clock(),
          ),
        ),
      );
    },

    readOperatorAccount: async (request): Promise<HandlerResult> =>
      accountAnswer(
        unwrapDomain(
          await readOperatorAccount(
            store,
            readParameter(request, 'accountId'),
            clock(),
          ),
        ),
      ),

    setOperatorAccountControls: async (request): Promise<HandlerResult> =>
      accountAnswer(
        unwrapDomain(
          await setOperatorControls(
            store,
            readParameter(request, 'accountId'),
            controlsChangeOf(request.body),
            clock(),
          ),
        ),
      ),

    removeOperatorAccount: async (request): Promise<HandlerResult> => {
      unwrapDomain(
        await removeOperatorAccount(store, readParameter(request, 'accountId')),
      );
      return { status: 200, mediaType: jsonMediaType, body: { removed: true } };
    },

    readOperatorTotals: async (request): Promise<HandlerResult> => {
      const month = queryValue(request, 'month');
      const totals = unwrapDomain(
        await readOperatorTotals(
          store,
          typeof month === 'string' ? month : null,
          clock(),
        ),
      );
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: {
          month: totals.month,
          publishedTransferBytes: Number(totals.publishedTransferBytes),
          downloadBytes: Number(totals.downloadBytes),
          objectWrites: Number(totals.objectWrites),
          objectReads: Number(totals.objectReads),
        },
      };
    },

    listOperatorAccountEvents: async (request): Promise<HandlerResult> => {
      const after = queryValue(request, 'after');
      const limit = queryValue(request, 'limit');
      const page = unwrapDomain(
        await listAccountEvents(
          store,
          typeof after === 'number' ? after : 0,
          typeof limit === 'number' ? limit : null,
        ),
      );
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: {
          events: page.events.map((event) => ({
            cursor: event.cursor,
            accountId: event.accountId,
            kind: event.kind,
            occurredAt: event.occurredAt,
          })),
          cursor: page.cursor,
        },
      };
    },

    redeemAccountHandoff: async (request): Promise<HandlerResult> => {
      const token = readString(request.body, 'token');
      const account = unwrapDomain(
        await redeemHandoff(store, secretDigest.digest(token)),
      );
      return {
        status: 200,
        mediaType: jsonMediaType,
        body: { accountId: account.accountId, email: account.email },
      };
    },
  };
}
