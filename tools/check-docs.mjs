/**
 * Checks document integrity: relative file links, current repository paths,
 * decision IDs and index rows, and safe guide action names.
 * A separate root permits checks over disposable fixture trees.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { root } from './workspace.mjs';

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
  'docker/',
];

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
    const target = match[1] ?? '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    if (target.startsWith('#')) continue;
    const path = target.split('#')[0];
    if (path) targets.push(path);
  }
  return targets;
}

/**
 * The names of a move to Trash that the application does not show.
 *
 * Each one is the bold name of a control, as a guide page writes it. The
 * application names the action Move to Trash on every surface, from
 * `apps/web/src/lib/note-menu.ts`.
 */
export const retiredActionNames = [
  '**Delete note**',
  '**Delete folder**',
  '**Delete this note**',
];

/**
 * The names of a control on a guide page that the application does not show.
 *
 * @param {string} text
 * @returns {{ line: number; name: string }[]}
 */
export function retiredNames(text) {
  /** @type {{ line: number; name: string }[]} */
  const found = [];
  text.split('\n').forEach((line, index) => {
    for (const name of retiredActionNames)
      if (line.includes(name)) found.push({ line: index + 1, name });
  });
  return found;
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
 * @param {string[]} names The paths relative to `docs/decisions/`.
 * @param {string} index The text of `docs/decisions/README.md`.
 * @returns {string[]}
 */
export function decisionIndexFailures(names, index) {
  /** @type {string[]} */
  const failures = [];
  const records = names
    .filter((name) => /^\d{4}-.+\.md$/.test(basename(name)))
    .filter((name) => !basename(name).startsWith('0000-'))
    .sort();
  /** @type {Map<string, string>} */
  const byNumber = new Map();
  for (const name of records) {
    const number = basename(name).slice(0, 4);
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
    const link = /\]\(((?:[^)\s]+\/)?\d{4}-[^)\s]+\.md)\)/.exec(text);
    if (link !== null) rows.push(link[1] ?? '');
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
    if (previous !== undefined && basename(previous) >= basename(row))
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
    const parts = inside.split('/');
    const kind = parts.length === 1 ? 'index' : (parts[0] ?? '');
    const text = await readFile(join(directory, path), 'utf8');
    linked.push({ path, text });
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
    if (kind === 'guide')
      for (const retired of retiredNames(text))
        failures.push(
          `${path}:${String(retired.line)}: ${retired.name} names an action the application calls Move to Trash.`,
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
    `Documents: ${documents.length} Markdown files under docs/ passed integrity checks.\n`,
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
