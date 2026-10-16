/**
 * A fake GitHub API for the tests of the fast forward scripts. It is not a
 * test file itself.
 */
import { codeRabbit, mainRef } from './ff-only-merge.mjs';
import { record } from './workspace.mjs';

export const api = 'https://api.github.test';
export const graphqlUrl = `${api}/graphql`;
export const repo = 'owner/repo';
export const B = 'b'.repeat(40);
export const C = 'c'.repeat(40);
export const H = 'a'.repeat(40);
export const old = 'd'.repeat(40);

export const rabbit = {
  login: codeRabbit.login,
  type: 'Bot',
  id: codeRabbit.id,
};
export const person = { login: 'person', type: 'User', id: 7 };
/** The time of the `/ff-merge` comment, after every review of the state. */
export const commentAt = '2026-10-16T11:00:00Z';
export const actions = { id: 15368 };

/** @param {number} id @param {object} user @param {string} state @param {string} commit */
export const review = (id, user, state, commit = H) => ({
  id,
  user,
  state,
  commit_id: commit,
  submitted_at: `2026-10-16T10:${String(id).padStart(2, '0')}:00Z`,
});

/** The state of a pull request that passes every gate. */
export function passing() {
  /** @type {unknown[]} A status is raw API data, also one with no creator. */
  const statuses = [
    { id: 21, context: 'CodeRabbit', state: 'success', creator: rabbit },
    { id: 20, context: 'CodeRabbit', state: 'pending', creator: rabbit },
  ];
  return {
    comment: {
      id: 900,
      user: { ...person },
      issue_url: `${api}/repos/${repo}/issues/5`,
      created_at: commentAt,
      updated_at: commentAt,
      body: '/ff-merge',
    },
    permission: { permission: 'admin', user: { ...person } },
    /** @type {{ id: string, createdAt: string }[]} */
    forcePushes: [],
    /** @type {string[]} */
    replies: [],
    repository: { id: 1, node_id: 'R_1', full_name: repo },
    pr: {
      number: 5,
      state: 'open',
      merged: false,
      draft: false,
      head: { sha: H, ref: 'topic', repo: { id: 1 } },
      base: { ref: 'main', repo: { id: 1 } },
    },
    main: B,
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      { type: 'required_linear_history' },
      {
        type: 'required_status_checks',
        parameters: {
          required_status_checks: [{ context: 'Lint', integration_id: 15368 }],
        },
      },
      {
        type: 'pull_request',
        parameters: {
          required_approving_review_count: 0,
          required_review_thread_resolution: true,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_reviewers: [],
          allowed_merge_methods: ['rebase'],
        },
      },
    ],
    reviews: [
      review(1, rabbit, 'COMMENTED', old),
      review(2, rabbit, 'APPROVED'),
    ],
    threads: [{ id: 'T1', isResolved: true, isOutdated: true }],
    checkRuns: [
      {
        id: 10,
        name: 'Lint',
        head_sha: H,
        status: 'completed',
        conclusion: 'success',
        app: actions,
      },
    ],
    statuses,
    compare: {
      status: 'ahead',
      ahead_by: 2,
      behind_by: 0,
      merge_base_commit: { sha: B },
    },
    commits: [
      { sha: C, parents: [{ sha: B }] },
      { sha: H, parents: [{ sha: C }] },
    ],
  };
}

/** @typedef {ReturnType<typeof passing>} State */

/**
 * A fake GitHub API. It serves two items per page, so every list is paged.
 * `afterRead` runs once the first snapshot is complete, after its last read.
 * `afterForcePushes` runs once after the first read of the force pushes.
 * `write` decides the answer to the mutation, and `reply` the answer to a
 * pull request comment.
 *
 * @param {State} state
 * @param {{
 *   afterRead?: (state: State) => void,
 *   write?: 'accept' | 'reject' | 'lost' | 'lost-applied',
 *   reply?: 'ok' | 'fail' | 'lost',
 *   afterForcePushes?: (state: State) => void,
 * }} [options]
 */
