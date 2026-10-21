import { classifyUrl } from '@notesapp/markdown';
import { DraftFlushCancelled } from './draft-flush.ts';

export const protocolSaveTimeoutMs = 5000;
export const protocolSaveFailureNotice =
  'The note could not be saved. Keep this tab open and try the link again.';

/** Saves the draft before a protocol handler can leave the current page. */
export async function openExternalLink(
  destination: string,
  flushDraft: () => Promise<void>,
): Promise<'opened' | 'blocked' | 'save-failed' | 'cancelled'> {
  const target = classifyUrl(destination);
  if (target.kind !== 'external') return 'blocked';
  if (target.protocol === 'http:' || target.protocol === 'https:') {
    window.open(target.href, '_blank', 'noopener,noreferrer');
    return 'opened';
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      flushDraft(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Draft save timed out.')),
          protocolSaveTimeoutMs,
        );
      }),
    ]);
  } catch (failure: unknown) {
    return failure instanceof DraftFlushCancelled ? 'cancelled' : 'save-failed';
  } finally {
    clearTimeout(timeout);
  }
  window.location.assign(target.href);
  return 'opened';
}
