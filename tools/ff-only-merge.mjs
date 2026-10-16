/**
 * Fast forwards `main` to the reviewed head of one pull request.
 *
 * `.github/workflows/ff-only-merge.yml` runs this file from the workflow
 * commit on `main`. It never reads the code of the pull request. It reads the
 * pull request, its reviews, its threads and its checks through the API, and
 * it freezes the head H and the current `main` B. Every gate holds on exactly
 * H. Then it reads everything a second time and stops if any of it changed.
 * The write is one `updateRefs` mutation with `beforeOid` B, `afterOid` H and
 * no force, so GitHub refuses it if `main` moved after the second read. The
 * script never retries a write. It reads the ref back and reports what it
 * finds. See `docs/development/fast-forward-merge.md`.
 *
 * The inputs come from the environment: `PR_NUMBER`, `EXPECTED_HEAD_SHA`,
 * `DRY_RUN`,
 * `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `GITHUB_REF`, `GITHUB_API_URL`,
 * `GITHUB_GRAPHQL_URL` and `GITHUB_STEP_SUMMARY`.
 */
import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { record } from './workspace.mjs';

/** The only ref that the script writes. */
export const mainRef = 'refs/heads/main';

/** The CodeRabbit account. Its login, type and user ID must all match. */
export const codeRabbit = {
  login: 'coderabbitai[bot]',
  type: 'Bot',
  id: 136622811,
  context: 'CodeRabbit',
};

/** A list call that needs more pages than this is refused. */
const maxPages = 50;

/** A gate that does not hold. The message names what the person must fix. */
export class GateError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'GateError';
  }
}

/** @param {unknown} value @returns {unknown[]} */
export const list = (value) => (Array.isArray(value) ? value : []);

/** @param {unknown} value */
export const text = (value) => (typeof value === 'string' ? value : '');

/** @param {unknown} value */
export const integer = (value) =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null;

/** @param {string} value */
const isSha = (value) => /^[0-9a-f]{40}$/.test(value);

/** @param {string} sha */
export const short = (sha) => sha.slice(0, 12);

/**
 * Reads the inputs as data and refuses anything else. A dry run checks every
 * gate and never writes.
 *
 * @param {Record<string, string | undefined>} env
 */
export function parseInputs(env) {
  const number = env.PR_NUMBER ?? '';
  const sha = env.EXPECTED_HEAD_SHA ?? '';
  if (!/^[1-9][0-9]{0,8}$/.test(number))
    throw new GateError('The pull request number must be a positive integer.');
  if (!isSha(sha))
    throw new GateError(
      'The expected head must be a full 40 character lowercase commit SHA.',
    );
  const dryRun = env.DRY_RUN;
  if (dryRun !== 'true' && dryRun !== 'false')
    throw new GateError('The dry run input must be true or false.');
  return {
    prNumber: Number(number),
    expectedHead: sha,
    dryRun: dryRun === 'true',
  };
}

/**
 * Reads the repository name from the environment.
 *
 * @param {Record<string, string | undefined>} env
 */
export function parseRepository(env) {
  const fullName = env.GITHUB_REPOSITORY ?? '';
  const match = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(fullName);
  if (match === null || match[1] === undefined || match[2] === undefined)
    throw new GateError('The repository name is not valid.');
  return { fullName, owner: match[1], name: match[2] };
}

/**
 * True when the user is the CodeRabbit account. The login or the user ID
 * with any other value stops, because each names one account. The type alone
 * names no account, so another bot is simply not CodeRabbit.
 *
 * @param {unknown} value
 */
export function isCodeRabbit(value) {
  const user = record(value);
  const login = text(user.login) === codeRabbit.login;
  const id = integer(user.id) === codeRabbit.id;
  if (login && id && text(user.type) === codeRabbit.type) return true;
  if (login || id)
    throw new GateError(
      `The account "${text(user.login)}" matches CodeRabbit only in part.`,
    );
  return false;
}

/**
 * The pull request is open, ready, from this repository, into `main`, and its
 * head is the expected commit.
 *
 * @param {Record<string, unknown>} pr
 * @param {Record<string, unknown>} repository
 * @param {{ prNumber: number, expectedHead: string }} inputs
 */
