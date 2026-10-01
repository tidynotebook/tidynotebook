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
import {
  avatarClassName,
  badgeClassName,
  bareFieldClassName,
  buttonClassName,
  buttonName,
  calendarDayClassName,
  calendarNoteMarkClassName,
  compactButtonVisualClassName,
  controlStripClassName,
  edgeControlClassName,
  fieldClassName,
  focusOutline,
  focusOutlineInset,
  kbdClassName,
  rowClassName,
  selectClassName,
  sidebarViewClassName,
  textAreaClassName,
  touchFieldText,
  type ButtonSize,
  type ButtonVariant,
  type EdgeMark,
  type FrameEdge,
} from './control-classes.ts';
import { defaultIconSize } from './icon-grid.ts';

/** Every button appearance, with the name a failure message reads. */
const variants: readonly ButtonVariant[] = [
  'primary',
  'secondary',
  'ghost',
  'danger',
];

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

await test('a button is 32 px on a desktop and 28 px when it is small', () => {
  const medium = buttonClassName({ size: 'md' }).split(' ');
  assert.ok(medium.includes('min-h-11'), 'the touch minimum');
  assert.ok(medium.includes('md:min-h-8'), 'the desktop control height');
  const small = buttonClassName({ size: 'sm' }).split(' ');
  assert.ok(small.includes('min-h-11'), 'the touch minimum');
  assert.ok(small.includes('md:min-h-7'), 'the small desktop height');
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

  assert.ok(button.includes('size-11'), 'the square touch target');
  assert.ok(button.includes('px-0'), 'the icon has no text inset');
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

  assert.ok(button.includes('min-h-11'), 'the touch target height');
  assert.ok(button.includes('px-0'), 'the outer target has no text inset');
  assert.ok(button.includes('group'), 'the visual state owner');
  assert.ok(!button.includes('bg-card'), 'the outer target has no fill');
  assert.ok(visual.includes('min-h-8'), 'the visible touch surface');
  assert.ok(visual.includes('md:min-h-7'), 'the small desktop surface');
  assert.ok(visual.includes('px-2.5'), 'the visible text inset');
  assert.ok(visual.includes('bg-card'), 'the secondary surface fill');
});

await test('a row is 28 px on a desktop and 44 px under touch', () => {
  const parts = rowClassName().split(' ');
  assert.ok(parts.includes('min-h-11'), 'the touch minimum');
  assert.ok(parts.includes('md:min-h-7'), 'the desktop row height');
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
  assert.ok(selected.includes('bg-active text-strong font-medium'));
  // A marked row has nothing left to say on hover, so it states no hover.
  assert.ok(!selected.includes('hover:'), 'a marked row repeats its own mark');
  assert.ok(rowClassName().includes('hover:bg-hover hover:text-strong'));
});

await test('a row that only holds actions promises none of its own', () => {
  const container = rowClassName({ interactive: false });
  assert.ok(!container.includes('cursor-pointer'), 'the pointer');
  assert.ok(!container.includes('hover:'), 'the hover fill');
  assert.ok(!container.includes('focus-visible:'), 'the focus outline');
  assert.ok(container.includes('min-h-11'), 'the size of a row');
});

await test('a field rests on the divider and answers focus on it', () => {
  const field = fieldClassName();
  assert.ok(field.includes('border-edge-line'), 'the resting edge');
  assert.ok(field.includes('focus-visible:border-focus'), 'the active edge');
  assert.ok(field.includes('focus-visible:ring-2'), 'the focus ring');
  assert.ok(field.includes('focus-visible:ring-focus/25'), 'the ring strength');
  assert.ok(field.includes('bg-app'), 'the field fill');
  assert.ok(field.includes('min-h-11'), 'the touch minimum');
  assert.ok(field.includes('md:min-h-8'), 'the desktop field height');
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
  assert.ok(parts.includes('text-ui'), 'the body step of the chrome');
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
  assert.ok(cap.includes('text-kbd'), 'the keyboard step');
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
  assert.ok(marked.includes('font-medium'), 'the weight of a marked row');
  assert.ok(marked.includes('text-danger'), 'the tone of the row');
});

await test('a row with no tone reads in the ink and marks in the strong text', () => {
  const quiet = rowClassName().split(' ');
  assert.ok(quiet.includes('text-ink'), 'the resting colour');
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
  return `${wide ? 'md:' : ''}-${side}-${String(steps)}`;
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
  assert.ok(
    box.includes(`size-${String(smallControlBox.touch / spacingStep)}`),
    'the touch box of a small compact control',
  );
  assert.ok(
    box.includes(`md:size-${String(smallControlBox.wide / spacingStep)}`),
    'the wide box of a small compact control',
  );
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
  assert.ok(strip.includes(`md:-mx-${String(widePull / spacingStep)}`));
  assert.ok(strip.includes(`md:px-${String(outline / spacingStep)}`));
  assert.ok(strip.includes(`py-${String(outline / spacingStep)}`));
  assert.ok(strip.includes('overflow-x-auto'));
  // The two pulls are the ones of a control at the edge of a frame.
  assert.equal(
    edgeControlClassName({ edge: 'start', mark: 'icon' }),
    `-ms-${String(touchPull / spacingStep)} md:-ms-${String((widePull - outline) / spacingStep)}`,
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
    assert.ok(parts.includes('h-8'));
    assert.ok(parts.includes('md:h-7'));
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
  assert.ok(select.includes('pr-9'), 'room for the chevron');
});

await test('the view that shows takes the mark of a current row', () => {
  assert.ok(sidebarViewClassName({ current: true }).includes('bg-active'));
  assert.ok(!sidebarViewClassName({ current: false }).includes('bg-active'));
  for (const current of [true, false]) {
    const view = sidebarViewClassName({ current });
    assert.ok(view.includes(focusOutline), 'the one focus treatment');
    assert.ok(view.includes('size-11'), 'the touch target');
  }
});
