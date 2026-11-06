import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  decisionIndexFailures,
  namedPaths,
  relativeLinks,
  retiredNames,
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
  assert.match(
    result.output,
    /Markdown files under docs\/ passed integrity checks/,
  );
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

await test('a guide page that names the move to Trash Delete fails', () => {
  // Issue 245: the guide said Delete note and Delete folder for the action
  // that the application calls Move to Trash.
  const result = check({
    'docs/guide/quickstart.md':
      '# Quick start\n\nThis page is for the person who writes notes.\n\n' +
      'Open the row menu and select **Delete folder**.\n',
  });
  assert.equal(result.status, 1);
  assert.match(
    result.output,
    /quickstart\.md:5: \*\*Delete folder\*\* names an action the application calls Move to Trash/,
  );
});

await test('the retired names are found and the application words pass', () => {
  assert.deepEqual(
    retiredNames('Select **Delete note**.\nSelect **Delete this note**.'),
    [
      { line: 1, name: '**Delete note**' },
      { line: 2, name: '**Delete this note**' },
    ],
  );
  assert.deepEqual(
    retiredNames('Select **Move to Trash**. In Trash, **Delete** removes it.'),
    [],
  );
});

// These shapes have no placement or prose policy. Each still gets link checks.
await test('optional layouts and measured prose keep link integrity', () => {
  for (const path of [
    'docs/reference.md',
    'docs/notes/Deep Folder/inner/reference.md',
    'docs/design/Bad Task/inner/copy.md',
    'docs/audits/not-a-date/report.md',
    'docs/plans/001-a-plan.md',
    'docs/decisions/0001-a-choice.md',
    'docs/development/architecture.md',
  ]) {
    const text = 'Ordinary record\n===\n\nIt took 300 ms for 10 KB at 40%.\n';
    const accepted = check({ [path]: text });
    assert.equal(accepted.status, 0, `${path}: ${accepted.output}`);
    const broken = check({ [path]: text + '[gone](gone.md)\n' });
    assert.equal(broken.status, 1, path);
    assert.match(broken.output, /the link "gone\.md" resolves to no file/);
  }
});

await test('a design folder can hold assets without a README', () => {
  const result = check({
    'docs/design/Bad Task/inner/prototype.html': '<!doctype html>\n',
  });
  assert.equal(result.status, 0, result.output);
});

await test('fence languages and historical status do not restrict examples', () => {
  for (const language of [
    '',
    'json',
    'text',
    'console',
    'ts',
    'sh',
    'bash',
    'shell',
  ]) {
    for (const status of ['active', 'superseded by an earlier record']) {
      const text =
        `# Example\n\nStatus: ${status}\n\n` +
        `\`\`\`${language}\n[literal](missing-in-example.md)\n\`\`\`\n` +
        '~~~text\n[also literal](missing-in-tilde.md)\n~~~\n' +
        '`[inline](missing-inline.md)`\n';
      const path = 'docs/plans/001-a-plan.md';
      const accepted = check({ [path]: text });
      assert.equal(accepted.status, 0, accepted.output);
      const broken = check({ [path]: text + '[gone](gone.md)\n' });
      assert.equal(broken.status, 1);
      assert.match(broken.output, /the link "gone\.md" resolves to no file/);
      assert.doesNotMatch(broken.output, /missing-in-|missing-inline/);
    }
  }
});

await test('a long development page still checks paths and links', () => {
  const path = 'docs/development/architecture.md';
  const text = '# Architecture\n\n' + 'Text.\n'.repeat(200);
  const accepted = check({ [path]: text });
  assert.equal(accepted.status, 0, accepted.output);
  const broken = check({ [path]: text + '[gone](gone.md)\n`apps/gone.ts`\n' });
  assert.equal(broken.status, 1);
  assert.match(broken.output, /the link "gone\.md" resolves to no file/);
  assert.match(broken.output, /the path "apps\/gone\.ts" names no file/);
});

