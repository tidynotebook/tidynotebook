/**
 * The class rules of a control that no other check can see.
 *
 * The contrast test in `theme.test.ts` proves every palette colour on every
 * surface it renders on. It cannot see a colour that a screen makes at paint
 * time with a filter or with an opacity modifier, and that was the fault
 * decision 0057 answers. These tests refuse both forms coming back.
 *
 * They also hold the recipes of decision 0065 to one focus treatment, one
 * radius, one size scale, and to the resting edge of decision 0063.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spacingSpec } from './spacing.ts';
import {
  avatarClassName,
  badgeClassName,
  bareFieldClassName,
  buttonClassName,
  buttonName,
  calendarDayClassName,
  calendarNoteMarkClassName,
  checkboxClassNames,
  compactButtonVisualClassName,
  controlStripClassName,
  disabledButtonSurface,
  edgeControlClassName,
  fieldClassName,
  focusOutline,
  focusOutlineInset,
  kbdClassName,
  menuSurfaceClassName,
  menuSurfaceStyle,
  menuSurfaceValues,
  meterAlmostFull,
  meterClassNames,
  meterFillPercent,
  rowClassName,
  switchClassNames,
  selectClassName,
  inlineFieldClassName,
  sidebarViewClassName,
  tabClassName,
  taskBoxClassName,
  textAreaClassName,
  touchFieldText,
  type ButtonSize,
  type ButtonVariant,
  type EdgeMark,
  type FrameEdge,
} from './control-classes.ts';
import { defaultIconSize } from './icon-grid.ts';
import { contrastRatio, textContrastMinimum } from './theme.ts';
import { themes } from './themes/index.ts';

/** Every button appearance, with the name a failure message reads. */
const variants: readonly ButtonVariant[] = [
  'primary',
  'secondary',
  'ghost',
  'danger',
];

for (const value of [0, 0.24, 1, 4, 5, 50, 89, 90, 99, 100, 125])
  await test(`a meter at ${String(value)} of 100 has its real percentage`, () => {
    assert.equal(meterFillPercent(value, 100), Math.min(value, 100));
    assert.equal(meterAlmostFull(value, 100), value >= 90);
    const classes = meterClassNames(value, 100);
    assert.ok(
      classes.fill.includes(
        value >= 90 ? 'fill-danger-fill' : 'fill-accent-fill',
      ),
    );
    assert.ok(classes.track.includes('overflow-hidden'));
  });

await test('a meter refuses numbers that cannot state a value against a maximum', () => {
  for (const [value, max] of [
    [-1, 100],
    [NaN, 100],
    [Infinity, 100],
    [0, 0],
    [0, -1],
    [0, NaN],
    [0, Infinity],
  ])
    assert.throws(() => meterFillPercent(value ?? 0, max ?? 0), RangeError);
});

/** Every button size. */
const sizes: readonly ButtonSize[] = ['sm', 'md'];

/** Every recipe of the module, with the name a failure message reads. */
const recipes: readonly (readonly [string, string])[] = [
  ...variants.map(
    (variant) => [`${variant} button`, buttonClassName({ variant })] as const,
  ),
  ...sizes.map(
    (size) => [`${size} button`, buttonClassName({ size })] as const,
  ),
  [
    'compact danger icon',
    compactButtonVisualClassName({
      variant: 'danger',
      size: 'sm',
      iconOnly: true,
    }),
  ],
  ['row', rowClassName()],
  ['meter track', meterClassNames(0, 100).track],
  ['meter fill', meterClassNames(1, 100).fill],
  ['meter warning fill', meterClassNames(90, 100).fill],
  ['selected row', rowClassName({ selected: true })],
  ['current row', rowClassName({ current: true })],
  ['container row', rowClassName({ interactive: false })],
  ['field', fieldClassName()],
  ['invalid field', fieldClassName({ invalid: true })],
  ['select field', selectClassName()],
  ['text area field', textAreaClassName()],
  ['invalid text area field', textAreaClassName({ invalid: true })],
  ['sidebar view', sidebarViewClassName({ current: false })],
  ['current sidebar view', sidebarViewClassName({ current: true })],
  ['tab', tabClassName({ selected: false })],
  ['open tab', tabClassName({ selected: true })],
  ['field inside a row', inlineFieldClassName()],
  ['key cap', kbdClassName()],
  ['badge', badgeClassName()],
  ['avatar', avatarClassName()],
  [
    'calendar day',
    calendarDayClassName({ selected: false, today: false, inMonth: true }),
  ],
  [
    'selected calendar day',
    calendarDayClassName({ selected: true, today: false, inMonth: true }),
  ],
  [
    'calendar today',
    calendarDayClassName({ selected: false, today: true, inMonth: true }),
  ],
  [
    'calendar day of another month',
    calendarDayClassName({ selected: false, today: false, inMonth: false }),
  ],
];

