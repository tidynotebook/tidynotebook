/**
 * The authentication protocol fragment of the contract.
 *
 * Better Auth implements these endpoints. The application still calls them
 * through generated operations, so their shapes must be part of the contract.
 * This module writes that fragment from the pinned Better Auth configuration
 * of `apps/server/src/auth/better-auth.ts`. It contacts no provider, reads no
 * secret, and produces the same bytes on every run, so `pnpm generated:check`
 * stays a byte comparison.
 *
 * Every operation here carries `x-notesapp-protocol: better-auth`. The runtime
 * operation index keeps that marker, and `apps/server/src/plugins/register.ts`
 * uses it twice: such an operation is not part of the one-handler-per-operation
 * check, and its route is served by the Better Auth handler through the exact
 * path list of that adapter instead of by a contract handler.
 *
 * Two Better Auth endpoints are deliberately absent: the provider callback and
 * the password reset link are browser navigation that answers with a redirect,
 * not calls that a generated client makes.
 *
 * Better Auth answers a failure with its own JSON body. The protocol adapter
 * rewrites that body into RFC 9457 problem details, so the fragment below
 * declares the same error shape as every other operation.
 */

import { protocolExtension } from './contract-index.ts';

/** Value of the protocol marker for the Better Auth endpoints. */
export const betterAuthProtocol = 'better-auth';

type Json = Record<string, unknown>;

const problem = (description: string): Json => ({
  description,
  content: {
    'application/problem+json': {
      schema: { $ref: '#/components/schemas/ProblemDetails' },
    },
  },
});

const json = (description: string, schema: Json): Json => ({
  description,
  content: { 'application/json': { schema } },
});

const body = (description: string, schema: Json): Json => ({
  description,
  required: true,
  content: { 'application/json': { schema } },
});

/** The failures that every protocol endpoint can answer with. */
const protocolFailures: Json = {
  '400': problem('The request did not match the endpoint.'),
  '401': problem('The credential was refused.'),
  '403': problem('The request did not come from the configured origin.'),
  '404': problem('The named record does not exist.'),
  '429': problem('Too many attempts. Try again later.'),
  '500': problem('The service failed to complete the request.'),
};

/** The failures of an endpoint that also accepts a request body. */
const bodyFailures: Json = {
  ...protocolFailures,
  '413': problem('The request body is larger than the configured limit.'),
  '415': problem('The request media type is not supported.'),
};

const operation = (input: {
  readonly id: string;
  readonly summary: string;
  readonly description: string;
  readonly requestBody?: Json;
  readonly success: Json;
  readonly successStatus?: string;
}): Json => ({
  operationId: input.id,
  summary: input.summary,
  description: input.description,
  tags: ['auth'],
  // Better Auth performs its own credential, origin, and Fetch Metadata
  // checks, so the identity hook of the boundary does not run for these
  // endpoints and the contract declares no security requirement.
  security: [],
  [protocolExtension]: betterAuthProtocol,
  ...(input.requestBody === undefined
    ? {}
    : { requestBody: input.requestBody }),
  responses: {
    [input.successStatus ?? '200']: input.success,
    ...(input.requestBody === undefined ? protocolFailures : bodyFailures),
  },
});

/** The signed in user as Better Auth reports it. */
const authUser: Json = {
  type: 'object',
  description: 'The signed in user as the identity provider reports it.',
  additionalProperties: true,
  required: ['id', 'email'],
  properties: {
    id: {
      type: 'string',
      readOnly: true,
      description: 'Identifier of the user inside the identity provider.',
      minLength: 1,
      maxLength: 128,
    },
    email: {
      type: 'string',
      readOnly: true,
      description: 'Sign-in address of the user.',
      maxLength: 320,
    },
    name: {
      type: 'string',
      readOnly: true,
      description: 'Display name of the user.',
      maxLength: 256,
    },
    emailVerified: {
      type: 'boolean',
      readOnly: true,
      description: 'Whether the provider reported the address as verified.',
    },
  },
};

