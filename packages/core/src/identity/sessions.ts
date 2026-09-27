/**
 * The sessions of an account (record 0122).
 *
 * A person lists the sessions of their own account and ends one of them, or
 * every one but the current one. Each use case runs in one transaction bound
 * to the actor, and the store reaches the session table through a function
 * that binds it to that account, so no account lists or ends a session of
 * another. No record here holds a token.
 */
import { fail, ok, type Result } from '../files/model.ts';
import type { Actor } from './actor.ts';
import type {
  SessionRecord,
  WorkspaceAdminStore,
} from '../workspaces/ports.ts';

/** One session and whether it is the one that asks. */
export type SessionView = SessionRecord & { readonly current: boolean };

/**
 * Every session of the account, the current one first and then the most
 * recently used.
 */
export function listSessions(
  store: WorkspaceAdminStore,
  actor: Actor,
  currentSessionId: string,
): Promise<Result<readonly SessionView[]>> {
  return store.account(actor, async (tx) => {
    const sessions = (await tx.sessions()).map((session) => ({
      ...session,
      current: session.sessionId === currentSessionId,
    }));
    sessions.sort((left, right) => {
      if (left.current !== right.current) return left.current ? -1 : 1;
      return left.lastActiveAt < right.lastActiveAt ? 1 : -1;
    });
    return ok(sessions);
  });
}

/** Ends one session of the account, or answers `not_found`. */
export function revokeSession(
  store: WorkspaceAdminStore,
  actor: Actor,
  sessionId: string,
): Promise<Result<void>> {
  return store.account(actor, async (tx) =>
    (await tx.revokeSession(sessionId)) ? ok(undefined) : fail('not_found'),
  );
}

/** Ends every session of the account but the current one. */
export function revokeOtherSessions(
  store: WorkspaceAdminStore,
  actor: Actor,
  currentSessionId: string,
): Promise<Result<number>> {
  return store.account(actor, async (tx) =>
    ok(await tx.revokeOtherSessions(currentSessionId)),
  );
}
