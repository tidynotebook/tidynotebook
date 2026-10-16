import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  allowedFenceLanguages,
  decisionIndexFailures,
  designFolderFailures,
  fenceAllowFile,
  fenceLanguages,
  isDesignSupport,
  isSuperseded,
  maximumDevelopmentLines,
  measuredAllowFile,
  measuredQuantities,
  namedPaths,
  placementFailure,
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

await test('a design is one file or one task folder', () => {
  assert.equal(placementFailure('design/001-a-design.md'), null);
  assert.equal(placementFailure('design/028-a-task/README.md'), null);
  assert.equal(placementFailure('design/028-a-task/copy.md'), null);
  assert.match(
    String(placementFailure('design/A Task/README.md')),
    /not a design task name/,
  );
  assert.match(
    String(placementFailure('design/028-a-task/nested/copy.md')),
    /one directory deep/,
  );
  assert.equal(isDesignSupport('design/028-a-task/copy.md'), true);
  assert.equal(isDesignSupport('design/028-a-task/README.md'), false);
  assert.equal(isDesignSupport('design/001-a-design.md'), false);
  assert.deepEqual(
    designFolderFailures([
      { name: '028-a-task', hasIndex: true },
      { name: '029-no-index', hasIndex: false },
      { name: 'Bad Task', hasIndex: true },
    ]),
    [
      'docs/design/029-no-index/: no README.md. A design task folder holds the design in its README.md.',
      'docs/design/Bad Task/: "Bad Task" is not a design task name. Use lowercase letters, digits and hyphens.',
    ],
  );
});

await test('a design task folder passes with its index and its files', () => {
  const result = check({
    'docs/design/028-a-task/README.md':
      '# A task\n\nStatus: active\n\n## Decisions\n\nNone yet. See [the copy](copy.md).\n',
    'docs/design/028-a-task/copy.md': '# The copy\n\nProse.\n',
  });
  assert.equal(result.status, 0, result.output);
});

