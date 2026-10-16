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
 *    shell the reader runs is a copy of code, so it is refused, and so is a
 *    block with no language. A document whose status line says that it is
 *    superseded is frozen, so only that one rule steps back for it. An audit
 *    that `tools/docs-fence-allow.json` names was accepted before the rule
 *    refused a block with no language, and it is never edited again, so it
 *    keeps its blocks. That list only shrinks.
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
 * 8. A guide page names an action by the word the application shows. The
 *    move to Trash is Move to Trash, because in Trash Delete removes a note
 *    for good (issue 245), so a guide page that writes a Delete action for
 *    the move fails.
 * 9. A record, a design, a plan and a development page copy no measured
 *    result and no configured value. A quantity with a unit of time, of size
 *    or of share is one or the other, so it fails outside a code span, a link
 *    address and a fenced block. The words say what the number shows, and a
 *    link names the audit or the code that holds it.
 * 10. A design is one file of `design/`, or one task folder
 *    `design/<task>/` that holds every file of the task. The `README.md` of
 *    the folder is the design and carries its header. Another Markdown file
 *    of the folder supports it, so it carries only a title. The check reads
 *    the folders from the tree, not from the Markdown files, so a folder that
 *    holds only a prototype or an image is held too: its name must be a task
 *    name, and a folder with no `README.md` has no design, so it fails. A
 *    prototype, a sample or an image may sit in a subfolder of the task, but
 *    a Markdown file may not, so no task nests inside another.
 *
 * A separate root permits a disposable negative check without real documents,
 * with disposable fixture files.
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

/** The name of a design task folder: lowercase words and digits. */
export const designTaskName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The file of a design task folder that is the design itself. */
export const designTaskIndex = 'README.md';

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
  'docker/',
];

/** How many lines one page of `development/` may hold. */
export const maximumDevelopmentLines = 150;

/**
 * The fenced block languages of a shell command that the reader runs.
 *
 * The root rule allows one code block, a shell command. A block with no
 * language and a text block are not shell commands, and a console block
 * mixes a command with its output, so each of them is refused.
 */
export const allowedFenceLanguages = ['sh', 'bash', 'shell'];

/** The accepted documents of rule 2, from the root of the checked tree. */
export const fenceAllowFile = 'tools/docs-fence-allow.json';

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
  if (!documentKinds.includes(kind ?? ''))
    return `"${kind}" is not a documentation directory. Use one of ${documentKinds.join(', ')}.`;
  if (kind === 'audits') {
    if (rest.length !== 2)
      return 'an audit sits in audits/<date>/, one directory deep.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rest[0] ?? ''))
      return `"${rest[0]}" is not an audit date. Name the directory YYYY-MM-DD.`;
    return null;
  }
  if (kind === 'design' && rest.length === 2) {
    if (!designTaskName.test(rest[0] ?? ''))
      return `"${rest[0]}" is not a design task name. Use lowercase letters, digits and hyphens.`;
    return null;
  }
  if (kind === 'design' && rest.length > 2)
    return 'a design task folder sits in design/<task>/, one directory deep.';
  if (rest.length !== 1) return `${kind}/ holds no subdirectory.`;
  return null;
}

/**
 * Answers whether a path under `docs/` is a supporting file of a design task
 * folder, which carries only a title.
 *
 * @param {string} path A path relative to `docs/`, with `/` separators.
 * @returns {boolean}
 */
export function isDesignSupport(path) {
  const parts = path.split('/');
  return (
    parts[0] === 'design' && parts.length === 3 && parts[2] !== designTaskIndex
  );
}

/**
 * One folder of `design/`, as the tree holds it.
 *
 * @typedef {{ name: string; hasIndex: boolean }} DesignFolder
 */

/**
 * Reads every folder of `docs/design/`, whatever files it holds.
 *
 * @param {string} directory The root of the checked tree.
 * @returns {Promise<DesignFolder[]>}
 */
