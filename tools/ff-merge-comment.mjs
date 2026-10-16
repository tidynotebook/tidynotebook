/**
 * Fast forwards `main` from one `/ff-merge` comment on a pull request.
 *
 * `.github/workflows/ff-merge-comment.yml` runs this file from the workflow
 * commit on `main` when a person creates a pull request comment. The comment
 * is data. The script never runs it and never runs pull request code.
 *
 * Before any write, the script reads the comment again by its ID. The author
 * must be the person in the event, and the comment must be new and never
 * edited. The author must have the admin permission on the repository. The
 * text must be exactly `/ff-merge`, or `/ff-merge` and a commit SHA prefix. Then
 * the script freezes the head H and runs every gate of
 * `tools/ff-only-merge.mjs` twice. It adds one gate: the CodeRabbit approval
 * of H is older than the comment, and nobody force pushed the head branch
 * after that approval. A normal push only moves the head away from H, so H
 * was the head when the person wrote the comment. The write is the same
 * compare and swap. The script replies once in the pull request with the
 * actual result, and only to an authorized person. A failed reply never
 * changes or repeats the write.
 *
 * The inputs come from the environment: `PR_NUMBER`, `COMMENT_ID`,
 * `COMMENT_USER_ID`, `COMMENT_USER_LOGIN`, `COMMENT_CREATED_AT`, and the
 * standard `GITHUB_*` values.
 */
import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  GateError,
  clientFromEnv,
  codeRabbit,
  fastForward,
  integer,
  latestReviews,
  list,
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

/** The pages of force push events that the script reads at most. */
const maxPages = 50;

/**
 * Reads the command. Anything else in the comment stops the run.
 *
 * @param {string} body
 * @returns {string | null} The SHA prefix, or `null` for the plain command.
 */
export function parseCommand(body) {
  const match = /^\/ff-merge(?: ([0-9a-f]{12,40}))?[ \t\r\n]*$/.exec(body);
  if (match === null)
    throw new GateError(
      'The comment must be exactly /ff-merge, or /ff-merge and a commit SHA prefix of 12 to 40 characters.',
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
 * text is parsed later, after the permission check, so that only an admin
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
 * The author has the admin permission now. The answer must name the same
 * user ID.
 *
 * @param {Record<string, unknown>} permission
 * @param {CommentEvent} event
 */
export function checkPermission(permission, event) {
  if (integer(record(permission.user).id) !== event.userId)
    throw new GateError('GitHub returned the permission of another user.');
  if (text(permission.permission) !== 'admin')
    throw new GateError(
      'Only an admin of the repository can merge by comment.',
    );
}

/**
 * The CodeRabbit approval of H is older than the comment, and no force push
 * of the head branch is as new as that approval or newer.
 *
 * @param {readonly unknown[]} reviews
 * @param {readonly unknown[]} forcePushes
 * @param {string} head
 * @param {string} commentAt
 */
export function checkApprovalBeforeComment(
  reviews,
  forcePushes,
  head,
  commentAt,
) {
  const approval = latestReviews(reviews).get(codeRabbit.id);
  if (
    approval === undefined ||
    text(approval.state) !== 'APPROVED' ||
    text(approval.commit_id) !== head
  )
    throw new GateError('CodeRabbit has not approved the head.');
  const approvedAt = Date.parse(text(approval.submitted_at));
  if (!Number.isFinite(approvedAt) || !(approvedAt < Date.parse(commentAt)))
    throw new GateError(
      `CodeRabbit approved ${short(head)} after the comment. Post a new comment for this head.`,
    );
  for (const push of forcePushes.map(record)) {
    const pushedAt = Date.parse(text(push.createdAt));
    if (!Number.isFinite(pushedAt) || pushedAt >= approvedAt)
      throw new GateError(
        'The head branch was force pushed after the approval. Post a new comment.',
      );
  }
}

const forcePushQuery = `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      timelineItems(first: 100, after: $cursor, itemTypes: [HEAD_REF_FORCE_PUSHED_EVENT]) {
        filteredCount
        pageInfo { hasNextPage endCursor }
        nodes { ... on HeadRefForcePushedEvent { id createdAt } }
      }
    }
  }
}`;

/**
 * Every force push event of the head branch.
 *
 * @param {ReturnType<typeof clientFromEnv>} client
 * @param {{ owner: string, name: string }} repository
 * @param {number} number
 */
async function forcePushes(client, { owner, name }, number) {
  /** @type {unknown[]} */
  const events = [];
  /** @type {string | null} */
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const data = await client.graphql(forcePushQuery, {
      owner,
      name,
      number,
      cursor,
    });
    const connection = record(
      record(record(data.repository).pullRequest).timelineItems,
    );
    events.push(...list(connection.nodes));
    const info = record(connection.pageInfo);
    if (info.hasNextPage !== true) {
      if (integer(connection.filteredCount) !== events.length)
        throw new GateError('GitHub did not list every force push.');
      return events;
    }
    cursor = text(info.endCursor);
  }
  throw new GateError('A list from GitHub has too many pages.');
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
      async (snapshot, frozen) => {
        const pushes = await forcePushes(client, repository, event.prNumber);
        checkApprovalBeforeComment(
          snapshot.reviews,
          pushes,
          frozen,
          event.createdAt,
        );
        return JSON.stringify(pushes);
      },
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
