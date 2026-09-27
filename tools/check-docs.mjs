/**
 * Documentation check.
 *
 * `docs/README.md` states what each documentation directory means and how to
 * write a document of that kind. This check holds the parts of that page that
 * a machine can prove, so the tree cannot drift away from its own index.
 *
 * 1. Every `.md` file under `docs/` sits in a known directory, so a reader and
 *    an agent can tell the kind of a document from its path alone.
 * 2. The code is the source of truth. A fenced block whose language is not a
 *    shell the reader runs is a copy of code, so it is refused. A document
 *    whose status line says that it is superseded is frozen, so only that one
 *    rule steps back for it.
 * 3. Each kind carries its required header: the ADR template for a decision, a
 *    date and a commit for an audit, a status line for a plan and a design, and
 *    the "who this is for" sentence for a guide page. A design and a plan also
 *    carry the "Decisions" heading that joins the two kinds, and a plan links
 *    into `decisions/` from it.
 * 4. Every relative link resolves, so a move cannot leave a dead pointer.
 * 5. Every repository path that a living document names inside a code span is
 *    really there, so a move of a file fails the gate instead of leaving a
 *    false pointer. A living document is one under `development/` or
 *    `guide/`: those two state what the product is now. A decision record, a
 *    design, an audit and a plan state what somebody believed at one moment
 *    and are never edited again, so a path in one of them is history and not
 *    a claim about the tree today.
 * 6. A page under `development/` stays under the line cap that
 *    `docs/README.md` states, so a page that grew into two pages is split
 *    rather than left to grow.
 * 7. Each decision number names one record, and the index table of
 *    `docs/decisions/README.md` holds one row for each record, in order.
 *
 * A separate root permits a disposable negative check without real documents,
 * in the same shape as `tools/check-agents-md.mjs`.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { root } from './workspace.mjs';

/** The directories that `docs/` may hold, and nothing else. */
export const documentKinds = [
  'guide',
  'development',
  'design',
  'decisions',
  'audits',
  'plans',
];

/** The kinds whose files carry a status line under the title. */
export const statusKinds = ['plans', 'design'];

/**
 * The kinds whose pointers must still be true.
 *
 * These two state what the product is now, so a path in one of them is a
 * claim about the tree today. Every other kind is a record of one moment and
 * is never edited again.
 */
export const livingKinds = ['development', 'guide'];

/** The directories of this repository that a path can start with. */
export const repositoryRoots = [
  'apps/',
  'packages/',
  'tools/',
  'tests/',
  'docs/',
  'rules/',
  'docker/',
];

/** How many lines one page of `development/` may hold. */
export const maximumDevelopmentLines = 150;

/** The fenced block languages that a reader runs, plus plain text. */
export const allowedFenceLanguages = [
  '',
  'sh',
  'bash',
  'shell',
  'console',
  'text',
];

/** The headings that `docs/decisions/0000-template.md` states. */
export const decisionHeadings = [
  '## Context',
  '## Decision',
  '## Consequences',
];

/** The heading under which a design and a plan name their decision records. */
export const decisionsHeading = 'Decisions';

/** The sentence that opens every public guide page. */
export const guideAudiencePrefix = 'This page is for';

/** How many opening lines an audit has to name its date and its commit in. */
export const auditHeaderLines = 10;

/** The root files whose relative links are checked with the documents. */
export const linkedRootFiles = ['README.md', 'CONTRIBUTING.md'];

/**
 * Lists every `.md` file under a directory, as repository relative paths.
 *
 * @param {string} directory
 * @param {string} base
 * @returns {Promise<string[]>}
 */
async function listMarkdown(directory, base) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  /** @type {string[]} */
  const found = [];
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await listMarkdown(full, base)));
    else if (entry.name.endsWith('.md'))
      found.push(relative(base, full).split(sep).join('/'));
  }
  return found.sort();
}

/**
 * States why a document path is not a known kind, or `null` when it is.
 *
 * @param {string} path A path relative to `docs/`, with `/` separators.
 * @returns {string | null}
 */
