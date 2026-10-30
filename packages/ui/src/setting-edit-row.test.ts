import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SettingEditRow,
  TextField,
  Form,
  DialogBody,
  DialogFooter,
  Button,
  SettingsSurface,
} from '../dist/index.js';
import { DialogInsetContext } from '../dist/dialog-layout-context.js';
await test('an inline value edit has no dialog inset or internal scroll line and Cancel precedes Save', () => {
  const html = renderToStaticMarkup(
    createElement(SettingEditRow, {
      label: 'Name edit',
      onCancel: () => {},
      onSubmit: () => {},
      children: createElement(TextField, {
        id: 'name',
        label: 'Name',
        value: 'Review',
        hint: 'Name help',
        onChange: () => {},
      }),
    }),
  );
  assert.ok(html.includes('ui-settings-row'));
  assert.ok(!html.includes('ui-scroll-region'));
  assert.ok(!html.includes('ui-dialog-footer'));
  assert.ok(html.indexOf('Cancel') < html.lastIndexOf('Save'));
  assert.match(html, /data-ui-gap="3"/);
  assert.match(html, /data-dialog-escape="local"/);
});
await test('a desktop dialog owns one inset and keeps Cancel before its primary action', () => {
  const html = renderToStaticMarkup(
    createElement(SettingsSurface, {
      children: createElement(DialogInsetContext.Provider, {
        value: true,
        children: createElement(Form, {
          regions: true,
          children: [
            createElement(DialogBody, { key: 'body', children: 'Form body' }),
            createElement(DialogFooter, {
              key: 'footer',
              children: [
                createElement(Button, { key: 'save', children: 'Save' }),
                createElement(Button, {
                  key: 'cancel',
                  variant: 'ghost',
                  children: 'Cancel',
                }),
              ],
            }),
          ],
        }),
      }),
    }),
  );
  assert.match(html, /data-ui-gap="6"/);
  assert.match(html, /data-ui-pad="0"/);
  assert.ok(!html.includes('data-ui-pad="6"'));
  assert.ok(html.indexOf('Cancel') < html.lastIndexOf('Save'));
});
