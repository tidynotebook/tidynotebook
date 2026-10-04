/**
 * An import of one archive through the three generated operations of the
 * import in parts (record 0192), as the browser sends it.
 *
 * It answers like one generated call: the answer of the step that failed, or
 * the answer of the completion.
 */
import {
  completeWorkspaceImport,
  sendWorkspaceImportPart,
  startWorkspaceImport,
} from '@notesapp/api-client';
import { importPartRanges } from '@notesapp/core';

/** What the import of one archive answered. */
export type ImportAnswer = {
  readonly data:
    Awaited<ReturnType<typeof completeWorkspaceImport>>['data'] | undefined;
  readonly error: unknown;
  readonly response: Response | undefined;
};

/** Where each step of an import goes, for a test of several servers. */
export type ImportRoute = {
  /** The base URL of the server that takes this step. */
  readonly start?: string;
  readonly part?: (partNumber: number) => string;
  readonly complete?: string;
};

/** Starts an import, sends every part of `file`, and completes it. */
export async function importArchive(options: {
  readonly headers: Record<string, string>;
  readonly path: { readonly workspaceId: string };
  readonly body: { readonly file: Blob };
  readonly route?: ImportRoute;
}): Promise<ImportAnswer> {
  const { headers, body, route } = options;
  const { workspaceId } = options.path;
  const started = await startWorkspaceImport({
    headers,
    path: { workspaceId },
    body: { size: body.file.size },
    ...(route?.start === undefined ? {} : { baseUrl: route.start }),
  });
  if (started.data === undefined)
    return {
      data: undefined,
      error: started.error,
      response: started.response,
    };
  const { importId, partBytes } = started.data;
  for (const part of importPartRanges(body.file.size, partBytes)) {
    const base = route?.part?.(part.partNumber);
    const sent = await sendWorkspaceImportPart({
      headers,
      path: { workspaceId, importId, partNumber: part.partNumber },
      body: body.file.slice(part.start, part.end),
      ...(base === undefined ? {} : { baseUrl: base }),
    });
    if (sent.error !== undefined)
      return { data: undefined, error: sent.error, response: sent.response };
  }
  const completed = await completeWorkspaceImport({
    headers,
    path: { workspaceId, importId },
    ...(route?.complete === undefined ? {} : { baseUrl: route.complete }),
  });
  return {
    data: completed.data,
    error: completed.error,
    response: completed.response,
  };
}
