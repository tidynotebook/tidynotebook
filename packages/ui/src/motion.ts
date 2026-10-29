/**
 * The motion of the application.
 *
 * Tailwind gives easing a theme namespace and a duration none, so a duration
 * written in a class is a bare number that no rule can hold. This module is
 * the answer, and it takes the form that `pageGutter` in `./layout.tsx`
 * already uses: one name, stated once, read by everything that moves. The
 * easing values live with the other central scales in
 * `apps/web/src/tailwind.css`.
 *
 * Every name carries `motion-safe`, so the preference of the person is held
 * by the scale and never by the caller. `tools/check-design-rules.mjs`
 * refuses a transition, a duration, and an easing utility everywhere else.
 *
 * See
 * [decision 0054](../../../docs/decisions/0054-motion-is-a-named-scale-in-one-module.md).
 */

/**
 * How a surface answers a pointer or the keyboard.
 *
 * A hover fill, a row mark, and a text colour use this. It is short, because
 * a person has already decided by the time it ends.
 */
export const transitionSurface =
  'motion-safe:transition-colors motion-safe:duration-100 motion-safe:ease-quick';

/**
 * How the edge of a field answers focus.
 *
 * A field draws its focus state with a ring as well as a colour, so it needs
 * the shadow property that `transitionSurface` does not carry.
 */
export const transitionField =
  'motion-safe:transition-shadow motion-safe:duration-100 motion-safe:ease-quick';

/**
 * How a panel of the frame slides.
 *
 * The navigation drawer is the one panel of the product. It travels the whole
 * width of itself, so it takes the long step and the settling easing.
 */
export const transitionPanel =
  'motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-soft';

/**
 * How a raised thing arrives.
 *
 * A menu, a dialog, and a toast are put into the document when a person opens
 * them, so the browser gives them their first style from `@starting-style`
 * and fades them in with no state of their own. Nothing moves, because a
 * panel that slides under the pointer moves the target a person is aiming at.
 */
export const transitionRaise =
  'motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-soft motion-safe:starting:opacity-0';

/**
 * How a compact confirmation enters the place of the action that opened it.
 *
 * The controls travel one short step from the right and fade in. The parent
 * keeps their full width before and after the change, so the row does not
 * move while the person chooses.
 */
export const transitionAction =
  'motion-safe:transition motion-safe:duration-150 motion-safe:ease-soft motion-safe:starting:translate-x-2 motion-safe:starting:opacity-0';

/** Direct sheet release motion, with a fade for reduced motion. */
export const phoneSheetMotion = {
  duration: 200,
  fadeDuration: 80,
  easing: 'ease-out',
} as const;
