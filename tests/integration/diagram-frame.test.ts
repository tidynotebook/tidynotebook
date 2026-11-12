/** Parent-side sandbox lifecycle. Geometry is protocol data, not browser proof. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

await test('a frame accepts its own current response and releases its resources', async () => {
  const browser = new Window({
    url: 'http://localhost/',
    settings: { disableIframePageLoading: true },
  });
  const names = ['window', 'document', 'Event'] as const;
  const originals = new Map(
    names.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );
  for (const name of names)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: browser[name],
    });
  const { createDiagramFrame } =
    await import('../../apps/web/dist/diagram/frame.js');
  const sizes: unknown[] = [];
  const handle = createDiagramFrame({
    source: 'graph LR; A-->B',
    theme: 'light',
    framePath: '/frame.html',
    onSize: (size) => sizes.push(size),
  });
  try {
    document.body.append(handle.element);
    const frame = handle.element.querySelector('iframe');
    assert.ok(frame);
    // Happy DOM does not load opaque frames. Supply a controlled message peer.
    const child = { postMessage: (_value: unknown): void => {} };
    Object.defineProperty(frame, 'contentWindow', {
      configurable: true,
      value: child,
    });
    assert.equal(frame.getAttribute('sandbox'), 'allow-scripts');
    assert.equal(frame.getAttribute('tabindex'), '-1');
    const sent: unknown[] = [];
    Object.defineProperty(child, 'postMessage', {
      configurable: true,
      value: (value: unknown) => sent.push(value),
    });
    frame.dispatchEvent(new Event('load'));
    const request = sent[0];
    assert.ok(request && typeof request === 'object' && 'requestId' in request);
    const requestId = request.requestId;
    const response = {
      requestId,
      ok: true,
      height: 100,
      width: 300,
      naturalWidth: 1000,
      naturalHeight: 300,
      paddingX: 16,
      paddingY: 16,
    };
    const send = (source: unknown, data: unknown): void => {
      const event = new browser.MessageEvent('message', { data });
      Object.defineProperty(event, 'source', { value: source });
      browser.dispatchEvent(event);
    };
    send(browser, response);
    send(child, { ...response, requestId: 'old' });
    send(child, { ...response, naturalWidth: Infinity });
    assert.equal(
      handle.element.getAttribute('data-notesapp-diagram'),
      'pending',
    );
    assert.equal(sizes.length, 0);
    send(child, response);
    assert.equal(handle.element.getAttribute('data-notesapp-diagram'), 'ready');
    handle.setScale(0.75);
    assert.equal(frame.style.width, '782px');
    assert.equal(frame.style.height, '257px');
    assert.equal(sizes.length, 1);
    handle.setScale(Infinity);
    assert.equal(frame.style.width, '782px');
    assert.deepEqual(sent.at(-1), { kind: 'scale', requestId, scale: 0.75 });
    handle.dispose();
    assert.equal(handle.element.isConnected, false);
    send(child, response);
    assert.equal(sizes.length, 1);
  } finally {
    handle.dispose();
    await browser.happyDOM.close();
    for (const name of names) {
      const original = originals.get(name);
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