export function checkPullRequest(pr, repository, inputs) {
  const head = record(pr.head);
  const base = record(pr.base);
  const repositoryId = integer(repository.id);
  if (integer(pr.number) !== inputs.prNumber)
    throw new GateError('GitHub returned a different pull request.');
  if (text(pr.state) !== 'open' || pr.merged === true)
    throw new GateError('The pull request is not open.');
  if (pr.draft !== false) throw new GateError('The pull request is a draft.');
  if (text(base.ref) !== 'main')
    throw new GateError('The pull request does not target main.');
  if (repositoryId === null || integer(record(base.repo).id) !== repositoryId)
    throw new GateError('The pull request belongs to another repository.');
  if (integer(record(head.repo).id) !== repositoryId)
    throw new GateError('The head branch is not in this repository.');
  const sha = text(head.sha);
  if (!isSha(sha)) throw new GateError('The head commit is not readable.');
  if (sha !== inputs.expectedHead)
    throw new GateError(
      `The head is ${short(sha)}, not the expected ${short(inputs.expectedHead)}.`,
    );
  return sha;
}

/**
 * The required status checks of the effective rules for `main`. A rule that
 * the script does not evaluate stops it, so a new rule never passes in
 * silence.
 *
 * @param {readonly unknown[]} rules
 */
export function requiredChecks(rules) {
  /** @type {{ context: string, integrationId: number | null }[]} */
  const required = [];
  for (const rule of rules.map(record)) {
    const type = text(rule.type);
    const parameters = record(rule.parameters);
    if (
      type === 'deletion' ||
      type === 'non_fast_forward' ||
      type === 'creation'
    )
      continue;
    if (type === 'required_linear_history') continue;
    if (type === 'pull_request') {
      checkPullRequestRule(parameters);
      continue;
    }
    if (type !== 'required_status_checks')
      throw new GateError(
        `main has the rule "${type}", and this workflow does not evaluate it.`,
      );
    for (const check of list(parameters.required_status_checks).map(record)) {
      const context = text(check.context);
      if (context === '')
        throw new GateError('A required status check has no name.');
      required.push({ context, integrationId: integer(check.integration_id) });
    }
  }
  if (required.length === 0)
    throw new GateError('main has no required status check to rely on.');
  return required;
}

/** The parts of the pull request rule that the script cannot evaluate stop it.
 * @param {Record<string, unknown>} parameters */
function checkPullRequestRule(parameters) {
  if (integer(parameters.required_approving_review_count) !== 0)
    throw new GateError(
      'main requires approvals that this workflow does not count.',
    );
  if (
    parameters.require_code_owner_review === true ||
    parameters.require_last_push_approval === true ||
    list(parameters.required_reviewers).length > 0
  )
    throw new GateError(
      'main requires reviewers that this workflow does not count.',
    );
}

/**
 * Every required check has a successful result on H. A check that names an
 * app counts only a check run from that app. The newest run of a name counts.
 *
 * @param {readonly { context: string, integrationId: number | null }[]} required
 * @param {readonly unknown[]} checkRuns
 * @param {readonly unknown[]} statuses
 * @param {string} head
 */
export function checkRequiredChecks(required, checkRuns, statuses, head) {
  for (const { context, integrationId } of required) {
    const runs = checkRuns
      .map(record)
      .filter(
        (run) =>
          text(run.name) === context &&
          text(run.head_sha) === head &&
          (integrationId === null ||
            integer(record(run.app).id) === integrationId),
      );
    const run = newest(runs);
    const status =
      integrationId === null ? latestStatus(statuses, context) : undefined;
    if (run === undefined && status === undefined)
      throw new GateError(
        `The required check "${context}" has no result on the head.`,
      );
    if (
      run !== undefined &&
      (text(run.status) !== 'completed' || text(run.conclusion) !== 'success')
    )
      throw new GateError(`The required check "${context}" did not succeed.`);
    if (status !== undefined && text(status.state) !== 'success')
      throw new GateError(`The required check "${context}" did not succeed.`);
  }
}

