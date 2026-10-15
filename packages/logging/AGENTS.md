# packages/logging

## Purpose

This package owns the browser-safe structured log event catalog, record shape,
context binding, and sink port.

## Allowed imports

Nothing. This package has no workspace dependency and no runtime dependency.

## Rules

- Add an event to the catalog before a caller emits it.
- Give each event one fixed level and an allow-listed field shape.
- Do not add free-form messages or secret-shaped fields.
- Keep runtime adapters in the application that owns the transport.

## Key files

| File           | Purpose                          |
| -------------- | -------------------------------- |
| `src/index.ts` | The event catalog and logger API |
