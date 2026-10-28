/** Settings uses an action view; other pages keep their standalone dialog. */
import {
  lazy,
  Suspense,
  useContext,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { Dialog } from '@notesapp/ui';
import { SettingsActionContext } from './settings-action-context.ts';
const SettingsAction = lazy(() => import('./settings-action.tsx'));

/** Loads the in-panel action only when Settings needs it. */
export function SettingsDialog(
  props: ComponentProps<typeof Dialog>,
): ReactNode {
  const context = useContext(SettingsActionContext);
  if (context === null) return <Dialog {...props} />;
  if (!props.open) return null;
  return (
    <Suspense fallback={null}>
      <SettingsAction {...props} context={context} />
    </Suspense>
  );
}