await test('nested living pages keep current paths and safe action names', () => {
  for (const kind of ['development', 'guide']) {
    const path = `docs/${kind}/nested/page.md`;
    const accepted = check({
      [path]: '# Page\n\nRead `apps/present.ts` and `apps/<name>.ts`.\n',
      'apps/present.ts': 'export {};\n',
    });
    assert.equal(accepted.status, 0, accepted.output);
    const broken = check({ [path]: '# Page\n\nRead `apps/gone.ts`.\n' });
    assert.equal(broken.status, 1);
    assert.match(broken.output, /the path "apps\/gone\.ts" names no file/);
  }
  const unsafe = check({
    'docs/guide/nested/page.md': '# Page\n\nSelect **Delete note**.\n',
  });
  assert.equal(unsafe.status, 1);
  assert.match(
    unsafe.output,
    /names an action the application calls Move to Trash/,
  );
  const safe = check({
    'docs/guide/quickstart.md':
      '# Page\n\nSelect **Move to Trash**. In Trash, **Delete** removes it.\n',
  });
  assert.equal(safe.status, 0, safe.output);
});

await test('historical paths remain history without template headers', () => {
  for (const path of [
    'docs/design/001-a-design.md',
    'docs/plans/001-a-plan.md',
    'docs/audits/2026-01-01/report.md',
    'docs/decisions/0001-a-choice.md',
  ]) {
    const result = check({ [path]: 'It named `apps/gone.ts`.\n' });
    assert.equal(result.status, 0, result.output);
  }
});

await test('both required root files must exist and keep valid links', () => {
  for (const path of ['README.md', 'CONTRIBUTING.md']) {
    const missing = check({ [path]: '' });
    assert.equal(missing.status, 1);
    assert.ok(missing.output.includes(`${path}: missing.`));
    const broken = check({ [path]: '# Root\n\n[gone](gone.md)\n' });
    assert.equal(broken.status, 1);
    assert.ok(broken.output.includes(`${path}: the link "gone.md"`));
  }
});

await test('missing and empty docs trees fail', () => {
  const directory = mkdtempSync(join(tmpdir(), 'notesapp-docs-empty-'));
  try {
    for (const path of ['README.md', 'CONTRIBUTING.md'])
      writeFileSync(join(directory, path), '# Root\n');
    for (const empty of [false, true]) {
      if (empty) mkdirSync(join(directory, 'docs'));
      const result = spawnSync(
        process.execPath,
        [checker, '--root', directory],
        { encoding: 'utf8' },
      );
      assert.equal(result.status, 1);
      assert.match(result.stderr, /docs\/: no document/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

await test('decision index failures remain fatal without record templates', () => {
  /** @type {[string, RegExp][]} */
  const cases = [
    ['# Records\n', /no "## Index" heading/],
    [decisionIndex([]), /0001-a-choice\.md has no row/],
    [decisionIndex(['0001-a-choice.md', '0003-gone.md']), /names no record/],
    [
      decisionIndex(['0002-second.md', '0001-a-choice.md']),
      /follows 0002-second\.md/,
    ],
    [
      decisionIndex(['0001-a-choice.md', '0001-a-choice.md']),
      /follows 0001-a-choice\.md/,
    ],
  ];
  for (const [index, expected] of cases) {
    const result = check({
      'docs/decisions/0001-a-choice.md': 'A choice.\n',
      'docs/decisions/0002-second.md': 'Another choice.\n',
      'docs/decisions/README.md': String(index),
    });
    assert.equal(result.status, 1);
    assert.match(result.output, expected);
  }
});

await test('bad CLI arguments fail', () => {
  for (const args of [['--unknown'], ['--root'], ['--root', '.', 'extra']]) {
    const result = spawnSync(process.execPath, [checker, ...args], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: node tools\/check-docs\.mjs/);
  }
});
