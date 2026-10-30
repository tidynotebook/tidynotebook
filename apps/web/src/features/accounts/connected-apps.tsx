import {
  Inset,
  Stack,
  RowCopy,
  Button,
  DialogBody,
  DialogFooter,
  ListRow,
  LoadingState,
  Notice,
  focusOutline,
} from '@notesapp/ui';

import { SettingsDialog } from './settings-dialog.tsx';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  listConnectedApps,
  revokeConnectedApp,
  type ConnectedApp,
} from '@notesapp/api-client';

import { problemMessage } from '../../app.tsx';
import {
  connectedAppFacts,
  connectedAppIdentity,
  connectedAppName,
  connectedAppRevokeText,
  connectedAppFocusOrder,
} from '../../lib/connected-apps.ts';
import { problemCode } from '../../lib/problem-text.ts';
import { sectionOf, settingsSections } from '../../lib/page-sections.ts';
import { useNow } from '../../shell/now.ts';
import { usePhoneSettings, SettingsSection } from './settings-section.tsx';

export function ConnectedAppSettings(): ReactNode {
  const phone = usePhoneSettings();
  const [apps, setApps] = useState<readonly ConnectedApp[] | null>(null);
  const [error, setError] = useState('');
  const [load, setLoad] = useState(0);
  const [revoking, setRevoking] = useState<ConnectedApp | null>(null);
  const revokeButtons = useRef(new Map<string, HTMLButtonElement>());
  const content = useRef<HTMLDivElement | null>(null);
  const now = useNow();
  useEffect(() => {
    let cancelled = false;
    setError('');
    void listConnectedApps()
      .then((result) => {
        if (cancelled) return;
        if (result.data === undefined) setError(problemMessage(result.error));
        else setApps(result.data.apps);
      })
      .catch(() => {
        if (!cancelled)
          setError('The connected apps could not be read. Try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [load]);
  return (
    <SettingsSection
      section={sectionOf(settingsSections, 'connected-apps')}
      description="These apps have the access that you allow. Revoke ends an app's access at once."
    >
      <div
        ref={content}
        tabIndex={-1}
        aria-label="Connected apps"
        className={focusOutline}
      >
        {error === '' ? null : <Notice tone="problem" message={error} />}
        {apps === null ? (
          error === '' ? (
            <LoadingState label="Reading connected apps" />
          ) : (
            <Button variant="secondary" onClick={() => setLoad(load + 1)}>
              Try again
            </Button>
          )
        ) : apps.length === 0 ? (
          <Inset
            padY={3}
            padX={{ fine: 0, coarse: 4 }}
            as="p"
            className="text-secondary text-muted"
          >
            No connected apps. Connect an app from its settings.
          </Inset>
        ) : (
          <Stack gap={0} pad={0} as="ul">
            {apps.map((app) => (
              <ListRow
                key={app.grantId}
                className="flex items-center justify-between"
              >
                <RowCopy>
                  <p className="m-0 break-words text-body text-strong">
                    Name claimed by app: {connectedAppName(app)}
                  </p>
                  {phone ? (
                    <p className="ui-settings-meta m-0 text-secondary text-muted">
                      {connectedAppIdentity(app)} ·{' '}
                      {connectedAppFacts(app, now)}
                    </p>
                  ) : (
                    <>
                      <Inset
                        as="p"
                        className="break-words text-secondary text-muted"
                      >
                        {connectedAppIdentity(app)}
                      </Inset>
                      <Inset as="p" className="text-secondary text-muted">
                        {connectedAppFacts(app, now)}
                      </Inset>
                    </>
                  )}
                </RowCopy>
                <Button
                  variant="secondary"
                  tone="danger"
                  label={`Revoke ${connectedAppName(app)}`}
                  buttonRef={(button) => {
                    if (button === null)
                      revokeButtons.current.delete(app.grantId);
                    else revokeButtons.current.set(app.grantId, button);
                  }}
                  onClick={() => setRevoking(app)}
                >
                  Revoke
                </Button>
              </ListRow>
            ))}
          </Stack>
        )}
      </div>
      {revoking === null ? null : (
        <RevokeAppDialog
          app={revoking}
          onClose={() => setRevoking(null)}
          onRevoked={() => {
            setApps((held) =>
              (held ?? []).filter((app) => app.grantId !== revoking.grantId),
            );
            setRevoking(null);
          }}
          returnFocus={() => {
            for (const grantId of connectedAppFocusOrder(
              apps ?? [],
              revoking.grantId,
            )) {
              const button = revokeButtons.current.get(grantId);
              if (button !== undefined) {
                button.focus();
                return;
              }
            }
            content.current?.focus();
          }}
        />
      )}
    </SettingsSection>
  );
}

function RevokeAppDialog({
  app,
  onClose,
  onRevoked,
  returnFocus,
}: {
  readonly app: ConnectedApp;
  readonly onClose: () => void;
  readonly onRevoked: () => void;
  readonly returnFocus: () => void;
}): ReactNode {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  async function submit(): Promise<void> {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await revokeConnectedApp({
        path: { grantId: app.grantId },
      });
      if (
        result.data !== undefined ||
        problemCode(result.error) === 'not_found'
      )
        onRevoked();
      else setError(problemMessage(result.error));
    } catch {
      setError('The app could not be revoked. Try again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <SettingsDialog
      open
      title="Revoke connected app?"
      titleId="revoke-connected-app-title"
      width="small"
      onClose={onClose}
      returnFocus={returnFocus}
    >
      <DialogBody>
        <p className="m-0 text-body text-strong">
          {connectedAppRevokeText(connectedAppName(app))}
        </p>
        {error === '' ? null : <Notice tone="problem" message={error} />}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => {
            void submit();
          }}
        >
          {busy ? 'Revoking access' : 'Revoke access'}
        </Button>
      </DialogFooter>
    </SettingsDialog>
  );
}
