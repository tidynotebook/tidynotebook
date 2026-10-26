import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  bannedClasses,
  colourTokens,
  fileRules,
  iconSizes,
  jsxTextRule,
  motionModule,
  scanDocument,
  scanSource,
  stylesheet,
  textRules,
  actionIconModule,
  binGlyphOwners,
  controlRecipeModule,
  deleteLabelModule,
  trashLabelModule,
} from './check-design-rules.mjs';
import { readFile } from 'node:fs/promises';
import { root } from './workspace.mjs';

// The fixtures below are disposable trees under the system temporary
// directory. They are never committed as application code.
const checker = fileURLToPath(
  new URL('./check-design-rules.mjs', import.meta.url),
);

/**
 * The palette that a disposable tree declares.
 *
 * The colour rule reads the tokens of the one stylesheet, so a fixture tree
 * needs one. These are the names of the real stylesheet and no value, because
 * the rule reads names alone.
 */
const fixtureStylesheet = `@theme inline {
  --color-app: var(--notes-bg);
  --color-surface: var(--notes-surface);
  --color-card: var(--notes-surface-card);
  --color-hover: var(--notes-surface-hover);
  --color-active: var(--notes-surface-active);
  --color-ink: var(--notes-text);
  --color-strong: var(--notes-text-strong);
  --color-muted: var(--notes-text-muted);
  --color-accent: var(--notes-accent-text);
  --color-accent-fill: var(--notes-accent-fill);
  --color-accent-fill-hover: var(--notes-accent-fill-hover);
  --color-on-accent: var(--notes-accent-on-fill);
  --color-accent-surface: var(--notes-accent-surface);
  --color-success: var(--notes-success-text);
  --color-success-surface: var(--notes-success-surface);
  --color-danger: var(--notes-danger-text);
  --color-danger-fill: var(--notes-danger-fill);
  --color-danger-fill-hover: var(--notes-danger-fill-hover);
  --color-danger-surface: var(--notes-danger-surface);
  --color-on-danger: var(--notes-on-danger);
  --color-edge: var(--notes-border);
  --color-edge-line: var(--notes-border-line);
  --color-edge-subtle: var(--notes-border-subtle);
  --color-focus: var(--notes-focus);
  --color-scrim: var(--notes-scrim);
  --color-syntax-keyword: var(--notes-syntax-keyword);
}
`;

/**
 * @param {Record<string, string>} files
 * @param {{ stylesheet?: boolean }} [options]
 * @returns {{ status: number; output: string }}
 */