export function placementFailure(path) {
  const parts = path.split('/');
  if (parts.length === 1)
    return parts[0] === 'README.md'
      ? null
      : 'a document sits at the top of docs/. Only README.md belongs there.';
  const [kind, ...rest] = parts;
  if (!documentKinds.includes(/** @type {string} */ (kind)))
    return `"${kind}" is not a documentation directory. Use one of ${documentKinds.join(', ')}.`;
  if (kind === 'audits') {
    if (rest.length !== 2)
      return 'an audit sits in audits/<date>/, one directory deep.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(/** @type {string} */ (rest[0])))
      return `"${rest[0]}" is not an audit date. Name the directory YYYY-MM-DD.`;
    return null;
  }
  if (rest.length !== 1) return `${kind}/ holds no subdirectory.`;
  return null;
}

/**
 * Lists the fenced block languages of one document, in order.
 *
 * @param {string} text
 * @returns {{ language: string; line: number }[]}
 */
export function fenceLanguages(text) {
  /** @type {{ language: string; line: number }[]} */
  const fences = [];
  /** @type {string | null} */
  let open = null;
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = /** @type {string} */ (lines[index]);
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match) continue;
    const marker = /** @type {string} */ (match[1]);
    const rest = /** @type {string} */ (match[2]).trim();
    if (open === null) {
      if (marker.startsWith('`') && rest.includes('`')) continue;
      open = marker[0] === '`' ? '`' : '~';
      fences.push({ language: rest.split(/\s+/)[0] ?? '', line: index + 1 });
    } else if (marker[0] === open && rest === '') open = null;
  }
  return fences;
}

/**
 * Lists the link targets of one document that address another file.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function relativeLinks(text) {
  const withoutFences = text.replace(/^ {0,3}(`{3,}|~{3,})[\s\S]*?\1/gm, '');
  const withoutCode = withoutFences.replace(/`[^`\n]*`/g, '');
  /** @type {string[]} */
  const targets = [];
  for (const match of withoutCode.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = /** @type {string} */ (match[1]);
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    if (target.startsWith('#')) continue;
    const path = target.split('#')[0];
    if (path) targets.push(path);
  }
  return targets;
}

/**
 * Reads the status line of a document, or `null` when it has none.
 *
 * @param {string} text
 * @returns {string | null}
 */
export function statusLine(text) {
  const match = /^Status: *(\S.*)$/m.exec(text);
  return match === null ? null : /** @type {string} */ (match[1]).trim();
}

/**
 * Answers whether a document is frozen, because a newer one replaced it.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function isSuperseded(text) {
  return /^superseded by \S/i.test(statusLine(text) ?? '');
}

/**
 * Answers whether a document holds the heading that names its decisions.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function hasDecisionsHeading(text) {
  return new RegExp(`^#{1,6} .*\\b${decisionsHeading}\\b`, 'im').test(text);
}

/**
 * Checks the header that the kind of a document requires.
 *
 * @param {string} kind
 * @param {string} name
 * @param {string} text
 * @returns {string[]}
 */
export function headerFailures(kind, name, text) {
  /** @type {string[]} */
  const failures = [];
  const lines = text.split('\n');
  if (!(lines[0] ?? '').startsWith('# '))
    failures.push('the first line is not a "# " title.');
  const opening = lines.slice(0, auditHeaderLines).join('\n');
  if (kind === 'guide' && !text.includes(guideAudiencePrefix))
    failures.push(
      `no "${guideAudiencePrefix} ..." sentence. A guide page states its reader.`,
    );
  if (kind === 'decisions' && name !== 'README.md') {
    for (const heading of decisionHeadings)
      if (!text.includes(`\n${heading}\n`))
        failures.push(`the ADR template heading "${heading}" is missing.`);
    if (!/^- Status: \S/m.test(text)) failures.push('no "- Status:" line.');
    if (!/^- Date: \S/m.test(text)) failures.push('no "- Date:" line.');
  }
  if (kind === 'audits') {
    if (!/\d{4}-\d{2}-\d{2}/.test(opening))
      failures.push(
        `no date in the first ${auditHeaderLines} lines. An audit names when it was read.`,
      );
    if (!/\b[0-9a-f]{7,40}\b/.test(opening))
      failures.push(
        `no commit in the first ${auditHeaderLines} lines. An audit names what it read.`,
      );
  }
  if (statusKinds.includes(kind) && statusLine(text) === null)
    failures.push(
      'no "Status:" line. A plan and a design state whether they are active, complete, or superseded.',
    );
  if ((kind === 'design' || kind === 'plans') && !hasDecisionsHeading(text))
    failures.push(
      `no "${decisionsHeading}" heading. A design and a plan name the decision records that they produced.`,
    );
  if (
    kind === 'plans' &&
    !relativeLinks(text).some((target) => target.includes('decisions/'))
  )
    failures.push(
      'no link into decisions/. A plan turns decision records into ordered work.',
    );
  return failures;
}

