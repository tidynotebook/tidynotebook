# tidy notebook

A notes application with a TypeScript server and web client.
Use the code as the source of truth. Select other files as the task needs.
Keep this file short. Add context only when it prevents a repeated mistake.
Skills are optional Markdown instructions for repeated tasks. They contain no scripts.

## Work

- Agree on the solution with the owner before implementation.
- Work on a short-lived branch in a git worktree. Do not edit the main checkout.
- Use conventional commits. Never force push or push directly to main.
- Commit the change, then test it in a fresh local Docker deployment.
- Keep only one local core application deployment active. Local data is disposable.
- Check the changed behavior in a browser. Inspect light and dark screenshots of changed screens.
- Run `pnpm verify` once at the end. It includes lint, builds, unit tests, and integration tests.
- Fix a failed check and run that check again. Do not skip failures or weaken assertions.
- Push, open a PR, and review your own diff. Include test results and relevant screenshots.
- CI runs only `pnpm lint`. Ask the owner to merge when lint and self-review pass.
- After merge, remove the task worktree and branch, and all local core Docker containers, volumes, images, networks, and build cache. Leave no deployment running.
- Keep the main checkout, other active work, and the `pr-screenshots` branch.
- A source change does not permit a release or remote deployment. Release is currently unavailable.

## Code

- `apps/server` owns HTTP handlers. `apps/web` owns the client. `apps/docs` owns the documentation site.
- `packages/core` owns domain rules. It imports no transport, database, browser, or React code.
- The other packages own storage, sync, the editor, Markdown, UI, and the API contract and client.
- `tests/integration` uses real services. Unit tests sit beside the code.
- Use unit and integration tests where useful. There is no required test for each changed file or defect.
- Change the API contract before its consumers. Run `pnpm generate`. Never edit generated files.
- Use generated API operations in feature code. Validate at domain boundaries.
- Keep one CodeMirror instance for an open working copy. Browser drafts are recovery data. Only checkpoints create server versions.
- Do not use type assertions. `as const` is allowed.
- Keep Tailwind utilities, shared controls, and central theme tokens. Keep keyboard focus visible and controls accessible.
- Name compatibility effects when you change an operator interface, configuration, stored data, or image command.

## Commands

- Install: `pnpm install --frozen-lockfile`.
- Local Docker: `docker compose --env-file .local-app/compose.env -p notesapp-local -f docker-compose.yml -f compose.local.yaml up --build -d --wait`.
- The optional `test-application` skill gives the disposable Docker setup commands.
- Check everything locally: `pnpm verify`.
- Format changed files: `pnpm exec prettier --write <files>`.

## Text

- Use simple English, short sentences, and sentence case. Use ASD-STE100 for user-facing text.
- Do not use em dash or en dash characters.
- State the result first. Keep reports brief.
- Show useful names and actions in the product, not internal identifiers or engine errors.
- Keep documentation focused on intent. Do not repeat code or process instructions.
- Do not use a bare numbered hash in a PR body or comment unless it names a real issue or PR.