/** A filter utility that makes a colour out of another colour. */
const colourFilter =
  /(?:^|:)(?:brightness|saturate|contrast|hue-rotate)-\d+|(?:^|:)(?:grayscale|invert|sepia)(?:-\d+)?$/;

/** A fill utility that takes a share of its colour instead of all of it. */
const fadedFill = /(?:^|:)bg-[a-z-]+\/\d+$/;

await test('no control makes a colour with a filter', () => {
  for (const [name, classes] of recipes) {
    for (const part of classes.split(' '))
      assert.ok(!colourFilter.test(part), `${part} of the ${name}`);
  }
});

await test('a label never sits on a fill that is faded', () => {
  for (const [name, classes] of recipes) {
    for (const part of classes.split(' '))
      assert.ok(!fadedFill.test(part), `${part} of the ${name}`);
  }
});

await test('no recipe names the component edge', () => {
  // Decision 0063 reserves `edge` for a control whose state a person must
  // read with no text: a task box, a checkbox, a radio, a switch track and a
  // drop target. A recipe of this module is none of those.
  for (const [name, classes] of recipes) {
    for (const part of classes.split(' ')) {
      assert.ok(
        !/(?:^|:)(?:border|ring|outline)-edge$/.test(part),
        `${part} of the ${name}`,
      );
    }
  }
});

await test('no recipe draws a ring except the focus ring of a field', () => {
  for (const [name, classes] of recipes) {
    for (const part of classes.split(' ')) {
      if (!part.includes('ring-')) continue;
      assert.ok(
        name.endsWith('field') && part.startsWith('focus-visible:'),
        `${part} of the ${name}`,
      );
    }
  }
});

await test('every recipe takes one radius of the named scale', () => {
  // The avatar is the one exception the design guide names: a circle of an
  // initial, and `rounded-full` is what draws a circle.
  for (const [name, classes] of recipes) {
    const found = classes
      .split(' ')
      .filter((part) => /(?:^|:)rounded(?:-|$)/.test(part));
    assert.equal(found.length, 1, `${name} names ${String(found.length)}`);
    assert.ok(
      (name === 'avatar'
        ? ['rounded-full']
        : ['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl']
      ).includes(found[0] ?? ''),
      `${found[0] ?? ''} of the ${name}`,
    );
  }
});

await test('nothing scales when a person presses it', () => {
  for (const [name, classes] of recipes) {
    for (const part of classes.split(' '))
      assert.ok(!/scale-/.test(part), `${part} of the ${name}`);
  }
});

await test('the focus treatment is one outline of the focus colour', () => {
  assert.equal(
    focusOutline,
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
  );
  assert.equal(
    focusOutlineInset,
    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
  );
  for (const variant of variants)
    assert.ok(buttonClassName({ variant }).includes(focusOutline), variant);
});

await test('no recipe answers focus with the pointer prefix', () => {
  // `focus:` fires for a pointer press as well, so it leaves a ring on a
  // control a person already clicked. `focus-visible:` is the treatment.
  for (const [name, classes] of recipes) {
    for (const part of classes.split(' ')) {
      assert.ok(
        !/(?:^|\s)focus:/.test(part),
        `${part} of the ${name} uses focus: instead of focus-visible:`,
      );
    }
  }
});

await test('a quiet button takes the danger tone from the recipe', () => {
  const ghost = buttonClassName({ variant: 'ghost', tone: 'danger' });
  assert.ok(ghost.includes('text-danger hover:bg-danger-surface'));
  assert.ok(!ghost.includes('text-strong'));
  const secondary = buttonClassName({ variant: 'secondary', tone: 'danger' });
  assert.ok(secondary.includes('text-danger'));
  assert.ok(!secondary.includes('text-strong'));
  // The filled variants carry their own label colour and ignore the tone.
  assert.equal(
    buttonClassName({ variant: 'primary', tone: 'danger' }),
    buttonClassName({ variant: 'primary' }),
  );
});

await test('every button variant states its own fill and label', () => {
  assert.ok(
    buttonClassName({ variant: 'primary' }).includes(
      'bg-accent-fill text-on-accent hover:bg-accent-fill-hover',
    ),
  );
  assert.ok(
    buttonClassName({ variant: 'secondary' }).includes(
      'border border-edge-line bg-card text-strong shadow-raised hover:bg-hover',
    ),
  );
  assert.ok(
    buttonClassName({ variant: 'ghost' }).includes(
      'bg-transparent text-strong hover:bg-hover',
    ),
  );
  assert.ok(
    buttonClassName({ variant: 'danger' }).includes(
      'bg-danger-fill text-on-danger hover:bg-danger-fill-hover',
    ),
  );
});

