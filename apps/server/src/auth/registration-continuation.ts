/**
 * Server-only Better Auth calls for one browser's registration continuation.
 * The verification link keeps its existing format and idempotence. A separate
 * short-lived cookie proves that this browser also started this exact signup.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  createAuthEndpoint,
  getSessionFromCtx,
  isAPIError,
} from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import type { BetterAuthPlugin } from 'better-auth';

export const registrationContinuationSeconds = 15 * 60;

/** These headers are set by the trusted caller, never read from the client. */
export const pendingRegistrationUserHeader =
  'x-notesapp-pending-registration-user';
export const verifiedRegistrationUserHeader =
  'x-notesapp-verified-registration-user';

function identifierOf(proof: string): string {
  return `notesapp-registration:${createHash('sha256').update(proof).digest('hex')}`;
}

/** No URL is assigned to these endpoints, so only the server API can call them. */
export function registrationContinuationPlugin() {
  return {
    id: 'notesapp-registration-continuation',
    endpoints: {
      beginRegistrationContinuation: createAuthEndpoint(
        { method: 'POST' },
        async (ctx) => {
          const proof = randomBytes(32).toString('base64url');
          const cookie = ctx.context.createAuthCookie(
            'registration_continuation',
            {
              maxAge: registrationContinuationSeconds,
              httpOnly: true,
              sameSite: 'lax',
              path: '/',
            },
          );
          // Every accepted signup, including a known address, does the same
          // storage and cookie work. The public answer cannot expose existence.
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: identifierOf(proof),
            value: ctx.headers?.get(pendingRegistrationUserHeader) ?? '',
            expiresAt: new Date(
              Date.now() + registrationContinuationSeconds * 1000,
            ),
          });
          ctx.setCookie(cookie.name, proof, cookie.attributes);
          return ctx.json({ accepted: true });
        },
      ),
      completeRegistrationContinuation: createAuthEndpoint(
        { method: 'POST' },
        async (ctx) => {
          const cookie = ctx.context.createAuthCookie(
            'registration_continuation',
            {
              httpOnly: true,
              sameSite: 'lax',
              path: '/',
            },
          );
          const proof = ctx.getCookie(cookie.name);
          const userId = ctx.headers?.get(verifiedRegistrationUserHeader);
          if (!proof || !/^[A-Za-z0-9_-]{43}$/.test(proof) || !userId)
            return ctx.json({ signedIn: false });
          const identifier = identifierOf(proof);
          const pending =
            await ctx.context.internalAdapter.findVerificationValue(identifier);
          if (pending === null || pending.expiresAt.getTime() <= Date.now()) {
            ctx.setCookie(cookie.name, '', { ...cookie.attributes, maxAge: 0 });
            return ctx.json({ signedIn: false });
          }
          // A different link cannot consume this browser's pending signup.
          if (pending.value !== userId) return ctx.json({ signedIn: false });
          const user = await ctx.context.internalAdapter.findUserById(userId);
          if (user === null || !user.emailVerified)
            return ctx.json({ signedIn: false });
          const consumed =
            await ctx.context.internalAdapter.consumeVerificationValue(
              identifier,
            );
          ctx.setCookie(cookie.name, '', { ...cookie.attributes, maxAge: 0 });
          if (consumed === null || consumed.value !== userId)
            return ctx.json({ signedIn: false });
          // Consume even when another account is already signed in, so this
          // link cannot silently sign the browser in after a later sign-out.
          if (
            await getSessionFromCtx(ctx, {
              disableCookieCache: true,
              disableRefresh: true,
            })
          )
            return ctx.json({ signedIn: false });
          // This adapter runs the normal enabled-account hook and owns the
          // session lifetime, random token and Secure/HttpOnly cookie format.
          const session = await ctx.context.internalAdapter
            .createSession(userId)
            .catch((error: unknown) => {
              // Some server profiles rethrow library API errors. A refused
              // account still needs the safe password-sign-in fallback.
              if (isAPIError(error) && error.statusCode === 403) return null;
              throw error;
            });
          if (session === null) return ctx.json({ signedIn: false });
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ signedIn: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
