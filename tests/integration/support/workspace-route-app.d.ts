/** Test-only bindings added by the module load hook. No product export changes. */
import type { Context, ReactNode } from 'react';
import type {
  SessionStatus,
  WorkspaceValue,
} from '../../../apps/web/dist/app.js';
export declare function useWorkspaceLoader(
  status: SessionStatus,
  accountId: string | null,
  generation: number,
): Omit<WorkspaceValue, 'reload'>;
export declare const WorkspaceContext: Context<WorkspaceValue>;
export declare function SessionScope(props: {
  readonly accountKey: string;
  readonly children: ReactNode;
}): ReactNode;