/** Schemas that the fragment adds to the contract components. */
export function authContractSchemas(): Json {
  return {
    AuthUser: authUser,
    AuthSession: {
      type: 'object',
      description:
        'The result of a completed sign-in. It never carries the session ' +
        'token: the browser already holds that value in an HttpOnly cookie, ' +
        'and the protocol adapter removes it from this answer.',
      additionalProperties: true,
      required: ['redirect'],
      properties: {
        redirect: {
          type: 'boolean',
          readOnly: true,
          description: 'Whether the caller should follow a redirect.',
        },
        token: {
          not: {},
          description:
            'Never present. The adapter removes the session token from this answer.',
        },
        url: {
          type: 'string',
          readOnly: true,
          description: 'Address to open, when the answer asks for a redirect.',
          maxLength: 2048,
        },
        user: { $ref: '#/components/schemas/AuthUser' },
      },
    },
    AuthCurrentSession: {
      type: ['object', 'null'],
      description: 'The current session, or null when there is none.',
      additionalProperties: true,
      properties: {
        user: { $ref: '#/components/schemas/AuthUser' },
        session: { $ref: '#/components/schemas/AuthSessionRecord' },
      },
    },
    AuthSessionRecord: {
      type: 'object',
      description:
        'The stored session of the signed in user. It never carries the ' +
        'session token: the browser already holds that value in an HttpOnly ' +
        'cookie, and the protocol adapter removes it from this answer.',
      additionalProperties: true,
      required: ['id', 'expiresAt'],
      properties: {
        id: {
          type: 'string',
          readOnly: true,
          description: 'Identifier of the session record.',
          minLength: 1,
          maxLength: 128,
        },
        expiresAt: {
          type: 'string',
          readOnly: true,
          description: 'Instant after which the session is refused.',
          maxLength: 64,
        },
        token: {
          not: {},
          description:
            'Never present. The adapter removes the session token from this answer.',
        },
      },
    },
    AuthOutcome: {
      type: 'object',
      description: 'Whether the protocol endpoint completed its work.',
      additionalProperties: true,
      required: ['status'],
      properties: {
        status: {
          type: 'boolean',
          readOnly: true,
          description: 'True when the endpoint completed its work.',
        },
      },
    },
    AuthSignOutResult: {
      type: 'object',
      description: 'Whether the session was ended.',
      additionalProperties: true,
      required: ['success'],
      properties: {
        success: {
          type: 'boolean',
          readOnly: true,
          description: 'True when the session no longer exists.',
        },
      },
    },
    AuthPasswordSignIn: {
      type: 'object',
      description: 'Address and password of a local account.',
      additionalProperties: false,
      required: ['email', 'password'],
      properties: {
        email: {
          type: 'string',
          description: 'Sign-in address of the account.',
          format: 'email',
          minLength: 3,
          maxLength: 320,
        },
        password: {
          type: 'string',
          description: 'Password of the account.',
          minLength: 1,
          maxLength: 512,
        },
        rememberMe: {
          type: 'boolean',
          description: 'Whether the session survives a browser restart.',
        },
        callbackURL: {
          type: 'string',
          description: 'Address to open after a completed sign-in.',
          maxLength: 2048,
        },
      },
    },
    AuthSignOut: {
      type: 'object',
      description: 'Sign-out carries no data. The session cookie names it.',
      additionalProperties: false,
      properties: {},
    },
    AuthPasswordResetRequest: {
      type: 'object',
      description: 'The address that asks for a password reset message.',
      additionalProperties: false,
      required: ['email'],
      properties: {
        email: {
          type: 'string',
          description: 'Sign-in address of the account.',
          format: 'email',
          minLength: 3,
          maxLength: 320,
        },
        redirectTo: {
          type: 'string',
          description: 'Address that the reset link opens.',
          maxLength: 2048,
        },
      },
    },
    AuthPasswordReset: {
      type: 'object',
      description: 'The new password and the token from the reset message.',
      additionalProperties: false,
      required: ['newPassword'],
      properties: {
        // The one component of a new password, which the root document
        // states, so the reset takes the bounds of every other new password
        // (record 0116).
        newPassword: {
          allOf: [{ $ref: '#/components/schemas/Password' }],
          description: 'New password of the account.',
        },
        token: {
          type: 'string',
          description: 'Token from the reset message.',
          minLength: 1,
          maxLength: 512,
        },
      },
    },
  };
}

