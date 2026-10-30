/**
 * Fast forwards main after an authorized ff-merge comment.
 * Reads the comment and the author's repository permission before a write.
 * Runs only trusted workflow code. Never runs comment text or PR code.
 */
import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  GateError,
  clientFromEnv,
  fastForward,
  integer,
  parseRepository,
  report,
  short,
  text,
} from './ff-only-merge.mjs';
import { record } from './workspace.mjs';

/** A comment older than this stops the run, so a late re-run does nothing. */
export const commentMaxAge = 10 * 60 * 1000;

/** The clock of the runner may be a little behind the comment time. */
const clockSkew = 60 * 1000;

/**
 * Reads the command. Anything else in the comment stops the run.
 *
 * @param {string} body
 * @returns {string | null} The SHA prefix, or `null` for the plain command.
 */
export function parseCommand(body) {
  const match = /^\/?ff-merge(?: ([0-9a-f]{12,40}))?[ \t\r\n]*$/.exec(body);
  if (match === null)
    throw new GateError(
      'The comment must be exactly ff-merge, or ff-merge and a commit SHA prefix of 12 to 40 characters.',
    );
  return match[1] ?? null;
}

/**
 * Reads the event values as data and refuses anything else.
 *
 * @param {Record<string, string | undefined>} env
 */
export function parseEvent(env) {
  /** @param {string} name */
  const id = (name) => {
    const value = env[name] ?? '';
    if (
      !/^[1-9][0-9]{0,15}$/.test(value) ||
      !Number.isSafeInteger(Number(value))
    )
      throw new GateError(`The event value ${name} is not valid.`);
    return Number(value);
  };
  const login = env.COMMENT_USER_LOGIN ?? '';
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(login))
    throw new GateError('The event value COMMENT_USER_LOGIN is not valid.');
  const createdAt = env.COMMENT_CREATED_AT ?? '';
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(createdAt) ||
    !Number.isFinite(Date.parse(createdAt))
  )
    throw new GateError('The event value COMMENT_CREATED_AT is not valid.');
  return {
    prNumber: id('PR_NUMBER'),
    commentId: id('COMMENT_ID'),
    userId: id('COMMENT_USER_ID'),
    login,
    createdAt,
  };
}

/** @typedef {ReturnType<typeof parseEvent>} CommentEvent */

/**
 * The comment that GitHub returns now is the comment of the event: same ID,
 * same author, same pull request, same time, never edited, and recent. The
 * text is parsed later, after the permission check, so that only an authorized user
 * gets a reply about it.
 *
 * @param {Record<string, unknown>} comment
 * @param {CommentEvent} event
 * @param {number} now
 */
export function checkComment(comment, event, now) {
  const user = record(comment.user);
  if (integer(comment.id) !== event.commentId)
    throw new GateError('GitHub returned a different comment.');
  if (
    integer(user.id) !== event.userId ||
    text(user.login) !== event.login ||
    text(user.type) !== 'User'
  )
    throw new GateError('The comment author is not the person in the event.');
  if (!text(comment.issue_url).endsWith(`/issues/${event.prNumber}`))
    throw new GateError('The comment belongs to another pull request.');
  const created = text(comment.created_at);
  if (created !== event.createdAt)
    throw new GateError('The comment time does not match the event.');
  if (text(comment.updated_at) !== created)
    throw new GateError('The comment was edited. Post a new comment.');
  const age = now - Date.parse(created);
  if (!(age >= -clockSkew && age <= commentMaxAge))
    throw new GateError('The comment is too old. Post a new comment.');
}

/**
 * The author has repository push access now. The answer must name the same
 * user ID.
 *
 * @param {Record<string, unknown>} permission
 * @param {CommentEvent} event
 */
export function checkPermission(permission, event) {
  if (integer(record(permission.user).id) !== event.userId)
    throw new GateError('GitHub returned the permission of another user.');
  if (
    !['admin', 'maintain', 'write'].includes(text(permission.permission)) &&
    record(record(permission.user).permissions).push !== true
  )
    throw new GateError(
      'Repository push access is required to merge by comment.',
    );
}

/** @param {Record<string, string | undefined>} env */
function runLink(env) {
  const server = env.GITHUB_SERVER_URL ?? 'https://github.com';
  const id = env.GITHUB_RUN_ID ?? '';
  if (!/^[0-9]+$/.test(id) || !/^https:\/\/[a-z0-9.-]+$/.test(server))
    return 'unknown';
  return `${server}/${env.GITHUB_REPOSITORY ?? ''}/actions/runs/${id}`;
}

/**
 * Runs the comment procedure and returns the report.
 *
 * @param {Record<string, string | undefined>} env
 * @param {import('./ff-only-merge.mjs').Fetch} fetch
 * @param {number} now
 */
export async function runComment(env, fetch, now) {
  /** @type {string[]} */
  const rows = [];
  /** @type {{ reply: (body: string) => Promise<number> } | null} */
  let replier = null;
  let outcome;
  try {
    const event = parseEvent(env);
    const repository = parseRepository(env);
    rows.push(
      `| Pull request | ${event.prNumber} |`,
      `| Comment | ${event.commentId} |`,
    );
    const client = clientFromEnv(env, fetch);
    const path = `/repos/${repository.fullName}`;
    const comment = record(
      await client.rest(`${path}/issues/comments/${event.commentId}`),
    );
    checkComment(comment, event, now);
    checkPermission(
      record(
        await client.rest(`${path}/collaborators/${event.login}/permission`),
      ),
      event,
    );
    replier = {
      reply: async (body) =>
        (
          await client.send(
            'POST',
            `${path}/issues/${event.prNumber}/comments`,
            {
              body,
            },
          )
        ).status,
    };
    const prefix = parseCommand(text(comment.body));
    const pr = record(await client.rest(`${path}/pulls/${event.prNumber}`));
    const head = text(record(pr.head).sha);
    rows.push(`| Head | ${head} |`);
    if (prefix !== null && !head.startsWith(prefix))
      throw new GateError(
        `The head is ${short(head)}, not the commit in the comment.`,
      );
    outcome = await fastForward(
      client,
      repository,
      { prNumber: event.prNumber, expectedHead: head, dryRun: false },
      rows,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outcome = report(false, `Stopped before the write: ${message}`, rows);
  }
  if (replier === null) return { ...outcome, replied: false };
  const body = [
    `**Fast forward main: ${outcome.ok ? 'done' : 'not done'}**`,
    '',
    outcome.result,
    '',
    `Run: ${runLink(env)}`,
  ].join('\n');
  let failure = '';
  try {
    const status = await replier.reply(body);
    if (status !== 201) failure = `GitHub answered ${status}`;
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  if (failure === '') return { ...outcome, replied: true };
  const note = `The reply comment failed (${failure}). The result above is the actual outcome.`;
  return {
    ok: outcome.ok,
    result: `${outcome.result} ${note}`,
    summary: `${outcome.summary}\n${note}\n`,
    replied: false,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const outcome = await runComment(process.env, fetch, Date.now());
  process.stdout.write(`${outcome.result}\n`);
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, outcome.summary);
  if (!outcome.ok) process.exitCode = 1;
}
