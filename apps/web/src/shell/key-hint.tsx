import { Inline, kbdClassName } from '@notesapp/ui';

/**
 * The one key hint of the application.
 *
 * Every place that shows a key uses this piece, so the platform decision is
 * made one time in `modifier-key.ts` and no screen repeats it.
 *
 * One key is one cap, and a combination is one cap for each key, because that
 * is how the keys sit on the keyboard in front of the person. `kbd` is the
 * native element for a key, and the HTML rule for a key combination is a
 * `kbd` inside a `kbd`, so the hint is one `kbd` that holds one `kbd` for
 * each cap.
 *
 * A sign such as the Command mark is a picture, and a screen reader says
 * nothing useful about it. So a cap whose sign is not its name hides the sign
 * from the accessibility tree and puts the full key name beside it, where a
 * screen reader reads it as text. A cap whose sign is its own name, such as
 * `S`, shows the one text and nothing hidden, so the reader hears the key
 * once.
 */
import { Fragment, type ReactNode } from 'react';

import { keyHintParts, type KeyCap } from './modifier-key.ts';

/** One key cap of a hint. */
function KeyCapHint({ cap }: { readonly cap: KeyCap }): ReactNode {
  if (cap.sign === cap.name)
    return <kbd className={kbdClassName()}>{cap.name}</kbd>;
  return (
    <kbd className={kbdClassName()}>
      <span aria-hidden="true">{cap.sign}</span>
      <span className="sr-only">{cap.name}</span>
    </kbd>
  );
}

/** One key line, with the caps of this device. */
export function KeyHint({ keys }: { readonly keys: string }): ReactNode {
  return (
    <Inline gap={1} as="kbd" className="inline-flex items-center">
      {keyHintParts(keys).map((part, index) => (
        <Fragment key={`${String(index)}:${part.kind}`}>
          {part.kind === 'or' ? (
            <span className="text-small text-muted">or</span>
          ) : (
            <KeyCapHint cap={part.cap} />
          )}
        </Fragment>
      ))}
    </Inline>
  );
}
