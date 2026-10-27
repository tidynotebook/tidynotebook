import assert from 'node:assert/strict';
import test from 'node:test';
import { settingsSections } from './page-sections.ts';
import {
  settingsPageForAnchor,
  visibleSettingsPages,
} from './settings-routes.ts';
await test('every old settings anchor redirects to one topic address', () => {
  for (const section of settingsSections)
    assert.notEqual(settingsPageForAnchor(`#${section.id}`), null, section.id);
  assert.equal(settingsPageForAnchor('#theme-heading'), 'appearance');
  assert.equal(settingsPageForAnchor('#import-heading'), 'export-import');
  assert.equal(settingsPageForAnchor('#export-heading'), 'export-import');
  assert.equal(settingsPageForAnchor('#remove-account-heading'), 'profile');
  assert.equal(settingsPageForAnchor('#account-heading'), 'profile');
  assert.equal(settingsPageForAnchor('#sessions-heading'), 'devices');
  assert.equal(
    settingsPageForAnchor('#connected-apps-heading'),
    'api-keys-apps',
  );
  assert.equal(settingsPageForAnchor('#unknown'), null);
  assert.equal(settingsPageForAnchor(''), null);
});
await test('billing and connected apps keep their server capability rules', () => {
  const selfHosted = visibleSettingsPages({
    accountPortal: false,
    mcpAuthorization: false,
  });
  assert.ok(!selfHosted.some((page) => page.path === 'billing'));
  const keys = selfHosted.find((page) => page.path === 'api-keys-apps');
  assert.equal(keys?.title, 'API keys');
  assert.deepEqual(keys?.sections, ['api-keys']);
  const cloud = visibleSettingsPages({
    accountPortal: true,
    mcpAuthorization: true,
  });
  assert.ok(cloud.some((page) => page.path === 'billing'));
  assert.deepEqual(
    cloud.find((page) => page.path === 'api-keys-apps')?.sections,
    ['api-keys', 'connected-apps'],
  );
});