/** @param {readonly Record<string, unknown>[]} items */
function newest(items) {
  return [...items].sort(
    (a, b) => (integer(b.id) ?? 0) - (integer(a.id) ?? 0),
  )[0];
}

/** @param {readonly unknown[]} statuses @param {string} context */
function latestStatus(statuses, context) {
  return newest(
    statuses.map(record).filter((status) => text(status.context) === context),
  );
}

/**
 * The newest CodeRabbit status on H is a success, and only CodeRabbit wrote
 * a status of that name. The name proves nothing about the writer, so each
 * status needs the CodeRabbit account as its creator, and a status with no
 * creator stops. A green status is not an approval. The statuses come from
 * the list endpoint, which carries the creator. The combined status endpoint
 * leaves the creator out, and GraphQL gives the bot login without its
 * `[bot]` suffix, so neither one can prove the writer here.
 *
 * @param {readonly unknown[]} statuses
 */
export function checkCodeRabbitStatus(statuses) {
  const own = statuses
    .map(record)
    .filter((status) => text(status.context) === codeRabbit.context);
  for (const status of own)
    if (!isCodeRabbit(status.creator))
      throw new GateError('Another account wrote a CodeRabbit status.');
  const latest = newest(own);
  if (latest === undefined)
    throw new GateError('CodeRabbit has no status on the head.');
  if (text(latest.state) !== 'success')
    throw new GateError('The CodeRabbit status on the head is not a success.');
}

/**
 * The latest review that sets a state, for each reviewer. A comment does not
 * change the state of a reviewer.
 *
 * @param {readonly unknown[]} reviews
 */
export function latestReviews(reviews) {
  const states = new Set(['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED']);
  const ordered = reviews
    .map(record)
    .filter((review) => states.has(text(review.state)))
    .sort(
      (a, b) =>
        text(a.submitted_at).localeCompare(text(b.submitted_at)) ||
        (integer(a.id) ?? 0) - (integer(b.id) ?? 0),
    );
  /** @type {Map<number, Record<string, unknown>>} */
  const latest = new Map();
  for (const review of ordered) {
    const id = integer(record(review.user).id);
    if (id !== null) latest.set(id, review);
    else if (text(review.state) === 'CHANGES_REQUESTED')
      throw new GateError('A review that requests changes has no author.');
  }
  return latest;
}

/**
 * No reviewer requests changes, and the latest CodeRabbit review approves H.
 *
 * @param {readonly unknown[]} reviews
 * @param {string} head
 */
export function checkReviews(reviews, head) {
  for (const review of reviews) isCodeRabbit(record(review).user);
  const latest = latestReviews(reviews);
  for (const review of latest.values())
    if (text(review.state) === 'CHANGES_REQUESTED')
      throw new GateError(
        `${text(record(review.user).login)} requests changes.`,
      );
  const approval = latest.get(codeRabbit.id);
  if (approval === undefined || !isCodeRabbit(approval.user))
    throw new GateError('CodeRabbit has not approved the pull request.');
  if (text(approval.state) !== 'APPROVED')
    throw new GateError('The latest CodeRabbit review is not an approval.');
  const commit = text(approval.commit_id);
  if (commit !== head)
    throw new GateError(
      `CodeRabbit approved ${short(commit)}, not the head ${short(head)}.`,
    );
}

/**
 * Every review thread is resolved, also an outdated thread.
 *
 * @param {readonly unknown[]} threads
 */
export function checkThreads(threads) {
  const open = threads
    .map(record)
    .filter((thread) => thread.isResolved !== true);
  if (open.length === 0) return;
  const outdated = open.filter((thread) => thread.isOutdated === true).length;
  throw new GateError(
    `${open.length} review thread(s) are not resolved, ${outdated} of them outdated.`,
  );
}

/**
 * B is an ancestor of H, and the commits after B up to H hold no merge
 * commit. The compare result must list every commit.
 *
 * @param {Record<string, unknown>} compare
 * @param {readonly unknown[]} commits
 * @param {string} base
 * @param {string} head
 */
