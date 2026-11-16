import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';
import { Switch } from '@notesapp/ui';
import {
  SettingsSection,
  SettingsTopicContext,
} from '../../apps/web/dist/features/accounts/settings-section.js';

await test('topic pages keep one help paragraph and the permanent-delete warning', () => {
  const html = renderToStaticMarkup(
    createElement(
      SettingsTopicContext.Provider,
      {
        value: {
          hiddenTitles: ['profile-heading', 'account-heading'],
          helpSection: 'profile-heading',
        },
      },
      createElement(SettingsSection, {
        section: { id: 'profile-heading', title: 'Profile and email' },
        description: 'Your profile help.',
        children: 'Profile controls',
      }),
      createElement(SettingsSection, {
        section: { id: 'account-heading', title: 'Account' },
        description: 'Repeated account help.',
        children: 'Account controls',
      }),
      createElement(SettingsSection, {
        section: { id: 'remove-account-heading', title: 'Delete account' },
        warning:
          'This deletes your account and every note in your workspaces for good.',
        children: 'Delete controls',
      }),
    ),
  );
  assert.match(html, /Your profile help/);
  assert.doesNotMatch(html, /Repeated account help|<h2[^>]*>Profile and email/);
  assert.match(
    html,
    /This deletes your account and every note in your workspaces for good/,
  );
  assert.match(html, /Delete controls/);
});

await test('switch hints have separate accessible descriptions and preserve the names', async () => {
  const html = renderToStaticMarkup(
    createElement(
      'div',
      null,
      createElement(Switch, {
        label: 'Images',
        hint: 'No images yet',
        checked: false,
        disabled: true,
        onChange: () => {},
      }),
      createElement(Switch, {
        label: 'Older versions',
        hint: 'Uses more space',
        checked: true,
        onChange: () => {},
      }),
      createElement(Switch, {
        label: 'Other choice',
        checked: false,
        onChange: () => {},
      }),
    ),
  );
  const browser = new Window();
  try {
    browser.document.body.innerHTML = html;
    const buttons = [...browser.document.querySelectorAll('button')];
    const ids = buttons
      .slice(0, 2)
      .map((button) => button.getAttribute('aria-describedby'));
    assert.ok(ids[0]);
    assert.ok(ids[1]);
    assert.notEqual(ids[0], ids[1]);
    assert.equal(
      browser.document.getElementById(ids[0])?.textContent,
      'No images yet',
    );
    assert.equal(
      browser.document.getElementById(ids[1])?.textContent,
      'Uses more space',
    );
    assert.equal(buttons[0]?.getAttribute('aria-label'), 'Images');
    assert.equal(buttons[1]?.getAttribute('aria-label'), 'Older versions');
    assert.equal(buttons[2]?.hasAttribute('aria-describedby'), false);
  } finally {
    await browser.happyDOM.close();
  }
});
