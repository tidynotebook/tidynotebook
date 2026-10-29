/** The consent screen uses client facts as text, never as markup or a link. */
import type { ReactNode } from 'react';
import { Button, Notice, SelectField } from '@notesapp/ui';
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
      <dl className="mb-6 mt-0 space-y-4 text-body">
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
      </dl>
      {facts.localWarning === null ? null : (
        <Notice className="mb-5" message={facts.localWarning} />
      )}
      <p className="mb-4 mt-0 text-body text-strong">{facts.accessSentence}</p>
      {facts.writeRequested ? (
        <fieldset className="m-0 min-w-0 border-0 p-0" disabled={busy}>
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
        </fieldset>
      ) : null}
      {error === '' ? null : (
        <Notice className="mb-4" tone="problem" message={error} />
      )}
      <div className="mt-6 flex flex-wrap gap-cluster">
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
      </div>
    </AuthFrame>
  );
}
