import assert from 'node:assert/strict';
import test from 'node:test';
import {
  childFolderPath,
  knownFolderPaths,
  selectedFolderOrRoot,
  selectionForOpenNote,
} from './folder-selection.ts';

await test('a child folder uses the selected full parent path', () => {
  assert.equal(childFolderPath('', 'Work'), 'Work');
  assert.equal(childFolderPath('Work/Plans', 'Next'), 'Work/Plans/Next');
});

await test('known folders include every parent of an empty folder', () => {
  assert.deepEqual(
    knownFolderPaths(['Work/Notes/One.md'], ['Archive/Old/Done']),
    ['Archive', 'Archive/Old', 'Archive/Old/Done', 'Work', 'Work/Notes'],
  );
});

await test('a missing selection returns to the root', () => {
  const folders = ['Work', 'Work/Plans'];
  assert.equal(selectedFolderOrRoot('Work/Plans', folders), 'Work/Plans');
  assert.equal(selectedFolderOrRoot('Work/Old', folders), '');
  assert.equal(selectedFolderOrRoot('', folders), '');
});

await test('the open note decides the create parent', () => {
  // The defect this covers: New folder made its folder at the top while the
  // person was reading a note three folders deep, because nothing had moved
  // the selection there.
  assert.equal(selectionForOpenNote('', 'Work/Plans/Next.md'), 'Work/Plans');
  assert.equal(selectionForOpenNote('Archive', 'Notes/One.md'), 'Notes');
  // A note at the top selects the top.
  assert.equal(selectionForOpenNote('Archive', 'One.md'), '');
  // No open note leaves the choice of the person alone.
  assert.equal(selectionForOpenNote('Archive', null), 'Archive');
});
