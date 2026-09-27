import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  decisionIndexFailures,
  fenceLanguages,
  isSuperseded,
  maximumDevelopmentLines,
  namedPaths,
  placementFailure,
  relativeLinks,
} from './check-docs.mjs';

// The fixtures below are disposable trees under the system temporary
// directory. They are never committed as application code.
const checker = fileURLToPath(new URL('./check-docs.mjs', import.meta.url));

/** A complete tree that satisfies every rule. */
const baseline = {
  'README.md': '# Project\n\nSee [the documents](docs/README.md).\n',
  'CONTRIBUTING.md':
    '# Contributing\n\nRead [docs/README.md](docs/README.md).\n',
  'docs/README.md': '# Documentation\n\nThe index.\n',
  'docs/guide/README.md':
    '# Guide\n\nThis page is for anyone who uses the product.\n',
  'docs/guide/quickstart.md':
    '# Quick start\n\nThis page is for the person who runs a server.\n\n' +
    '```sh\ndocker compose up -d\n```\n',
  'docs/development/architecture.md':
    '# Architecture\n\nThe shape of the system. See [the guide](../guide/README.md).\n',
  'docs/decisions/README.md':
    '# Decision records\n\n## Index\n\n| Record | Decision |\n| --- | --- |\n' +
    '| [0001](0001-a-choice.md) | A choice |\n\nThe records follow.\n',
  'docs/decisions/0001-a-choice.md':
    '# 0001. A choice\n\n- Status: Accepted\n- Date: 2026-01-01\n\n' +
    '## Context\n\nFacts.\n\n## Decision\n\nThe choice.\n\n## Consequences\n\nThe cost.\n',
  'docs/audits/2026-01-01/report.md':
    '# Audit\n\nAudited on 2026-01-01 against commit `abc1234`.\n\nFindings.\n',
  'docs/design/001-a-design.md':
    '# A design\n\nStatus: active\n\n## Decisions\n\n' +
    'See [0001](../decisions/0001-a-choice.md).\n',
  'docs/plans/001-a-plan.md':
    '# A plan\n\nStatus: active\n\n## Decisions\n\n' +
    'See [0001](../decisions/0001-a-choice.md).\n',
  'docs/plans/002-an-old-plan.md':
    '# An old plan\n\nStatus: superseded by [the plan](./001-a-plan.md)\n\n' +
    '## Decisions\n\nSee [the index](../decisions/README.md).\n\n' +
    '```ts\nconst copied = true;\n```\n',
};

/**
 * Runs the checker over the baseline tree with the given changes. A value of
 * the empty string removes the file.
 *
 * @param {Record<string, string>} overrides
 * @returns {{ status: number; output: string }}
 */
