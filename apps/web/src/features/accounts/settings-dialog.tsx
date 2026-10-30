/** Settings uses an action view; other pages keep their standalone dialog. */
import {
  lazy,
  Suspense,
  useContext,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { Dialog } from '@notesapp/ui';
import { usePhoneSettings } from './settings-section.tsx';
import { SettingsActionContext } from './settings-action-context.ts';
const SettingsAction = lazy(() => import('./settings-action.tsx'));

/** Loads the in-panel action only when Settings needs it. */
export function SettingsDialog({
  hideScope,
  level = false,
  ...props
}: ComponentProps<typeof Dialog> & {
  readonly hideScope?: boolean;
  readonly level?: boolean;
}): ReactNode {
  const context = useContext(SettingsActionContext);
  const phone = usePhoneSettings();
  if (context === null || (!phone && !level && !props.headerActions))
    return <Dialog {...props} />;
  if (!props.open) return null;
  return (
    <Suspense fallback={null}>
      <SettingsAction
        {...props}
        hideScope={hideScope === true}
        context={context}
      />
    </Suspense>
  );
}
