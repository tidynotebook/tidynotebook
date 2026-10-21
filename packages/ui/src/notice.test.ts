import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Notice } from '../dist/notice.js';

await test('a dismissible notice has a named button and calls its dismiss action', () => {
  let dismissed = false;
  const props = {
    message: 'This link is blocked.',
    onDismiss: () => {
      dismissed = true;
    },
  };
  const markup = renderToStaticMarkup(createElement(Notice, props));
  assert.match(markup, /role="status"/);
  assert.match(
    markup,
    /<button[^>]*type="button"[^>]*><span>Dismiss<\/span><\/button>/,
  );
  const notice = Notice(props);
  assert.ok(isValidElement<{ children: unknown[] }>(notice));
  const button = notice.props.children.at(-1);
  assert.ok(isValidElement<{ onClick: () => void }>(button));
  button.props.onClick();
  assert.equal(dismissed, true);
});

await test('a notice without a dismiss action adds no button', () => {
  const markup = renderToStaticMarkup(
    createElement(Notice, { message: 'Saved.' }),
  );
  assert.doesNotMatch(markup, /<button/);
});