function check(overrides) {
  const directory = mkdtempSync(join(tmpdir(), 'notesapp-docs-'));
  try {
    for (const [name, content] of Object.entries({
      ...baseline,
      ...overrides,
    })) {
      if (content === '') continue;
      const file = join(directory, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    const result = spawnSync(process.execPath, [checker, '--root', directory], {
      encoding: 'utf8',
    });
    return {
      status: result.status ?? 1,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

await test('a complete tree passes', () => {
  const result = check({});
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /known directories/);
});

await test('the placement rule names every known directory', () => {
  assert.equal(placementFailure('README.md'), null);
  assert.equal(placementFailure('guide/offline.md'), null);
  assert.equal(placementFailure('audits/2026-01-01/report.md'), null);
  assert.match(
    String(placementFailure('notes/stray.md')),
    /not a documentation directory/,
  );
  assert.match(
    String(placementFailure('stray.md')),
    /Only README\.md belongs there/,
  );
  assert.match(
    String(placementFailure('guide/writing/notes.md')),
    /holds no subdirectory/,
  );
  assert.match(
    String(placementFailure('audits/september/report.md')),
    /Name the directory YYYY-MM-DD/,
  );
});

await test('a document outside a known directory fails', () => {
  const result = check({ 'docs/notes/stray.md': '# Stray\n' });
  assert.equal(result.status, 1);
  assert.match(result.output, /docs\/notes\/stray\.md/);
});

await test('the fence reader reports the language of every block', () => {
  const languages = fenceLanguages(
    '```sh\na\n```\n\ntext\n\n~~~ts\nb\n~~~\n\n```\nc\n```\n',
  ).map((fence) => fence.language);
  assert.deepEqual(languages, ['sh', 'ts', '']);
});

await test('a code block that is not a shell command fails', () => {
  const result = check({
    'docs/development/architecture.md':
      '# Architecture\n\n```ts\nconst copied = true;\n```\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /a "ts" block/);
});

await test('a superseded document may hold any code block', () => {
  assert.equal(
    isSuperseded('# A\n\nStatus: superseded by [x](./x.md)\n'),
    true,
  );
  assert.equal(isSuperseded('# A\n\nStatus: active\n'), false);
  const result = check({});
  assert.equal(result.status, 0, result.output);
});

await test('an active document with the same code block fails', () => {
  const result = check({
    'docs/plans/002-an-old-plan.md':
      '# An old plan\n\nStatus: active\n\n' +
      '## Decisions\n\nSee [the index](../decisions/README.md).\n\n' +
      '```ts\nconst copied = true;\n```\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /a "ts" block/);
});

await test('a plan or a design without a status line fails', () => {
  for (const [file, text] of [
    ['docs/plans/001-a-plan.md', '# A plan\n\n## Decisions\n\nNone.\n'],
    ['docs/design/001-a-design.md', '# A design\n\n## Decisions\n\nNone.\n'],
  ]) {
    const result = check({ [String(file)]: String(text) });
    assert.equal(result.status, 1);
    assert.match(result.output, /no "Status:" line/);
  }
});

await test('a design without a Decisions heading fails', () => {
  const result = check({
    'docs/design/001-a-design.md': '# A design\n\nStatus: active\n\nProse.\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /no "Decisions" heading/);
});

await test('a plan whose Decisions heading links no record fails', () => {
  const result = check({
    'docs/plans/001-a-plan.md':
      '# A plan\n\nStatus: active\n\n## Decisions\n\nNone yet.\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /no link into decisions\//);
});

await test('a decision record without a template heading fails', () => {
  const result = check({
    'docs/decisions/0001-a-choice.md':
      '# 0001. A choice\n\n- Status: Accepted\n- Date: 2026-01-01\n\n' +
      '## Context\n\nFacts.\n\n## Decision\n\nThe choice.\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /"## Consequences" is missing/);
});

await test('a decision record without a status line fails', () => {
  const result = check({
    'docs/decisions/0001-a-choice.md':
      '# 0001. A choice\n\n- Date: 2026-01-01\n\n' +
      '## Context\n\nFacts.\n\n## Decision\n\nThe choice.\n\n## Consequences\n\nThe cost.\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /no "- Status:" line/);
});

await test('an audit without a date or a commit fails', () => {
  const result = check({
    'docs/audits/2026-01-01/report.md': '# Audit\n\nFindings.\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /no date in the first 10 lines/);
  assert.match(result.output, /no commit in the first 10 lines/);
});

await test('an audit that names them late fails', () => {
  const filler = Array.from({ length: 12 }, () => 'Text.').join('\n');
  const result = check({
    'docs/audits/2026-01-01/report.md': `# Audit\n\n${filler}\n\nCommit \`abc1234\` on 2026-01-01.\n`,
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /no date in the first 10 lines/);
});

await test('a guide page without the audience sentence fails', () => {
  const result = check({
    'docs/guide/quickstart.md': '# Quick start\n\nRun the command.\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /no "This page is for \.\.\." sentence/);
});

await test('a document without a title line fails', () => {
  const result = check({
    'docs/development/architecture.md': 'Architecture\n===\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /not a "# " title/);
});

await test('the link reader skips absolute links, anchors and code', () => {
  assert.deepEqual(
    relativeLinks(
      '[a](./one.md) [b](https://example.com/x) [c](#here) [d](../two.md#part)\n' +
        '`[e](./three.md)`\n\n```text\n[f](./four.md)\n```\n',
    ),
    ['./one.md', '../two.md'],
  );
});

await test('a relative link to a missing file fails', () => {
  const result = check({
    'docs/development/architecture.md':
      '# Architecture\n\nSee [the gone page](./gone.md).\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /"\.\/gone\.md" resolves to no file/);
});

await test('a broken link in a root file fails', () => {
  const result = check({
    'README.md': '# Project\n\nSee [the documents](docs/gone.md).\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /README\.md: the link "docs\/gone\.md"/);
});

await test('a missing root file fails', () => {
  const result = check({ 'CONTRIBUTING.md': '' });
  assert.equal(result.status, 1);
  assert.match(result.output, /CONTRIBUTING\.md: missing/);
});

await test('the path reader finds a repository path inside a code span', () => {
  const found = namedPaths(
    '# A page\n\nRead `apps/web/src/app.tsx` and `packages/core/`.\n' +
      'It is not `a phrase` and not `./relative.ts`.\n',
  );
  assert.deepEqual(
    found.map((entry) => entry.path),
    ['apps/web/src/app.tsx', 'packages/core/'],
  );
  assert.equal(found[0]?.line, 3);
});

await test('the path reader passes over a shape with a placeholder in it', () => {
  const found = namedPaths('`apps/web/src/features/<feature>/<name>.tsx`\n');
  assert.deepEqual(found, []);
});

await test('a development page that names a file which is gone fails', () => {
  // The defect this covers: a page pointed at two files under a server
  // directory that a decision moved, and nothing refused the pointer, so the
  // page told a reader to open a file that is not there.
  const result = check({
    'docs/development/architecture.md':
      '# Architecture\n\nRead `apps/server/src/http/register.ts`.\n',
  });
  assert.equal(result.status, 1);
  assert.match(
    result.output,
    /"apps\/server\/src\/http\/register\.ts" names no file/,
  );
});

await test('a decision record keeps the path it named when it was accepted', () => {
  // A record states what somebody believed at one moment and is never edited
  // again, so a path in one is history and not a claim about the tree today.
  const result = check({
    'docs/decisions/0001-a-choice.md':
      '# 0001. A choice\n\n- Status: Accepted\n- Date: 2026-01-01\n\n' +
      '## Context\n\nIt named `apps/server/src/http/register.ts`.\n\n' +
      '## Decision\n\nThe choice.\n\n## Consequences\n\nThe cost.\n',
  });
  assert.equal(result.status, 0, result.output);
});

await test('a development page over the line cap fails', () => {
  const body = ['# Architecture', ''];
  while (body.length < maximumDevelopmentLines + 1) body.push('Text.');
  const result = check({
    'docs/development/architecture.md': `${body.join('\n')}\n`,
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /151 lines\. A page of development\//);
});

/**
 * A decision record that satisfies every rule, with the given number.
 *
 * @param {string} number
 */
function record(number) {
  return (
    `# ${number}. A choice\n\n- Status: Accepted\n- Date: 2026-01-01\n\n` +
    '## Context\n\nFacts.\n\n## Decision\n\nThe choice.\n\n## Consequences\n\nThe cost.\n'
  );
}

/**
 * An index whose table holds the given rows, then the given trailing text.
 *
 * @param {string[]} rows
 * @param {string} [after]
 */
function decisionIndex(rows, after = '') {
  return (
    '# Decision records\n\n## Index\n\n| Record | Decision |\n| --- | --- |\n' +
    rows
      .map((name) => `| [${name.slice(0, 4)}](${name}) | A choice |\n`)
      .join('') +
    after
  );
}

await test('a record whose row sits after a blank line fails', () => {
  // The defect this covers: three rows were written after a blank line, so
  // the table ended above them and they showed as a paragraph of pipes.
  const result = check({
    'docs/decisions/0002-a-second-choice.md': record('0002'),
    'docs/decisions/README.md': decisionIndex(
      ['0001-a-choice.md'],
      '\n| [0002](0002-a-second-choice.md) | A second choice |\n',
    ),
  });
  assert.equal(result.status, 1);
  assert.match(
    result.output,
    /0002-a-second-choice\.md has no row in the index table/,
  );
});

await test('two records with one number fail', () => {
  // The defect this covers: a branch took record numbers that the main line
  // had already given to other records.
  const result = check({
    'docs/decisions/0001-another-choice.md': record('0001'),
    'docs/decisions/README.md': decisionIndex([
      '0001-a-choice.md',
      '0001-another-choice.md',
    ]),
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /share the number 0001/);
});

await test('the index rule refuses a missing heading, a stray row and an order', () => {
  assert.match(
    String(decisionIndexFailures(['0001-a.md'], '# Records\n')[0]),
    /no "## Index" heading/,
  );
  assert.deepEqual(
    decisionIndexFailures(
      ['0000-template.md', 'README.md', '0001-a.md', '0002-b.md'],
      decisionIndex(['0001-a.md', '0002-b.md']),
    ),
    [],
  );
  assert.match(
    decisionIndexFailures(
      ['0001-a.md'],
      decisionIndex(['0001-a.md', '0003-c.md']),
    ).join('\n'),
    /the index row for 0003-c\.md names no record/,
  );
  assert.match(
    decisionIndexFailures(
      ['0001-a.md', '0002-b.md'],
      decisionIndex(['0002-b.md', '0001-a.md']),
    ).join('\n'),
    /0001-a\.md follows 0002-b\.md/,
  );
});
