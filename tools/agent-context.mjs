/**
 * Agent reading list.
 *
 * Several agent harnesses work on this repository, and each one holds its
 * context in its own file format. No harness feature can carry the rule that
 * an agent reads the context first, so this script is the portable form: the
 * core list for every change, the guide of an area that a path touches, then
 * the nested `AGENTS.md` that owns each given path, then the `Key files` rows
 * of that guide. A path of the operator interface also lists its page and,
 * when a checkout of the cloud repository sits beside this one, the guide of
 * that repository. The status is non-zero
 * when a listed file is gone, so `tools/check-agents-md.mjs` runs the list
 * for every guide and fails on a stale pointer.
 */
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { filesIn, root } from './workspace.mjs';

/** The files an agent reads before any change. @type {[string, string][]} */
export const coreReadingList = [
  ['AGENTS.md', 'Every rule of this repository.'],
  ['docs/README.md', 'Where a document belongs.'],
  ['docs/development/feature-workflow.md', 'The order of one whole feature.'],
  ['docs/decisions/README.md', 'The decisions and when one is needed.'],
  ['docs/development/tracking.md', 'Where the work is tracked.'],
];

/**
 * The guide of one area, read whenever a path touches that area.
 *
 * A directory guide links the design guide, but a link is a pointer an agent
 * can skip. Everything a person sees lives under these paths, so the design
 * guide joins the list by construction for each of them, right after the core
 * list and before the guide of the directory.
 *
 * @type {[RegExp, string, string][]}
 */
export const areaReadingList = [
  [
    /^(?:apps\/web|apps\/docs|packages\/ui|packages\/editor)(?:\/|$)|^apps\/server\/src\/routes\/published-document\.ts$/,
    'docs/development/design.md',
    'The one system of everything a person sees.',
  ],
];

/**
 * The interface that a service of the operator depends on.
 *
 * A private service reaches the core only through this interface (records
 * 0186 and 0190), and it pins one release of it. A change to one of these
 * files can break that service, so the page that states the compatibility
 * rule joins the list for each of them. The contract files are the operator
 * path items, the portal path item, and every file that they reach through a
 * `$ref`, so a shared schema that the interface uses is part of it.
 *
 * @type {{
 *   guide: [string, string];
 *   sibling: [string, string];
 *   contractEntries: RegExp[];
 *   files: string[];
 * }}
 */
export const operatorInterface = {
  guide: [
    'docs/development/operator-api.md',
    'The interface that a service of the operator depends on.',
  ],
  sibling: [
    '../cloud/AGENTS.md',
    'The rules of the cloud repository, which pins this interface.',
  ],
  contractEntries: [
    /^packages\/api-contract\/paths\/api_operator_[^/]+\.yaml$/,
    /^packages\/api-contract\/paths\/api_account_portal\.yaml$/,
  ],
  files: [
    'apps/server/src/routes/operator.ts',
    'apps/server/src/routes/account-controls.ts',
    'packages/core/src/identity/operator.ts',
    'docker/entrypoint.sh',
    'apps/server/src/config.ts',
  ],
};

/** Public semantic, storage, migration, configuration, and image inputs.
 * Conservative coverage is intentional: operator consumers depend on results.
 * @param {string} path
 */
export function operatorSurfacePath(path) {
  return (
    operatorInterface.files.includes(path) ||
    /^(?:packages\/core\/src\/|packages\/storage-server\/|apps\/server\/src\/(?:identity|routes|services)\/|docker\/|Dockerfile$|compose\.yaml$|docker-compose\.yml$|\.dockerignore$|package\.json$|pnpm-lock\.yaml$|\.github\/workflows\/release\.yml$)/.test(
      path,
    )
  );
}

/** Classifies an actual diff without a private dependency.
 * @param {string[]} paths
 * @param {Set<string>} contract
 */
