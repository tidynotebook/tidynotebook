/** Removes the retired tip dismissal keys. Storage refusal must not stop startup. */
export function removeRetiredWritingTips(): void {
  try {
    const storage = window.localStorage;
    for (const key of Object.keys(storage)) {
      if (key.startsWith('notesapp.writing-tips:')) storage.removeItem(key);
    }
  } catch {
    // Local storage can be unavailable in private browser modes.
  }
}
