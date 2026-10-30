import {
  Form,
  ListRow,
  Inset,
  Stack,
  Inline,
  RowCopy,
  Button,
  DialogBody,
  DialogFooter,
  MetaFacts,
  LoadingState,
  Notice,
  ReadOnlyField,
  SelectField,
  TextField,
} from '@notesapp/ui';

import { SettingsDialog } from './settings-dialog.tsx';
/** Personal API keys are account controls, shared by every API client (0208). */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  type ApiKey,
  type ApiKeyCreated,
} from '@notesapp/api-client';
import { apiKeyNameProblem, maxApiKeys } from '@notesapp/core';

import { problemMessage } from '../../app.tsx';
import { apiKeyExpiryChoices, apiKeyRevokeText } from '../../lib/api-keys.ts';
import { problemCode } from '../../lib/problem-text.ts';
import { sectionOf, settingsSections } from '../../lib/page-sections.ts';
import { useNow } from '../../shell/now.ts';
import { relativeTime } from '../../lib/relative-time.ts';
import { usePhoneSettings, SettingsSection } from './settings-section.tsx';

export function ApiKeySettings(): ReactNode {
  const phone = usePhoneSettings();
  const [keys, setKeys] = useState<readonly ApiKey[] | null>(null);
  const [error, setError] = useState('');
  const [load, setLoad] = useState(0);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<ApiKeyCreated | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const createButton = useRef<HTMLButtonElement | null>(null);
  const firstRevokeButton = useRef<HTMLButtonElement | null>(null);
  const returnFocus = (): void => {
    const target =
      createButton.current?.disabled === false
        ? createButton.current
        : firstRevokeButton.current;
    target?.focus();
  };
  const now = useNow();
  useEffect(() => {
    let cancelled = false;
    setError('');
    void listApiKeys()
      .then((result) => {
        if (cancelled) return;
        if (result.data === undefined) setError(problemMessage(result.error));
        else setKeys(result.data.keys);
      })
      .catch(() => {
        if (!cancelled) setError('The keys could not be read. Try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [load]);
  return (
    <SettingsSection
      section={sectionOf(settingsSections, 'api-keys')}
      description="Let a program read and change your account and notes. Each key has all your current access. Keep it as safe as your password."
    >
      {newKey === null ? null : (
        <CreatedKey
          key={newKey.key.keyId}
          created={newKey}
          onClose={() => {
            setNewKey(null);
            returnFocus();
          }}
        />
      )}
      {error === '' ? null : <Notice tone="problem" message={error} />}
      {keys === null ? (
        error === '' ? (
          <LoadingState label="Reading API keys" />
        ) : (
          <Button variant="secondary" onClick={() => setLoad(load + 1)}>
            Try again
          </Button>
        )
      ) : (
        <>
          {keys.length === 0 ? (
            <Inset
              padY={3}
              padX={{ fine: 0, coarse: 4 }}
              as="p"
              className="text-secondary text-muted"
            >
              No API keys. Create a key for your program.
            </Inset>
          ) : (
            <Stack gap={0} pad={0} as="ul">
              {keys.map((key) => (
                <ListRow
                  key={key.keyId}
                  className="flex items-center justify-between"
                >
                  <RowCopy>
                    <p className="m-0 break-words text-body text-strong">
                      {key.name}
                    </p>
                    <MetaFacts
                      className="ui-settings-meta"
                      facts={[
                        `Created ${relativeTime(key.createdAt, now)}`,
                        key.lastUsedAt === null
                          ? 'Not used yet'
                          : `Last used ${relativeTime(key.lastUsedAt, now)}`,
                      ]}
                    />
                  </RowCopy>
                  <Button
                    variant="secondary"
                    tone="danger"
                    label={`Revoke ${key.name}`}
                    buttonRef={key === keys[0] ? firstRevokeButton : undefined}
                    onClick={() => setRevoking(key)}
                  >
                    Revoke
                  </Button>
                </ListRow>
              ))}
            </Stack>
          )}
          {keys.length >= maxApiKeys ? (
            <Inset
              padY={3}
              padX={{ fine: 0, coarse: 4 }}
              as="p"
              className="text-secondary text-muted"
            >
              Your account has 25 API keys. Revoke a key before you create
              another.
            </Inset>
          ) : null}
          {phone ? (
            <ListRow
              as="button"
              density="setting"

              buttonRef={createButton}
              aria-label="Create API key"
              className="text-left"
              labelTone="accent"
              label="+ Create API key"
              disabled={keys.length >= maxApiKeys}
              onClick={() => setCreating(true)}
            ></ListRow>
          ) : (
            <Button
              variant="secondary"
              buttonRef={createButton}
              disabled={keys.length >= maxApiKeys}
              onClick={() => setCreating(true)}
            >
              Create API key
            </Button>
          )}
        </>
      )}
      {creating ? (
        <CreateKeyDialog
          onClose={() => setCreating(false)}
          returnFocus={returnFocus}
          onCreated={(created) => {
            setKeys((held) => [created.key, ...(held ?? [])]);
            setNewKey(created);
            setCreating(false);
          }}
        />
      ) : null}
      {revoking === null ? null : (
        <RevokeKeyDialog
          apiKey={revoking}
          onClose={() => setRevoking(null)}
          onRevoked={() => {
            setKeys((held) =>
              (held ?? []).filter((key) => key.keyId !== revoking.keyId),
            );
            setRevoking(null);
          }}
          returnFocus={returnFocus}
        />
      )}
    </SettingsSection>
  );
}

function CreateKeyDialog({
  onClose,
  onCreated,
  returnFocus,
}: {
  readonly onClose: () => void;
  readonly onCreated: (created: ApiKeyCreated) => void;
  readonly returnFocus: () => void;
}): ReactNode {
  const [name, setName] = useState('');
  const [days, setDays] = useState('90');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const close = (): void => {
    if (!pending.current) onClose();
  };
  async function submit(): Promise<void> {
    if (pending.current) return;
    const problem = apiKeyNameProblem(name);
    if (problem !== null) {
      setError(problem);
      return;
    }
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await createApiKey({
        body: { name, expiresInDays: Number(days) },
      });
      if (result.data === undefined) setError(problemMessage(result.error));
      else {
        onCreated(result.data);
      }
    } catch {
      setError('The key could not be created. Try again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <SettingsDialog
      open
      title="Create API key"
      titleId="create-api-key-title"
      width="small"
      onClose={close}
      returnFocus={returnFocus}
    >
      <Form
        regions

        className="flex overflow-hidden flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <DialogBody>
          <Inset as="p" className="text-body text-strong">
            This key can read, change, and delete your notes. Use a separate key
            for each program.
          </Inset>
          <TextField
            id="api-key-name"
            label="Program name"
            value={name}
            onChange={(value) => {
              setName(value);
              setError('');
            }}
            required
            autoFocus
            error={error}
          />
          <SelectField
            id="api-key-expiry"
            label="Expires after"
            value={days}
            options={apiKeyExpiryChoices}
            onChange={setDays}
            hint="The program loses access when the key expires."
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating key' : 'Create key'}
          </Button>
        </DialogFooter>
      </Form>
    </SettingsDialog>
  );
}

/** Show the one-time secret in the section after key creation. */
function CreatedKey({
  created,
  onClose,
}: {
  readonly created: ApiKeyCreated;
  readonly onClose: () => void;
}): ReactNode {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(created.token);
      setCopied(true);
      setError('');
    } catch {
      setError('The key could not be copied. Select it and copy it.');
      document.getElementById('api-key-secret')?.focus();
    }
  }

  return (
    <Stack
      aria-label="Copy your API key"
      pad={3}
      gap={3}
      as="section"
      className="rounded-lg border border-edge-subtle"
    >
      <Inset as="h3" className="text-title-header text-strong">
        Copy your API key
      </Inset>
      <Inset id="api-key-secret-help" as="p" className="text-body text-strong">
        Copy this key now. You cannot read it again after you leave this
        section. Store it in a safe place. Do not put it in a web address.
      </Inset>
      <ReadOnlyField
        id="api-key-secret"
        label="API key"
        value={created.token}
        describedBy="api-key-secret-help"
      />
      {error === '' ? null : <Notice tone="problem" message={error} />}
      <Inline gap={2} justify="end" as="div">
        <Button
          variant="secondary"
          onClick={() => {
            void copy();
          }}
        >
          {copied ? 'Copied' : 'Copy key'}
        </Button>
        <Button onClick={onClose}>Done</Button>
      </Inline>
    </Stack>
  );
}

function RevokeKeyDialog({
  apiKey,
  onClose,
  onRevoked,
  returnFocus,
}: {
  readonly apiKey: ApiKey;
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
      const result = await revokeApiKey({ path: { keyId: apiKey.keyId } });
      if (
        result.data !== undefined ||
        problemCode(result.error) === 'not_found'
      )
        onRevoked();
      else setError(problemMessage(result.error));
    } catch {
      setError('The key could not be revoked. Try again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <SettingsDialog
      open
      title="Revoke API key?"
      titleId="revoke-api-key-title"
      width="small"
      onClose={onClose}
      returnFocus={returnFocus}
    >
      <DialogBody>
        <p className="m-0 text-body text-strong">
          {apiKeyRevokeText(apiKey.name)}
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
          {busy ? 'Revoking key' : 'Revoke key'}
        </Button>
      </DialogFooter>
    </SettingsDialog>
  );
}
