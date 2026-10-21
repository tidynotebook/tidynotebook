/** The draft changed while its earlier snapshot was being saved. */
export class DraftFlushCancelled extends Error {}

/** Saves one draft only while its note and edit sequence stay current. */
export async function flushUnchangedDraft(
  readIdentity: () => string | null,
  flush: () => Promise<void>,
): Promise<void> {
  const identity = readIdentity();
  if (identity === null) throw new DraftFlushCancelled();
  await flush();
  if (readIdentity() !== identity) throw new DraftFlushCancelled();
}
