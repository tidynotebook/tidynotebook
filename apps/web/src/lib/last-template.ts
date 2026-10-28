/** The last template actually used on this device, scoped to the account and workspace. */
export function lastTemplateKey(
  accountId: string,
  workspaceId: string,
): string {
  return `last-template:${accountId}:${workspaceId}`;
}

/** A removed or moved template falls back to the first available choice. */
export function firstTemplate(
  choices: readonly { readonly id: string }[],
  last: string | null,
): string | null {
  return (
    choices.find((choice) => choice.id === last)?.id ?? choices[0]?.id ?? null
  );
}
