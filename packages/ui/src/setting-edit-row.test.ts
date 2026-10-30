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
  Panel,
  CollapsibleSection,
  PhoneSheetHeader,
} from '../dist/index.js';
import { fixedRegionClasses } from './scroll-classes.ts';
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
  assert.ok(!/\bclass="[^"]*\bgap-4\b/.test(html));
  assert.match(html, /data-dialog-escape="local"/);
});

await test('every scroll-edge layer stays outside flex and grid flow', () => {
  for (const edge of ['top', 'bottom', 'both'] as const) {
    const classes = fixedRegionClasses(edge).split(/\s+/);
    assert.ok(classes.includes('before:absolute'));
    assert.ok(classes.includes('after:absolute'));
  }
});

await test('a phone sheet keeps its Close control in the trailing header slot', () => {
  const html = renderToStaticMarkup(
    createElement(PhoneSheetHeader, {
      title: 'New folder',
      onClose: () => {},
    }),
  );
  assert.match(html, /data-header-slot="leading"/);
  assert.match(
    html,
    /data-header-slot="trailing"[^]*aria-label="Close dialog"/,
  );
  assert.equal((html.match(/aria-label="Close dialog"/g) ?? []).length, 1);
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

await test('the note side panel uses symmetric panel padding and tree disclosure rows', () => {
  const html = renderToStaticMarkup(
    createElement(Panel, {
      children: createElement(CollapsibleSection, {
        id: 'outline',
        title: 'Outline',
        open: true,
        onToggle: () => {},
        children: 'Launch plan',
      }),
    }),
  );
  assert.match(html, /data-ui-layout="panel"/);
  assert.match(
    html,
    /data-ui-pad="\{&quot;fine&quot;:2,&quot;coarse&quot;:3\}"/,
  );
  assert.match(html, /data-ui-row="tree"/);
  assert.match(html, /data-disclosure-content="outline"/);
});