await test('a filled button states the hover fill of its own fill', () => {
  const primary = buttonClassName({ variant: 'primary' });
  assert.ok(primary.includes('bg-accent-fill '), 'the primary resting fill');
  assert.ok(
    primary.includes('hover:bg-accent-fill-hover'),
    'the primary hover fill',
  );
  const danger = buttonClassName({ variant: 'danger' });
  assert.ok(danger.includes('bg-danger-fill '), 'the danger resting fill');
  assert.ok(
    danger.includes('hover:bg-danger-fill-hover'),
    'the danger hover fill',
  );
});

await test('only the secondary button carries an edge', () => {
  for (const variant of variants) {
    const classes = buttonClassName({ variant });
    assert.equal(
      classes.split(' ').includes('border'),
      variant === 'secondary',
      variant,
    );
  }
});

await test('a disabled button reads as unavailable and not as the action', () => {
  // The defect this covers: a disabled primary button took half of its ink
  // fill, so the Save button of Settings was a grey filled button that read
  // as the action of the screen.
  for (const variant of variants) {
    const parts = buttonClassName({ variant }).split(' ');
    const surface = disabledButtonSurface[variant];
    assert.ok(!parts.some((part) => part.includes('opacity')), variant);
    assert.ok(parts.includes('disabled:text-muted'), variant);
    assert.ok(parts.includes(`disabled:${surface}`), variant);
    // The hover of a disabled button keeps the same surface.
    assert.ok(parts.includes(`disabled:hover:${surface}`), variant);
    assert.ok(parts.includes('disabled:cursor-not-allowed'), variant);
  }
  assert.equal(disabledButtonSurface.primary, 'bg-hover');
  assert.equal(disabledButtonSurface.danger, 'bg-hover');
  // A compact button carries the state on its group.
  const visual = compactButtonVisualClassName({
    variant: 'primary',
    iconOnly: true,
  }).split(' ');
  assert.ok(visual.includes('group-disabled:bg-hover'));
  assert.ok(visual.includes('group-disabled:group-hover:bg-hover'));
  assert.ok(visual.includes('group-disabled:text-muted'));
});

await test('a disabled row reads as unavailable with no opacity', () => {
  for (const options of [{}, { selected: true }, { danger: true }]) {
    const parts = rowClassName(options).split(' ');
    assert.ok(!parts.some((part) => part.includes('opacity')));
    assert.ok(parts.includes('disabled:text-muted'));
    assert.ok(parts.includes('disabled:cursor-not-allowed'));
  }
  // A row with a hover keeps its resting fill and the muted text under the
  // pointer.
  for (const options of [{}, { danger: true }]) {
    const parts = rowClassName(options).split(' ');
    assert.ok(parts.includes('disabled:hover:bg-transparent'));
    assert.ok(parts.includes('disabled:hover:text-muted'));
  }
  // A container row is never a control, so it states no disabled state.
  assert.ok(!rowClassName({ interactive: false }).includes('disabled:'));
});

await test('the label of a disabled button reads on every palette', () => {
  // The muted text on each surface a disabled button rests on. A transparent
  // ghost button takes the plane under it, which the theme rules already hold.
  const tokenOf = {
    'bg-hover': 'surfaceHover',
    'bg-card': 'surfaceCard',
  } as const;
  for (const theme of themes)
    for (const variant of variants) {
      const surface = disabledButtonSurface[variant];
      if (surface === 'bg-transparent') continue;
      const fill = theme.tokens[tokenOf[surface]];
      assert.ok(
        contrastRatio(theme.tokens.textMuted, fill) >= textContrastMinimum,
        `${theme.id} ${variant}`,
      );
    }
});

await test('a button names one appearance and one size', () => {
  const seen = new Set<string>();
  for (const variant of variants) {
    const classes = buttonClassName({ variant });
    assert.ok(!seen.has(classes), `${variant} repeats another appearance`);
    seen.add(classes);
  }
  assert.equal(buttonClassName(), buttonClassName({ variant: 'primary' }));
  assert.ok(buttonClassName({ className: 'mt-2' }).endsWith('mt-2'));
});

await test('text buttons share one spacing role while inline actions are compact', () => {
  for (const size of ['sm', 'md'] as const) {
    assert.ok(buttonClassName({ size }).split(' ').includes('ui-button'));
    assert.ok(!buttonClassName({ size }).split(' ').includes('ui-compact'));
  }
  assert.ok(
    buttonClassName({ size: 'inline' }).split(' ').includes('ui-compact'),
  );
  assert.equal(spacingSpec.fine.button, 32);
  assert.equal(spacingSpec.coarse.button, 44);
  assert.equal(spacingSpec.fine.compact, 28);
});

