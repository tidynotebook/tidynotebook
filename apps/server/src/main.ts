/**
 * Production server entry point.
 *
 * It starts the Fastify server on the configured socket with validated
 * configuration, and it gives the stop signals to the drain. The steps of the
 * start and of the stop live in `lifecycle.ts`, which owns no signal and no
 * exit, so a test drives them.
 */
import process from 'node:process';
import { createApp } from './app.ts';
import {
  ConfigError,
  loadLegalTexts,
  loadObjectStoreSettings,
  loadProtectedEnvironment,
  loadServerConfig,
} from './config.ts';
import type { DrainEvent, StartEvent } from './lifecycle.ts';
import {
  createDrain,
  createServiceLifecycle,
  startListener,
} from './lifecycle.ts';

/**
 * Writes one step of the stop where the operator reads it.
 *
 * A failed stop also sets the exit code, so the process states the same result
 * that the message states. No message carries a failure object, because the
 * operator can act on the step alone.
 */
function reportStop(event: DrainEvent): void {
  switch (event.step) {
    case 'started':
      process.stdout.write(
        `notesapp: received ${event.signal}. The server reports that it is not ready. It then completes the open requests and stops.\n`,
      );
      return;
    case 'repeated':
      process.stdout.write(
        `notesapp: received ${event.signal} again. The server is already stopping. Send SIGKILL to end it at once.\n`,
      );
      return;
    case 'stopped':
      process.stdout.write('notesapp: the server stopped.\n');
      return;
    case 'failed':
      process.exitCode = 1;
      process.stderr.write('notesapp: the server did not stop cleanly.\n');
      return;
    case 'forced':
      process.stderr.write(
        'notesapp: a request did not complete inside the stop deadline. The server ends now.\n',
      );
      return;
  }
}

/**
 * Writes the result of the start where the operator reads it.
 *
 * The listening line names the socket and the public origin, because the two
 * are different addresses and an operator behind a proxy reads both. A start
 * that fails names the two values that decide the socket, which is what the
 * operator can act on.
 */
function reportStart(
  event: StartEvent,
  listen: { readonly host: string; readonly port: number },
  origin: string,
): void {
  if (event.step === 'listening') {
    process.stdout.write(
      `notesapp: listening on ${listen.host}:${String(listen.port)} (origin: ${origin})\n`,
    );
    return;
  }
  process.stderr.write(
    'notesapp: the server cannot use the configured listening address. Check NOTESAPP_HOST and NOTESAPP_PORT, and check that no other process holds that port.\n',
  );
}

/** Starts the HTTP server and gives the stop signals to the drain. */
export async function main(): Promise<void> {
  let config;
  let legalTexts;
  let objectStore;
  try {
    config = loadServerConfig(await loadProtectedEnvironment(process.env));
    // The legal documents are part of the configuration: a file that cannot
    // be read, or a template with a blank left, stops the start here.
    legalTexts = await loadLegalTexts(config);
    // So is the key pair of an S3 store (record 0192).
    objectStore = await loadObjectStoreSettings(config);
  } catch (error) {
    // A configuration error already states one line for each value it
    // refused, in the words of this server. Anything else is the message of a
    // library or of the operating system, which names a file, a code, or a
    // stack, and an operator can act on none of those.
    if (error instanceof ConfigError) {
      process.stderr.write(
        `notesapp: configuration error:\n${error.issues.join('\n')}\n`,
      );
    } else {
      process.stderr.write(
        'notesapp: the configuration could not be read. Check that every NOTESAPP_ value is set and that each file a _FILE value names exists and can be read.\n',
      );
    }
    process.exit(1);
  }

  // The readiness answer reads this state, so the state is built before the
  // application and it reaches the handlers through the composition.
  const lifecycle = createServiceLifecycle();

  let app;
  try {
    app = await createApp(config, { lifecycle, legalTexts, objectStore });
  } catch {
    // The failure here is a database that refuses a connection, a storage
    // directory that cannot be written, or a mail transport that will not
    // build. Each one arrives as the message of a driver, which carries a
    // code and sometimes a stack, so the operator reads the one sentence that
    // states where to look instead.
    process.stderr.write(
      'notesapp: the server could not start. Check that the database accepts connections, that NOTESAPP_STORAGE_ROOT exists and can be written, that the object store answers, and that the mail settings are complete.\n',
    );
    process.exit(1);
  }

  // One drain serves every stop signal. The first signal starts it, a later
  // signal joins it, and the deadline is the one escape hatch. Closing the
  // Fastify instance stops the listener, completes the open requests, and then
  // runs the close hooks that end the cleanup timer, the two identity pools,
  // the attachment store, and the content store.
  const drain = createDrain({
    lifecycle,
    close: () => app.close(),
    gracePeriodMs: config.shutdown.gracePeriodMs,
    deadlineMs: config.shutdown.deadlineMs,
    report: reportStop,
    forceExit: (code) => process.exit(code),
  });

  process.on('SIGTERM', () => void drain('SIGTERM'));
  process.on('SIGINT', () => void drain('SIGINT'));

  // A listen that fails closes the pools and the stores that the composition
  // already opened, so the process ends them instead of dropping them.
  await startListener({
    listen: async () => {
      await app.listen(config.listen);
    },
    close: () => app.close(),
    report: (event) => {
      reportStart(event, config.listen, config.origin);
    },
    exit: (code) => process.exit(code),
  });
}

if (import.meta.main) {
  void main();
}
