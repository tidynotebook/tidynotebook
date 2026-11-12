# Page layouts

These family rules are documented only. They add no checklist, gate, design
lint or enforcement test. Keep the current type steps and theme tokens.

## Note app pages

- Private workspace list routes use `Page`: one centred `45 rem` column.
  The note editor keeps its own document measure and outline. Keep account themes.
- Use `pageGutter` from `packages/ui/src/layout.tsx` for edge space.
  When the note side region is visible, its outside edge meets the viewport.
  The note stays centred within its remaining frame.

## Public pages

- Installation Terms and Privacy and published notes use
  `publicLayout` from `packages/ui/src/public-layout.ts`. Its `container` is
  centred `max-w-5xl` (`64 rem`). Put its `gutter` outside the cap: `16 px`,
  or `24 px` from `sm`. Long text uses `reading`, `max-w-note` (`40 rem`).
- Keep public headers, footers and type steps.
- Published notes have no app frame. Password and unavailable pages keep
  their narrow centred form. Legal pages use the same server width helper.
- The landing home keeps its feature icons and real product screenshots
  from [record 0217](../decisions/0217-the-landing-home-page-may-use-a-wide-column.md).

## Guide pages

The guide uses the standard docs layout: contents nav at the left edge, a 40 rem article, and the page outline on the right.

## Account pages

Use `AuthFrame` from `apps/web/src/features/accounts/accounts.tsx` for
sign-in, account forms, standalone OAuth consent and status, and application
errors. It centres a `24 rem` card. Workspace page errors keep `Page`.