await test('a compact icon keeps its touch target and reduces its visible surface', () => {
  const button = buttonClassName({
    variant: 'danger',
    size: 'sm',
    iconOnly: true,
    compact: true,
  });
  const visual = compactButtonVisualClassName({
    variant: 'danger',
    size: 'sm',
    iconOnly: true,
  });

  assert.ok(button.includes('ui-icon-button'), 'the square target role');
  assert.ok(
    button.includes('ui-icon-button'),
    'the icon role removes text padding',
  );
  assert.ok(!button.includes('px-2.5'), 'the text inset does not squeeze it');
  assert.ok(button.includes('group'), 'the visual state owner');
  assert.ok(
    button.includes('focus-visible:outline-none'),
    'the outer target has no second outline',
  );
  assert.ok(!button.includes('bg-danger-fill'), 'the outer target has no fill');
  assert.ok(visual.includes('size-8'), 'the visible touch surface');
  assert.ok(visual.includes('md:size-7'), 'the small desktop surface');
  assert.ok(visual.includes('bg-danger-fill'), 'the confirmation fill');
  assert.ok(
    visual.includes('group-focus-visible:outline-focus'),
    'the visible focus surface',
  );
});

await test('a compact text button has a quiet surface inside its touch target', () => {
  const button = buttonClassName({
    variant: 'secondary',
    size: 'sm',
    compact: true,
  });
  const visual = compactButtonVisualClassName({
    variant: 'secondary',
    size: 'sm',
    iconOnly: false,
  });

  assert.ok(button.includes('ui-compact'), 'the compact target role');
  assert.ok(button.includes('ui-button'), 'the shared target padding');
  assert.ok(button.includes('group'), 'the visual state owner');
  assert.ok(!button.includes('bg-card'), 'the outer target has no fill');
  assert.ok(visual.includes('min-h-8'), 'the visible touch surface');
  assert.ok(visual.includes('md:min-h-7'), 'the small desktop surface');
  assert.ok(visual.includes('px-2'), 'the visible text inset');
  assert.ok(visual.includes('bg-card'), 'the secondary surface fill');
});

await test('a row is 28 px on a desktop and 44 px under touch', () => {
  const parts = rowClassName().split(' ');
  assert.ok(parts.includes('ui-tree-row'), 'the shared tree row role');
  assert.equal(spacingSpec.fine.tree, 28);
  assert.equal(spacingSpec.coarse.tree, 44);
  assert.ok(parts.includes('rounded-md'), 'the row radius');
  assert.ok(parts.includes('px-2'), 'the row inset');
});

await test('a row offsets its outline inward unless it is told not to', () => {
  assert.ok(rowClassName().includes(focusOutlineInset), 'the default row');
  assert.ok(
    !rowClassName().includes('focus-visible:outline-offset-2'),
    'the default row takes no outward offset',
  );
  assert.ok(
    rowClassName({ inset: false }).includes(focusOutline),
    'a row that stands on its own',
  );
});

await test('a marked row states one mark for a choice and for a route', () => {
  const selected = rowClassName({ selected: true });
  const current = rowClassName({ current: true });
  assert.equal(selected, current);
  assert.ok(selected.includes('bg-active text-strong text-label'));
  // A marked row has nothing left to say on hover, so it states no hover.
  assert.ok(!selected.includes('hover:'), 'a marked row repeats its own mark');
  assert.ok(rowClassName().includes('hover:bg-hover hover:text-strong'));
});

await test('a row that only holds actions promises none of its own', () => {
  const container = rowClassName({ interactive: false });
  assert.ok(!container.includes('cursor-pointer'), 'the pointer');
  assert.ok(!container.includes('hover:'), 'the hover fill');
  assert.ok(!container.includes('focus-visible:'), 'the focus outline');
  assert.ok(container.includes('ui-tree-row'), 'the shared size of a row');
});

await test('a field rests on the divider and answers focus on it', () => {
  const field = fieldClassName();
  assert.ok(field.includes('border-edge-line'), 'the resting edge');
  assert.ok(field.includes('focus-visible:border-focus'), 'the active edge');
  assert.ok(field.includes('focus-visible:ring-2'), 'the focus ring');
  assert.ok(field.includes('focus-visible:ring-focus/25'), 'the ring strength');
  assert.ok(field.includes('bg-app'), 'the field fill');
  assert.ok(field.includes('ui-field'), 'the shared field geometry');
  assert.equal(spacingSpec.fine.field, 32);
  assert.equal(spacingSpec.coarse.field, 44);
});

await test('every field sets its text at 16 px under touch', () => {
  // The defect this covers: Safari on iOS zoomed the page into every field
  // of the product on a tap, because the text of each field was under
  // 16 px, and the zoom hid what the person had on the screen.
  for (const [name, classes] of [
    ['field', fieldClassName()],
    ['invalid field', fieldClassName({ invalid: true })],
    ['select', selectClassName()],
    ['text area', textAreaClassName()],
    ['bare field', bareFieldClassName()],
  ] as const) {
    const parts = classes.split(' ');
    assert.ok(parts.includes(touchFieldText), `${name} under touch`);
  }
  assert.equal(touchFieldText, 'pointer-coarse:text-base');
});

