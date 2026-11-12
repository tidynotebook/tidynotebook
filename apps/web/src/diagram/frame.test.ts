/**
 * The presentation invariants of the diagram frame.
 *
 * The frame is a sandboxed document inside a live-preview widget. A click on
 * a separate document moves the focus into it, so the widget never learns of
 * the click: the source of the diagram stays closed and every keystroke after
 * the click is lost. The frame therefore takes no pointer event.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { themeProperties, themes } from '@notesapp/ui';
import {
  diagramFontVariable,
  diagramThemeOptions,
  drawnHeight,
  isParentMessage,
  clampDiagramHeight,
  diagramFrameStyle,
  diagramLimits,
  isDiagramRequest,
  isDiagramResponse,
  isDiagramScaleRequest,
  inlineDiagramScale,
  diagramSourceAllowed,
  longHexColour,
  paletteNames,
} from './frame.ts';

await test('the diagram frame lets a click reach the editor', () => {
  assert.equal(diagramFrameStyle['pointerEvents'], 'none');
});

await test('the diagram frame fills the measure and shows no border', () => {
  assert.equal(diagramFrameStyle['width'], '100%');
  assert.equal(diagramFrameStyle['border'], '0');
});

await test('the load clock is longer than the render clock', () => {
  // Two clocks answer two questions. The frame holds the whole diagram engine
  // inline, so the bytes need more time than the drawing, and a render budget
  // that started before the bytes arrived spent itself on the download. That
  // is what left a diagram as plain text on a slow link.
  assert.ok(diagramLimits.maxLoadMs > diagramLimits.maxRenderMs);
});

await test('a reported height is clamped into the applied bounds', () => {
  assert.equal(clampDiagramHeight(-1), diagramLimits.minHeightPx);
  assert.equal(clampDiagramHeight(Number.NaN), diagramLimits.minHeightPx);
  assert.equal(clampDiagramHeight(10_000), diagramLimits.maxHeightPx);
  assert.equal(clampDiagramHeight(240.4), 240);
});

await test('a short colour of the stylesheet reaches the frame in six digits', () => {
  // The light palette of a published page comes from the built stylesheet,
  // which writes `#ffffff` as `#fff`. The frame refused that request, so a
  // published diagram drew in dark and never in light (record 0158).
  assert.equal(longHexColour('#fff'), '#ffffff');
  assert.equal(longHexColour('#1A6'), '#11AA66');
  assert.equal(longHexColour('#f7f7f5'), '#f7f7f5');
  assert.equal(longHexColour('white'), 'white');
  const palette = ['#fff', '#f7f7f5', '#37352f', '#1a63c4', '#85837d'];
  const request = (colours: readonly string[]) => ({
    requestId: 'r',
    source: 'graph TD;',
    theme: 'light',
    palette: colours,
  });
  assert.equal(paletteNames.length, palette.length);
  assert.equal(isDiagramRequest(request(palette)), false);
  assert.equal(isDiagramRequest(request(palette.map(longHexColour))), true);
});

await test('a diagram takes its colours from the palette of the page in both appearances', () => {
  // The light diagram drew in the lavender of the default Mermaid theme while
  // the page drew the Default palette. Every colour now comes from the palette
  // that the request carries, so a theme of the registry reaches the frame.
  const light = ['#ffffff', '#f7f7f5', '#37352f', '#1a63c4', '#85837d'];
  const dark = ['#191919', '#141414', '#d0cfcc', '#6fa8f5', '#807e79'];
  for (const [theme, palette] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    const options = diagramThemeOptions(
      { requestId: 'r', source: 'graph TD;', theme, palette },
      'Face',
    );
    assert.equal(options.theme, 'base');
    assert.equal(options.darkMode, theme === 'dark');
    const variables = options.themeVariables;
    assert.equal(variables['background'], palette[0]);
    assert.equal(variables['primaryColor'], palette[1]);
    assert.equal(variables['primaryTextColor'], palette[2]);
    assert.equal(variables['primaryBorderColor'], palette[4]);
    assert.equal(variables['lineColor'], palette[4]);
    // No colour of a Mermaid theme stays: each value is one of the palette,
    // and the two values that are not a colour turn the shadow off and name
    // the face.
    assert.deepEqual(
      Object.entries(variables).filter(([, value]) => !palette.includes(value)),
      [
        ['dropShadow', 'none'],
        ['fontFamily', 'Face'],
      ],
    );
  }
});

await test('a diagram node draws no shadow in any theme of the registry', () => {
  // Mermaid 12 draws a flowchart and a sequence diagram in its `neo` look,
  // which puts a shadow under each node. The `base` theme colours it a light
  // grey, so every node of a dark page had a pale halo. The `neo` look also
  // adds a shadow filter of a colour that no palette reaches. A node is part
  // of the page and not a raised surface, so no theme draws a shadow.
  assert.ok(themes.length > 2);
  for (const theme of themes) {
    const properties = new Map(themeProperties(theme));
    const palette = paletteNames.map((name) =>
      longHexColour(properties.get(name) ?? ''),
    );
    const request = {
      requestId: 'r',
      source: 'graph TD;',
      theme: theme.appearance,
      palette,
    };
    assert.equal(isDiagramRequest(request), true, theme.id);
    const options = diagramThemeOptions(request, 'Face');
    assert.equal(options.look, 'classic', theme.id);
    assert.equal(options.themeVariables['dropShadow'], 'none', theme.id);
  }
});

await test('the frame takes a request from its parent and from no one else', () => {
  // A frame document opened at the top level, or a message of a sibling
  // frame, drew whatever it received with the inline script of the frame.
  const parent = { name: 'parent' };
  const framed = { parent };
  assert.equal(isParentMessage(framed, parent), true);
  assert.equal(isParentMessage(framed, { name: 'sibling' }), false);
  assert.equal(isParentMessage(framed, null), false);
  // At the top level a window is its own parent, so nothing is a request.
  const top: { parent: unknown } = { parent: null };
  top.parent = top;
  assert.equal(isParentMessage(top, top), false);
});

await test('a diagram is set in the face that the stylesheet declares', () => {
  // The frame set its text in a system face of its own, and Mermaid set each
  // label in its own default family, while the page around it is Geist
  // (record 0061). The frame now reads the family of the page from the one
  // stylesheet and gives it to Mermaid in both places that Mermaid reads.
  // `tests/integration/web-build.test.ts` proves that the built frame
  // declares this variable with the family of the page.
  assert.equal(diagramFontVariable, '--font-sans');
  const family = 'Face of the page';
  const options = diagramThemeOptions(
    {
      requestId: 'r',
      source: 'sequenceDiagram',
      theme: 'dark',
      palette: ['#191919', '#141414', '#d0cfcc', '#6fa8f5', '#807e79'],
    },
    family,
  );
  assert.equal(options.fontFamily, family);
  assert.equal(options.themeVariables['fontFamily'], family);
});

await test('the frame reports the whole body that it drew, rounded up', () => {
  // The frame reported the height of the diagram host alone. The body adds a
  // padding around it, so the last rows of every diagram fell out of view:
  // the lowest edge of a flowchart and the name under a sequence actor.
  const body = { getBoundingClientRect: () => ({ height: 347.39 }) };
  assert.equal(drawnHeight(body), 348);
  assert.equal(clampDiagramHeight(drawnHeight(body)), 348);
});

await test('inline diagrams keep readable text and reserve measured frame padding', () => {
  const size = { width: 1000, height: 600, paddingX: 8, paddingY: 8 };
  assert.equal(inlineDiagramScale(size, 1016), 1);
  assert.equal(inlineDiagramScale(size, 816), 0.8);
  assert.equal(inlineDiagramScale(size, 320), 0.75);
  assert.equal(inlineDiagramScale({ ...size, paddingX: 16 }, 832), 0.8);
  assert.equal(inlineDiagramScale(size, Number.NaN), 0.75);
});

await test('sandbox zoom accepts finite bounded scales only', () => {
  for (const scale of [0.001, 0.625, 0.75, 1, 4])
    assert.equal(
      isDiagramScaleRequest({ kind: 'scale', requestId: 'r', scale }),
      true,
    );
  for (const scale of [0, -1, 0.0001, 4.01, Infinity, NaN, '1', null])
    assert.equal(
      isDiagramScaleRequest({ kind: 'scale', requestId: 'r', scale }),
      false,
    );
  assert.equal(
    isDiagramScaleRequest({ kind: 'scale', requestId: '', scale: 1 }),
    false,
  );
  assert.equal(
    isDiagramScaleRequest({ kind: 'render', requestId: 'r', scale: 1 }),
    false,
  );
});

await test('sandbox geometry rejects partial or unbounded natural dimensions', () => {
  const answer = { requestId: 'r', ok: true, height: 400 };
  const natural = {
    ...answer,
    width: 300,
    naturalWidth: 1000,
    naturalHeight: 800,
    paddingX: 8,
    paddingY: 8,
  };
  assert.equal(isDiagramResponse(answer), true);
  assert.equal(isDiagramResponse(natural), true);
  assert.equal(isDiagramResponse({ ...answer, naturalWidth: 1000 }), false);
  for (const value of [0, -1, NaN, Infinity, 32769]) {
    assert.equal(isDiagramResponse({ ...natural, naturalWidth: value }), false);
    assert.equal(
      isDiagramResponse({ ...natural, naturalHeight: value }),
      false,
    );
  }
  for (const value of [-1, NaN, Infinity, 257])
    assert.equal(isDiagramResponse({ ...natural, paddingX: value }), false);
});

await test('diagram source cannot replace the fixed sandbox configuration', () => {
  assert.equal(diagramSourceAllowed('graph LR; A-->B'), true);
  assert.equal(diagramSourceAllowed('%% a comment\ngraph TD; A-->B'), true);
  assert.equal(
    diagramSourceAllowed(
      '%%{init: {"securityLevel":"loose"}}%%\ngraph TD; A-->B',
    ),
    false,
  );
  assert.equal(
    diagramSourceAllowed('---\nconfig: {}\n---\ngraph TD; A-->B'),
    false,
  );
  assert.equal(
    diagramSourceAllowed('x'.repeat(diagramLimits.maxSourceChars + 1)),
    false,
  );
});
