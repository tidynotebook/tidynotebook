---
name: prove-change
description: Reads required hosted proof for the current PR head. Use after a change or a failed check. It does not merge, release or deploy.
---

# Prove change

Run focused tests while you work. Push the branch through the normal PR path.
Read the current head and every selected job in `.github/workflows/ci.yml`.
The final Check must pass; failed, cancelled and missing work is not proof.
Fix failures and push a new commit. Local `pnpm verify` is optional.

For a changed screen, use [test-application](../test-application/SKILL.md).
Drive its actual paths and read light and dark screenshots. A pure test and a
served result test prove the rule. Record the hosted run and the screen evidence
in the PR. No local proof receipt is needed (record 0228).
