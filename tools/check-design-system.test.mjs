import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectDesignSource } from './check-design-system.mjs';
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