export function classifyImpact(paths, contract = new Set()) {
  return {
    paths: [...new Set(paths)].sort(),
    operator: paths.some(
      (path) => operatorSurfacePath(path) || contract.has(path),
    ),
    contract: paths.some((path) => contract.has(path)),
    migration: paths.some((path) =>
      /^packages\/storage-server\/(?:drizzle|migrations|src\/(?:schema|migrate))/.test(
        path,
      ),
    ),
    documentsOnly:
      paths.length > 0 &&
      paths.every((path) =>
        /^(?:docs\/.*\.md|(?:CHANGELOG|CONTRIBUTING|SECURITY|CODE_OF_CONDUCT)\.md)$/.test(
          path,
        ),
      ),
    // Every copied source is an image input, including notice tools and fonts.
    // Unknown paths take the full image gate. Exclusions mirror .dockerignore.
    image: paths.some(
      (path) =>
        !/^(?:docs\/|apps\/docs\/|tests\/(?!image\/)|tools\/(?:[^/]+\.test\.mjs$|performance\/|test-database\/)|\.agents\/|\.claude\/|rules\/|(?:AGENTS|CLAUDE|CHANGELOG|CONTRIBUTING|SECURITY|CODE_OF_CONDUCT)\.md$)/.test(
          path,
        ),
    ),
    ui: paths.some((path) =>
      /^(?:apps\/(?:web|docs)\/|packages\/(?:ui|editor|markdown)\/|apps\/server\/src\/routes\/(?:published(?:-[\w-]+)?|legal(?:-[\w-]+)?)\.ts$)/.test(
        path,
      ),
    ),
  };
}

