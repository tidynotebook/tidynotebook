/**
 * Ajv 2020-12 validators for every request slot and every declared response.
 *
 * The contract data is generated; this module is not. It compiles the schemas
 * of `src/generated/contract.ts` once when it loads, so a validator lookup at
 * run time is a map read.
 *
 * The generated index states each schema through `$ref` pointers into one
 * shared definition document, so a schema that many operations share is
 * written once. That document is registered with both Ajv instances below,
 * which is what lets a slot schema resolve its pointers.
 *
 * A schema that two slots share compiles once. The compiled validators are
 * cached by the exact text of the schema they came from, so the 434 slots and
 * responses of the contract compile only their 67 distinct schemas. A cached
 * validator is safe to share: a caller reads `validate.errors` in the same
 * synchronous step that called `validate`.
 *
 * Standalone code output was not used because the emitted module is
 * JavaScript, and this package compiles and publishes TypeScript sources
 * through its declaration build.
 */
import type { ValidateFunction } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import ajvFormats from 'ajv-formats';

import type {
  ChannelId,
  JsonSchema,
  MessageDirection,
  OperationId,
} from './generated/contract.ts';
import {
  channels,
  operations,
  sharedDefinitions,
} from './generated/contract.ts';

export type RequestSlot = 'params' | 'query' | 'headers' | 'body';

const ajv = new Ajv2020({ allErrors: false, strict: true });
// Ajv formats ships CommonJS. Node binds a default import to `module.exports`,
// so the plugin function is reached through its `default` member.
ajvFormats.default(ajv);
ajv.addSchema(sharedDefinitions);

/**
 * The validator of the query and the path slots, which converts as well as
 * checks.
 *
 * A query value and a path segment arrive as text on the wire. OpenAPI
 * parameter serialization describes how that text maps to the declared type,
 * so this is the one place that performs the conversion, and a handler then
 * reads a number where the contract declares one, such as the number of a
 * part of an import (record 0192). The body and the header validators never
 * convert: a JSON body already carries typed values, and accepting the string
 * "1" where a number is declared would hide a client defect.
 */
const ajvQuery = new Ajv2020({
  allErrors: false,
  strict: true,
  coerceTypes: true,
});
ajvFormats.default(ajvQuery);
ajvQuery.addSchema(sharedDefinitions);

/** Key of a request validator. */
export function requestKey(id: OperationId, slot: RequestSlot): string {
  return `${id}:${slot}`;
}

/** Key of a response validator. */
export function responseKey(
  id: OperationId,
  status: number,
  mediaType: string,
): string {
  return `${id}:${String(status)}:${mediaType}`;
}

/** Key of a message validator. */
export function messageKey(
  channel: ChannelId,
  direction: MessageDirection,
  kind: string,
): string {
  return `${channel}:${direction}:${kind}`;
}

const requests = new Map<string, ValidateFunction>();
const responses = new Map<string, ValidateFunction>();
const messages = new Map<string, ValidateFunction>();

/**
 * One compiled validator per distinct schema of one Ajv instance.
 *
 * The key is the exact JSON text of the schema. Two slots that share a schema
 * share the object the generator emitted, so the text is equal exactly when
 * the schema is the same schema.
 */
const compiled = new Map<Ajv2020, Map<string, ValidateFunction>>([
  [ajv, new Map()],
  [ajvQuery, new Map()],
]);

/** Compiles a schema, or returns the validator this instance already built. */
function validatorFor(instance: Ajv2020, schema: JsonSchema): ValidateFunction {
  const cache = compiled.get(instance);
  if (cache === undefined)
    throw new Error('An unknown Ajv instance asked for a validator.');
  const digest = JSON.stringify(schema);
  const cached = cache.get(digest);
  if (cached !== undefined) return cached;
  const validate = instance.compile(schema);
  cache.set(digest, validate);
  return validate;
}

for (const operation of operations) {
  const slots: readonly (readonly [RequestSlot, JsonSchema | null])[] = [
    ['params', operation.request.params],
    ['query', operation.request.query],
    ['headers', operation.request.headers],
    ['body', operation.request.body],
  ];
  for (const [slot, schema] of slots) {
    if (schema === null) continue;
    const instance = slot === 'query' || slot === 'params' ? ajvQuery : ajv;
    requests.set(
      requestKey(operation.id, slot),
      validatorFor(instance, schema),
    );
  }
  for (const response of operation.responses) {
    responses.set(
      responseKey(operation.id, response.status, response.mediaType),
      validatorFor(ajv, response.schema),
    );
  }
}

// A WebSocket message is validated like a body: it arrives as JSON, so no
// value is converted (record 0126).
for (const channel of channels)
  for (const message of channel.messages)
    messages.set(
      messageKey(channel.id, message.direction, message.kind),
      validatorFor(ajv, message.schema),
    );

/** Compiled message validators, keyed by messageKey. */
export const messageValidators: ReadonlyMap<string, ValidateFunction> =
  messages;

/** Compiled request validators, keyed by requestKey. */
export const requestValidators: ReadonlyMap<string, ValidateFunction> =
  requests;

/** Compiled response validators, keyed by responseKey. */
export const responseValidators: ReadonlyMap<string, ValidateFunction> =
  responses;

/**
 * How many schemas were compiled, and how many validators they serve.
 *
 * The two numbers prove the cache works: `validators` counts every slot and
 * every declared response, and `schemas` counts the compilations they needed.
 */
export const compileCounts: {
  readonly schemas: number;
  readonly validators: number;
} = {
  schemas: (compiled.get(ajv)?.size ?? 0) + (compiled.get(ajvQuery)?.size ?? 0),
  validators: requests.size + responses.size + messages.size,
};
