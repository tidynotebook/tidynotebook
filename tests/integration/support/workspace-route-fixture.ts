import type { Workspace } from '@notesapp/api-client';
export * from '@notesapp/api-client';
type ListResult = {
  readonly data?: { readonly workspaces: readonly Workspace[] };
  readonly error?: unknown;
  readonly response?: { readonly status: number };
};
export const requests: ReturnType<typeof Promise.withResolvers<ListResult>>[] =
  [];
export function listWorkspaces(): Promise<ListResult> {
  const request = Promise.withResolvers<ListResult>();
  requests.push(request);
  return request.promise;
}
