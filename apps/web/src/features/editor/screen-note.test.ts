import assert from 'node:assert/strict';
import test from 'node:test';
import { createScreenNote, type ScreenBoundNote } from './screen-note.ts';

/** A note that counts its opens and its releases, as `openBoundNote` acts. */
interface CountedNote extends ScreenBoundNote<CountedNote> {
  readonly id: number;
  readonly released: () => boolean;
}

/** The opens and releases of one screen, and the function that opens. */
function counter(): {
  readonly open: () => CountedNote;
  readonly opens: () => number;
  readonly releases: () => number;
} {
  let opens = 0;
  let releases = 0;
  const open = (): CountedNote => {
    opens += 1;
    const id = opens;
    let released = false;
    const note: CountedNote = {
      id,
      released: () => released,
      release(): void {
        if (released) return;
        released = true;
        releases += 1;
      },
      reopen: (): CountedNote => (released ? open() : note),
    };
    return note;
  };
  return { open, opens: () => opens, releases: () => releases };
}

await test('a render opens no note, and each mount releases the one note it took', () => {
  // The defect: each read of the loader with the same key opened a new note
  // in a render, and nothing released it.
  const count = counter();
  const screen = createScreenNote(count.open);
  assert.equal(count.opens(), 0, 'a render opens nothing');

  // React mounts the effects, cleans up and mounts again in development.
  // The view effect and the work effect each hold the note.
  const view = screen.holdNote();
  const work = screen.holdNote();
  const first = view.note;
  assert.equal(work.note, first, 'a second effect takes the note');
  assert.equal(screen.noteRef.current, first);
  view.release();
  work.release();
  assert.equal(first.released(), true);
  const second = screen.holdNote();
  assert.notEqual(second.note, first);
  assert.equal(screen.noteRef.current, second.note);
  second.release();
  assert.equal(count.opens(), 2);
  assert.equal(count.releases(), 2);
});

await test('a released note never stays under a live view', () => {
  // Issue 517: React runs the set up of the view effect before the clean up
  // of the work effect. The view took the open note, and the clean up then
  // released it, so the undo of the live view was gone.
  const count = counter();
  const screen = createScreenNote(count.open);
  const firstView = screen.holdNote();
  const firstWork = screen.holdNote();
  // Both effects run again in one commit: the view effect first.
  firstView.release();
  const view = screen.holdNote();
  firstWork.release();
  const work = screen.holdNote();
  assert.equal(view.note.released(), false, 'the view keeps an open note');
  assert.equal(work.note, view.note, 'both effects share one note');
  assert.equal(count.opens(), 1);
  // Leaving the screen ends the note after its last hold.
  view.release();
  assert.equal(view.note.released(), false);
  work.release();
  work.release();
  assert.equal(view.note.released(), true);
  assert.equal(count.releases(), 1);
});

await test('a screen that React renders and throws away opens nothing', () => {
  const count = counter();
  createScreenNote(count.open);
  createScreenNote(count.open);
  const kept = createScreenNote(count.open);
  const note = kept.noteRef.current;
  const hold = kept.holdNote();
  assert.equal(hold.note, note, 'the mount takes the note it read');
  hold.release();
  assert.equal(count.opens(), 1);
  assert.equal(count.releases(), 1);
});
