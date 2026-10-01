import assert from 'node:assert/strict';
import test from 'node:test';
import { touchFieldText } from '@notesapp/ui';
import {
  noteNameFieldClassName,
  noteNameFieldMaximum,
  noteNameFieldMinimum,
  noteNameFieldSize,
} from './note-name-field.ts';

await test('the field is as wide as the name and no wider', () => {
  assert.equal(noteNameFieldSize('Meeting notes'), 'Meeting notes'.length);
  const classes = noteNameFieldClassName().split(' ');
  // A field that took the free width of the header drew its hover fill over
  // a thousand pixels of empty row. The width comes from the name.
  assert.ok(classes.includes('w-auto'));
  assert.ok(!classes.includes('w-full'));
});

await test('a short name keeps the width of the placeholder', () => {
  assert.equal(noteNameFieldSize(''), noteNameFieldMinimum);
  assert.equal(noteNameFieldSize('Ab'), noteNameFieldMinimum);
});

await test('a long name stops at the width the header can hold', () => {
  assert.equal(noteNameFieldSize('x'.repeat(500)), noteNameFieldMaximum);
  const classes = noteNameFieldClassName().split(' ');
  // The header holds it too, and the name ends in an ellipsis rather than
  // pushing Search off the row.
  assert.ok(classes.includes('max-w-full'));
  assert.ok(classes.includes('min-w-0'));
  assert.ok(classes.includes('truncate'));
});

await test('the name field reads as the last part of the breadcrumb', () => {
  const classes = noteNameFieldClassName().split(' ');
  // Decision 0069. The breadcrumb draws the part a route names in the body
  // step of the chrome, the medium weight and the strong ink, so the field
  // that replaces that part takes the same three.
  assert.ok(classes.includes('text-ui'));
  assert.ok(classes.includes('font-medium'));
  assert.ok(classes.includes('text-strong'));
  // It is no longer the largest text of the note screen, so it takes no
  // title step and no display tracking.
  assert.ok(!classes.includes('text-3xl'));
  assert.ok(!classes.includes('tracking-display'));
});

await test('the name field carries no box and no line in any state', () => {
  const classes = noteNameFieldClassName().split(' ');
  // A name, not a form field: nothing frames it at rest, under the pointer
  // or while a person types. The pointer gets the hover fill and the keyboard
  // gets the one focus treatment of the product.
  assert.ok(classes.includes('border-0'));
  assert.ok(!classes.some((name) => name.startsWith('border-b')));
  assert.ok(classes.includes('bg-transparent'));
  assert.ok(classes.includes('hover:bg-hover'));
  assert.ok(!classes.some((name) => name.startsWith('focus:')));
  assert.ok(classes.includes('focus-visible:outline-2'));
  assert.ok(classes.includes('focus-visible:outline-focus'));
});

await test('the name field starts where the folder before it starts', () => {
  const classes = noteNameFieldClassName().split(' ');
  // No inline padding, so the whole path reads as one line.
  assert.ok(!classes.some((name) => name.startsWith('px-')));
  assert.ok(!classes.some((name) => name.startsWith('pl-')));
});

await test('the name field sets its text at 16 px under touch', () => {
  // Safari on iOS zoomed the page into the name field on a tap, because its
  // text was under 16 px, and the zoom hid the rest of the header.
  assert.ok(noteNameFieldClassName().split(' ').includes(touchFieldText));
});
