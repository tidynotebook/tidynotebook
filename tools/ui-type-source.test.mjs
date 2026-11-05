import assert from 'node:assert/strict';
import test from 'node:test';
import { rawTypeRole } from './check-design-rules.mjs';

await test('raw type sizes are refused in whole source and CSS', () => {
  for (const value of [
    'text-xs',
    'text-sm',
    'text-base',
    'text-lg',
    'text-xl',
    ...Array.from({ length: 8 }, (_, i) => `text-${i + 2}xl`),
    'text-[13px]',
    'fontSize: 12',
    'fontSize = 12',
    'font-size: 12px',
  ]) {
    for (const path of [
      'apps/web/src/screen.tsx',
      'packages/ui/src/control.ts',
      'packages/ui/src/control.css',
      'apps/web/src/screen.test.tsx',
    ])
      assert.equal(
        rawTypeRole(path, `/* ${value} */`),
        true,
        `${path}: ${value}`,
      );
    assert.equal(rawTypeRole('apps/web/src/tailwind.css', value), false);
  }
});
await test('named roles and the original excluded paths pass', () => {
  assert.equal(
    rawTypeRole(
      'apps/web/src/screen.tsx',
      'text-body text-control font-size-adjust: 1',
    ),
    false,
  );
  for (const path of [
    'apps/web/src/screen.test.ts',
    'apps/docs/src/page.ts',
    'packages/editor/src/widgets.ts',
    'apps/server/src/routes/legal-document.ts',
    'apps/web/index.html',
  ])
    assert.equal(rawTypeRole(path, 'text-sm'), false, path);
});
