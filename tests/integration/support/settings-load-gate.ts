/** The test controls when the real Settings module becomes available. */
let finish: () => void = () => {};
export const settingsLoadReady = new Promise<void>((resolve) => {
  finish = resolve;
});
export function finishSettingsLoad(): void {
  finish();
}