await test('a bare field is a field with no box of its own', () => {
  const parts = bareFieldClassName().split(' ');
  for (const part of ['border-0', 'bg-transparent', 'outline-none'])
    assert.ok(parts.includes(part), part);
  assert.ok(parts.includes('text-body'), 'the body step of the chrome');
  assert.ok(!parts.some((part) => part.startsWith('rounded')), 'no radius');
});

await test('a text area is a field of several lines in the code face', () => {
  const area = textAreaClassName();
  for (const part of [
    'border-edge-line',
    'focus-visible:border-focus',
    'focus-visible:ring-2',
    'bg-app',
    'rounded-md',
  ])
    assert.ok(area.includes(part), part);
  assert.ok(area.includes('font-mono'), 'the code face');
  assert.ok(area.includes('min-h-64'), 'the height of a document');
  assert.ok(!area.includes('md:min-h-8'), 'no height of one line');
  assert.ok(textAreaClassName({ invalid: true }).includes('border-danger'));
});

await test('an invalid field states the error on its edge alone', () => {
  const invalid = fieldClassName({ invalid: true });
  assert.ok(invalid.includes('border-danger'), 'the error edge');
  assert.ok(!invalid.includes('border-edge-line'), 'the resting edge is gone');
  assert.ok(!invalid.includes('bg-danger'), 'an error is not a fill');
});

await test('a key cap is the quietest step in the code face', () => {
  const cap = kbdClassName();
  assert.ok(cap.includes('text-small'), 'the keyboard step');
  assert.ok(cap.includes('font-mono'), 'the code face');
  assert.ok(cap.includes('border-edge-line'), 'the resting edge');
  assert.ok(cap.includes('rounded-sm'), 'the smallest radius');
});

await test('a badge sits on a surface the contrast test holds', () => {
  assert.ok(badgeClassName().includes('bg-hover'));
  assert.ok(badgeClassName().includes('text-muted'));
});

await test('a label reaches a button that has no text', () => {
  const name = buttonName({ label: 'Close navigation', hasText: false });
  assert.equal(name.ariaLabel, 'Close navigation');
  assert.equal(name.title, 'Close navigation');
});

await test('a label reaches a button that also has text', () => {
  // The row actions of Trash and of the attention screen each show one word
  // and act on one note, so the label is the only thing that tells two rows
  // apart. Dropping it gave every row of the list the same name.
  const name = buttonName({ label: 'Restore Shopping list', hasText: true });
  assert.equal(name.ariaLabel, 'Restore Shopping list');
});

await test('a button with text carries no tooltip of its own', () => {
  const name = buttonName({ label: 'Restore Shopping list', hasText: true });
  assert.equal(name.title, undefined);
});

await test('an explicit title wins over the label', () => {
  const name = buttonName({
    label: 'Restore Shopping list',
    title: 'Restore this note',
    hasText: true,
  });
  assert.equal(name.title, 'Restore this note');
});

await test('a button with no label names itself by its text alone', () => {
  const name = buttonName({ hasText: true });
  assert.equal(name.ariaLabel, undefined);
  assert.equal(name.title, undefined);
});

await test('a row that destroys something reads in the danger tone', () => {
  // The defect this covers: a caller appended `text-danger` to this recipe,
  // and the stylesheet puts `text-danger` before `text-ink`, so the recipe
  // won and every Delete row of the product read like every other row. The
  // tone is part of the recipe now, and it replaces the colour instead of
  // competing with it.
  const danger = rowClassName({ danger: true }).split(' ');
  assert.ok(danger.includes('text-danger'), 'the danger tone');
  assert.ok(!danger.includes('text-ink'), 'one colour for one row');
  assert.ok(!danger.includes('text-strong'), 'the tone survives the hover');
  assert.ok(!danger.includes('hover:text-strong'), 'the tone survives a hover');
  // A marked danger row keeps its fill and its weight.
  const marked = rowClassName({ danger: true, current: true }).split(' ');
  assert.ok(marked.includes('bg-active'), 'the mark of the open route');
  assert.ok(marked.includes('text-label'), 'the weight of a marked row');
  assert.ok(marked.includes('text-danger'), 'the tone of the row');
});

await test('a row with no tone reads in the ink and marks in the strong text', () => {
  const quiet = rowClassName().split(' ');
  assert.ok(quiet.includes('text-strong'), 'the resting colour');
  assert.ok(quiet.includes('hover:text-strong'), 'the hover colour');
  const marked = rowClassName({ selected: true }).split(' ');
  assert.ok(marked.includes('text-strong'), 'the colour of a marked row');
  assert.ok(marked.includes('bg-active'), 'the fill of a marked row');
});