export function checkRange(compare, commits, base, head) {
  const status = text(compare.status);
  if (status === 'identical')
    throw new GateError('main already points to the head.');
  if (status !== 'ahead' || integer(compare.behind_by) !== 0)
    throw new GateError(
      'main is not an ancestor of the head. Rebase the pull request.',
    );
  if (text(record(compare.merge_base_commit).sha) !== base)
    throw new GateError('The merge base is not the current main.');
  const ahead = integer(compare.ahead_by);
  const listed = commits.map(record);
  if (ahead === null || ahead < 1 || listed.length !== ahead)
    throw new GateError('GitHub did not list every commit after main.');
  if (text(listed.at(-1)?.sha) !== head)
    throw new GateError('The commit list does not end at the head.');
  for (const commit of listed)
    if (list(commit.parents).length !== 1)
      throw new GateError(
        `The commit ${short(text(commit.sha))} is a merge commit. main keeps a linear history.`,
      );
}

/**
 * Runs every gate on one snapshot. The fingerprint holds each value that a
 * gate read, so two equal fingerprints mean that nothing changed.
 *
 * @param {Snapshot} snapshot
 * @param {{ prNumber: number, expectedHead: string }} inputs
 */
export function evaluate(snapshot, inputs) {
  const head = checkPullRequest(snapshot.pr, snapshot.repository, inputs);
  const base = snapshot.base;
  if (!isSha(base)) throw new GateError('The current main is not readable.');
  const required = requiredChecks(snapshot.rules);
  checkReviews(snapshot.reviews, head);
  checkThreads(snapshot.threads);
  checkCodeRabbitStatus(snapshot.statuses);
  checkRequiredChecks(required, snapshot.checkRuns, snapshot.statuses, head);
  checkRange(snapshot.compare, snapshot.commits, base, head);
  return { head, base, fingerprint: fingerprint(snapshot) };
}

/** @param {Snapshot} snapshot */
export function fingerprint(snapshot) {
  /** @param {readonly unknown[]} items @param {(item: Record<string, unknown>) => unknown[]} pick */
  const rows = (items, pick) =>
    items.map((item) => JSON.stringify(pick(record(item)))).sort();
  const pr = snapshot.pr;
  return JSON.stringify({
    base: snapshot.base,
    pr: [
      pr.state,
      pr.draft,
      pr.merged,
      record(pr.head).sha,
      record(pr.base).ref,
      record(record(pr.head).repo).id,
      record(record(pr.base).repo).id,
    ],
    rules: rows(snapshot.rules, (rule) => [rule.type, rule.parameters]),
    reviews: rows(snapshot.reviews, (review) => [
      review.id,
      review.state,
      review.commit_id,
      record(review.user).id,
    ]),
    threads: rows(snapshot.threads, (thread) => [
      thread.id,
      thread.isResolved,
      thread.isOutdated,
    ]),
    checkRuns: rows(snapshot.checkRuns, (run) => [
      run.id,
      run.name,
      run.status,
      run.conclusion,
      record(run.app).id,
    ]),
    statuses: rows(snapshot.statuses, (status) => [
      status.id,
      status.context,
      status.state,
      record(status.creator).id,
    ]),
    commits: snapshot.commits.map((commit) => record(commit).sha),
  });
}

/**
 * @typedef {{
 *   status: number,
 *   headers: { get(name: string): string | null },
 *   text(): Promise<string>,
 * }} Reply
 * @typedef {(url: string, init: { method: string, headers: Record<string, string>, body?: string }) => Promise<Reply>} Fetch
 * @typedef {{
 *   repository: Record<string, unknown>,
 *   pr: Record<string, unknown>,
 *   base: string,
 *   rules: unknown[],
 *   reviews: unknown[],
 *   threads: unknown[],
 *   checkRuns: unknown[],
 *   statuses: unknown[],
 *   compare: Record<string, unknown>,
 *   commits: unknown[],
 * }} Snapshot
 */