await test('a design task folder holds the header in its index', () => {
  const result = check({
    'docs/design/028-a-task/README.md': '# A task\n\nProse.\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /028-a-task\/README\.md: no "Status:" line/);
  assert.match(result.output, /028-a-task\/README\.md: no "Decisions" heading/);
});

await test('a supporting file of a design task folder needs a title', () => {
  const result = check({
    'docs/design/028-a-task/README.md':
      '# A task\n\nStatus: active\n\n## Decisions\n\nNone.\n',
    'docs/design/028-a-task/copy.md': 'No title.\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /copy\.md: the first line is not a "# " title/);
  assert.doesNotMatch(result.output, /copy\.md: no "Status:" line/);
});

await test('a design task folder with no index fails', () => {
  const result = check({ 'docs/design/028-a-task/copy.md': '# The copy\n' });
  assert.equal(result.status, 1);
  assert.match(result.output, /docs\/design\/028-a-task\/: no README\.md/);
});

await test('a design task folder keeps the link and measure rules', () => {
  const result = check({
    'docs/design/028-a-task/README.md':
      '# A task\n\nStatus: active\n\n## Decisions\n\nNone. See [gone](gone.md).\n',
    'docs/design/028-a-task/copy.md': '# The copy\n\nIt waits 300 ms.\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /the link "gone\.md" resolves to no file/);
  assert.match(result.output, /copy\.md:3: "300 ms" is a measured result/);
});

await test('a design task folder with only assets and no index fails', () => {
  const result = check({
    'docs/design/028-a-task/prototype.html': '<!doctype html>\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /docs\/design\/028-a-task\/: no README\.md/);
});

await test('a design folder with a wrong name fails, also with only assets', () => {
  const result = check({
    'docs/design/Bad Task/prototype.html': '<!doctype html>\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /"Bad Task" is not a design task name/);
  assert.match(result.output, /docs\/design\/Bad Task\/: no README\.md/);
});

await test('a design task keeps its assets in a subfolder', () => {
  const result = check({
    'docs/design/028-a-task/README.md':
      '# A task\n\nStatus: active\n\n## Decisions\n\nNone. See [a sample](email/a.html).\n',
    'docs/design/028-a-task/email/a.html': '<!doctype html>\n',
    'docs/design/028-a-task/email/a.txt': 'Plain text.\n',
  });
  assert.equal(result.status, 0, result.output);
});

await test('a task cannot nest inside a task', () => {
  const result = check({
    'docs/design/028-a-task/README.md':
      '# A task\n\nStatus: active\n\n## Decisions\n\nNone.\n',
    'docs/design/028-a-task/inner/README.md':
      '# Inner\n\nStatus: active\n\n## Decisions\n\nNone.\n',
  });
  assert.equal(result.status, 1);
  assert.match(
    result.output,
    /inner\/README\.md: a design task folder sits in design\/<task>\/, one directory deep/,
  );
});

await test('a flat numbered design still passes beside a task folder', () => {
  const result = check({
    'docs/design/002-another-design.md':
      '# Another design\n\nStatus: complete\n\n## Decisions\n\nNone.\n',
    'docs/design/028-a-task/README.md':
      '# A task\n\nStatus: active\n\n## Decisions\n\nNone.\n',
  });
  assert.equal(result.status, 0, result.output);
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

// The root rule allows one code block: a shell command that the reader runs.
// A block with no language and a text block are not shell commands.
await test('a block with no language fails', () => {
  const result = check({
    'docs/development/architecture.md':
      '# Architecture\n\n```\nconst copied = true;\n```\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /a block with no language/);
});

await test('a text block and a console block fail', () => {
  for (const language of ['text', 'console']) {
    const result = check({
      'docs/guide/quickstart.md':
        '# Quick start\n\nThis page is for the person who runs a server.\n\n' +
        `\`\`\`${language}\nhttp://127.0.0.1:3000\n\`\`\`\n`,
    });
    assert.equal(result.status, 1, language);
    assert.match(result.output, new RegExp(`a "${language}" block`));
  }
});

await test('a sh, a bash and a shell block pass', () => {
  const result = check({
    'docs/guide/quickstart.md':
      '# Quick start\n\nThis page is for the person who runs a server.\n\n' +
      '```sh\na\n```\n\n```bash\nb\n```\n\n```shell\nc\n```\n',
  });
  assert.equal(result.status, 0, result.output);
});

await test('an accepted audit keeps its block, and a stale entry fails', () => {
  /** @param {string} file */
  const allow = (file) =>
    JSON.stringify({ allow: [{ file, reason: 'Accepted before the rule.' }] });
  const audit = 'docs/audits/2026-01-01/report.md';
  const kept = check({
    [audit]:
      '# Audit\n\nAudited on 2026-01-01 against commit `abc1234`.\n\n' +
      '```\na | b\n```\n',
    [fenceAllowFile]: allow(audit),
  });
  assert.equal(kept.status, 0, kept.output);
  const stale = check({ [fenceAllowFile]: allow(audit) });
  assert.equal(stale.status, 1);
  assert.match(stale.output, /report\.md holds no refused block now/);
});

await test('the documentation index names exactly the allowed languages', () => {
  const index = readFileSync(
    fileURLToPath(new URL('../docs/README.md', import.meta.url)),
    'utf8',
  ).replace(/\s+/g, ' ');
  const sentence = /a fenced block in ([^.]*)\bis allowed/.exec(index)?.[1];
  assert.ok(sentence !== undefined, 'docs/README.md names no fence language.');
  const named = [...sentence.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
  assert.deepEqual(new Set(named), new Set(allowedFenceLanguages));
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

/**
 * A decision record whose context holds one more line.
 *
 * @param {string} line
 * @returns {string}
 */
function recordWith(line) {
  return (
    '# 0001. A choice\n\n- Status: Accepted\n- Date: 2026-01-01\n\n' +
    `## Context\n\n${line}\n\n## Decision\n\nThe choice.\n\n` +
    '## Consequences\n\nThe cost.\n'
  );
}

await test('the quantity reader finds a time, a size and a share', () => {
  // Review of the audit of 2026-10-02. Records copied measured results, such
  // as a median time and the bytes of a read, and no check refused them.
  assert.deepEqual(
    measuredQuantities(
      'A move takes about 200 ms at the median.\n' +
        'A read of a 500 KB note sends 1.15 MB, and 4 GiB is the bound.\n' +
        'A proxy waits 60 seconds, a 3-second budget, and 2s, at 40% of it.',
    ).map((found) => [found.line, found.quantity]),
    [
      [1, '200 ms'],
      [2, '500 KB'],
      [2, '1.15 MB'],
      [2, '4 GiB'],
      [3, '60 seconds'],
      [3, '3-second'],
      [3, '2s'],
      [3, '40%'],
    ],
  );
});

await test('the quantity reader passes over a name, a count, code and an address', () => {
  assert.deepEqual(
    measuredQuantities(
      'Record 0170 answers issue 256 and finding 13, with 503 and F2.\n' +
        'The p95 key, a $5 price, 1010 notes and 65534 files are no unit.\n' +
        'The constant `maxArchiveBytes = 4 GiB` names code.\n' +
        'See [the audit](../audits/x.md#a-5-ms-read) and <https://a.example/50%22>.\n' +
        'Read https://a.example/?q=%22Interface+012%22 for it.\n' +
        '```sh\nsleep 5s\n```\n',
    ),
    [],
  );
});

await test('a record that copies a measured result fails', () => {
  const result = check({
    'docs/decisions/0001-a-choice.md': recordWith(
      'A move from a note to the list takes about 200 ms at the median.',
    ),
  });
  assert.equal(result.status, 1);
  assert.match(
    result.output,
    /0001-a-choice\.md:8: "200 ms" is a measured result or a configured value/,
  );
});

await test('a design, a plan and a development page that copy a value fail', () => {
  for (const [path, text] of Object.entries({
    'docs/design/001-a-design.md':
      '# A design\n\nStatus: active\n\nThe library is about 10 KB.\n\n' +
      '## Decisions\n\nSee [0001](../decisions/0001-a-choice.md).\n',
    'docs/plans/001-a-plan.md':
      '# A plan\n\nStatus: active\n\nKeep the bundle under 256 KB.\n\n' +
      '## Decisions\n\nSee [0001](../decisions/0001-a-choice.md).\n',
    'docs/development/architecture.md':
      '# Architecture\n\nThe shape of the system. An import holds 4 GiB.\n',
  })) {
    const result = check({ [path]: text });
    assert.equal(result.status, 1, path);
    assert.match(result.output, /is a measured result or a configured value/);
  }
});

await test('a guide page, an audit and a superseded document may hold a quantity', () => {
  const result = check({
    'docs/guide/quickstart.md':
      '# Quick start\n\nThis page is for the person who runs a server.\n\n' +
      'An import takes a zip file of up to 4 GiB.\n',
    'docs/audits/2026-01-01/report.md':
      '# Audit\n\nAudited on 2026-01-01 against commit `abc1234`.\n\n' +
      'A move took 202 ms at the median.\n',
    'docs/plans/002-an-old-plan.md':
      '# An old plan\n\nStatus: superseded by [the plan](./001-a-plan.md)\n\n' +
      '## Decisions\n\nSee [the index](../decisions/README.md).\n\n' +
      'Keep the bundle under 256 KB.\n',
  });
  assert.equal(result.status, 0, result.output);
});

await test('an accepted document keeps its quantities, and a stale entry fails', () => {
  /** @param {string} file */
  const allow = (file) =>
    JSON.stringify({ allow: [{ file, reason: 'Accepted before the rule.' }] });
  const kept = check({
    'docs/decisions/0001-a-choice.md': recordWith('The claim took 233 ms.'),
    [measuredAllowFile]: allow('docs/decisions/0001-a-choice.md'),
  });
  assert.equal(kept.status, 0, kept.output);
  const stale = check({
    [measuredAllowFile]: allow('docs/decisions/0001-a-choice.md'),
  });
  assert.equal(stale.status, 1);
  assert.match(
    stale.output,
    /0001-a-choice\.md holds no measured quantity of a living document now/,
  );
});