/*
 * The pull of a control at the edge of a frame.
 *
 * The defect these cover: the header drew its drawer toggle 30 px from the
 * edge of a phone screen while the title of the page below it stood at 16 px,
 * because a compact control centres its 16 px mark in a 44 px touch box. The
 * arithmetic below is the rule, and the strings of the recipe answer to it.
 */

/** The width in pixels of one step of the spacing scale. */
const spacingStep = 4;

/** The box of a small compact control, under touch and from the medium width. */
const smallControlBox = { touch: 44, wide: 28 } as const;

/** The width in pixels of each mark that a control at a frame edge draws. */
const markWidth = { icon: defaultIconSize, avatar: 24 } as const;

/** Every side of a frame that a control sits on. */
const edges: readonly FrameEdge[] = ['start', 'end'];

/** Every mark that a control at a frame edge draws. */
const marks: readonly EdgeMark[] = ['icon', 'avatar'];

/** The utility that pulls a control by one distance, on one side. */
function pullUtility(edge: FrameEdge, pixels: number, wide: boolean): string {
  const side = edge === 'start' ? 'ms' : 'me';
  const steps = pixels / spacingStep;
  return `${wide ? 'pointer-fine:' : ''}-${side}-${String(steps)}`;
}

for (const edge of edges)
  for (const mark of marks)
    await test(`the ${mark} at the ${edge} edge lands on the gutter line`, () => {
      const touch = (smallControlBox.touch - markWidth[mark]) / 2;
      const wide = (smallControlBox.wide - markWidth[mark]) / 2;
      assert.equal(
        edgeControlClassName({ edge, mark }),
        `${pullUtility(edge, touch, false)} ${pullUtility(edge, wide, true)}`,
      );
    });

await test('the pull answers the box of the control it corrects', () => {
  // Check the check: the pull is half of the difference between the box and
  // the mark, so a change to either size has to reach the recipe. These two
  // assertions fail when it does not.
  const box = buttonClassName({
    variant: 'ghost',
    size: 'sm',
    iconOnly: true,
    compact: true,
  }).split(' ');
  assert.ok(box.includes('ui-icon-button'));
  assert.equal(spacingSpec.coarse.compact, smallControlBox.touch);
  assert.equal(spacingSpec.fine.compact, smallControlBox.wide);
  assert.ok(
    avatarClassName()
      .split(' ')
      .includes(`size-${String(markWidth.avatar / spacingStep)}`),
    'the width of the avatar',
  );
});

await test('a strip of controls that scrolls takes the pull of its edges', () => {
  // The focus outline is two pixels drawn two pixels out from the surface.
  const outline = 4;
  // Under touch the surface of a small compact control is 32 px inside its
  // 44 px box, so the box holds the outline and the strip adds nothing.
  const touchSurface = 32;
  assert.ok(
    compactButtonVisualClassName({
      variant: 'ghost',
      size: 'sm',
      iconOnly: true,
    })
      .split(' ')
      .includes(`size-${String(touchSurface / spacingStep)}`),
    'the touch surface of a small compact control',
  );
  assert.ok((smallControlBox.touch - touchSurface) / 2 >= outline);
  const touchPull = (smallControlBox.touch - markWidth.icon) / 2;
  // From the medium width the surface is the box, so the strip pads the
  // outline and grows by it as well, which keeps the mark on the line.
  const widePull = (smallControlBox.wide - markWidth.icon) / 2 + outline;
  const strip = controlStripClassName().split(' ');
  assert.ok(strip.includes(`-mx-${String(touchPull / spacingStep)}`));
  assert.ok(
    strip.includes(`pointer-fine:-mx-${String(widePull / spacingStep)}`),
  );
  assert.ok(strip.includes(`pointer-fine:px-${String(outline / spacingStep)}`));
  assert.ok(strip.includes(`py-${String(outline / spacingStep)}`));
  assert.ok(strip.includes('overflow-x-auto'));
  // The two pulls are the ones of a control at the edge of a frame.
  assert.equal(
    edgeControlClassName({ edge: 'start', mark: 'icon' }),
    `-ms-${String(touchPull / spacingStep)} pointer-fine:-ms-${String((widePull - outline) / spacingStep)}`,
  );
});

await test('a day of the calendar keeps one size in every state', () => {
  const states = [true, false].flatMap((selected) =>
    [true, false].flatMap((today) =>
      [true, false].map((inMonth) =>
        calendarDayClassName({ selected, today, inMonth }).split(' '),
      ),
    ),
  );
  for (const parts of states) {
    // The width of its cell, the touch height, the row height of a desktop,
    // and one edge width, so a day that becomes today or selected moves no
    // neighbour.
    assert.ok(parts.includes('w-full'));
    assert.ok(parts.includes('ui-calendar-day'));
    assert.equal(spacingSpec.fine.compact, 28);
    assert.ok(parts.includes('border'));
    assert.ok(parts.includes('rounded-md'));
    // One colour utility for one element.
    assert.equal(
      parts.filter((part) => /^text-(?:ink|strong|muted)$/.test(part)).length,
      1,
    );
  }
});