export function fakeGitHub(state, options = {}) {
  /** @type {string[]} */
  const calls = [];
  /** @type {unknown[]} */
  const mutations = [];
  let snapshots = 0;
  let forcePushReads = 0;
  /** @param {number} status @param {unknown} body @param {string} [link] */
  const reply = (status, body, link) => ({
    status,
    headers: {
      get: (/** @type {string} */ name) =>
        name === 'link' ? (link ?? null) : null,
    },
    text: async () => JSON.stringify(body),
  });
  /** @param {URL} url @param {unknown[]} items @param {(page: unknown[]) => unknown} wrap */
  const paged = (url, items, wrap = (page) => page) => {
    const page = Number(url.searchParams.get('page') ?? '1');
    const slice = items.slice((page - 1) * 2, page * 2);
    const next = new URL(url);
    next.searchParams.set('page', String(page + 1));
    return reply(
      200,
      wrap(slice),
      page * 2 < items.length ? `<${next.href}>; rel="next"` : undefined,
    );
  };
  /** @type {import('./ff-only-merge.mjs').Fetch} */
  const fetch = async (address, init) => {
    calls.push(`${init.method} ${address}`);
    const url = new URL(address);
    if (address === graphqlUrl) {
      const body = record(JSON.parse(init.body ?? '{}'));
      const query = String(body.query);
      const variables = record(body.variables);
      if (query.startsWith('mutation')) {
        mutations.push(variables.input);
        const update = record(list(record(variables.input).refUpdates)[0]);
        if (options.write === 'reject')
          return reply(200, {
            data: { updateRefs: null },
            errors: [
              { message: 'Changes must be made through a pull request.' },
            ],
          });
        if (options.write === 'lost') throw new Error('socket hang up');
        if (update.beforeOid === state.main)
          state.main = String(update.afterOid);
        if (options.write === 'lost-applied') throw new Error('socket hang up');
        return reply(200, { data: { updateRefs: { clientMutationId: null } } });
      }
      if (query.includes('timelineItems')) {
        const nodes = [...state.forcePushes];
        forcePushReads += 1;
        if (forcePushReads === 1) options.afterForcePushes?.(state);
        return reply(200, {
          data: {
            repository: {
              pullRequest: {
                timelineItems: {
                  filteredCount: nodes.length,
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes,
                },
              },
            },
          },
        });
      }
      const all = state.threads;
      const start = variables.cursor === null ? 0 : Number(variables.cursor);
      const nodes = all.slice(start, start + 2);
      const more = start + 2 < all.length;
      return reply(200, {
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                totalCount: all.length,
                pageInfo: { hasNextPage: more, endCursor: String(start + 2) },
                nodes,
              },
            },
          },
        },
      });
    }
    const path = url.pathname;
    const base = `/repos/${repo}`;
    if (path === base) return reply(200, state.repository);
    if (path === `${base}/issues/comments/900`)
      return reply(200, state.comment);
    if (path === `${base}/collaborators/person/permission`)
      return reply(200, state.permission);
    if (path === `${base}/issues/5/comments` && init.method === 'POST') {
      if (options.reply === 'lost') throw new Error('socket hang up');
      if (options.reply === 'fail') return reply(403, { message: 'Forbidden' });
      state.replies.push(String(record(JSON.parse(init.body ?? '{}')).body));
      return reply(201, { id: 901 });
    }
    if (path === `${base}/pulls/5`) return reply(200, state.pr);
    if (path === `${base}/git/ref/heads/main`)
      return reply(200, { ref: mainRef, object: { sha: state.main } });
    if (path === `${base}/rules/branches/main`) return paged(url, state.rules);
    if (path === `${base}/pulls/5/reviews`) return paged(url, state.reviews);
    if (path === `${base}/commits/${state.pr.head.sha}/check-runs`)
      return paged(url, state.checkRuns, (page) => ({
        total_count: state.checkRuns.length,
        check_runs: page,
      }));
    if (path === `${base}/commits/${state.pr.head.sha}/statuses`)
      return paged(url, state.statuses);
    if (path === `${base}/compare/${state.main}...${state.pr.head.sha}`) {
      const answer = paged(url, state.commits, (page) => ({
        ...state.compare,
        commits: page,
      }));
      if (answer.headers.get('link') === null) {
        snapshots += 1;
        if (snapshots === 1) options.afterRead?.(state);
      }
      return answer;
    }
    return reply(404, { message: 'Not Found' });
  };
  return { fetch, calls, mutations };
}

/** @param {unknown} value @returns {unknown[]} */
export const list = (value) => (Array.isArray(value) ? value : []);
