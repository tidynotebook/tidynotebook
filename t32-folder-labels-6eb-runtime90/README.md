# Actual local N9 Move dialog evidence

These two captures show the installed local application at source 6ebd98883a2365e3f30244b8d2c28c181d3e9fc9, image sha256:277c3f52642a6e3bd44464418f18cee76c0468ef9a8c964687cbf6165b3dda7a.

- Default Light 1440: selected Current folder, disabled original-target Move.
- Solarized Dark 320: original folder unselected and hovered, enabled destination choice. No Move was pressed for this capture.
- The widths are CSS-width simulations with a fine pointer. These are actual local installed-app captures, not component simulation, production, physical phone or AT speech proof.
- Background navigation and unrelated destinations were hidden with visibility only. Their geometry remains. The target row, its ancestors, colors and layout were not changed. Blank areas are redaction, not product spacing.
- The earlier broad root visibility mask did not hide descendants with explicit visibility. Those private captures are retained privately and are NOT published. The final two images use a full background-subtree mask and were inspected before publication.
- PNG alone does not prove contrast, hover, focus or accessibility. actual-state-summary.json contains 63 measured states across Default Light, Default Dark and Solarized Dark at 1440/390/320. It records actual computed foreground, effective ancestor-composited backgrounds, full-precision contrast, geometry, font and state. All sampled label and row-name values meet unchanged 4.5. Minimum is 4.539204606532101.
- Actual returned AX trees are in the two ax files. These are redacted capture-state trees, not all application states or screen-reader speech.
- Native Home and Enter selected a destination; Escape from the focused row closed the dialog and returned to Note actions in the recorded Solarized Dark desktop case. Escape after a capture with BODY focus did not close a prior dialog; Cancel was used. No full keyboard-matrix claim.
- One owned note was moved through normal UI with POST200 and reload proof. Native Save returned POST200; full reload and read-only History preview showed the saved text. No Restore or pre-existing note/publication edit.
- Necessary theme changes used normal UI; original System and Default choices were restored.
- Original 94 file/path rows, 49 publications and 45 session rows remain. Totals are 95 files, 49 publications and 46 sessions. Own revisions and normal preference/session/usage/sync operational changes are separate. No raw rows or secrets are published.
- Exact image source files: 1948 match. Static image first screen: 315705/315904, 54 scripts. 73 loaded JS/CSS/font paths were read through same-origin HTTP and matched image bytes. Earlier host canonical and component results are separate.
- The original 45-second image attempt remains SKIPPED BY OWNER at 52.617 seconds. The one owner-approved 90-second retry succeeded, exit 0. The package warning monitor does not expose every internal request start; there is no exact deadline-cancellation claim.
- PR581 stays DRAFT for Root review. PR582's separate 90-second retry is reserved and unused. No merge, release or remote deployment.

