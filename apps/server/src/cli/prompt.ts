/**
 * Secret input for the operator commands.
 *
 * A password never travels in a command argument, because process arguments
 * are visible to every other process on the host and are kept in shell
 * history. It comes from a protected file that the operator names, or from a
 * hidden prompt on a terminal. Nothing here writes the value to standard
 * output or to a log.
 */
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { passwordBounds, passwordProblem } from '@notesapp/core';

/** Where a command may read a secret from. */
export type SecretSource = {
  /** Environment variable that names a file holding the secret. */
  readonly fileVariable: string;
  /** Label of the hidden prompt. */
  readonly label: string;
};

/** The streams that a prompt uses. A test supplies its own. */
export type PromptStreams = {
  readonly input: NodeJS.ReadableStream & { isTTY?: boolean };
  readonly output: NodeJS.WritableStream;
};

/** Reads one line without echoing it. */
export function promptSecret(
  streams: PromptStreams,
  label: string,
): Promise<string> {
  streams.output.write(label);
  // The prompt is written above. The interface writes into a stream that
  // discards everything, so the typed characters never appear on the terminal.
  const hidden = new Writable({
    write(_chunk, _encoding, done): void {
      done();
    },
  });
  const reader = createInterface({
    input: streams.input,
    output: hidden,
    terminal: true,
  });
  return new Promise<string>((resolve) => {
    reader.question('', (answer: string) => {
      reader.close();
      streams.output.write('\n');
      resolve(answer);
    });
  });
}

/**
 * Reads a secret from the named file, or from a hidden prompt.
 *
 * A command that runs without a terminal and without the file fails, so no
 * command ever falls back to an argument or to a default password.
 */
export async function readSecret(
  source: SecretSource,
  environment: Readonly<Record<string, string | undefined>>,
  streams: PromptStreams,
): Promise<string> {
  const file = environment[source.fileVariable];
  if (file !== undefined && file !== '')
    return (await readFile(file, 'utf8')).trim();
  if (streams.input.isTTY !== true)
    throw new Error(
      `notesapp: set ${source.fileVariable} to a protected file, or run this command on a terminal.`,
    );
  return promptSecret(streams, source.label);
}

/** Reads one named argument, for example `--email a@b.c` or `--email=a@b.c`. */
export function readArgument(
  argv: readonly string[],
  name: string,
): string | null {
  const flag = `--${name}`;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? '';
    if (argument === flag) return argv[index + 1] ?? null;
    if (argument.startsWith(`${flag}=`)) return argument.slice(flag.length + 1);
  }
  return null;
}

/**
 * Refuses a new password outside the one policy of `@notesapp/core`, with a
 * message that names the rule (record 0116).
 */
export function assertNewPassword(password: string): void {
  const problem = passwordProblem(password);
  if (problem === 'too_short')
    throw new Error(
      `notesapp: the password must have at least ${String(passwordBounds.minLength)} characters.`,
    );
  if (problem === 'too_long')
    throw new Error(
      `notesapp: the password must have at most ${String(passwordBounds.maxLength)} characters.`,
    );
}
