# Toolchain

This document owns the package layout, the compiler policy, and the checks
that `pnpm lint` and `pnpm lint:types` run. It records no version number and no
measured result.

## Versions

The version pins, the container image and the automated bumps are in
[Versions](versions.md).

## Packages

`pnpm-workspace.yaml` names the workspace globs. Each package carries its
`@notesapp/` name, a `package.json`, a `tsconfig.json`, a `src/index.ts`, and
`typecheck`, `build`, and `test:unit` scripts.

A package exposes only `exports["."]`. It publishes no internal path, so a
consumer cannot reach past the public entry and a boundary stays provable.

Each app, each package, and the `tests` tree carries its own `AGENTS.md` with
the context of that directory.

## Compiler settings

`tsconfig.base.json` holds the strict settings that every package inherits.
Each package then has two configurations: `tsconfig.json` for the type check,
which covers the adjacent `*.test.ts` files, and `tsconfig.build.json` for the
declaration emit, which excludes them. A consumer uses `references` to the
build configuration, so it reads emitted declarations and not another
package's sources.

Three settings need a reason before they are changed.

- **`skipLibCheck`.** It stays off. A package turns it on only when a
  third-party declaration does not compile under the strict base, and the
  reason belongs in a comment next to the setting. Application sources are
  still checked in full.
- **`exactOptionalPropertyTypes`.** It stays on everywhere except inside
  `packages/api-client`, whose generated vendor transport does not compile with
  it. `tools/check-exact-optional.test.mjs` fails when a consumer stops
  enforcing it.
- **`lib`.** A browser package that needs a browser type adds the `DOM`
  library rather than turning off `skipLibCheck`.

A handwritten relative import carries an explicit `.ts` extension. Node's type
stripping runs an adjacent test file directly and does not map `./path.js` to
`./path.ts`, so a `.js` specifier fails at run time. The base configuration
accepts the specifier and rewrites it on emit. An emitting package sets an
explicit `rootDir` and excludes `**/*.test.ts` from its build. Generated output
keeps the extension its generator writes.

An error class avoids a TypeScript parameter property for the same reason.

## The checks

`pnpm lint` runs these in order. Each check in this table takes a
`--root <directory>` flag and has a root tool test over a fixture tree.

| Check                          | Proves                                                             |
| ------------------------------ | ------------------------------------------------------------------ |
| `tools/check-versions.mjs`     | The installed runtime matches the pins in the manifests.           |
| `oxlint`                       | The source rules that need no type information, with no warning.   |
| `tools/check-boundaries.mjs`   | The package graph, the browser rule, and the transport rule.       |
| `tools/check-casts.mjs`        | No JavaScript file asserts a type with a JSDoc cast (record 0019). |
| `tools/check-docs.mjs`         | The documentation rules of `docs/README.md`.                       |
| `tools/check-design-rules.mjs` | The styling and user-facing text rules of the interface code.      |

`pnpm lint` reads the sources only, so it passes in a fresh checkout with no
build output. `pnpm lint:types` runs `oxlint --type-aware`, which needs the
emitted declaration of every workspace package, so it runs after `pnpm build`
and `pnpm verify` keeps that order. `tools/check-declarations.mjs` runs first
inside it and names that one cause when the build output is absent.

`tools/check-boundaries.mjs` holds the rules that
[Architecture](architecture.md) states. It parses every source file rather than
matching text, so an import cannot hide behind an alias, a destructuring, or a
computed member access. A module path it cannot resolve statically is refused
rather than ignored.

Two rules need care when you read a failure.

- **Do not name a binding after a transport.** `fetch`, `XMLHttpRequest`,
  `WebSocket`, and `EventSource` are refused in value position, so a variable
  with one of those names fails at its first use. Choose another name. A type
  position and a plain object key are accepted.
- **A declaration package satisfies a type-only import.** `@types/<name>` in
  the manifest declares an `import type` of `<name>`. A value import of the
  same name still needs the runtime package.

Every exemption is an exact file path or an exact generated directory, never a
glob that a later task can widen. An exemption turns off one rule and leaves
the others in force. Add a fixture to the checker's test in the same change
that adds an exemption.

`.oxlintrc.json` also refuses a DOM global and a Node global inside the
packages that both runtimes share. The boundary checker sees imports only, so a
package that loads the `DOM` type library could otherwise reach `document` or
`process` with no import at all.

## Generation

`pnpm generate` rewrites the contract index and the typed client.
`pnpm generated:check` runs the same code into a temporary directory and
compares the bytes, so it needs no Git history. Never edit a file under a
`src/generated/` directory. See [Adding an API operation](api-contract.md).

`tools/sdk-codegen` owns its own TypeScript version, because the generator
reads a compiler API that the root version does not expose. Its package
scripts run that compiler, so the recursive root type check never uses it.