/** @param {string} directory @param {string} base */
export async function diffImpact(directory, base) {
  const paths = execFileSync(
    'git',
    ['diff', '--name-only', '-z', `${base}...HEAD`],
    { cwd: directory, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
  return classifyImpact(paths, await operatorContractFiles(directory));
}

/** @param {string} file @returns {Promise<boolean>} */
async function exists(file) {
  return (await stat(file).catch(() => null)) !== null;
}

/**
 * The relative `$ref` targets of one contract file, as tree paths.
 *
 * @param {string} file A tree path with `/` separators.
 * @param {string} text
 * @returns {string[]}
 */
export function contractReferences(file, text) {
  /** @type {string[]} */
  const targets = [];
  for (const match of text.matchAll(/\$ref:\s*['"]?(\.[^'"#\s]*)/g))
    targets.push(posix.join(posix.dirname(file), match[1] ?? ''));
  return targets;
}

/**
 * The contract files of the operator interface in one tree.
 *
 * @param {string} directory
 * @returns {Promise<Set<string>>}
 */
export async function operatorContractFiles(directory) {
  const top = resolve(directory);
  const paths = await filesIn(join(top, 'packages/api-contract/paths'));
  const pending = paths
    .map((file) => relative(top, file).split(sep).join('/'))
    .filter((file) =>
      operatorInterface.contractEntries.some((entry) => entry.test(file)),
    );
  /** @type {Set<string>} */
  const found = new Set();
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (found.has(file)) continue;
    found.add(file);
    const text = await readFile(join(top, file), 'utf8').catch(() => '');
    pending.push(...contractReferences(file, text));
  }
  return found;
}

/**
 * The root of the main checkout that holds a tree.
 *
 * A worktree has a `.git` file that names its git directory, and that
 * directory names the common one in `commondir`. The main checkout holds the
 * common directory, so a sibling repository sits beside the main checkout
 * and not beside the worktree. Any other tree is its own root.
 *
 * @param {string} directory
 * @returns {Promise<string>}
 */
export async function checkoutRoot(directory) {
  const top = resolve(directory);
  const pointer = await readFile(join(top, '.git'), 'utf8').catch(() => '');
  const gitDirectory = /^gitdir:\s*(.+)$/m.exec(pointer)?.[1]?.trim();
  if (gitDirectory === undefined) return top;
  const absolute = resolve(top, gitDirectory);
  const common = await readFile(join(absolute, 'commondir'), 'utf8').catch(
    () => null,
  );
  return common === null ? top : dirname(resolve(absolute, common.trim()));
}

/**
 * The guide of the cloud repository beside a tree, or `null` when no
 * checkout of it is there.
 *
 * @param {string} directory
 * @returns {Promise<string | null>}
 */
export async function siblingGuide(directory) {
  const top = resolve(directory);
  const [path] = operatorInterface.sibling;
  for (const base of new Set([top, await checkoutRoot(top)])) {
    const candidate = resolve(base, path);
    if (await exists(candidate)) return relative(top, candidate);
  }
  return null;
}

/**
 * Reads the `Key files` table. A path is relative to the guide.
 *
 * @param {string} text @returns {{ path: string; purpose: string }[]}
 */
export function keyFiles(text) {
  /** @type {{ path: string; purpose: string }[]} */
  const rows = [];
  let inside = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('#')) {
      inside = /^#+\s+key files\s*$/i.test(line);
      continue;
    }
    if (!inside || !line.trimStart().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1);
    const name = /^\s*`([^`]+)`\s*$/.exec(cells[0] ?? '');
    if (!name) continue;
    rows.push({ path: name[1] ?? '', purpose: (cells[1] ?? '').trim() });
  }
  return rows;
}

/**
 * The nested guide that owns a path, relative to the tree.
 *
 * @param {string} directory @param {string} target @returns {Promise<string?>}
 */
export async function nearestGuide(directory, target) {
  const top = resolve(directory);
  const absolute = resolve(top, target);
  const stats = await stat(absolute).catch(() => null);
  let current = stats?.isDirectory() ? absolute : dirname(absolute);
  while (current.startsWith(top + sep)) {
    const guide = join(current, 'AGENTS.md');
    if (await exists(guide)) return relative(top, guide);
    current = dirname(current);
  }
  return null;
}

/** Every nested guide of a tree. @param {string} directory */
export async function nestedGuides(directory) {
  const top = resolve(directory);
  const files = await filesIn(top);
  return files
    .filter((file) => file.endsWith(`${sep}AGENTS.md`) && dirname(file) !== top)
    .map((file) => relative(top, file));
}

/**
 * The ordered reading list. No path means every nested guide of the tree.
 *
 * @param {string} directory @param {string[]} paths
 * @returns {Promise<{ file: string; purpose: string }[]>}
 */
export async function readingList(directory, paths) {
  const guides = paths.length === 0 ? await nestedGuides(directory) : [];
  for (const path of paths) {
    const guide = await nearestGuide(directory, path);
    if (guide) guides.push(guide);
  }
  /** @type {Map<string, string>} */
  const list = new Map();
  for (const [file, purpose] of coreReadingList) list.set(file, purpose);
  const normalisedPaths = paths.map((path) =>
    relative(resolve(directory), resolve(directory, path)).split(sep).join('/'),
  );
  for (const normalised of normalisedPaths)
    for (const [area, file, purpose] of areaReadingList)
      if (area.test(normalised) && !list.has(file)) list.set(file, purpose);
  /** @type {Set<string>} */
  let contract = new Set();
  if (normalisedPaths.some((path) => path.startsWith('packages/api-contract/')))
    contract = await operatorContractFiles(directory);
  if (
    normalisedPaths.some(
      (path) => operatorSurfacePath(path) || contract.has(path),
    )
  ) {
    const [file, purpose] = operatorInterface.guide;
    list.set(file, purpose);
    const sibling = await siblingGuide(directory);
    if (sibling !== null) list.set(sibling, operatorInterface.sibling[1]);
  }
  for (const guide of guides) {
    const owner = dirname(guide);
    if (list.has(guide)) continue;
    list.set(guide, `The rules of ${owner}/.`);
    const text = await readFile(resolve(directory, guide), 'utf8');
    for (const row of keyFiles(text)) {
      const file = join(owner, row.path);
      if (!list.has(file)) list.set(file, row.purpose);
    }
  }
  return [...list].map(([file, purpose]) => ({ file, purpose }));
}

/**
 * The listed files that are not there.
 *
 * @param {string} directory @param {{ file: string }[]} entries
 */
export async function missingFiles(directory, entries) {
  const checked = await Promise.all(
    entries.map(async (entry) =>
      (await exists(resolve(directory, entry.file))) ? '' : entry.file,
    ),
  );
  return checked.filter((file) => file !== '');
}

/**
 * Prints the list for one tree, and returns the process status.
 *
 * @param {string} directory @param {string[]} paths @returns {Promise<number>}
 */
export async function main(directory, paths) {
  const entries = await readingList(directory, paths);
  process.stdout.write('Read these files in order before you edit:\n');
  for (const [index, entry] of entries.entries())
    process.stdout.write(`  ${index + 1}. ${entry.file}: ${entry.purpose}\n`);
  const missing = await missingFiles(directory, entries);
  if (missing.length > 0) {
    process.stderr.write(
      [
        'Missing files. A guide points at a file that is not there:',
        ...missing.map((file) => `  ${file}`),
      ].join('\n') + '\n',
    );
    return 1;
  }
  return 0;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const rooted = args[0] === '--root';
  if (rooted && args.length < 2) {
    process.stderr.write('Usage: node tools/agent-context.mjs [path ...]\n');
    process.exit(1);
  }
  const directory = resolve(rooted ? (args[1] ?? root) : root);
  process.exit(await main(directory, args.slice(rooted ? 2 : 0)));
}
