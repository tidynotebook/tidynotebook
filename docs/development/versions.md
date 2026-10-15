# Versions

This document owns the version pins of the runtime, the package manager, the
dependencies and the container image, and the automated bumps that move them.
It records no version number. The manifests hold the versions, and
`tools/check-versions.mjs` fails the gate when a manifest, the installed tree
and the container image disagree.

## Pins

Node and pnpm are pinned in `.node-version`, and in `engines` and
`packageManager` in the root `package.json`. Every dependency is pinned to an
exact version, once, in a manifest or in the `pnpm-workspace.yaml` catalog.

The container runs the Node release that the checks run. Each stage of
`Dockerfile` names the tag of the exact release in `.node-version` and the
digest of that tag, and the `perf:service` script names the same reference.
A floating tag of the major line is refused, because the digest behind it
moves to each new release while `.node-version` stays. `pnpm install` inside
the image does not refuse a different `engines.node`, so no build step would
report the gap. `tools/check-versions.mjs` compares the three and fails the
gate on a difference.

- Check a version against the registry and the release notes before you change
  it. Registry availability does not prove runtime behaviour.
- A prerelease is refused. A release candidate line stays unused while a stable
  line exists.
- `pnpm install` uses exact versions, strict engines, strict peers, no
  automatic peer installation, and explicit `workspace:*` links. There is no
  major version override.
- pnpm refuses an unreviewed build script. `pnpm-workspace.yaml` lists the
  ones that were read and decided.

A version change is one commit over the manifest and the lockfile. The
evidence belongs in that commit body, not here.

## Patches

`patches/` holds a pnpm patch of an upstream package only for a step whose
work grows faster than the note it reads, and `pnpm-workspace.yaml` lists
each one under `patchedDependencies`
([decision 0185](../decisions/0185-a-step-of-the-grammar-that-grows-faster-than-the-note-is-patched.md)).
A patch makes that one step a single pass with the same result, and it is the
upstream fix when there is one. pnpm refuses an install whose patch names no
installed version, so a bump of a patched package fails until a person moves
the patch to the new version or removes it. Remove a patch when a release
that holds the fix passes the release age of the lockfile, and run the tests
of `packages/markdown/test-data/shapes.ts` on the bump.

## Automated bumps

`.github/dependabot.yml` opens the bump changes. It runs once a month (record
0224). It groups each wave into one change per area: the runtime dependencies,
the development and build tools, the GitHub Actions, and the container images
of `Dockerfile` and the Compose files. Each change carries a conventional
commit prefix.

The npm entry sets an increasing versioning strategy, so Dependabot writes a new
exact version into a manifest that already holds one. No range reaches a
manifest, and `tools/check-versions.mjs` accepts the change. Dependabot reaches
a version that a manifest states, and a person bumps a catalog version by hand.
Review a bump like any other change. Run focused tests on the branch, and open
the screens that a bump of the editor or the router can change.

Two pins stay manual, and the configuration says why.

- TypeScript. `tools/check-versions.mjs` names the version of the code
  generator and the version of every other package, so a bump edits that check
  in the same commit.
- The image inside the `perf:service` script of the root `package.json`.
  Dependabot reads a Dockerfile and a Compose file, not a script. Move this
  reference with the base image of `Dockerfile`.

A bump of the Node image is one commit over `Dockerfile`, the `perf:service`
script, `.node-version` and `engines.node`. Dependabot moves the exact tag of
the image and its digest only, so its change fails `tools/check-versions.mjs`
until a person moves the other three and runs the gate on the new release.
