/**
 * The rules of the image viewer (record 0145): the fit, the zoom steps, the
 * actions of a picture, and the name a download takes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  actionNeedsPicture,
  imageActionMessages,
  clampZoom,
  closesOnRelease,
  fitZoom,
  imageActionLabels,
  imageActions,
  imageDownloadName,
  imageTitle,
  lowestZoom,
  wheelZoom,
  zoomIn,
  zoomKey,
  zoomLimits,
  zoomOut,
  zoomPercent,
  zoomSteps,
  viewerStatus,
  zoomedSize,
} from './image-viewer.ts';

await test('a large picture fits the room and a small one keeps its size', () => {
  const room = { width: 800, height: 600 };
  assert.equal(fitZoom({ width: 1600, height: 600 }, room), 0.5);
  assert.equal(fitZoom({ width: 800, height: 1200 }, room), 0.5);
  assert.equal(fitZoom({ width: 200, height: 100 }, room), 1);
});

await test('a picture or a room with no size shows at its own size', () => {
  assert.equal(fitZoom({ width: 0, height: 0 }, { width: 10, height: 10 }), 1);
  assert.equal(fitZoom({ width: 10, height: 10 }, { width: 0, height: 0 }), 1);
});

await test('a huge picture fits below the smallest step', () => {
  // A review of 2026-10-01. A 4000 px photo on a phone narrower than 400 px
  // fits below 10%, and a fit held to that step showed a part of it.
  const phone = { width: 342, height: 700 };
  const photo = { width: 4000, height: 3000 };
  const fitted = fitZoom(photo, phone);
  assert.ok(fitted < zoomLimits.min, String(fitted));
  assert.ok(zoomedSize(photo, fitted).width <= phone.width);
  assert.equal(lowestZoom(fitted), fitted);
  assert.equal(lowestZoom(0.5), zoomLimits.min);
});

await test('a zoom out reaches the fit and stays there', () => {
  const lowest = 0.05;
  assert.equal(zoomOut(0.25, lowest), 0.1);
  assert.equal(zoomOut(0.1, lowest), lowest);
  assert.equal(zoomOut(lowest, lowest), lowest);
  assert.equal(wheelZoom(lowest, 10_000, lowest), lowest);
  assert.equal(clampZoom(0.01, lowest), lowest);
});

await test('the buttons move one step and stop at the limits', () => {
  assert.equal(zoomIn(1), 1.5);
  assert.equal(zoomOut(1), 0.75);
  // A fitted zoom between two steps moves to the next step in each way.
  assert.equal(zoomIn(0.6), 0.75);
  assert.equal(zoomOut(0.6), 0.5);
  assert.equal(zoomIn(zoomLimits.max), zoomLimits.max);
  assert.equal(zoomOut(zoomLimits.min), zoomLimits.min);
});

await test('the wheel zooms with the distance and stays inside the limits', () => {
  assert.ok(wheelZoom(1, -100) > 1);
  assert.ok(wheelZoom(1, 100) < 1);
  assert.equal(wheelZoom(zoomLimits.max, -10_000), zoomLimits.max);
  assert.equal(wheelZoom(zoomLimits.min, 10_000), zoomLimits.min);
  assert.equal(clampZoom(Number.NaN), 1);
});

await test('the keys zoom in, out, and back to the fit', () => {
  assert.equal(zoomKey('+'), 'in');
  assert.equal(zoomKey('='), 'in');
  assert.equal(zoomKey('-'), 'out');
  assert.equal(zoomKey('0'), 'fit');
  assert.equal(zoomKey('a'), null);
  assert.equal(zoomKey('Enter'), null);
});

await test('the zoomed size is whole pixels and never zero', () => {
  assert.deepEqual(zoomedSize({ width: 333, height: 101 }, 0.5), {
    width: 167,
    height: 51,
  });
  assert.deepEqual(zoomedSize({ width: 1, height: 1 }, 0.1), {
    width: 1,
    height: 1,
  });
  assert.equal(zoomPercent(0.5), '50%');
  assert.equal(zoomPercent(1.5), '150%');
});

await test('a picture of the workspace copies and downloads its bytes', () => {
  assert.deepEqual(imageActions(false), ['copy-image', 'download']);
});

await test('only Copy image waits for the pixels of the picture', () => {
  // A review of 2026-10-01. A picture of another host that did not load still
  // has an address, so Copy link stays as Open original does.
  assert.equal(actionNeedsPicture('copy-image'), true);
  assert.equal(actionNeedsPicture('download'), false);
  assert.equal(actionNeedsPicture('copy-link'), false);
  assert.equal(actionNeedsPicture('open'), false);
});

await test('a picture of another host copies its link and opens the original', () => {
  // The page cannot read the bytes of another host, so it offers no action
  // that would need them.
  assert.deepEqual(imageActions(true), ['copy-link', 'open']);
  assert.deepEqual(
    imageActions(true).map((action) => imageActionLabels[action]),
    ['Copy link', 'Open original'],
  );
});

await test('the title is the alt text or a plain name', () => {
  assert.equal(imageTitle(' A red bike '), 'A red bike');
  assert.equal(imageTitle(''), 'Image');
});

await test('a download takes the name of the file without its identifier', () => {
  const note = '0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d';
  assert.equal(
    imageDownloadName(`attachments/${note}-photo.png`, 'alt'),
    'photo.png',
  );
  assert.equal(
    imageDownloadName(`../attachments/${note}-my%20chart.svg`, ''),
    'my chart.svg',
  );
  assert.equal(
    imageDownloadName('attachments/plan.jpg?x=1#top', ''),
    'plan.jpg',
  );
});

await test('a destination that names no file takes the alt text', () => {
  const revision = '/attachments/0a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d';
  assert.equal(imageDownloadName(revision, 'Floor plan'), 'Floor plan');
  assert.equal(imageDownloadName(revision, ''), 'image');
});

await test('a download name holds no path and no unsafe character', () => {
  assert.equal(imageDownloadName('attachments/a%2Fb%3Ac.png', ''), 'a-b-c.png');
  assert.equal(imageDownloadName('attachments/..', ''), 'image');
  assert.equal(imageDownloadName('attachments/%00x.png', ''), 'x.png');
});

await test('the steps run from the smallest zoom to the largest', () => {
  const steps = [...zoomSteps];
  assert.equal(steps[0], zoomLimits.min);
  assert.equal(steps.at(-1), zoomLimits.max);
  assert.deepEqual(
    steps,
    [...steps].sort((left, right) => left - right),
  );
});

await test('a tap on the scrim closes the viewer and a drag does not', () => {
  assert.equal(closesOnRelease({ onScrim: true, dx: 0, dy: 0 }), true);
  assert.equal(closesOnRelease({ onScrim: true, dx: 2, dy: 2 }), true);
  // A drag that starts on the scrim moves a zoomed picture.
  assert.equal(closesOnRelease({ onScrim: true, dx: 30, dy: 0 }), false);
  // A press on the picture never closes it.
  assert.equal(closesOnRelease({ onScrim: false, dx: 0, dy: 0 }), false);
});

await test('the result of an action replaces the load failure', () => {
  // A review of 2026-10-01. A picture that did not load kept its load message
  // after Copy link, so a copy that worked and one that failed looked alike.
  assert.equal(viewerStatus({ failed: false, message: '' }), '');
  assert.equal(
    viewerStatus({ failed: true, message: '' }),
    imageActionMessages.notLoaded,
  );
  assert.equal(
    viewerStatus({ failed: true, message: imageActionMessages.copiedLink }),
    imageActionMessages.copiedLink,
  );
  assert.equal(
    viewerStatus({ failed: true, message: imageActionMessages.copyLinkFailed }),
    imageActionMessages.copyLinkFailed,
  );
});

await test('the actual-size key uses the same scale as the 100 percent control', () => {
  assert.equal(zoomKey('1'), 'actual');
});
