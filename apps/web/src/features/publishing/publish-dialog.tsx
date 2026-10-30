import {
  Stack,
  Inset,
  Button,
  CopyIcon,
  Dialog,
  DialogBody,
  DialogFooter,
  Notice,
  ReadOnlyField,
  SelectField,
  TextField,
} from '@notesapp/ui';
/**
 * The dialog that publishes one note or one folder.
 *
 * The dialog has two states and one purpose. The first state states what the
 * link opens, takes the optional expiry and the optional password, and sends
 * the create. The second state shows the link one time.
 *
 * Every rule of both states lives in `publishing.ts`, which has its own unit
 * test. This file holds the state of the dialog, its markup, and the one
 * generated operation that it calls.
 *
 * The one time link is the hardest moment of the feature, so the dialog
 * protects it. The server keeps a digest of the token and can never show it
 * again, as decision 0030 states. A person who closes this dialog without the
 * link therefore has to revoke the link and publish again, so the dialog says
 * that before it closes and asks once. Escape still closes, as every dialog
 * of this application does: the first press raises the question and the second
 * press answers it, which is the ordinary shape of a guard over unsaved work.
 *
 * A browser that serves this page over plain HTTP has no clipboard, which a
 * deployment on a local network commonly is. The dialog says so and leaves the
 * link in a field that a person selects with the keyboard, so the feature
 * works without a clipboard. The field takes focus with the whole value
 * selected as soon as the link appears, because the control that the person
 * pressed has just left the screen, and a keyboard then starts at the one
 * value that this moment exists to hand over.
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPublishedLink } from '@notesapp/api-client';
import type { PublicationScope } from '@notesapp/core';

import { copyText } from '../../platform.ts';
import { problemCode, problemStatus } from '../../lib/problem-text.ts';
import { optionalPasswordProblem } from '../../lib/password-policy.ts';
import {
  expiryChoices,
  expiryInstant,
  folderScopeSentences,
  linkPasswordRule,
  noteScopeSentence,
  notesInScope,
  parseExpiryChoice,
  publishedLinkAddress,
  publishFailureSentence,
  type ExpiryChoice,
} from './publishing.ts';

/** The words of the one time link, in one place. */
const copyNow = 'Copy this link now. You see it one time.';
const loseItBack =
  'This link is not shown again. If you lose it, revoke it and publish again.';
const notCopied =
  'You did not copy this link. It is gone after you close this dialog.';
const noClipboard =
  'Copying is not available here. Select the link and copy it with your keyboard.';

/** Publishes one note or one folder and shows the new link one time. */
export function PublishDialog({
  open,
  onClose,
  workspaceId,
  scope,
  notes,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly workspaceId: string;
  /** The one note, or the one folder, that the link opens. */
  readonly scope: PublicationScope;
  /** The notes of the workspace, which state the reach of a folder link. */
  readonly notes: readonly { readonly fileId: string; readonly path: string }[];
}): ReactNode {
  const fieldId = useId();
  const titleId = `${fieldId}-title`;
  const scopeId = `${fieldId}-scope`;
  const [expiry, setExpiry] = useState<ExpiryChoice>('never');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState('');
  const [copied, setCopied] = useState(false);
  const [clipboardMissing, setClipboardMissing] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!open) return;
    setExpiry('never');
    setPassword('');
    setPasswordError('');
    setFailure('');
    setBusy(false);
    setAddress('');
    setCopied(false);
    setClipboardMissing(false);
    setAsking(false);
  }, [open]);

  const folder = scope.kind === 'folder';
  const title = folder ? 'Publish this folder' : 'Publish this note';
  const sentences = folder
    ? folderScopeSentences(notesInScope(scope, notes))
    : [noteScopeSentence];

  /** Asks once before the one time link leaves the screen. */
  const requestClose = (): void => {
    if (address !== '' && !copied && !asking) {
      setAsking(true);
      return;
    }
    onClose();
  };

  const copy = (): void => {
    void copyText(address).then((done) => {
      setCopied(done);
      setClipboardMissing(!done);
      if (done) setAsking(false);
    });
  };

  const publish = (): void => {
    if (busy) return;
    const problem = optionalPasswordProblem(password);
    setPasswordError(problem ?? '');
    if (problem !== null) return;
    setBusy(true);
    setFailure('');
    const expiresAt = expiryInstant(expiry, Date.now());
    void (async (): Promise<void> => {
      const result = await createPublishedLink({
        path: { workspaceId },
        body: {
          scope,
          ...(password === '' ? {} : { password }),
          ...(expiresAt === null ? {} : { expiresAt }),
        },
      });
      setBusy(false);
      if (result.error !== undefined || result.data === undefined) {
        setFailure(
          publishFailureSentence(
            problemCode(result.error),
            problemStatus(result.error),
          ),
        );
        return;
      }
      setAddress(
        publishedLinkAddress(window.location.origin, result.data.token),
      );
    })();
  };

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      title={title}
      titleId={titleId}
      width="small"
      describedBy={scopeId}
    >
      {address === '' ? (
        <>
          <DialogBody>
            <Stack gap={3} as="div" id={scopeId}>
              {sentences.map((sentence) => (
                <p className="m-0 text-secondary text-muted" key={sentence}>
                  {sentence}
                </p>
              ))}
            </Stack>
            <Stack gap={3} as="div">
              <SelectField
                id={`${fieldId}-expiry`}
                label="Expiry"
                value={expiry}
                options={expiryChoices}
                onChange={(value) => setExpiry(parseExpiryChoice(value))}
              />
              <TextField
                id={`${fieldId}-password`}
                label="Password"
                value={password}
                inputType="password"
                autoComplete="new-password"
                hint={linkPasswordRule}
                error={passwordError === '' ? undefined : passwordError}
                onChange={(value) => {
                  setPassword(value);
                  setPasswordError('');
                }}
              />
            </Stack>
            {failure === '' ? null : (
              <Notice tone="problem" message={failure} />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={requestClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={publish}
            >
              {busy ? 'Publishing' : 'Publish'}
            </Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <DialogBody>
            <p className="m-0 text-body text-strong" id={scopeId}>
              {copyNow}
            </p>
            <Inset as="div">
              <ReadOnlyField
                id={`${fieldId}-address`}
                label="Link"
                value={address}
                takeFocus
                describedBy={`${fieldId}-warning`}
              />
            </Inset>
            <Inset
              as="p"
              className="text-secondary text-muted"
              id={`${fieldId}-warning`}
            >
              {loseItBack}
            </Inset>
            {clipboardMissing ? (
              <Inset as="p" className="text-secondary text-muted" role="status">
                {noClipboard}
              </Inset>
            ) : null}
            {asking ? <Notice tone="problem" message={notCopied} /> : null}
          </DialogBody>
          <DialogFooter>
            {/*
              The pair is fixed. Copy link is the second action of this state
              and Done is the one that confirms it, whether or not the dialog
              has asked its question, so a variant never moves under a person
              who is reaching for a control. Only the word of the confirming
              action changes, and the notice above states why.
            */}
            <Button
              variant="secondary"
              size="sm"
              icon={<CopyIcon />}
              onClick={copy}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button variant="primary" size="sm" onClick={requestClose}>
              {asking ? 'Close anyway' : 'Done'}
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}