function check(files, options) {
  const directory = mkdtempSync(join(tmpdir(), 'notesapp-design-'));
  try {
    mkdirSync(join(directory, 'apps/web/src'), { recursive: true });
    mkdirSync(join(directory, 'packages/ui/src'), { recursive: true });
    if (options?.stylesheet !== false)
      writeFileSync(join(directory, stylesheet), fixtureStylesheet);
    for (const [name, content] of Object.entries(files)) {
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

/** The tokens of the real stylesheet, for a rule that needs them. */
const tokens = { colourTokens: colourTokens(fixtureStylesheet) };

/** @param {string} source @returns {string[]} */
const rulesOf = (source) =>
  scanSource('apps/web/src/screen.tsx', source, tokens).map(
    (issue) => issue.rule,
  );

await test('a colour value outside the theme registry fails', () => {
  assert.equal(
    textRules['colour-literal']('#1a1b26', 'apps/web/src/screen.tsx'),
    'Colour value #1a1b26 outside the theme registry.',
  );
  assert.equal(
    textRules['colour-literal']('rgb(10, 20, 30)', 'apps/web/src/screen.tsx'),
    'Colour value rgb( outside the theme registry.',
  );
});

await test('the theme registry may hold a colour value', () => {
  assert.equal(
    textRules['colour-literal']('#1a1b26', 'packages/ui/src/themes/nord.ts'),
    null,
  );
});

await test('a Tailwind arbitrary value fails and a selector does not', () => {
  assert.notEqual(textRules['arbitrary-value']('w-[32rem] p-2'), null);
  assert.notEqual(textRules['arbitrary-value']('grid-cols-[1fr_auto]'), null);
  assert.equal(textRules['arbitrary-value']('[role="menuitem"]'), null);
  assert.equal(textRules['arbitrary-value']('flex items-center gap-2'), null);
});

await test('a class outside the named scale fails', () => {
  assert.notEqual(textRules['banned-class']('flex text-xs'), null);
  assert.notEqual(textRules['banned-class']('text-white'), null);
  assert.notEqual(textRules['banned-class']('hover:bg-black'), null);
  assert.equal(textRules['banned-class']('text-control'), null);
  assert.equal(textRules['banned-class']('text-xs-legacy'), null);
});

await test('every class of the banned list fails, and its neighbours pass', () => {
  // One negative case for each entry, so a name added to the list without a
  // working pattern cannot pass this test.
  for (const [name, instead] of Object.entries(bannedClasses)) {
    const message = textRules['banned-class'](`flex ${name} items-center`);
    assert.notEqual(message, null, name);
    assert.ok(message?.includes(instead), name);
  }
});

await test('a text size, a radius and a weight off the scale fail', () => {
  for (const name of [
    'text-sm',
    'text-lg',
    'text-2xl',
    'text-4xl',
    'text-5xl',
    'text-6xl',
    'font-bold',
    'font-extrabold',
    'font-black',
    'rounded',
    'rounded-none',
    'rounded-2xl',
    'rounded-3xl',
    'uppercase',
    'tracking-wide',
    'tracking-wider',
    'tracking-widest',
    'border-dashed',
  ])
    assert.notEqual(textRules['banned-class'](`p-2 ${name}`), null, name);
  // The named steps and the names that only start the same way all pass.
  for (const name of [
    'text-kbd',
    'text-control',
    'text-ui',
    'text-base',
    'text-xl',
    'text-3xl',
    'font-medium',
    'font-semibold',
    'rounded-sm',
    'rounded-md',
    'rounded-lg',
    'rounded-xl',
    'rounded-full',
    'tracking-heading',
    'tracking-display',
    'border-solid',
    'text-sm-legacy',
    'roundedish',
  ])
    assert.equal(textRules['banned-class'](`p-2 ${name}`), null, name);
});

await test('a control that shrinks under a press fails', () => {
  assert.notEqual(textRules['banned-class']('active:scale-95'), null);
  assert.notEqual(textRules['banned-class']('scale-90'), null);
  assert.notEqual(textRules['banned-class']('hover:scale-105'), null);
  assert.notEqual(textRules['banned-class']('scale-x-95'), null);
  // A filter that ends in the same letters is not the transform.
  assert.equal(textRules['banned-class']('grayscale-50'), null);
  assert.equal(textRules['banned-class']('size-11'), null);
});

await test('a colour class that names no token fails', () => {
  // `bg-surface-hover` is the case that proves the rule: it reads as a
  // palette name, Tailwind emits nothing for it, and no other check sees it.
  const screen = 'apps/web/src/screen.tsx';
  const message = textRules['colour-token']('bg-surface-hover', screen, tokens);
  assert.ok(message?.includes('--color-surface-hover'), String(message));
  for (const name of [
    'hover:bg-active-hover',
    'border-edge-loud',
    'bg-danger-soft',
    'md:text-muted-strong',
    // A code colour of record 0159 that the stylesheet does not name.
    'text-syntax-heading',
  ])
    assert.notEqual(
      textRules['colour-token'](name, screen, tokens),
      null,
      name,
    );
});

await test('a colour class that names a token passes', () => {
  const screen = 'apps/web/src/screen.tsx';
  for (const name of [
    'bg-app',
    'bg-surface',
    'bg-card',
    'hover:bg-hover',
    'text-strong',
    'border-edge-line',
    'focus-visible:outline-focus',
    'focus-visible:ring-focus/25',
    'bg-transparent',
    'text-center',
    'border-transparent',
    'text-control',
    'rounded-md',
    '[&_.notes-code-keyword]:text-syntax-keyword',
  ])
    assert.equal(textRules['colour-token'](name, screen, tokens), null, name);
});

await test('the colour rule is quiet when no stylesheet was read', () => {
  // The scan reads the tokens once. A caller that passes none, such as a
  // rule test of another rule, must not turn every colour class into a
  // failure, and `main` refuses a tree with no stylesheet at all.
  assert.equal(
    textRules['colour-token']('bg-surface-hover', 'apps/web/src/screen.tsx'),
    null,
  );
});

await test('the component edge fails outside a control with a drawn state', () => {
  assert.notEqual(
    textRules['stateful-edge']('rounded-md border border-edge'),
    null,
  );
  assert.notEqual(textRules['stateful-edge']('ring-1 ring-edge'), null);
  assert.notEqual(textRules['stateful-edge']('hover:border-edge'), null);
  // The divider and the hairline are the resting edges, and they pass.
  assert.equal(textRules['stateful-edge']('border border-edge-line'), null);
  assert.equal(textRules['stateful-edge']('border-edge-subtle'), null);
  assert.equal(textRules['stateful-edge']('ring-edge-line'), null);
});

await test('the task box takes the edge through its one recipe', () => {
  // The review of the merged branch: the published task box needed an
  // exception of this gate. The recipe module names the edge, and the
  // published copy names it under the variant of a task item alone.
  const box = 'size-4 rounded-sm border border-edge bg-app';
  assert.equal(textRules['stateful-edge'](box, controlRecipeModule), null);
  assert.notEqual(
    textRules['stateful-edge'](box, 'apps/server/src/routes/a.ts'),
    null,
  );
  assert.equal(
    textRules['stateful-edge'](
      '[&_.task-list-item_input]:border [&_.task-list-item_input]:border-edge [&_.task-list-item_input]:bg-app',
      'apps/server/src/routes/published-document.ts',
    ),
    null,
  );
  // Another element of the published page keeps the resting edge.
  assert.notEqual(
    textRules['stateful-edge'](
      '[&_pre]:border [&_pre]:border-edge',
      'apps/server/src/routes/published-document.ts',
    ),
    null,
  );
});

await test('a focus variant fails except on the edge and the ring of a field', () => {
  assert.notEqual(textRules['pointer-focus']('focus:outline-2'), null);
  assert.notEqual(textRules['pointer-focus']('focus:bg-hover'), null);
  assert.notEqual(textRules['pointer-focus']('focus:translate-y-0'), null);
  assert.equal(textRules['pointer-focus']('focus:border-focus'), null);
  assert.equal(textRules['pointer-focus']('focus:ring-2'), null);
  assert.equal(textRules['pointer-focus']('focus-visible:outline-2'), null);
});

await test('a family name outside the stylesheet fails', () => {
  const screen = 'apps/web/src/screen.tsx';
  assert.notEqual(textRules['font-family']('font-family: Geist', screen), null);
  assert.notEqual(
    textRules['font-family']("'Geist Mono', monospace", screen),
    null,
  );
  assert.notEqual(
    textRules['font-family']('-apple-system, sans-serif', screen),
    null,
  );
  assert.notEqual(textRules['font-family']('Inter, Arial', screen), null);
  // The one file that declares the face may name it, and every module reads
  // the variable instead.
  assert.equal(
    textRules['font-family']('font-family: Geist', stylesheet),
    null,
  );
  assert.equal(textRules['font-family']('var(--font-sans)', screen), null);
  assert.equal(textRules['font-family']('var(--font-mono)', screen), null);
  // A word that holds the name of a face is not that face.
  assert.equal(textRules['font-family']('setInterval', screen), null);
  assert.equal(textRules['font-family']('createInterface', screen), null);
});

await test('an element that writes an icon attribute fails', () => {
  // The grid lives in one module and one frame spreads it, so an element
  // that states a viewport or a stroke has a second answer to what an icon
  // is. This is the rule that makes reading the grid the only way to draw.
  for (const attribute of [
    'viewBox="0 0 24 24"',
    'strokeWidth="2"',
    'strokeLinecap="round"',
    'strokeLinejoin="round"',
  ]) {
    const found = fileRules['icon-attribute'](`<svg ${attribute} />`, 'a.tsx');
    assert.equal(found.length, 1, attribute);
    assert.ok(
      found[0]?.message.includes('icon-grid.ts'),
      found[0]?.message ?? '',
    );
  }
});

await test('a module that reads the grid writes no attribute', () => {
  // The grid module states the same names as object properties, and a frame
  // spreads them, so neither one writes an attribute.
  for (const source of [
    "export const iconAttributes = { viewBox: '0 0 24 24', strokeWidth: 1.5 };",
    '<svg width={size} {...iconAttributes} />',
  ])
    assert.deepEqual(fileRules['icon-attribute'](source, 'a.tsx'), [], source);
});

await test('an icon at a size off the grid fails', () => {
  const found = fileRules['icon-size'](
    '<TrashIcon size={14} />\n<HistoryIcon size={24} />\n',
    'apps/web/src/screen.tsx',
  );
  assert.equal(found.length, 2);
  assert.ok(found[0]?.message.includes('TrashIcon'), found[0]?.message ?? '');
  assert.ok(found[1]?.message.includes('HistoryIcon'), found[1]?.message ?? '');
});

await test('an icon at one of the two sizes passes', () => {
  for (const size of iconSizes) {
    assert.deepEqual(
      fileRules['icon-size'](
        `<TrashIcon size={${String(size)}} />`,
        'apps/web/src/screen.tsx',
      ),
      [],
      String(size),
    );
  }
  // A size the icon takes from a variable cannot be read here, and a module
  // that is not JSX holds no icon at all.
  assert.deepEqual(
    fileRules['icon-size']('<TrashIcon size={size} />', 'a/b.tsx'),
    [],
  );
  assert.deepEqual(
    fileRules['icon-size']('<TrashIcon size={14} />', 'a/b.ts'),
    [],
  );
});

await test('the colour tokens are read from the stylesheet text', () => {
  const found = colourTokens(fixtureStylesheet);
  assert.ok(found.has('app'));
  assert.ok(found.has('edge-line'));
  assert.ok(!found.has('surface-hover'));
  assert.equal(colourTokens('body { color: red }').size, 0);
});

await test('a shadow outside the elevation scale fails', () => {
  assert.notEqual(textRules['raw-elevation']('flex shadow-sm'), null);
  assert.notEqual(textRules['raw-elevation']('hover:shadow-md'), null);
  assert.notEqual(textRules['raw-elevation']('rounded-xl shadow'), null);
  assert.notEqual(
    textRules['raw-elevation']('shadow-raised hover:shadow-xl'),
    null,
  );
  assert.equal(textRules['raw-elevation']('shadow-raised'), null);
  assert.equal(textRules['raw-elevation']('shadow-overlay rounded-xl'), null);
  assert.equal(textRules['raw-elevation']('shadow-modal'), null);
  // The property name of a transition is not a shadow utility.
  assert.equal(
    textRules['raw-elevation']('motion-safe:transition-shadow'),
    null,
  );
});

await test('a filter that makes a colour fails', () => {
  assert.notEqual(textRules['colour-filter']('hover:brightness-110'), null);
  assert.notEqual(
    textRules['colour-filter']('bg-accent-fill saturate-150'),
    null,
  );
  assert.notEqual(textRules['colour-filter']('grayscale'), null);
  assert.notEqual(textRules['colour-filter']('hue-rotate-15'), null);
  assert.equal(textRules['colour-filter']('bg-accent-fill-hover'), null);
  // The preference variant of Tailwind is not a filter.
  assert.equal(textRules['colour-filter']('contrast-more:border-edge'), null);
  assert.equal(textRules['colour-filter']('text-strong'), null);
});

await test('a control that fades with an opacity fails', () => {
  const screen = 'packages/ui/src/menu.tsx';
  // The defect this covers: a disabled button faded to half of its ink fill
  // and still read as the action of the screen.
  assert.notEqual(
    textRules['faded-control']('disabled:opacity-50', screen),
    null,
  );
  assert.notEqual(textRules['faded-control']('opacity-75', screen), null);
  assert.notEqual(textRules['faded-control']('hover:opacity-5', screen), null);
  assert.equal(textRules['faded-control']('opacity-0', screen), null);
  assert.equal(textRules['faded-control']('opacity-100', screen), null);
  assert.equal(textRules['faded-control']('disabled:text-muted', screen), null);
  // The motion module fades an element in from none.
  assert.equal(
    textRules['faded-control'](
      'motion-safe:starting:opacity-0',
      'packages/ui/src/motion.ts',
    ),
    null,
  );
});

await test('motion outside the one motion module fails', () => {
  const screen = 'apps/web/src/screen.tsx';
  assert.notEqual(textRules['raw-motion']('transition-colors', screen), null);
  assert.notEqual(
    textRules['raw-motion']('motion-safe:transition', screen),
    null,
  );
  assert.notEqual(textRules['raw-motion']('duration-100', screen), null);
  assert.notEqual(textRules['raw-motion']('ease-quick', screen), null);
  // The one module that states the scale may name every part of it.
  assert.equal(
    textRules['raw-motion']('motion-safe:transition-colors', motionModule),
    null,
  );
  // A word that ends in the name of a utility is not that utility.
  assert.equal(textRules['raw-motion']('lease-held', screen), null);
  assert.equal(textRules['raw-motion']('flex items-center', screen), null);
});

await test('a path suffix or an identifier must not reach the person', () => {
  assert.notEqual(jsxTextRule('Open notes/today.md'), null);
  assert.notEqual(jsxTextRule('1f5c24b3-6995-41ec-98ac-7741aae373eb'), null);
  assert.equal(jsxTextRule('Open today'), null);
});

await test('the scan names every broken rule with its line', () => {
  const issues = scanSource(
    'apps/web/src/screen.tsx',
    [
      'export function Screen() {',
      '  return (',
      '    <p style={{ color: "red" }} className="text-xs w-[3rem]">',
      '      notes/today.md',
      '    </p>',
      '  );',
      '}',
      '',
    ].join('\n'),
  );
  const rules = issues.map((issue) => issue.rule).sort();
  assert.deepEqual(rules, [
    'arbitrary-value',
    'banned-class',
    'inline-style',
    'jsx-text',
  ]);
  assert.ok(issues.every((issue) => issue.line >= 3 && issue.line <= 4));
});

await test('an accepted file passes every rule', () => {
  assert.deepEqual(
    rulesOf(
      [
        'export function Screen() {',
        '  return <p className="text-control text-muted">Open today</p>;',
        '}',
        '',
      ].join('\n'),
    ),
    [],
  );
});

await test('unchecked markup fails in both forms', () => {
  assert.deepEqual(
    rulesOf(
      [
        'export function Screen(html: string) {',
        '  return <p dangerouslySetInnerHTML={{ __html: html }} />;',
        '}',
        '',
      ].join('\n'),
    ),
    ['inner-html'],
  );
  assert.deepEqual(
    scanSource(
      'apps/web/src/host.ts',
      'export function paint(host: Element, html: string) {\n  host.innerHTML = html;\n}\n',
    ).map((issue) => issue.rule),
    ['inner-html'],
  );
});

await test('a clean tree passes the command', () => {
  const result = check({
    'apps/web/src/screen.tsx':
      'export function Screen() {\n  return <p className="text-control">Open today</p>;\n}\n',
  });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /1 files checked/);
});

await test('a broken rule fails the command and names the file', () => {
  const result = check({
    'apps/web/src/screen.tsx':
      'export function Screen() {\n  return <p className="text-xs">Open today</p>;\n}\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /apps\/web\/src\/screen\.tsx:2: banned-class/);
});

await test('an allowlist entry accepts one file and one rule only', () => {
  const source =
    'export function Screen() {\n  return <p className="text-xs">Open today</p>;\n}\n';
  const allow = JSON.stringify({
    allow: [
      {
        file: 'apps/web/src/screen.tsx',
        rule: 'banned-class',
        reason: 'A disposable fixture.',
      },
    ],
  });
  assert.equal(
    check({
      'apps/web/src/screen.tsx': source,
      'tools/design-rules-allow.json': allow,
    }).status,
    0,
  );
  assert.equal(
    check({
      'apps/web/src/other.tsx': source,
      'tools/design-rules-allow.json': allow,
    }).status,
    1,
  );
});

await test('a tree with no stylesheet cannot answer the colour rule', () => {
  // The palette names come from one file. Skipping the rule when that file is
  // missing would turn a broken tree into a passing check.
  const result = check(
    {
      'apps/web/src/screen.tsx':
        'export function Screen() {\n  return <p className="text-control">Open today</p>;\n}\n',
    },
    { stylesheet: false },
  );
  assert.equal(result.status, 1);
  assert.match(result.output, /tailwind\.css is missing/);
});

await test('the editor tree and the published page are checked too', () => {
  // Decision 0065 widens the scan: the editor adapter writes presentation in
  // TypeScript, and one file of the server writes the published page.
  const result = check({
    'packages/editor/src/theme.ts': "export const heading = 'text-2xl';\n",
    'apps/server/src/routes/published-document.ts':
      "export const body = 'uppercase';\n",
  });
  assert.equal(result.status, 1);
  assert.match(
    result.output,
    /packages\/editor\/src\/theme\.ts:1: banned-class/,
  );
  assert.match(
    result.output,
    /apps\/server\/src\/routes\/published-document\.ts:1: banned-class/,
  );
});

await test('a screen that follows every new rule passes the command', () => {
  const result = check({
    'apps/web/src/screen.tsx': [
      "import { CheckIcon, FolderIcon } from '@notesapp/ui';",
      '',
      'export function Screen() {',
      '  return (',
      '    <div className="rounded-md border border-edge-line bg-card text-strong">',
      '      <button',
      '        type="button"',
      '        className="rounded-md bg-accent-fill text-on-accent hover:bg-accent-fill-hover focus-visible:outline-2 focus-visible:outline-focus"',
      '      >',
      '        <CheckIcon size={16} />',
      '        Save',
      '      </button>',
      '      <FolderIcon size={20} />',
      '      <input className="border-edge-line focus:border-focus focus:ring-2" />',
      '    </div>',
      '  );',
      '}',
      '',
    ].join('\n'),
  });
  assert.equal(result.status, 0, result.output);
});

await test('a test file is not checked', () => {
  const result = check({
    'apps/web/src/screen.test.tsx': 'export const classes = "text-xs";\n',
  });
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /0 files checked/);
});

await test('a Delete label for the move to Trash fails in the web application', () => {
  // Issue 245: the row menu of the tree said Delete, Delete folder and the
  // palette said Delete this note, for the action that moves to Trash.
  for (const source of [
    "items={[{ id: 'delete-note', label: 'Delete', onSelect }]}",
    "{ label: 'Delete folder', onSelect }",
    "{ label: 'Delete this note', run }",
    '<Button label="Delete">x</Button>',
    '<button>Delete</button>',
  ]) {
    const found = fileRules['trash-label'](
      source,
      'apps/web/src/shell/tree.tsx',
    );
    assert.equal(found.length, 1, source);
    assert.ok(found[0]?.message.includes(trashLabelModule), source);
  }
});

await test('the words of the application and other packages pass', () => {
  for (const source of [
    '{ label: moveToTrashLabel, icon: actionIcon(noteTrashRow.icon) }',
    "{ label: 'Delete permanently' }",
    "const label = 'Deleted notes';",
  ])
    assert.deepEqual(
      fileRules['trash-label'](source, 'apps/web/src/shell/tree.tsx'),
      [],
      source,
    );
  assert.deepEqual(
    fileRules['trash-label']("{ label: 'Delete' }", 'packages/ui/src/menu.tsx'),
    [],
  );
});

await test('only the note menu draws the glyph of the move to Trash', () => {
  const source = "icon: 'move-to-trash',\nactionIcon('move-to-trash')";
  assert.equal(
    fileRules['trash-label'](source, 'apps/web/src/shell/tree.tsx').length,
    2,
  );
  assert.deepEqual(fileRules['trash-label'](source, trashLabelModule), []);
});

await test('the bin reaches a screen only through its owner, by any name', () => {
  // The review of the merged branch: actionIcon('delete') drew the same bin
  // as the move to Trash, so a screen could draw it with no label module.
  for (const source of [
    "icon: actionIcon('delete'),",
    "emptyStateIcon('trash')",
    'icon={<TrashIcon />}',
  ])
    assert.equal(
      fileRules['trash-label'](source, 'apps/web/src/shell/tree.tsx').length,
      1,
      source,
    );
  assert.deepEqual(
    fileRules['trash-label'](
      "export const deleteGlyph: ActionIconName = 'delete';",
      deleteLabelModule,
    ),
    [],
  );
  assert.deepEqual(
    fileRules['trash-label']('  delete: TrashIcon,', actionIconModule),
    [],
  );
  // A glyph that draws no bin is free.
  assert.deepEqual(
    fileRules['trash-label']("actionIcon('history')", 'apps/web/src/a.tsx'),
    [],
  );
});

await test('every glyph name that draws the bin has its owner', async () => {
  const icons = await readFile(resolve(root, actionIconModule), 'utf8');
  const names = [...icons.matchAll(/^\s+'?([a-z-]+)'?: TrashIcon,$/gmu)].map(
    (match) => match[1],
  );
  assert.ok(names.length > 0);
  assert.deepEqual(new Set(names), new Set(Object.keys(binGlyphOwners)));
});

await test('a removal for good may read Delete from its one module', () => {
  assert.deepEqual(
    fileRules['trash-label'](
      "export const deleteForGoodLabel = 'Delete';",
      deleteLabelModule,
    ),
    [],
  );
  assert.equal(
    fileRules['trash-label'](
      '<Button>\n  Delete\n</Button>',
      'apps/web/src/features/trash/trash.tsx',
    ).length,
    1,
  );
});

await test('a control hidden from assistive software fails', () => {
  // The review of the merged branch: the action button and the chevron of a
  // tree row were hidden, so VoiceOver and TalkBack could not reach the
  // menu of a folder at all.
  assert.ok(
    rulesOf(
      '<button type="button" tabIndex={-1} aria-hidden="true">x</button>',
    ).includes('hidden-control'),
  );
  assert.ok(
    !rulesOf(
      '<button type="button" tabIndex={-1} aria-label="Actions"><span aria-hidden="true">x</span></button>',
    ).includes('hidden-control'),
  );
});

/** @param {string} source @returns {string[]} */
const documentRulesOf = (source) =>
  scanDocument('apps/web/src/frame.html', source, tokens).map(
    (issue) => `${String(issue.line)} ${issue.rule}`,
  );

await test('a document that writes its own style or face fails', () => {
  // The diagram frame held a style block with a family of its own, so a
  // diagram was not set in the face of the page, and no check read a
  // document at all (record 0061).
  assert.deepEqual(
    documentRulesOf(
      [
        '<html>',
        '  <head><style>',
        '    body { font-family: system-ui; }',
        '  </style></head>',
        '  <body style="margin: 0">',
        '    <p class="text-xs bg-surface-hover">x</p>',
        '  </body>',
        '</html>',
      ].join('\n'),
    ),
    [
      '2 inline-style',
      '3 font-family',
      '5 inline-style',
      '6 colour-token',
      '6 banned-class',
    ],
  );
});

await test('a document with classes of the scale and a comment passes', () => {
  assert.deepEqual(
    documentRulesOf(
      [
        '<!-- A comment that names a <style> element and system-ui sets nothing. -->',
        '<html class="scheme-light-dark">',
        '  <body class="m-0 p-2 font-sans text-ink">',
        '    <script>root.style.colorScheme = shown;</script>',
        '  </body>',
        '</html>',
      ].join('\n'),
    ),
    [],
  );
});

await test('a string that writes a style element or attribute fails', () => {
  const rule = textRules['inline-style'];
  assert.match(rule('<style>a{}</style>') ?? '', /style element/);
  assert.match(rule('<p style="color: red">') ?? '', /style attribute/);
  assert.equal(rule('style-src-attr'), null);
  assert.equal(rule('the style of a page'), null);
});

await test('the documents of the application and the server pages are checked', () => {
  const result = check({
    'apps/web/index.html': '<body class="text-xs"></body>\n',
    'apps/web/src/diagram/frame.html': '<style>a{}</style>\n',
    'apps/server/src/routes/legal-document.ts':
      'export const page = \'<body style="margin: 0">\';\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.output, /apps\/web\/index\.html:1: banned-class/);
  assert.match(
    result.output,
    /apps\/web\/src\/diagram\/frame\.html:1: inline-style/,
  );
  assert.match(
    result.output,
    /apps\/server\/src\/routes\/legal-document\.ts:1: inline-style/,
  );
});

await test('every document of the application follows the rules', async () => {
  const css = await readFile(resolve(root, stylesheet), 'utf8');
  for (const file of [
    'apps/web/index.html',
    'apps/web/src/diagram/frame.html',
  ]) {
    const text = await readFile(resolve(root, file), 'utf8');
    assert.deepEqual(
      scanDocument(file, text, { colourTokens: colourTokens(css) }),
      [],
      file,
    );
  }
});

await test('the normalised repository root runs the icon generation check', async () => {
  const { cp, mkdir, mkdtemp, rm, symlink, writeFile } =
    await import('node:fs/promises');
  const directory = await mkdtemp(join(tmpdir(), 'notesapp-icon-check-'));
  try {
    for (const path of [
      'tools/check-design-rules.mjs',
      'tools/generate-icons.mjs',
      '.prettierrc.json',
      'apps/server/src/auth/email-logo.ts',
      'tools/workspace.mjs',
      'packages/ui/assets/notebook.svg',
      'packages/ui/src/icons.tsx',
      'packages/ui/src/themes/default.ts',
      'apps/web/icons',
      'docs/design/028-emails-and-link-previews/social-card-light.svg',
    ]) {
      await mkdir(dirname(join(directory, path)), { recursive: true });
      await cp(resolve(root, path), join(directory, path), { recursive: true });
    }
    await symlink(
      resolve(root, 'node_modules'),
      join(directory, 'node_modules'),
      'dir',
    );
    const icon = join(directory, 'apps/web/icons/favicon.ico');
    const changed = await readFile(icon);
    changed[0] = 1;
    await writeFile(icon, changed);
    const result = spawnSync(
      process.execPath,
      [join(directory, 'tools/check-design-rules.mjs')],
      { encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ICO header differs/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test('only the history recipe can dim its unavailable control', () => {
  const classes = 'cursor-not-allowed text-muted opacity-40';
  assert.equal(textRules['faded-control'](classes, controlRecipeModule), null);
  assert.notEqual(
    textRules['faded-control'](classes, 'apps/web/src/screen.tsx'),
    null,
  );
  assert.notEqual(
    textRules['faded-control']('opacity-50', controlRecipeModule),
    null,
  );
});
