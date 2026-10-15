# Verification

- Add a regression test for each fixed defect.
- A change of source carries a test of its area (record 0154).
  `tools/check-change-tests.mjs` runs in `pnpm lint` and as the Stop hook of
  `.claude/settings.json`, and it refuses a branch that changes the source of
  a package or a tool and no test of it. When a change cannot have a test,
  state why in a commit trailer: `Test-exempt: <area> <reason>`.
- Prove what a person sees through the pure module that decides it and through
  an integration test of the served result.
- Take a screenshot of each changed screen in light and in dark before a
  landing.
- To run the application of a worktree and drive it in a browser, follow the
  `test-application` skill. Each worktree runs its own application,
  so worktrees do not conflict.
- Run focused tests while work is in progress. Required hosted checks prove
  the change before merge. Local `pnpm verify` is an optional diagnostic.
- Do not weaken assertions, add fixed delays, or skip a failing test to make a
  suite pass.
