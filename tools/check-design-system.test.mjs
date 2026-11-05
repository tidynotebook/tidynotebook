import assert from 'node:assert/strict';
import test from 'node:test';
import { scanFile } from './check-design-rules.mjs';
/** @param {string} path @param {string} source */
const inspectDesignSource = (path, source) => scanFile(path, source).spacing;
await test('features compose primitives instead of setting spacing', () => {
  const issues = inspectDesignSource(
    'apps/web/src/example.tsx',
    'const x=<div className="coarse:px-4 mt-2 space-y-2 min-h-0 p-[length:13px]" style={{padding:12}}/>;',
  );
  for (const rule of [
    'feature-spacing',
    'feature-margin',
    'child-spacing',
    'minimum-height',
    'arbitrary-value',
    'inline-spacing',
  ])
    assert.ok(
      issues.some((i) => i.rule === rule),
      rule,
    );
  assert.deepEqual(
    inspectDesignSource(
      'apps/web/src/example.tsx',
      'const x=<Stack gap={3} pad={4} className="m-0 text-body"/>;',
    ),
    [],
  );
});
await test('shared components accept only the spacing scale', () => {
  assert.deepEqual(
    inspectDesignSource(
      'packages/ui/src/example.tsx',
      'const x="p-3 gap-0.5 coarse:px-4";',
    ),
    [],
  );
  assert.equal(
    inspectDesignSource(
      'packages/ui/src/example.tsx',
      'const x="p-5 coarse:gap-7";',
    ).filter((i) => i.rule === 'spacing-scale').length,
    2,
  );
});
await test('custom layout CSS and specificity hacks are refused', () => {
  const issues = inspectDesignSource(
    'packages/ui/src/example.css',
    '@utility row { padding: 8px; } .panel .row { gap: 4px; } .row.row {height:28px}',
  );
  for (const rule of [
    'component-css',
    'screen-selector',
    'specificity',
    'component-selector',
  ])
    assert.ok(
      issues.some((i) => i.rule === rule),
      rule,
    );
});

await test('shared components reject arbitrary properties and variants and row minimum heights', () => {
  const issues = inspectDesignSource(
    'packages/ui/src/example.tsx',
    'const x="[--surface:var(--fill)] [&_button]:w-full min-h-8";',
  );
  assert.equal(
    issues.filter((issue) => issue.rule === 'arbitrary-value').length,
    2,
  );
  assert.ok(issues.some((issue) => issue.rule === 'minimum-height'));
});

await test('state utilities set only the approved inherited theme tokens', () => {
  assert.deepEqual(
    inspectDesignSource(
      'apps/web/src/tailwind.css',
      '@utility state-overlay { --notes-surface-hover: var(--notes-overlay-hover); --notes-surface-active: var(--notes-overlay-selected); }',
    ),
    [],
  );
  assert.ok(
    inspectDesignSource(
      'apps/web/src/tailwind.css',
      '@utility state-overlay { padding: 8px; }',
    ).some((issue) => issue.rule === 'component-css'),
  );
});

await test('content variants stay at shared markup boundaries', () => {
  assert.ok(
    inspectDesignSource(
      'apps/web/src/example.tsx',
      'const c="content-pre:p-3";',
    ).some((issue) => issue.rule === 'content-boundary'),
  );
  assert.deepEqual(
    inspectDesignSource(
      'packages/ui/src/preview-surface.tsx',
      'const c="content-pre:p-3";',
    ),
    [],
  );
});

await test('CSS role aliases are refused', () => {
  assert.deepEqual(
    inspectDesignSource(
      'packages/ui/src/example.css',
      ':root { --ui-control: 12px; }',
    ),
    [
      {
        file: 'packages/ui/src/example.css',
        rule: 'role-alias',
        match: 'ui-control',
      },
    ],
  );
});

await test('template spacing reads raw text while general rules read cooked text', () => {
  const result = scanFile(
    'apps/web/src/example.ts',
    'const x = `p\\u002d5 text\\u002dxs`;',
  );
  assert.deepEqual(result.spacing, []);
  assert.ok(result.rules.some((i) => i.rule === 'banned-class'));
  const raw = scanFile('apps/web/src/example.ts', 'const x = `p-5`;');
  assert.ok(raw.spacing.some((i) => i.rule === 'feature-spacing'));
});
