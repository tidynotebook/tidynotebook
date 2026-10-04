/**
 * A body that must hold exactly the bytes that its sender stated.
 *
 * Both adapters write a stream whose length a request states. A sender that
 * stops early, or sends more, must leave nothing in the store, so the stream
 * fails before its end instead of ending short.
 */
import { pipeline, Transform, type Readable } from 'node:stream';

/** The body of a write did not hold its stated length. */
export class BodyLengthError extends Error {
  constructor() {
    super('notesapp: the body did not hold its stated length.');
    this.name = 'BodyLengthError';
  }
}

/**
 * The bytes of `body`, which fails unless they are exactly `size` bytes.
 *
 * A failure of `body` reaches the answer, and a failure of the answer stops
 * `body`, so neither side keeps reading for the other.
 */
export function exactLength(body: Readable, size: number): Readable {
  let seen = 0;
  const check = new Transform({
    transform(chunk: Buffer, _encoding, done): void {
      seen += chunk.length;
      if (seen > size) done(new BodyLengthError());
      else done(null, chunk);
    },
    flush(done): void {
      done(seen === size ? null : new BodyLengthError());
    },
  });
  return pipeline(body, check, () => {
    // The failure reaches the reader of `check`, which owns the answer.
  });
}