/** Path items that the fragment adds to the contract paths. */
export function authContractPaths(): Json {
  return {
    '/api/auth/sign-in/email': {
      post: operation({
        id: 'signInWithPassword',
        summary: 'Sign in with an address and a password.',
        description:
          'Checks a local password and sets the Secure HttpOnly session ' +
          'cookie. Public registration is disabled, so this endpoint never ' +
          'creates an account.',
        requestBody: body('Address and password of a local account.', {
          $ref: '#/components/schemas/AuthPasswordSignIn',
        }),
        success: json('The sign-in completed.', {
          $ref: '#/components/schemas/AuthSession',
        }),
      }),
    },
    '/api/auth/sign-out': {
      post: operation({
        id: 'signOut',
        summary: 'End the current session.',
        description:
          'Removes the session on the server and clears the session cookie. ' +
          'A cleared session cannot be used again.',
        requestBody: body('Sign-out carries no data.', {
          $ref: '#/components/schemas/AuthSignOut',
        }),
        success: json('The session ended.', {
          $ref: '#/components/schemas/AuthSignOutResult',
        }),
      }),
    },
    '/api/auth/get-session': {
      get: operation({
        id: 'getAuthSession',
        summary: 'Report the current session.',
        description:
          'Reports the session that the request cookie names, or null when ' +
          'there is none.',
        success: json('The current session, or null.', {
          $ref: '#/components/schemas/AuthCurrentSession',
        }),
      }),
    },
    '/api/auth/request-password-reset': {
      post: operation({
        id: 'requestPasswordReset',
        summary: 'Ask for a password reset message.',
        description:
          'Sends a reset link to the address when a mail transport is ' +
          'configured. A deployment without one uses the operator recovery ' +
          'command instead. The answer never says whether the address exists.',
        requestBody: body('The address that asks for a reset message.', {
          $ref: '#/components/schemas/AuthPasswordResetRequest',
        }),
        success: json('The request was accepted.', {
          $ref: '#/components/schemas/AuthOutcome',
        }),
      }),
    },
    '/api/auth/reset-password': {
      post: operation({
        id: 'resetPassword',
        summary: 'Choose a new password with a reset token.',
        description:
          'Sets a new password and revokes every session of the account. The ' +
          'token works once and expires one hour after it was created.',
        requestBody: body('The new password and the reset token.', {
          $ref: '#/components/schemas/AuthPasswordReset',
        }),
        success: json('The password was replaced.', {
          $ref: '#/components/schemas/AuthOutcome',
        }),
      }),
    },
  };
}

/**
 * Merges the fragment into a contract document.
 *
 * The document keeps its own references, so the merged result is still the
 * source form that the client generator reads. A path or a schema name that
 * already exists is a defect and stops generation.
 */
export function mergeAuthContract(document: Json): Json {
  const paths: Json = { ...(asRecord(document.paths) ?? {}) };
  const components: Json = { ...(asRecord(document.components) ?? {}) };
  const schemas: Json = { ...(asRecord(components.schemas) ?? {}) };
  for (const [path, item] of Object.entries(authContractPaths())) {
    if (path in paths)
      throw new Error(`Auth contract: the path ${path} is already declared.`);
    paths[path] = item;
  }
  for (const [name, schema] of Object.entries(authContractSchemas())) {
    if (name in schemas)
      throw new Error(`Auth contract: the schema ${name} is already declared.`);
    schemas[name] = schema;
  }
  return {
    ...document,
    paths: sorted(paths),
    components: { ...components, schemas: sorted(schemas) },
  };
}

function asRecord(value: unknown): Json | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return null;
  return Object.fromEntries(Object.entries(value));
}

/** Sorts keys, so the merged document is byte stable. */
function sorted(value: Json): Json {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => (left < right ? -1 : 1)),
  );
}
