import assert from 'node:assert/strict';
import test from 'node:test';
import {
  openExternalLink,
  protocolSaveTimeoutMs,
} from './open-external-link.ts';

await test('web links open a protected tab and protocol handlers use the current context', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const tabs: unknown[][] = [];
  const handlers: string[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      open: (...args: unknown[]) => {
        tabs.push(args);
      },
      location: {
        assign: (href: string) => {
          handlers.push(href);
        },
      },
    },
  });
  try {
    for (const href of ['https://example.com', 'http://example.com']) {
      await openExternalLink(href, async () => {});
      assert.deepEqual(tabs.at(-1), [href, '_blank', 'noopener,noreferrer']);
    }
    await openExternalLink('  HtTpS://example.com  ', async () => {
      throw new Error('Web links do not wait for a draft save.');
    });
    assert.deepEqual(tabs.at(-1), [
      'HtTpS://example.com',
      '_blank',
      'noopener,noreferrer',
    ]);
    const protocols = [
      'mailto:a@example.com',
      'tel:+123456789',
      'sms:+123456789',
      'slack://channel',
      'vscode://file/note',
      'obsidian://open',
      'zoommtg://join',
      'spotify:track:123',
      'figma://file/123',
      'notion://page/123',
      'custom+app:target',
    ];
    for (const href of protocols) await openExternalLink(href, async () => {});
    assert.deepEqual(handlers, protocols);
    for (const href of [
      'javascript:alert(1)',
      'vbscript:msgbox(1)',
      'data:text/html,test',
      'blob:https://example.com/id',
      'file:///etc/passwd',
      'https://[invalid',
      '/notes/test',
    ])
      await openExternalLink(href, async () => {});
    assert.equal(tabs.length, 3);
    assert.deepEqual(handlers, protocols);
  } finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, 'window');
    else Object.defineProperty(globalThis, 'window', original);
  }
});

await test('a protocol handoff waits for the draft write', async () => {
  const events: string[] = [];
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        assign: (href: string) => {
          events.push(href);
        },
      },
    },
  });
  try {
    let finish = () => {};
    const saved = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const opened = openExternalLink('slack://channel', () => {
      events.push('flush');
      return saved;
    });
    assert.deepEqual(events, ['flush']);
    finish();
    assert.equal(await opened, true);
    assert.deepEqual(events, ['flush', 'slack://channel']);
  } finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, 'window');
    else Object.defineProperty(globalThis, 'window', original);
  }
});

await test('a failed or slow draft write prevents handoff, including after a late save', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const events: string[] = [];
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        assign: (href: string) => {
          events.push(href);
        },
      },
    },
  });
  try {
    assert.equal(
      await openExternalLink('slack://channel', async () => {
        throw new Error('Storage failed.');
      }),
      false,
    );
    let finish = () => {};
    const saved = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const opened = openExternalLink('slack://channel', () => saved);
    t.mock.timers.tick(protocolSaveTimeoutMs);
    assert.equal(await opened, false);
    finish();
    await saved;
    assert.deepEqual(events, []);
  } finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, 'window');
    else Object.defineProperty(globalThis, 'window', original);
  }
});
