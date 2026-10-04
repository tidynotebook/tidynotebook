---
name: testing-changes-end-to-end
description: Runs this worktree's own copy of the whole tidy notebook application, server and web client, on its own port with its own database and file store, and drives it in a headless Chromium through Playwright as one or more devices or tabs, with screenshots in light and dark. Several worktrees can do this at the same time without conflict. Use it to see or operate a change in the real application, to reproduce a defect in a browser, to take the light and dark screenshots before a landing, or to act as two devices on one note. It covers how to start, reach, drive and stop the application, not what to check.
---

# Testing changes end to end

The repository holds no browser test (record 0066), so a change reaches a real
browser through this skill. Each worktree runs its own application from its
own build. The only shared service is the test PostgreSQL on port 55432, and
each run makes a database of its own there. Everything a run writes stays in
`.local-app/` of the worktree, which git ignores.

What to check, and what counts as a pass, is the task of the caller.

## The checklist

Copy this into the answer and mark each step when it is done.

```
- [ ] 1. Start the application of this worktree
- [ ] 2. Prepare the browser
- [ ] 3. Write and run a drive script
- [ ] 4. Read what it produced
- [ ] 5. Stop the application
```

### 1. Start the application

Run this from anywhere inside the worktree:

```sh
node .agents/skills/testing-changes-end-to-end/scripts/app.mjs start
```

It builds the worktree, starts the server on a free port, and prints the
`origin`, `email`, `password`, `port`, `pid`, `log`, and the `commit` and
`changedFiles` that it built. A first start takes one to three minutes. When
an application of this worktree already runs, it prints that one with
`"reused": true` and starts nothing.

Add `--object-store s3` to keep the uploads and the imports of the run in a
bucket of its own on the test MinIO service of `compose.test.yaml`, instead
of its file store. `restart` keeps the store of the run.

The application serves the build that `start` made. `app.mjs status` prints
whether it runs, what it built, and under `now` the state of the code today.
When the two differ, run `app.mjs restart` before you drive it again. When a
start fails, read `.local-app/app.log`.

One worktree has one application, and every agent in that worktree shares
it. Its database keeps what earlier drive scripts made until `stop`, so give
what a script makes a name of its own, or restart for an empty workspace.

### 2. Prepare the browser

```sh
node .agents/skills/testing-changes-end-to-end/scripts/browser.mjs
```

It installs Playwright into `.local-app/` and Chromium into the shared
Playwright cache. It returns at once when both are there.

### 3. Write and run a drive script

Write the script in `.local-app/`, so `playwright` resolves, and run it with
`node .local-app/<name>.mjs`. Start from this:

```js
import { chromium } from 'playwright';
import {
  openDevice,
  readApp,
  readNoteText,
  screenshotBoth,
  until,
} from '../.agents/skills/testing-changes-end-to-end/scripts/session.mjs';

const app = await readApp();
const browser = await chromium.launch();
try {
  const device = await openDevice(browser, app);
  await device.page.getByRole('button', { name: 'New note' }).first().click();
  await device.page.locator('.cm-content').click();
  await device.page.keyboard.type('Hello');
  // Ctrl + S makes a version now, so the text goes to the server.
  await device.page.keyboard.press('Control+s');
  await until(
    async () => (await readNoteText(device.page)) === 'Hello',
    'the server to hold the text',
  );
  const url = device.page.url();
  console.log(await screenshotBoth(browser, app, url, '.local-app/note'));
  console.log(device.problems);
} finally {
  await browser.close();
}
```

`scripts/session.mjs` gives these helpers:

| Helper                                       | What it does                                                    |
| -------------------------------------------- | --------------------------------------------------------------- |
| `readApp()`                                  | The application of this worktree, from `.local-app/app.json`    |
| `openDevice(browser, app, { colorScheme })`  | One signed in device: its own context, session and IndexedDB    |
| `openTab(device, url)`                       | One more tab of that device, which shares its session and store |
| `setVisibility(page, 'hidden' \| 'visible')` | A switch away from a tab and back                               |
| `readNoteText(page)`                         | The Markdown that the server holds for the note on that page    |
| `until(check, what)`                         | Waits for a state that no locator reaches                       |
| `screenshotBoth(browser, app, url, file)`    | `<file>-light.png` and `<file>-dark.png` of one address         |

Rules that keep a run true:

- Two devices are two `openDevice` calls. Two tabs of one device are
  `openTab`. Pages of one context share storage, so they are never two
  devices.
- A headless page stays visible for ever. Use `setVisibility` where a person
  would switch away.
- Wait for a state with a locator, or with `until` for a state that is not
  on the screen. A fixed wait stands only for a timer of the application
  itself.
- Typing reaches the server at a version: a pause of a few seconds, Ctrl + S,
  a toggle of a task box, leaving the note, or a hidden tab. The footer text
  `Everything is saved to the server.` states the queue of the workspace, so
  it can show while the last words are still only on the device.
- The editor is CodeMirror. Click `.cm-content`, then use `page.keyboard`.
- The address of each screen is in `apps/web/src/router.tsx`. After
  `openDevice`, `device.page.url()` is the workspace, `/w/<workspace>`.
- Pass `{ ready: '<text>' }` to `screenshotBoth` when a screen fills in after
  its requests end. A color scheme belongs to a device, so a screenshot of a
  tab is in the scheme of its device.
- `device.problems` lists failed requests and page errors. None is expected,
  so read each one. A headless browser refuses persistent storage, so every
  new device shows one quiet notice about offline data until **Close**.

### 4. Read what it produced

Open each screenshot and look at it. Compare it with
`docs/development/design.md` when the change is one a person sees. A drive
script that printed no problem and a screenshot that shows the wrong screen is
a failed run.

### 5. Stop the application

```sh
node .agents/skills/testing-changes-end-to-end/scripts/app.mjs stop
```

It waits while the application removes its database and its file store.

## Next to other worktrees

- Never stop, restart or remove the PostgreSQL container of the Compose
  project `notesapp-test`. Every worktree uses it. Only the
  `cleaning-up-after-a-task` skill removes it, when the owner invokes that
  skill and no worktree is left.
- Cookies ignore the port, so the applications of two worktrees must never
  share one browser context. A context from `openDevice` belongs to one
  application.
- `pnpm test:unit`, `pnpm test:integration -- <area>` and `pnpm verify` can run
  in several worktrees at once. Each integration file makes its own database
  and each test server takes a free port.
- Each worktree reads only its own `.local-app/`. Never read or stop the
  application of another worktree, and stop the application of this one only
  when no other agent of this worktree still drives it.
