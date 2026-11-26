import assert from 'node:assert/strict';
import test from 'node:test';
import {
  overlayGap,
  overlayMargin,
  overlayMaxHeight,
  placeOverlay,
} from './overlay-position.ts';

/** A tablet screen, which is where the sidebar is narrowest and deepest. */
const screen = { top: 0, left: 0, bottom: 768, right: 1024 };

await test('an overlay opens below its anchor when it fits there', () => {
  const place = placeOverlay({
    anchor: { top: 100, left: 500, width: 32, height: 32 },
    overlay: { width: 224, height: 190 },
    screen,
    align: 'end',
  });
  assert.equal(place.above, false);
  assert.equal(place.top, 100 + 32 + overlayGap);
  assert.equal(place.left, 500 + 32 - 224);
});

await test('an overlay near the foot of the screen opens above its anchor', () => {
  // The row menu of the last folder of a long tree. Below it there is room
  // for one row, so every row but the first was cut off before.
  const place = placeOverlay({
    anchor: { top: 602, left: 191, width: 32, height: 32 },
    overlay: { width: 224, height: 190 },
    screen,
    align: 'end',
  });
  assert.equal(place.above, true);
  assert.equal(place.top, 602 - overlayGap - 190);
  assert.ok(place.top >= overlayMargin);
  assert.ok(place.maxHeight >= 190);
});

await test('an overlay wider than the room to its left keeps its left edge on the screen', () => {
  // A deep row of a 224 px sidebar. The right edge of the trigger is 215, so
  // an end aligned overlay of 224 wants to start at -9 and was cut off.
  const place = placeOverlay({
    anchor: { top: 300, left: 183, width: 32, height: 32 },
    overlay: { width: 224, height: 190 },
    screen,
    align: 'end',
  });
  assert.equal(place.left, overlayMargin);
});

await test('an overlay keeps its right edge on the screen', () => {
  const place = placeOverlay({
    anchor: { top: 40, left: 1000, width: 32, height: 32 },
    overlay: { width: 224, height: 190 },
    screen,
    align: 'start',
  });
  assert.equal(place.left, screen.right - 224 - overlayMargin);
});

await test('an overlay wider than the screen starts at the margin', () => {
  const place = placeOverlay({
    anchor: { top: 40, left: 10, width: 32, height: 32 },
    overlay: { width: 2000, height: 100 },
    screen,
    align: 'start',
  });
  assert.equal(place.left, overlayMargin);
});

await test('a start aligned overlay lines up with the left edge of its anchor', () => {
  const place = placeOverlay({
    anchor: { top: 40, left: 300, width: 200, height: 32 },
    overlay: { width: 224, height: 100 },
    screen,
    align: 'start',
  });
  assert.equal(place.left, 300);
});

await test('an overlay is never taller than the room it has', () => {
  const place = placeOverlay({
    anchor: { top: 700, left: 100, width: 32, height: 32 },
    overlay: { width: 224, height: 600 },
    screen,
    align: 'end',
  });
  // Above the anchor there is 700 minus the gap and the margin.
  assert.equal(place.above, true);
  assert.equal(
    place.maxHeight,
    Math.min(700 - overlayGap - overlayMargin, overlayMaxHeight),
  );
  assert.ok(place.top >= overlayMargin);
});

await test('a long list is bounded so it never fills the screen', () => {
  const place = placeOverlay({
    anchor: { top: 60, left: 100, width: 200, height: 32 },
    overlay: { width: 224, height: 2000 },
    screen,
    align: 'start',
  });
  assert.equal(place.maxHeight, overlayMaxHeight);
});

await test('a menu can use the space below its trigger up to the safe inset', () => {
  const place = placeOverlay({
    anchor: { top: 0, left: 100, width: 44, height: 44 },
    overlay: { width: 224, height: 420 },
    screen: { top: 0, left: 0, bottom: 700, right: 320 },
    align: 'end',
    heightLimit: Infinity,
    bottomInset: 20,
  });
  assert.equal(place.top, 44 + overlayGap);
  assert.equal(place.maxHeight, 700 - 20 - overlayMargin - place.top);
  assert.ok(place.maxHeight >= 420);
});

await test('an anchor below the foot of the screen leaves no room below it', () => {
  const place = placeOverlay({
    anchor: { top: 900, left: 100, width: 32, height: 32 },
    overlay: { width: 224, height: 190 },
    screen,
    align: 'end',
  });
  assert.equal(place.above, true);
  assert.ok(place.maxHeight > 0);
});

await test('an overlay stays above the keyboard of a phone', () => {
  // The keyboard covers the screen from 508 down. The layout viewport still
  // ends at 844, so a menu of a table row at 420 opened under the keys.
  const place = placeOverlay({
    anchor: { top: 420, left: 40, width: 32, height: 32 },
    overlay: { width: 224, height: 190 },
    screen: { top: 0, left: 0, bottom: 508, right: 390 },
    align: 'start',
  });
  assert.equal(place.above, true);
  assert.ok(place.top + Math.min(190, place.maxHeight) <= 508 - overlayMargin);
});

await test('an overlay keeps the margin from a visible area that starts low', () => {
  const place = placeOverlay({
    anchor: { top: 260, left: 40, width: 32, height: 32 },
    overlay: { width: 224, height: 400 },
    screen: { top: 200, left: 0, bottom: 300, right: 390 },
    align: 'start',
  });
  assert.equal(place.above, true);
  assert.ok(place.top >= 200 + overlayMargin);
});

await test('an anchor under the keyboard opens its overlay above the keyboard', () => {
  // The visible area ends at 508 and the anchor stands at 600, under the
  // keys. The overlay ended at the anchor, so 88 px of it stood under them.
  const place = placeOverlay({
    anchor: { top: 600, left: 40, width: 32, height: 32 },
    overlay: { width: 224, height: 190 },
    screen: { top: 0, left: 0, bottom: 508, right: 390 },
    align: 'start',
  });
  assert.equal(place.above, true);
  assert.ok(place.top >= overlayMargin);
  assert.ok(place.top + Math.min(190, place.maxHeight) <= 508 - overlayMargin);
});