/**
 * A small GitHub API client. It sends the token only to the API host.
 *
 * @param {{ token: string, apiUrl: string, graphqlUrl: string, fetch: Fetch }} options
 */
export function githubClient({ token, apiUrl, graphqlUrl, fetch }) {
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'tidynotebook-ff-only-merge',
  };
  /** @param {string} url */
  const checkHost = (url) => {
    if (!url.startsWith(`${apiUrl}/`) && url !== graphqlUrl)
      throw new GateError('GitHub sent an address outside its API.');
  };
  /** @param {string} url */
  async function get(url) {
    checkHost(url);
    const reply = await fetch(url, { method: 'GET', headers });
    if (reply.status !== 200)
      throw new GateError(`GitHub answered ${reply.status} for a read.`);
    /** @type {unknown} */
    const body = JSON.parse(await reply.text());
    const next = /<([^>]+)>;\s*rel="next"/.exec(
      reply.headers.get('link') ?? '',
    );
    return { body, next: next?.[1] };
  }
  /**
   * Sends one GraphQL request and returns the raw reply.
   *
   * @param {string} query
   * @param {Record<string, unknown>} variables
   */
  const post = (query, variables) =>
    fetch(graphqlUrl, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
  return {
    /**
     * One REST write. It returns the status and the raw body.
     *
     * @param {string} method
     * @param {string} path
     * @param {Record<string, unknown>} payload
     */
    async send(method, path, payload) {
      const url = `${apiUrl}${path}`;
      checkHost(url);
      const reply = await fetch(url, {
        method,
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return { status: reply.status, text: await reply.text() };
    },
    /** @param {string} path */
    async rest(path) {
      return (await get(`${apiUrl}${path}`)).body;
    },
    /**
     * Every page of a list. A key names the list inside an object page.
     *
     * @param {string} path
     * @param {string | null} key
     */
    async pages(path, key) {
      /** @type {unknown[]} */
      const items = [];
      /** @type {Record<string, unknown>} */
      let first = {};
      /** @type {string | undefined} */
      let url = `${apiUrl}${path}`;
      for (let page = 0; url !== undefined; page += 1) {
        if (page === maxPages)
          throw new GateError('A list from GitHub has too many pages.');
        const { body, next } = await get(url);
        if (page === 0) first = record(body);
        if (key === null && !Array.isArray(body))
          throw new GateError('GitHub did not return a list.');
        items.push(...list(key === null ? body : record(body)[key]));
        url = next;
      }
      return { first, items };
    },
    /**
     * A GraphQL request. A read stops on any error.
     *
     * @param {string} query
     * @param {Record<string, unknown>} variables
     */
    async graphql(query, variables) {
      const reply = await post(query, variables);
      const body = record(JSON.parse(await reply.text()));
      if (reply.status !== 200 || list(body.errors).length > 0)
        throw new GateError('GitHub refused a GraphQL read.');
      return record(body.data);
    },
    post,
  };
}

/** @typedef {ReturnType<typeof githubClient>} Client */

const threadsQuery = `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes { id isResolved isOutdated }
      }
    }
  }
}`;

/**
 * Every review thread of the pull request.
 *
 * @param {Client} client
 * @param {{ owner: string, name: string }} repository
 * @param {number} number
 */
async function reviewThreads(client, { owner, name }, number) {
  /** @type {unknown[]} */
  const threads = [];
  /** @type {string | null} */
  let cursor = null;
  for (let page = 0; ; page += 1) {
    if (page === maxPages)
      throw new GateError('A list from GitHub has too many pages.');
    const data = await client.graphql(threadsQuery, {
      owner,
      name,
      number,
      cursor,
    });
    const connection = record(
      record(record(data.repository).pullRequest).reviewThreads,
    );
    threads.push(...list(connection.nodes));
    const info = record(connection.pageInfo);
    if (info.hasNextPage !== true) {
      if (integer(connection.totalCount) !== threads.length)
        throw new GateError('GitHub did not list every review thread.');
      return threads;
    }
    cursor = text(info.endCursor);
  }
}

/**
 * The commit that `main` points to.
 *
 * @param {Client} client
 * @param {string} fullName
 */
export async function readMain(client, fullName) {
  const ref = record(
    await client.rest(`/repos/${fullName}/git/ref/heads/main`),
  );
  return text(record(ref.object).sha);
}

/**
 * Reads one snapshot. The head comes from the pull request, and every later
 * read uses that head, not a branch name.
 *
 * @param {Client} client
 * @param {{ fullName: string, owner: string, name: string }} repository
 * @param {number} number
 * @returns {Promise<Snapshot>}
 */
export async function readSnapshot(client, repository, number) {
  const path = `/repos/${repository.fullName}`;
  const repo = record(await client.rest(path));
  const pr = record(await client.rest(`${path}/pulls/${number}`));
  const head = text(record(pr.head).sha);
  const base = await readMain(client, repository.fullName);
  if (!isSha(head) || !isSha(base))
    throw new GateError('The head or main is not readable.');
  const rules = await client.pages(
    `${path}/rules/branches/main?per_page=100`,
    null,
  );
  const reviews = await client.pages(
    `${path}/pulls/${number}/reviews?per_page=100`,
    null,
  );
  const threads = await reviewThreads(client, repository, number);
  const checkRuns = await client.pages(
    `${path}/commits/${head}/check-runs?filter=latest&per_page=100`,
    'check_runs',
  );
  const statuses = await client.pages(
    `${path}/commits/${head}/statuses?per_page=100`,
    null,
  );
  const compare = await client.pages(
    `${path}/compare/${base}...${head}?per_page=100`,
    'commits',
  );
  if (integer(checkRuns.first.total_count) !== checkRuns.items.length)
    throw new GateError('GitHub did not list every check run.');
  return {
    repository: repo,
    pr,
    base,
    rules: rules.items,
    reviews: reviews.items,
    threads,
    checkRuns: checkRuns.items,
    statuses: statuses.items,
    compare: compare.first,
    commits: compare.items,
  };
}

const updateRefsMutation = `mutation($input: UpdateRefsInput!) {
  updateRefs(input: $input) { clientMutationId }
}`;

/**
 * Writes `main` once, from B to H, with no force. It never retries. It reads
 * the ref back and reports what it finds.
 *
 * @param {Client} client
 * @param {{ fullName: string, repositoryId: string, base: string, head: string }} target
 */
export async function writeMain(
  client,
  { fullName, repositoryId, base, head },
) {
  /** @type {'accepted' | 'rejected' | 'unclear'} */
  let answer = 'unclear';
  let detail = '';
  try {
    const reply = await client.post(updateRefsMutation, {
      input: {
        repositoryId,
        refUpdates: [
          { name: mainRef, beforeOid: base, afterOid: head, force: false },
        ],
      },
    });
    const raw = await reply.text();
    /** @type {Record<string, unknown>} */
    let body = {};
    try {
      body = record(JSON.parse(raw));
    } catch {
      detail = `GitHub answered ${reply.status} with no readable body.`;
    }
    const errors = list(body.errors).map((error) =>
      text(record(error).message),
    );
    if (errors.length > 0 || (reply.status >= 400 && reply.status < 500)) {
      answer = 'rejected';
      detail = errors.join(' ') || `GitHub answered ${reply.status}.`;
    } else if (reply.status === 200 && 'updateRefs' in record(body.data)) {
      answer = 'accepted';
    } else if (detail === '') {
      detail = `GitHub answered ${reply.status}.`;
    }
  } catch (error) {
    detail = error instanceof Error ? error.message : String(error);
  }
  /** @type {string | null} */
  let after = null;
  try {
    after = await readMain(client, fullName);
  } catch {
    after = null;
  }
  const where =
    after === null ? 'main could not be read back' : `main is at ${after}`;
  if (after === head && answer !== 'rejected')
    return {
      ok: true,
      answer,
      after,
      result:
        answer === 'accepted'
          ? `main moved from ${base} to ${head}.`
          : `The answer was unclear (${detail}), but ${where}.`,
    };
  return {
    ok: false,
    answer,
    after,
    result:
      answer === 'rejected'
        ? `GitHub rejected the update: ${detail} ${where}.`
        : answer === 'accepted'
          ? `GitHub accepted the update, but ${where}.`
          : `The answer was unclear (${detail}). ${where}. Nothing was retried.`,
  };
}

/**
 * Gates two snapshots, then writes `main` once unless it is a dry run. A
 * caller can add a gate. It runs on each snapshot, and its result must not
 * change between the two reads.
 *
 * @param {Client} client
 * @param {{ fullName: string, owner: string, name: string }} repository
 * @param {{ prNumber: number, expectedHead: string, dryRun: boolean }} inputs
 * @param {string[]} rows
 * @param {(snapshot: Snapshot, head: string) => Promise<string>} [extra]
 */
export async function fastForward(
  client,
  repository,
  inputs,
  rows,
  extra = async () => '',
) {
  const firstSnapshot = await readSnapshot(client, repository, inputs.prNumber);
  const first = evaluate(firstSnapshot, inputs);
  const firstExtra = await extra(firstSnapshot, first.head);
  rows.push(`| main before | ${first.base} |`);
  const snapshot = await readSnapshot(client, repository, inputs.prNumber);
  const second = evaluate(snapshot, inputs);
  const secondExtra = await extra(snapshot, second.head);
  if (second.fingerprint !== first.fingerprint || secondExtra !== firstExtra)
    throw new GateError(
      'The pull request, its reviews, its threads, its checks or main changed between the two reads.',
    );
  if (inputs.dryRun) {
    rows.push('| Write | none, dry run |');
    return report(
      true,
      `Every gate holds on ${second.head}. This was a dry run, so main did not move.`,
      rows,
    );
  }
  const repositoryId = text(snapshot.repository.node_id);
  if (repositoryId === '')
    throw new GateError('The repository ID is not readable.');
  const outcome = await writeMain(client, {
    fullName: repository.fullName,
    repositoryId,
    base: second.base,
    head: second.head,
  });
  rows.push(
    `| Write | ${outcome.answer} |`,
    `| main after | ${outcome.after ?? 'unknown'} |`,
  );
  return report(outcome.ok, outcome.result, rows);
}

/**
 * The API client of a run. It stops outside `main` and without a token.
 *
 * @param {Record<string, string | undefined>} env
 * @param {Fetch} fetch
 */
export function clientFromEnv(env, fetch) {
  if (env.GITHUB_REF !== mainRef)
    throw new GateError('The workflow must run from main.');
  const token = env.GITHUB_TOKEN ?? '';
  if (token === '') throw new GateError('The workflow token is missing.');
  return githubClient({
    token,
    apiUrl: env.GITHUB_API_URL ?? 'https://api.github.com',
    graphqlUrl: env.GITHUB_GRAPHQL_URL ?? 'https://api.github.com/graphql',
    fetch,
  });
}

/**
 * Runs the whole procedure and returns the report.
 *
 * @param {Record<string, string | undefined>} env
 * @param {Fetch} fetch
 */
export async function run(env, fetch) {
  /** @type {string[]} */
  const rows = [];
  try {
    const inputs = parseInputs(env);
    const repository = parseRepository(env);
    rows.push(
      `| Pull request | ${inputs.prNumber} |`,
      `| Expected head | ${inputs.expectedHead} |`,
    );
    const client = clientFromEnv(env, fetch);
    return await fastForward(client, repository, inputs, rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return report(false, `Stopped before the write: ${message}`, rows);
  }
}

/** @param {boolean} ok @param {string} result @param {readonly string[]} rows */
export function report(ok, result, rows) {
  const clean = result.replaceAll('|', '/');
  const summary = [
    `## Fast forward main: ${ok ? 'done' : 'not done'}`,
    '',
    clean,
    '',
    '| Item | Value |',
    '| --- | --- |',
    ...rows,
    '',
  ].join('\n');
  return { ok, result: clean, summary };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const outcome = await run(process.env, fetch);
  process.stdout.write(`${outcome.result}\n`);
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, outcome.summary);
  if (!outcome.ok) process.exitCode = 1;
}
