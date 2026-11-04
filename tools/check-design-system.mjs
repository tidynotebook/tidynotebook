/** The UI contract forbids feature spacing and custom component CSS. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseSync } from 'oxc-parser';
import { filesIn, root, record } from './workspace.mjs';
/** @typedef {{file:string,rule:string,match:string,reason?:string}} DesignProblem */
const steps = new Set(['0', '0.5', '1', '2', '3', '4', '6', '8', '12']);
/** @param {string} token */
function baseCandidate(token) {
  let depth = 0,
    start = 0;
  for (let index = 0; index < token.length; index++) {
    const c = token[index];
    if (c === '[') depth++;
    if (c === ']') depth--;
    if (c === ':' && depth === 0) start = index + 1;
  }
  return token.slice(start);
}
/** @param {string} path @param {string} source @returns {DesignProblem[]} */
export function inspectDesignSource(path, source) {
  /** @type {DesignProblem[]} */ const issues = [];
  const app = path.startsWith('apps/web/src/');
  /** @param {string} rule @param {string} match */ const add = (
    rule,
    match,
  ) => {
    issues.push({ file: path, rule, match });
  };
  if (path.endsWith('.css')) {
    const states = {
      'state-overlay': ['--notes-overlay-hover', '--notes-overlay-selected'],
      'state-raised': [
        '--notes-card-raised-hover',
        '--notes-card-raised-selected',
      ],
    };
    for (const match of source.matchAll(/@utility\s+([\w-]+)\s*\{([^}]*)\}/g)) {
      const name = match[1] ?? '';
      const values = Object.entries(states).find(([key]) => key === name)?.[1];
      const expected = values
        ? `--notes-surface-hover: var(${values[0]}); --notes-surface-active: var(${values[1]});`
        : '';
      if (
        !expected ||
        (match[2] ?? '').replace(/\s+/g, ' ').trim() !== expected
      )
        add('component-css', name);
    }
    for (const match of source.matchAll(/--(ui-[\w-]+)\s*:/g))
      add('role-alias', match[1] ?? '');
    for (const match of source.matchAll(/([^{};]+)\{/g)) {
      const selector = (match[1] ?? '').trim();
      if (/^\.[\w-]+.*\s[.\w[]/.test(selector))
        add('screen-selector', selector);
      if (/(\.[\w-]+)\1/.test(selector)) add('specificity', selector);
      if (/^[.#]/.test(selector)) add('component-selector', selector);
    }
    return issues;
  }
  const parsed = parseSync(path, source, { sourceType: 'module' });
  /** @param {unknown} value */
  const walk = (value) => {
    if (Array.isArray(value)) {
      for (const child of value) walk(child);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const node = record(value);
    if (node.type === 'JSXAttribute' && record(node.name).name === 'style') {
      const raw = source.slice(Number(node.start), Number(node.end));
      if (/\b(?:padding\w*|margin\w*|gap|rowGap|columnGap)\s*:/.test(raw))
        add('inline-spacing', raw);
    }
    const text =
      node.type === 'Literal' && typeof node.value === 'string'
        ? node.value
        : node.type === 'TemplateElement'
          ? record(node.value).raw
          : undefined;
    if (typeof text === 'string')
      for (let token of text.split(/\s+/).filter(Boolean)) {
        if (/\[[^\]]+\]:(?!not\()/.test(token) || /(?:^|:)\[--/.test(token))
          add('arbitrary-value', token);
        if (
          /(?:^|:)content-[\w-]+:/.test(token) &&
          ![
            'packages/ui/src/static.ts',
            'packages/ui/src/preview-surface.tsx',
            'packages/ui/src/code-figure.ts',
            'packages/ui/src/dialog-classes.ts',
            'apps/docs/src/page.ts',
          ].includes(path)
        )
          add('content-boundary', token);
        const candidate = baseCandidate(token);
        token = candidate;
        if (/^-?(?:p[xytrblse]?|gap(?:-[xy])?)-/.test(token)) {
          if (app) add('feature-spacing', token);
          else {
            const step = token.replace(
              /^-?(?:p[xytrblse]?|gap(?:-[xy])?)-/,
              '',
            );
            if (!steps.has(step)) add('spacing-scale', token);
          }
        }
        if (/^-?m[xytrblse]?-/.test(token) && token !== 'm-0') {
          if (app) add('feature-margin', token);
          else {
            const step = token.replace(/^-?m[xytrblse]?-/, '');
            if (step !== 'auto' && !steps.has(step))
              add('spacing-scale', token);
          }
        }
        if (/^space-[xy]-/.test(token)) add('child-spacing', token);
        if (
          /^min-h-/.test(token) &&
          (app ||
            !['min-h-0', 'min-h-full', 'min-h-dvh', 'min-h-64'].includes(token))
        )
          add('minimum-height', token);
        if (/^[\w-]+-\[[^\]]+\]$/.test(token)) add('arbitrary-value', token);
      }
    for (const child of Object.values(node)) walk(child);
  };
  walk(parsed.program);
  return [...new Map(issues.map((i) => [problemKey(i), i])).values()];
}
/** @param {Pick<DesignProblem,'file'|'rule'|'match'>} item */
function problemKey(item) {
  return `${item.file}:${item.rule}:${item.match}`;
}
/** @param {string} [directory] @returns {Promise<DesignProblem[]>} */
export async function designProblems(directory = root) {
  const files = (
    await Promise.all(
      ['apps/web/src', 'packages/ui/src'].map((p) =>
        filesIn(resolve(directory, p)),
      ),
    )
  )
    .flat()
    .filter((p) => /\.(?:tsx?|css)$/.test(p) && !p.endsWith('.test.ts'));
  return (
    await Promise.all(
      files.map(async (file) =>
        inspectDesignSource(
          relative(directory, file),
          await readFile(file, 'utf8'),
        ),
      ),
    )
  ).flat();
}
async function main() {
  const found = await designProblems();
  const path = resolve(root, 'tools/design-system-allow.json');
  const data = record(JSON.parse(await readFile(path, 'utf8')));
  const entries = Array.isArray(data.allow) ? data.allow.map(record) : [];
  const allow = entries.map((entry) => {
    if (
      typeof entry.file !== 'string' ||
      typeof entry.rule !== 'string' ||
      typeof entry.match !== 'string' ||
      typeof entry.reason !== 'string'
    )
      throw Error('Every exception needs a file, rule, match and reason.');
    return {
      file: entry.file,
      rule: entry.rule,
      match: entry.match,
      reason: entry.reason,
    };
  });
  const active = new Set(found.map(problemKey));
  if (process.argv.includes('--prune')) {
    data.allow = allow.filter((i) => active.has(problemKey(i)));
    await writeFile(path, JSON.stringify(data, null, 2) + '\n');
  }
  const allowed = new Set(allow.map(problemKey));
  const failures = found.filter((i) => !allowed.has(problemKey(i)));
  if (failures.length) {
    process.stderr.write(
      'Design system check failed:\n' +
        failures.map((i) => `  ${i.file}: ${i.rule}: ${i.match}`).join('\n') +
        '\n',
    );
    process.exitCode = 1;
  } else
    process.stdout.write(
      `Design system: ${found.length} recorded cases remain.\n`,
    );
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