/** The heading of `docs/decisions/README.md` that holds the record table. */
export const decisionIndexHeading = '## Index';

/**
 * Checks that the decision records and their index agree.
 *
 * Two branches can take the same next number, and a row written after a
 * blank line ends the table and becomes a paragraph of pipes that no reader
 * sees as a row. So every number has one record, and every record has one
 * row inside the one table under the index heading, in number order.
 *
 * @param {string[]} names The file names in `docs/decisions/`.
 * @param {string} index The text of `docs/decisions/README.md`.
 * @returns {string[]}
 */
export function decisionIndexFailures(names, index) {
  /** @type {string[]} */
  const failures = [];
  const records = names
    .filter((name) => /^\d{4}-.+\.md$/.test(name))
    .filter((name) => !name.startsWith('0000-'))
    .sort();
  /** @type {Map<string, string>} */
  const byNumber = new Map();
  for (const name of records) {
    const number = name.slice(0, 4);
    const earlier = byNumber.get(number);
    if (earlier === undefined) byNumber.set(number, name);
    else
      failures.push(
        `${earlier} and ${name} share the number ${number}. Take the next free number.`,
      );
  }
  const lines = index.split('\n');
  const start = lines.indexOf(decisionIndexHeading);
  if (start === -1)
    return [
      ...failures,
      `no "${decisionIndexHeading}" heading. The index table lists every record.`,
    ];
  let first = start + 1;
  while (first < lines.length && (lines[first] ?? '').trim() === '') first += 1;
  /** @type {string[]} */
  const rows = [];
  for (let line = first; line < lines.length; line += 1) {
    const text = lines[line] ?? '';
    if (!text.startsWith('|')) break;
    const link = /\]\((\d{4}-[^)]+\.md)\)/.exec(text);
    if (link !== null) rows.push(/** @type {string} */ (link[1]));
  }
  const listed = new Set(rows);
  for (const name of records)
    if (!listed.has(name))
      failures.push(
        `${name} has no row in the index table. Add the row inside the table, with no blank line before it.`,
      );
  for (const row of new Set(rows))
    if (!records.includes(row))
      failures.push(`the index row for ${row} names no record.`);
  for (const [position, row] of rows.entries()) {
    const previous = rows[position - 1];
    if (previous !== undefined && previous >= row)
      failures.push(
        `the index row for ${row} follows ${previous}. Keep one row for each record, in number order.`,
      );
  }
  return failures;
}

/**
 * The repository paths that one document names inside a code span.
 *
 * A path is a value in backticks that starts with a directory of this
 * repository. A directory ends with `/` and a file does not, so both shapes
 * are answered and the caller checks whichever it finds.
 *
 * @param {string} text
 * @returns {{ path: string; line: number }[]}
 */
