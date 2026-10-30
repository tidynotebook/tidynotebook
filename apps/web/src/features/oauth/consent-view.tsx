import {
  Stack,
  Inset,
  Inline,
  Button,
  Notice,
  SelectField,
} from '@notesapp/ui';
/** The consent screen uses client facts as text, never as markup or a link. */
import type { ReactNode } from 'react';

import { AuthFrame } from '../accounts/accounts.tsx';
import {
  oauthAccessChoices,
  type OAuthAccess,
  type OAuthConsentFacts,
} from '../../lib/oauth-consent.ts';

export function OAuthConsentView({
  facts,
  access,
  busy,
  error,
  onAccess,
  onAnswer,
}: {
  readonly facts: OAuthConsentFacts;
  readonly access: OAuthAccess;
  readonly busy: boolean;
  readonly error: string;
  readonly onAccess: (access: OAuthAccess) => void;
  readonly onAnswer: (accept: boolean) => void;
}): ReactNode {
  return (
    <AuthFrame title="Allow access to your notes">
      <Stack gap={4} as="dl" className="text-body">
        <div>
          <dt className="text-body text-strong">The client calls itself</dt>
          <dd className="m-0 break-words text-strong">
            <bdi>{facts.claimedName}</bdi>
          </dd>
        </div>
        <div>
          <dt className="text-body text-strong">Client identity</dt>
          <dd className="m-0 break-words text-strong">
            {facts.clientHost === null ? (
              'Not verified. This client registers itself.'
            ) : (
              <bdi>{facts.clientHost}</bdi>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-body text-strong">Your answer goes to</dt>
          <dd className="m-0 break-words text-strong">
            {facts.redirectHost === null ? (
              'An app on this computer'
            ) : (
              <bdi>{facts.redirectHost}</bdi>
            )}
          </dd>
        </div>
      </Stack>
      {facts.localWarning === null ? null : (
        <Notice message={facts.localWarning} />
      )}
      <Inset as="p" className="text-body text-strong">
        {facts.accessSentence}
      </Inset>
      {facts.writeRequested ? (
        <Inset
          pad={0}
          as="fieldset"
          className="min-w-0 border-0"
          disabled={busy}
        >
          <SelectField
            id="oauth-access"
            label="Access to give"
            value={access}
            options={oauthAccessChoices}
            onChange={(value) => {
              onAccess(value === 'write' ? 'write' : 'read');
            }}
            hint="Read only lets the client read your notes. Read and write also lets it change them and move them to Trash."
          />
        </Inset>
      ) : null}
      {error === '' ? null : <Notice tone="problem" message={error} />}
      <Inline gap={2} wrap as="div">
        <Button
          disabled={busy}
          onClick={() => {
            onAnswer(true);
          }}
        >
          Allow
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            onAnswer(false);
          }}
        >
          Deny
        </Button>
      </Inline>
    </AuthFrame>
  );
}