await test('today takes the resting edge and a selected day the chosen fill', () => {
  const today = calendarDayClassName({
    selected: false,
    today: true,
    inMonth: true,
  }).split(' ');
  assert.ok(today.includes('border-edge-line'));
  assert.ok(!today.includes('bg-active'));
  const selected = calendarDayClassName({
    selected: true,
    today: false,
    inMonth: true,
  }).split(' ');
  assert.ok(selected.includes('bg-active'));
  assert.ok(selected.includes('border-transparent'));
  // No state paints the accent, which carries a link and a focus ring only.
  for (const [, classes] of recipes)
    assert.ok(
      !classes
        .split(' ')
        .some((part) => /(?:^|:)(?:bg|text)-accent$/.test(part)),
    );
  const outside = calendarDayClassName({
    selected: false,
    today: false,
    inMonth: false,
  }).split(' ');
  assert.ok(outside.includes('text-muted'));
});

await test('the mark of a day with a note is a muted dot that takes no pointer', () => {
  const parts = calendarNoteMarkClassName().split(' ');
  assert.ok(parts.includes('rounded-full'));
  assert.ok(parts.includes('bg-muted'));
  assert.ok(parts.includes('pointer-events-none'));
});

await test('a select is a field with the native appearance removed', () => {
  const select = selectClassName();
  for (const part of fieldClassName().split(' '))
    assert.ok(select.includes(part), `the field class ${part}`);
  assert.ok(select.includes('appearance-none'), 'no native shape');
  assert.ok(select.includes('ui-select'), 'the shared chevron inset');
  assert.equal(spacingSpec.selectRight, 36);
});

await test('the view that shows takes the mark of a current row', () => {
  assert.ok(sidebarViewClassName({ current: true }).includes('bg-active'));
  assert.ok(!sidebarViewClassName({ current: false }).includes('bg-active'));
  for (const current of [true, false]) {
    const view = sidebarViewClassName({ current });
    assert.ok(view.includes(focusOutline), 'the one focus treatment');
    assert.ok(view.includes('ui-icon-button'), 'the shared icon target');
  }
});

await test('the open tab takes the fill of a chosen row and the others rest', () => {
  // Record 0166: a tab is a chip, so the open view is one fill and no line.
  const open = tabClassName({ selected: true });
  const rest = tabClassName({ selected: false });
  assert.ok(open.includes('bg-active'));
  assert.ok(open.includes('text-strong'));
  assert.ok(!rest.includes('bg-active'));
  assert.ok(rest.includes('hover:bg-hover'));
  for (const tab of [open, rest]) {
    assert.ok(tab.includes('ui-button'));
    assert.ok(tab.includes('ui-compact'));
    assert.ok(tab.includes('rounded-md'));
    assert.ok(!tab.includes('border-b'));
  }
});

await test('a field inside a row keeps the shared field geometry', () => {
  // An edited tree row grows to fit the same field as every form.
  const field = inlineFieldClassName();
  assert.ok(field.split(' ').includes('ui-field'));
  assert.ok(field.includes('border-edge-line'));
  assert.ok(field.includes('focus-visible:border-focus'));
  assert.ok(field.includes(touchFieldText));
});

await test('a task box takes the component edge, a task radius and the page fill', () => {
  // Record 0063: a task box is one of the five controls with the component
  // edge, and the published page reads this recipe for its box.
  const box = taskBoxClassName().split(' ');
  assert.ok(box.includes('border-edge'));
  assert.ok(box.includes('rounded-sm'));
  assert.ok(box.includes('bg-app'));
  assert.ok(box.includes('size-4'));
});

await test('a checkbox draws its box from the theme and its mark from its state', () => {
  // The find panel of the editor builds its own DOM and reads this recipe,
  // so its options are the checkboxes of every other screen (issue 247).
  const classes = checkboxClassNames();
  const box = classes.box.split(' ');
  assert.ok(box.includes('appearance-none'));
  assert.ok(box.includes('border-edge'));
  assert.ok(box.includes('rounded-sm'));
  assert.ok(classes.box.includes(focusOutline));
  assert.ok(classes.mark.split(' ').includes('peer-checked:block'));
  assert.ok(classes.label.includes('text-body'));
  assert.ok(
    checkboxClassNames({ disabled: true }).label.includes('text-muted'),
  );
});

await test('a menu is a raised card with the menu radius and the overlay step', () => {
  const surface = menuSurfaceClassName().split(' ');
  for (const part of [
    'rounded-lg',
    'border-edge-subtle',
    'bg-card',
    'shadow-overlay',
  ])
    assert.ok(surface.includes(part), part);
  assert.ok(!surface.includes('border-edge'));
});