export function namedPaths(text) {
  /** @type {{ path: string; line: number }[]} */
  const found = [];
  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(/`([^`\s]+)`/g)) {
      const value = match[1] ?? '';
      if (!repositoryRoots.some((prefix) => value.startsWith(prefix))) continue;
      // A path with a placeholder in it names a shape and not a file.
      if (/[<>*]/.test(value)) continue;
      found.push({ path: value, line: index + 1 });
    }
  }
  return found;
}

/**
 * Runs the check over one repository tree.
 *
 * @param {string} directory
 * @returns {Promise<number>} The process status.
 */
export async function main(directory) {
  /** @type {string[]} */
  const failures = [];
  const documents = await listMarkdown(join(directory, 'docs'), directory);
  if (documents.length === 0)
    failures.push('docs/: no document. The documentation tree is missing.');
  /** @type {{ path: string; text: string }[]} */
  const linked = [];
  for (const path of documents) {
    const inside = path.slice('docs/'.length);
    const placement = placementFailure(inside);
    if (placement !== null) {
      failures.push(`${path}: ${placement}`);
      continue;
    }
    const parts = inside.split('/');
    const kind =
      parts.length === 1 ? 'index' : /** @type {string} */ (parts[0]);
    const name = /** @type {string} */ (parts.at(-1));
    const text = await readFile(join(directory, path), 'utf8');
    linked.push({ path, text });
    for (const failure of headerFailures(kind, name, text))
      failures.push(`${path}: ${failure}`);
    if (livingKinds.includes(kind)) {
      for (const named of namedPaths(text)) {
        const target = resolve(directory, named.path);
        const found = await stat(target).then(
          () => true,
          () => false,
        );
        if (!found)
          failures.push(
            `${path}:${named.line}: the path "${named.path}" names no file. A document points at code by path.`,
          );
      }
    }
    if (kind === 'development') {
      const lines = text.endsWith('\n')
        ? text.split('\n').length - 1
        : text.split('\n').length;
      if (lines > maximumDevelopmentLines)
        failures.push(
          `${path}: ${String(lines)} lines. A page of development/ stays under ${String(maximumDevelopmentLines)}. A page that grew past it is two pages.`,
        );
    }
    // A superseded document is frozen, so nobody can take a copy of code out
    // of it. Every other rule still holds.
    if (isSuperseded(text)) continue;
    for (const fence of fenceLanguages(text))
      if (!allowedFenceLanguages.includes(fence.language))
        failures.push(
          `${path}:${fence.line}: a "${fence.language}" block. A document points at code and never copies it.`,
        );
  }
  const decisionNames = documents
    .filter((path) => path.startsWith('docs/decisions/'))
    .map((path) => path.slice('docs/decisions/'.length));
  if (decisionNames.length > 0) {
    const index = await readFile(
      join(directory, 'docs/decisions/README.md'),
      'utf8',
    ).catch(() => '');
    for (const failure of decisionIndexFailures(decisionNames, index))
      failures.push(`docs/decisions/README.md: ${failure}`);
  }
  for (const name of linkedRootFiles) {
    const text = await readFile(join(directory, name), 'utf8').catch(
      () => null,
    );
    if (text === null) failures.push(`${name}: missing.`);
    else linked.push({ path: name, text });
  }
  for (const { path, text } of linked)
    for (const target of relativeLinks(text)) {
      const resolved = resolve(directory, dirname(path), target);
      const found = await stat(resolved).then(
        () => true,
        () => false,
      );
      if (!found)
        failures.push(`${path}: the link "${target}" resolves to no file.`);
    }
  if (failures.length > 0) {
    process.stderr.write(
      [
        'Documentation check failed:',
        ...failures.map((failure) => `  ${failure}`),
        '  See docs/README.md for the rule behind each message.',
      ].join('\n') + '\n',
    );
    return 1;
  }
  process.stdout.write(
    `Documents: ${documents.length} files under docs/ sit in ${documentKinds.length} known directories, with every header and every relative link in place.\n`,
  );
  return 0;
}

// The helpers above are imported by the unit test, so the check itself runs
// only when this file is the program.
if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--root')) {
    process.stderr.write(
      'Usage: node tools/check-docs.mjs [--root <directory>]\n',
    );
    process.exit(1);
  }
  process.exit(await main(resolve(args[1] ?? root)));
}