export async function readDesignFolders(directory) {
  const design = join(directory, 'docs', 'design');
  const entries = await readdir(design, { withFileTypes: true }).catch(
    () => [],
  );
  /** @type {DesignFolder[]} */
  const folders = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const index = await stat(join(design, entry.name, designTaskIndex)).then(
      (found) => found.isFile(),
      () => false,
    );
    folders.push({ name: entry.name, hasIndex: index });
  }
  return folders.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * States what is wrong with each folder of `design/`.
 *
 * @param {readonly DesignFolder[]} folders
 * @returns {string[]}
 */
export function designFolderFailures(folders) {
  /** @type {string[]} */
  const failures = [];
  for (const folder of folders) {
    const path = `docs/design/${folder.name}/`;
    if (!designTaskName.test(folder.name))
      failures.push(
        `${path}: "${folder.name}" is not a design task name. Use lowercase letters, digits and hyphens.`,
      );
    if (!folder.hasIndex)
      failures.push(
        `${path}: no ${designTaskIndex}. A design task folder holds the design in its ${designTaskIndex}.`,
      );
  }
  return failures;
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
    const line = lines[index] ?? '';
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match) continue;
    const marker = match[1] ?? '';
    const rest = (match[2] ?? '').trim();
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
    const target = match[1] ?? '';
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
  return match === null ? null : (match[1] ?? '').trim();
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
 * The kinds that never copy a measured result or a configured value.
 *
 * A guide page is left out: its reader runs a server or writes notes and does
 * not open the code, so the page states a limit, such as the largest import,
 * as a number. An audit is the evidence that the other kinds link.
 */
export const measuredKinds = ['development', 'design', 'decisions', 'plans'];

/**
 * A quantity with a unit of time, of size or of share.
 *
 * A bare count is not held. A record names the numbers of records, issues,
 * findings, rows and status codes, and none of them is a copy, so a count
 * cannot tell a copy from a name. A unit can.
 */
const measuredQuantity =
  /(?<![\w.$])\d+(?:[.,]\d+)*[ -]?(?:ms|milliseconds?|s|seconds?|[KMGT]i?B|kB|%)(?![\w%])/g;

/** The accepted documents of rule 9, from the root of the checked tree. */
export const measuredAllowFile = 'tools/docs-measured-allow.json';

/**
 * The measured quantities of one document.
 *
 * A code span names code, a link address is an address, and a fenced block
 * is a command, so none of them is read.
 *
 * @param {string} text
 * @returns {{ line: number; quantity: string }[]}
 */