await test('the style of a menu that no class reaches is the style of its classes', () => {
  // Review of issue 247: the completion list of the editor wrote the values
  // of the menu surface by hand.
  const surface = menuSurfaceClassName().split(' ');
  for (const part of menuSurfaceValues) {
    for (const name of part.classes.split(' '))
      assert.ok(surface.includes(name), name);
    assert.equal(menuSurfaceStyle[part.property], part.value);
  }
  assert.deepEqual(Object.keys(menuSurfaceStyle).sort(), [
    'backgroundColor',
    'border',
    'borderRadius',
    'boxShadow',
    'padding',
  ]);
});

await test('history controls draw the surface of every other format tool', async () => {
  const {
    compactButtonVisualClassName,
    historyButtonClassName,
    historyButtonVisualClassName,
  } = await import('./control-classes.ts');
  const tool = compactButtonVisualClassName({
    variant: 'ghost',
    size: 'sm',
    iconOnly: true,
  }).split(' ');
  const on = historyButtonVisualClassName(false).split(' ');
  // The same surface size, focus ring and colours as a small ghost tool, so
  // the 16 px glyph sits at the same size, colour and height in the row.
  for (const token of [
    'size-8',
    'md:size-7',
    'items-center',
    'justify-center',
    'rounded-md',
    'bg-transparent',
    'text-strong',
    'group-hover:bg-hover',
    'group-focus-visible:outline-2',
    'group-focus-visible:outline-offset-2',
    'group-focus-visible:outline-focus',
  ]) {
    assert.ok(tool.includes(token), `${token} left the format tool`);
    assert.ok(on.includes(token), `${token} is missing on a history tool`);
  }
  // The disabled colour of a format tool, without an opacity on top.
  assert.ok(tool.includes('group-disabled:text-muted'));
  assert.ok(
    historyButtonVisualClassName(true).split(' ').includes('text-muted'),
  );
  // The surface carries the look, and the target only carries the group.
  assert.ok(historyButtonClassName().split(' ').includes('group'));
  for (const colour of ['text-strong', 'text-muted'])
    assert.ok(!historyButtonClassName().includes(colour));
});

await test('history controls take the tool size of every format tool', async () => {
  const { buttonClassName, historyButtonClassName } =
    await import('./control-classes.ts');
  // The format row draws each tool as a small, compact, icon-only ghost
  // button: 44 px under touch and 28 px on a desktop. Undo and Redo take the
  // same target, so the row keeps one width and one gap.
  const tool = buttonClassName({
    variant: 'ghost',
    size: 'sm',
    iconOnly: true,
    compact: true,
  }).split(' ');
  const history = historyButtonClassName().split(' ');
  for (const token of ['ui-button', 'ui-icon-button', 'group'])
    assert.ok(tool.includes(token), `${token} left the format tool`);
  for (const token of tool)
    assert.ok(history.includes(token), `${token} is missing on a history tool`);
});

await test('history controls retain their size and focus when unavailable', async () => {
  const {
    historyButtonClassName,
    historyButtonName,
    historyButtonVisualClassName,
  } = await import('./control-classes.ts');
  const off = historyButtonClassName();
  assert.ok(off.split(' ').includes('ui-icon-button'));
  assert.ok(off.split(' ').includes('aria-disabled:cursor-not-allowed'));
  assert.ok(!off.includes('opacity'));
  assert.ok(!off.includes('hover:'));
  const offSurface = historyButtonVisualClassName(true);
  assert.ok(offSurface.includes('text-muted'));
  assert.ok(offSurface.includes('group-focus-visible:outline-2'));
  assert.ok(!offSurface.includes('opacity'));
  assert.ok(!offSurface.includes('hover:'));
  assert.deepEqual(historyButtonName('undo', false), {
    label: 'Undo',
    tooltip: 'Undo (Ctrl+Z)',
  });
  assert.deepEqual(historyButtonName('redo', true), {
    label: 'Redo',
    tooltip: 'Redo (Cmd+Shift+Z)',
  });
});

await test('the touch button recipe uses the shared icon target on each pointer', () => {
  const classes = buttonClassName({ size: 'touch', iconOnly: true });
  assert.ok(classes.split(' ').includes('ui-icon-button'));
  assert.equal(spacingSpec.coarse.compact, 44);
  assert.ok(!/md:size-[78]/.test(classes));
  assert.ok(!/md:min-h-[78]/.test(buttonClassName({ size: 'touch' })));
});

await test('Settings switches share the content edge in both states', () => {
  for (const checked of [false, true]) {
    const row = switchClassNames(checked).row.split(' ');
    assert.ok(row.includes('px-0'));
    assert.ok(!row.includes('px-2'));
    assert.ok(row.includes('w-full'));
  }
  assert.ok(
    rowClassName().split(' ').includes('px-2'),
    'other rows keep their inset',
  );
});
