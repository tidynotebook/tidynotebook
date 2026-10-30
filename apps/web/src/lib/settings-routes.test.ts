import assert from 'node:assert/strict';
import test from 'node:test';
import { settingsSections } from './page-sections.ts';
import {
  isSettingsRoute,
  searchWithSettings,
  settingsValueOf,
} from './settings-address.ts';
import {
  legacySettingsTarget,
  settingsPageGroups,
  settingsPageOf,
  settingsPageForAnchor,
  settingsPages,
  visibleSettingsPages,
} from './settings-routes.ts';
await test('every old settings anchor redirects to one topic address', () => {
  for (const section of settingsSections)
    assert.notEqual(settingsPageForAnchor(`#${section.id}`), null, section.id);
  assert.equal(settingsPageForAnchor('#theme-heading'), 'appearance');
  assert.equal(settingsPageForAnchor('#import-heading'), 'export-import');
  assert.equal(settingsPageForAnchor('#export-heading'), 'export-import');
  assert.equal(settingsPageForAnchor('#remove-account-heading'), 'account');
  assert.equal(settingsPageForAnchor('#account-heading'), 'account');
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

await test('the modal groups its sections as the wireframe does, with no Sign out', () => {
  assert.deepEqual(settingsPageGroups, [
    'Security',
    'Preferences',
    'Workspace',
    'Administration',
  ]);
  assert.deepEqual(
    settingsPages.map((page) => [page.group, page.title]),
    [
      ['Security', 'Profile'],
      ['Security', 'Plan and billing'],
      ['Security', 'Devices'],
      ['Security', 'API keys and apps'],
      ['Preferences', 'Appearance and editor'],
      ['Preferences', 'Offline'],
      ['Workspace', 'Daily notes'],
      ['Workspace', 'Templates'],
      ['Workspace', 'Export and import'],
      ['Administration', 'Users'],
      ['Administration', 'Mail'],
      ['Administration', 'Legal documents'],
      ['Administration', 'Reports'],
    ],
  );
  assert.ok(!settingsPages.some((page) => /sign out/i.test(page.title)));
  // Spelling is a part of Appearance and editor (item 7).
  assert.deepEqual(
    settingsPages.find((page) => page.path === 'appearance')?.sections,
    ['appearance', 'spelling'],
  );
  // Delete account is in the Danger zone of Account.
  assert.deepEqual(
    settingsPages.find((page) => page.path === 'account')?.sections,
    ['profile', 'account', 'remove-account'],
  );
  for (const page of settingsPages) {
    if (page.path === 'mail')
      assert.equal(
        page.scope,
        'Mail delivery for this installation. Without a mail server, an invitation shows its link once and nobody can reset a password.',
      );
    else assert.ok(page.scope.length <= 80, page.path);
  }
});

await test('old pages and anchors open their new page', () => {
  assert.equal(settingsPageOf('spelling'), 'appearance');
  assert.equal(settingsPageOf('profile'), 'account');
  assert.equal(settingsPageOf('sign-out'), 'devices');
  assert.equal(settingsPageOf('templates'), 'templates');
  assert.equal(settingsPageOf('nothing'), null);
  assert.equal(settingsPageForAnchor('#spelling-heading'), 'appearance');
  assert.equal(settingsPageForAnchor('#signout-heading'), 'devices');
  assert.equal(settingsPageForAnchor('#templates-heading'), 'templates');
});

await test('the settings parameter opens and closes Settings on any address', () => {
  assert.equal(settingsValueOf(''), null);
  assert.equal(settingsValueOf('?settings='), '');
  assert.equal(settingsValueOf('?q=1&settings=account'), 'account');
  assert.equal(searchWithSettings('', 'account'), '?settings=account');
  assert.equal(
    searchWithSettings('?q=1&settings=offline', 'account'),
    '?q=1&settings=account',
  );
  assert.equal(searchWithSettings('?q=1&settings=offline', null), '?q=1');
  assert.equal(searchWithSettings('?settings=offline', null), '');
  assert.equal(searchWithSettings('', ''), '?settings=');
  assert.ok(isSettingsRoute('/w/one/settings'));
  assert.ok(isSettingsRoute('/w/one/settings/account'));
  assert.ok(!isSettingsRoute('/w/one/notes/settings'));
  assert.ok(!isSettingsRoute('/w/one'));
});

await test('an old Settings address opens the modal over the last page or All notes', () => {
  const target = (
    lastRoute: string | null,
    settingsPage: string | undefined,
    hash = '',
  ) =>
    legacySettingsTarget({ workspaceId: 'one', lastRoute, settingsPage, hash });
  assert.equal(target(null, undefined), '/w/one?settings=');
  assert.equal(
    target('/w/one/notes/n1', 'templates'),
    '/w/one/notes/n1?settings=templates',
  );
  assert.equal(
    target('/w/one/folders/A?view=list', 'profile'),
    '/w/one/folders/A?view=list&settings=account',
  );
  assert.equal(
    target('/w/one/notes/n1', undefined, '#templates-heading'),
    '/w/one/notes/n1?settings=templates',
  );
  assert.equal(
    target(null, undefined, '#spelling-heading'),
    '/w/one?settings=appearance',
  );
  // An unknown page opens the first section.
  assert.equal(target(null, 'nothing'), '/w/one?settings=appearance');
  // A route of another workspace, or an old Settings route, never counts.
  assert.equal(target('/w/two/notes/n1', 'offline'), '/w/one?settings=offline');
  assert.equal(
    target('/w/one/settings/offline', 'offline'),
    '/w/one?settings=offline',
  );
  assert.equal(
    target('/w/onetwo/notes/n1', 'offline'),
    '/w/one?settings=offline',
  );
});

await test('only administrators see the four administration deep links', () => {
  assert.deepEqual(
    visibleSettingsPages({
      accountPortal: false,
      installationRole: 'member',
    }).filter((page) => page.group === 'Administration'),
    [],
  );
  assert.deepEqual(
    visibleSettingsPages({
      accountPortal: false,
      installationRole: 'administrator',
    })
      .filter((page) => page.group === 'Administration')
      .map((page) => page.path),
    ['accounts', 'mail', 'legal', 'reports'],
  );
});
