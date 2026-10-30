/**
 * Fast forwards main to the head of one pull request, without review or CI gates.
 * The workflow runs trusted code from main. Inputs are data.
 * The ref update uses the previous main SHA and never forces or retries.
 */
import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { record } from './workspace.mjs';

/** The only ref that the script writes. */
export const mainRef = 'refs/heads/main';

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
 * Reads the inputs as data and refuses anything else. A dry run checks the fast forward and never writes.
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
 * The pull request is open, targets this repository and `main`, and its
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
  if (text(base.ref) !== 'main')
    throw new GateError('The pull request does not target main.');
  if (repositoryId === null || integer(record(base.repo).id) !== repositoryId)
    throw new GateError('The pull request belongs to another repository.');
  const sha = text(head.sha);
  if (!isSha(sha)) throw new GateError('The head commit is not readable.');
  if (sha !== inputs.expectedHead)
    throw new GateError(
      `The head is ${short(sha)}, not the expected ${short(inputs.expectedHead)}.`,
    );
  return sha;
}

/**
 * B is an ancestor of H. The compare result must list every commit.
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
}

/**
 * Checks the fast forward target. The fingerprint records the target values.
 *
 * @param {Snapshot} snapshot
 * @param {{ prNumber: number, expectedHead: string }} inputs
 */
export function evaluate(snapshot, inputs) {
  const head = checkPullRequest(snapshot.pr, snapshot.repository, inputs);
  const base = snapshot.base;
  if (!isSha(base)) throw new GateError('The current main is not readable.');
  checkRange(snapshot.compare, snapshot.commits, base, head);
  return { head, base, fingerprint: fingerprint(snapshot) };
}

/** @param {Snapshot} snapshot */
export function fingerprint(snapshot) {
  const pr = snapshot.pr;
  return JSON.stringify({
    base: snapshot.base,
    pr: [
      pr.state,
      pr.merged,
      record(pr.head).sha,
      record(pr.base).ref,
      record(record(pr.base).repo).id,
    ],
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
  const compare = await client.pages(
    `${path}/compare/${base}...${head}?per_page=100`,
    'commits',
  );
  return {
    repository: repo,
    pr,
    base,
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
 * Reads the target twice, then writes main once unless this is a dry run.
 *
 * @param {Client} client
 * @param {{ fullName: string, owner: string, name: string }} repository
 * @param {{ prNumber: number, expectedHead: string, dryRun: boolean }} inputs
 * @param {string[]} rows
 */
export async function fastForward(client, repository, inputs, rows) {
  const firstSnapshot = await readSnapshot(client, repository, inputs.prNumber);
  const first = evaluate(firstSnapshot, inputs);
  rows.push(`| main before | ${first.base} |`);
  const snapshot = await readSnapshot(client, repository, inputs.prNumber);
  const second = evaluate(snapshot, inputs);
  if (second.fingerprint !== first.fingerprint)
    throw new GateError(
      'The pull request or main changed between the two reads.',
    );
  if (inputs.dryRun) {
    rows.push('| Write | none, dry run |');
    return report(
      true,
      `The fast forward is valid for ${second.head}. This was a dry run, so main did not move.`,
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