export function measuredQuantities(text) {
  /** @type {{ line: number; quantity: string }[]} */
  const found = [];
  /** @type {string | null} */
  let open = null;
  for (const [index, line] of text.split('\n').entries()) {
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence !== null) {
      const marker = fence[1] ?? '';
      const rest = (fence[2] ?? '').trim();
      if (open === null) {
        if (!(marker.startsWith('`') && rest.includes('`')))
          open = marker.slice(0, 1);
        continue;
      }
      if (marker.startsWith(open) && rest === '') {
        open = null;
        continue;
      }
    }
    if (open !== null) continue;
    const prose = line
      .replace(/`[^`]*`/g, '')
      .replace(/\]\([^)]*\)/g, ']')
      .replace(/<[a-z][a-z0-9+.-]*:[^>]*>/gi, '')
      .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '');
    for (const match of prose.matchAll(measuredQuantity))
      found.push({ line: index + 1, quantity: match[0] });
  }
  return found;
}

/**
 * The fields of a parsed JSON value, or none when it is not an object.
 *
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function fieldsOf(value) {
  return value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value))
    : {};
}

/**
 * The documents that one list of accepted documents names, with the reason.
 *
 * @param {string} directory
 * @param {string} file
 * @returns {Promise<Map<string, string>>}
 */
async function readAllowlist(directory, file) {
  const text = await readFile(join(directory, file), 'utf8').catch(
    () => '{"allow":[]}',
  );
  /** @type {Map<string, string>} */
  const allowed = new Map();
  const list = fieldsOf(JSON.parse(text)).allow;
  if (!Array.isArray(list)) return allowed;
  for (const entry of list.map(fieldsOf)) {
    const { file, reason } = entry;
    if (typeof file === 'string' && typeof reason === 'string' && reason !== '')
      allowed.set(file, reason);
  }
  return allowed;
}

/**
 * The documents that may keep their measured quantities, with the reason.
 *
 * Each one was accepted before rule 9 held and is never edited again, so its
 * quantities are history. The list only shrinks: an entry whose document
 * holds no quantity fails.
 *
 * @param {string} directory
 * @returns {Promise<Map<string, string>>}
 */
export function readMeasuredAllowlist(directory) {
  return readAllowlist(directory, measuredAllowFile);
}

/**
 * The documents that may keep a refused fenced block, with the reason.
 *
 * Each one is an audit that was accepted before rule 2 refused a block with
 * no language, and an audit is never edited again. The list only shrinks: an
 * entry whose document holds no refused block fails.
 *
 * @param {string} directory
 * @returns {Promise<Map<string, string>>}
 */
export function readFenceAllowlist(directory) {
  return readAllowlist(directory, fenceAllowFile);
}

/**
 * The words of one refused fenced block.
 *
 * @param {string} language
 * @returns {string}
 */
function fenceFailure(language) {
  const block =
    language === '' ? 'a block with no language' : `a "${language}" block`;
  return `${block}. A document points at code and never copies it. The one allowed block is a shell command in ${allowedFenceLanguages.join(', ')}.`;
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
  const measuredAllowed = await readMeasuredAllowlist(directory);
  const fenceAllowed = await readFenceAllowlist(directory);
  /** @type {Set<string>} */
  const fenceHistory = new Set();
  /** @type {Set<string>} */
  const measuredHistory = new Set();
  for (const path of documents) {
    const inside = path.slice('docs/'.length);
    const placement = placementFailure(inside);
    if (placement !== null) {
      failures.push(`${path}: ${placement}`);
      continue;
    }
    const parts = inside.split('/');
    const kind = parts.length === 1 ? 'index' : (parts[0] ?? '');
    const name = parts.at(-1) ?? '';
    const text = await readFile(join(directory, path), 'utf8');
    linked.push({ path, text });
    // A supporting file of a design task folder carries a title only. The
    // `README.md` of the folder carries the header of the design.
    const headerKind = isDesignSupport(inside) ? 'support' : kind;
    for (const failure of headerFailures(headerKind, name, text))
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
    if (kind === 'guide')
      for (const retired of retiredNames(text))
        failures.push(
          `${path}:${String(retired.line)}: ${retired.name} names an action the application calls Move to Trash.`,
        );
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
    if (measuredKinds.includes(kind)) {
      const quantities = measuredQuantities(text);
      if (measuredAllowed.has(path)) {
        if (quantities.length > 0) measuredHistory.add(path);
      } else
        for (const found of quantities)
          failures.push(
            `${path}:${String(found.line)}: "${found.quantity}" is a measured result or a configured value. A document never copies one: say what it shows in words, and link the audit or name the code by path.`,
          );
    }
    const refused = fenceLanguages(text).filter(
      (fence) => !allowedFenceLanguages.includes(fence.language),
    );
    if (fenceAllowed.has(path) && kind === 'audits') {
      if (refused.length > 0) fenceHistory.add(path);
    } else
      for (const fence of refused)
        failures.push(`${path}:${fence.line}: ${fenceFailure(fence.language)}`);
  }
  failures.push(...designFolderFailures(await readDesignFolders(directory)));
  for (const file of fenceAllowed.keys())
    if (!fenceHistory.has(file))
      failures.push(
        `${fenceAllowFile}: ${file} holds no refused block now, or it is not an audit. Remove its entry.`,
      );
  for (const file of measuredAllowed.keys())
    if (!measuredHistory.has(file))
      failures.push(
        `${measuredAllowFile}: ${file} holds no measured quantity of a living document now. Remove its entry.`,
      );
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
