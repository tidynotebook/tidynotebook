/**
 * The mail server and the legal documents of the installation, as two
 * sections of the accounts page (record 0148).
 *
 * An administrator sets each one here, with no file and no restart. A group
 * that the server environment sets is locked, so its section states that and
 * offers no change. The mail section sends a test message to the address of
 * the administrator, and the legal section starts each document from the
 * template of the server and shows every blank of it as a field.
 *
 * Every word and every rule lives in `lib/installation-settings.ts` with its
 * unit test, and every server call is a generated operation.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  getLegalDocumentSettings,
  removeLegalDocument,
  removeMailSettings,
  sendTestMessage,
  updateLegalDocument,
  updateMailSettings,
  type LegalDocumentSummary,
  type LegalSettings,
  type MailSecurity,
  type MailSettings,
} from '@notesapp/api-client';
import { fillBlanks } from '@notesapp/core';
import {
  Button,
  buttonClassName,
  Dialog,
  DialogBody,
  DialogFooter,
  ExternalLinkIcon,
  FileTextIcon,
  ListRow,
  LoadingState,
  Notice,
  pageListClassName,
  SelectField,
  TextAreaField,
  TextField,
} from '@notesapp/ui';
import { problemMessage } from '../../app.tsx';
import { problemCode } from '../../lib/problem-text.ts';
import {
  blankFields,
  blanksOf,
  defaultMailPort,
  legalDocumentFact,
  legalDocumentRows,
  mailFacts,
  mailFailureReasonOf,
  mailFailureText,
  mailPortOf,
  mailSecurityOf,
  mailSecurityOptions,
  portAfterSecurity,
  textToSave,
  unfinishedText,
  type LegalDocumentRowName,
} from '../../lib/installation-settings.ts';

/** What a section reports to the page. */
type SectionCallbacks = {
  /** Whether another change of the page runs now. */
  readonly busy: boolean;
  /** States the outcome of a change, then reads the page again. */
  readonly onChanged: (notice: string) => void;
  /** States a failure of a change. */
  readonly onFailed: (message: string) => void;
};

/** The body of the mail section. */
export function MailSettingsBody({
  mail,
  busy,
  onChanged,
  onFailed,
}: SectionCallbacks & { readonly mail: MailSettings }): ReactNode {
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState(false);
  const facts = mailFacts(mail);
  const locked = mail.source === 'environment';

  const test = (): void => {
    if (working) return;
    setWorking(true);
    void sendTestMessage().then((result) => {
      setWorking(false);
      if (result.data !== undefined) {
        onChanged(
          `A test message went to ${result.data.to}. Check that it arrived in the inbox and not in spam.`,
        );
        return;
      }
      onFailed(
        problemCode(result.error) === 'mail_failed'
          ? mailFailureText(mailFailureReasonOf(result.error))
          : problemMessage(result.error),
      );
    });
  };

  const remove = (): void => {
    if (working) return;
    setWorking(true);
    void removeMailSettings().then((result) => {
      setWorking(false);
      if (result.error !== undefined) {
        onFailed(problemMessage(result.error));
        return;
      }
      onChanged(
        'The mail server is removed. An invitation shows its link once again.',
      );
    });
  };

  return (
    <>
      {facts.length === 0 ? null : (
        <p className="m-0 mb-3 flex flex-wrap gap-cluster text-control text-muted">
          {facts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </p>
      )}
      <div className="flex flex-wrap gap-cluster">
        {locked ? null : (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || working}
            onClick={() => {
              setEditing(true);
            }}
          >
            {mail.source === 'none' ? 'Set up mail' : 'Change'}
          </Button>
        )}
        {mail.source === 'none' ? null : (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || working}
            onClick={test}
          >
            {working ? 'Sending' : 'Send a test message'}
          </Button>
        )}
        {mail.source === 'application' ? (
          <Button
            variant="secondary"
            tone="danger"
            size="sm"
            disabled={busy || working}
            onClick={remove}
          >
            Remove
          </Button>
        ) : null}
      </div>
      {editing ? (
        <MailDialog
          mail={mail}
          onClose={() => {
            setEditing(false);
          }}
          onSaved={() => {
            setEditing(false);
            onChanged(
              'The mail server is saved. Send a test message to check it.',
            );
          }}
        />
      ) : null}
    </>
  );
}

/** The dialog that sets the mail server. */
function MailDialog({
  mail,
  onClose,
  onSaved,
}: {
  readonly mail: MailSettings;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactNode {
  const startSecurity: MailSecurity = mail.security ?? 'starttls';
  const [host, setHost] = useState(mail.host ?? '');
  const [security, setSecurity] = useState<MailSecurity>(startSecurity);
  const [port, setPort] = useState(
    String(mail.port ?? defaultMailPort[startSecurity]),
  );
  const [username, setUsername] = useState(mail.username ?? '');
  const [password, setPassword] = useState('');
  const [sender, setSender] = useState(mail.sender ?? '');
  const [portError, setPortError] = useState('');
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const keepsPassword = mail.passwordStored && username.trim() !== '';

  const submit = (): void => {
    if (busy) return;
    const portNumber = mailPortOf(port);
    if (portNumber === null) {
      setPortError('Enter a port from 1 to 65535.');
      return;
    }
    setPortError('');
    setFailure('');
    setBusy(true);
    const name = username.trim();
    void updateMailSettings({
      body: {
        host: host.trim(),
        port: portNumber,
        security,
        sender: sender.trim(),
        ...(name === '' ? {} : { username: name }),
        ...(name === '' || password === '' ? {} : { password }),
      },
    }).then((result) => {
      setBusy(false);
      if (result.error !== undefined) {
        setFailure(problemMessage(result.error));
        return;
      }
      onSaved();
    });
  };

  return (
    <Dialog
      open
      title="Mail server"
      titleId="mail-settings-title"
      width="medium"
      onClose={onClose}
    >
      <form
        onSubmit={(event): void => {
          event.preventDefault();
          submit();
        }}
      >
        <DialogBody>
          <p className="mb-4 mt-0 text-control text-muted">
            Your mail provider gives these values. The server keeps the password
            sealed and never shows it again.
          </p>
          <TextField
            id="mail-host"
            label="Server"
            value={host}
            placeholder="smtp.example.com"
            autoComplete="off"
            required
            autoFocus
            onChange={setHost}
          />
          <SelectField
            id="mail-security"
            label="Security"
            value={security}
            options={mailSecurityOptions}
            hint="STARTTLS and TLS protect the connection. Use None only on a network that you trust."
            onChange={(value) => {
              const next = mailSecurityOf(value);
              if (next === null) return;
              setPort(portAfterSecurity(port, security, next));
              setSecurity(next);
            }}
          />
          <TextField
            id="mail-port"
            label="Port"
            value={port}
            required
            error={portError}
            onChange={setPort}
          />
          <TextField
            id="mail-username"
            label="User name"
            value={username}
            autoComplete="off"
            hint="Leave it empty for a server that takes mail with no sign-in."
            onChange={setUsername}
          />
          <TextField
            id="mail-password"
            label="Password"
            value={password}
            inputType="password"
            autoComplete="new-password"
            hint={
              keepsPassword
                ? 'Leave it empty to keep the saved password.'
                : undefined
            }
            onChange={setPassword}
          />
          <TextField
            id="mail-sender"
            label="Sender"
            value={sender}
            placeholder="NotesApp <no-reply@notes.example.com>"
            autoComplete="off"
            required
            hint="An address that this server may send from, with a name before it if you want one."
            onChange={setSender}
          />
          {/* The refusal stands next to Save, where the person is. */}
          {failure === '' ? null : <Notice tone="problem" message={failure} />}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy || host.trim() === '' || sender.trim() === ''}
          >
            {busy ? 'Saving' : 'Save'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/** The body of the legal documents section. */
export function LegalDocumentsBody({
  legal,
  busy,
  onChanged,
  onFailed,
}: SectionCallbacks & { readonly legal: LegalSettings }): ReactNode {
  const [editing, setEditing] = useState<LegalDocumentRowName | null>(null);
  const [working, setWorking] = useState(false);
  const locked = legal.source === 'environment';

  const remove = (name: LegalDocumentRowName, title: string): void => {
    if (working) return;
    setWorking(true);
    void removeLegalDocument({ path: { document: name } }).then((result) => {
      setWorking(false);
      if (result.error !== undefined) {
        onFailed(problemMessage(result.error));
        return;
      }
      onChanged(
        `The ${title.toLowerCase()} is removed. Nobody accepts the documents until both exist again.`,
      );
    });
  };

  return (
    <>
      <ul className={pageListClassName()}>
        {legalDocumentRows.map((row) => {
          const document: LegalDocumentSummary | null = legal[row.name];
          return (
            <ListRow key={row.name} className="flex-wrap">
              <span
                className="inline-flex shrink-0 items-center text-muted"
                aria-hidden="true"
              >
                <FileTextIcon />
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-ui text-strong">{row.title}</p>
                <p className="m-0 text-control text-muted">
                  {legalDocumentFact(document)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-cluster">
                {document === null ? null : (
                  <a
                    className={buttonClassName({
                      variant: 'secondary',
                      size: 'sm',
                      iconOnly: true,
                    })}
                    href={document.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open the ${row.title.toLowerCase()}`}
                    title={`Open the ${row.title.toLowerCase()}`}
                  >
                    <ExternalLinkIcon />
                  </a>
                )}
                {locked ? null : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy || working}
                    label={
                      document === null
                        ? `Add the ${row.title.toLowerCase()}`
                        : `Change the ${row.title.toLowerCase()}`
                    }
                    onClick={() => {
                      setEditing(row.name);
                    }}
                  >
                    {document === null ? 'Add' : 'Change'}
                  </Button>
                )}
                {locked || document === null ? null : (
                  <Button
                    variant="secondary"
                    tone="danger"
                    size="sm"
                    disabled={busy || working}
                    label={`Remove the ${row.title.toLowerCase()}`}
                    onClick={() => {
                      remove(row.name, row.title);
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </ListRow>
          );
        })}
      </ul>
      {editing === null ? null : (
        <LegalDocumentDialog
          name={editing}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={(title) => {
            setEditing(null);
            onChanged(`The ${title.toLowerCase()} is saved.`);
          }}
        />
      )}
    </>
  );
}

/** The form of one document, once its read finished. */
type LegalForm = {
  readonly template: string;
  readonly kind: 'text' | 'address';
  readonly text: string;
  readonly url: string;
  readonly version: string;
};

/** Today as a version, for example 2026-10-01. */
function todayVersion(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The dialog that writes one legal document. */
function LegalDocumentDialog({
  name,
  onClose,
  onSaved,
}: {
  readonly name: LegalDocumentRowName;
  readonly onClose: () => void;
  readonly onSaved: (title: string) => void;
}): ReactNode {
  const title =
    legalDocumentRows.find((row) => row.name === name)?.title ?? 'Document';
  const [form, setForm] = useState<LegalForm | null>(null);
  const [loadFailure, setLoadFailure] = useState('');
  const [values, setValues] = useState<Readonly<Record<string, string>>>({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getLegalDocumentSettings({ path: { document: name } }).then(
      (result) => {
        if (cancelled) return;
        if (result.data === undefined) {
          setLoadFailure(problemMessage(result.error));
          return;
        }
        const stored = result.data.document;
        setForm({
          template: result.data.template,
          kind: stored?.kind ?? 'text',
          // A new document starts from the template, so its blanks show at
          // once as fields.
          text: stored?.text ?? result.data.template,
          url: stored?.url ?? '',
          version: stored?.version ?? todayVersion(),
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [name]);

  const fields = form === null ? [] : blankFields(form.text);
  const update = (change: Partial<LegalForm>): void => {
    setForm((current) => (current === null ? null : { ...current, ...change }));
  };

  const submit = (): void => {
    if (busy || form === null) return;
    setFailure('');
    setBusy(true);
    void updateLegalDocument({
      path: { document: name },
      body:
        form.kind === 'text'
          ? {
              kind: 'text',
              text: textToSave(form.text, form.version.trim()),
              version: form.version.trim(),
            }
          : {
              kind: 'address',
              url: form.url.trim(),
              version: form.version.trim(),
            },
    }).then((result) => {
      setBusy(false);
      if (result.error !== undefined) {
        setFailure(
          problemCode(result.error) === 'legal_document_unfinished'
            ? unfinishedText(blanksOf(result.error))
            : problemMessage(result.error),
        );
        return;
      }
      onSaved(title);
    });
  };

  return (
    <Dialog
      open
      title={title}
      titleId="legal-document-title"
      width="large"
      onClose={onClose}
    >
      {form === null ? (
        <DialogBody>
          {loadFailure === '' ? (
            <LoadingState
              shape="list"
              rows={3}
              label="The document is loading."
            />
          ) : (
            <Notice tone="problem" message={loadFailure} />
          )}
        </DialogBody>
      ) : (
        <form
          onSubmit={(event): void => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogBody>
            <SelectField
              id="legal-kind"
              label="Source"
              value={form.kind}
              options={[
                { value: 'text', label: 'Text on this server' },
                { value: 'address', label: 'Page on another site' },
              ]}
              onChange={(value) => {
                update({ kind: value === 'address' ? 'address' : 'text' });
              }}
            />
            {form.kind === 'text' ? (
              <>
                <Notice
                  tone="info"
                  className="mb-4"
                  message="The template states what NotesApp keeps and where it sends data. It is not legal advice. Ask a person who knows the law of your country to read the document."
                />
                <TextAreaField
                  id="legal-text"
                  label="Text in Markdown"
                  value={form.text}
                  required
                  onChange={(text) => {
                    update({ text });
                  }}
                />
                <div className="mb-4 flex flex-wrap gap-cluster">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      update({ text: form.template });
                      setValues({});
                    }}
                  >
                    Start again from the template
                  </Button>
                </div>
                {fields.length === 0 ? null : (
                  <fieldset className="m-0 mb-4 min-w-0 border-0 p-0">
                    <legend className="mb-2 p-0 text-ui font-semibold text-strong">
                      {fields.length === 1
                        ? '1 blank to fill'
                        : `${String(fields.length)} blanks to fill`}
                    </legend>
                    <p className="mb-3 mt-0 text-control text-muted">
                      Type the facts of your service. Fill the blanks writes
                      each one into every place of the text.
                    </p>
                    {fields.map((field, index) => (
                      <TextField
                        key={field.blank}
                        id={`legal-blank-${String(index)}`}
                        label={field.label}
                        value={values[field.blank] ?? ''}
                        autoComplete="off"
                        onChange={(value) => {
                          setValues((current) => ({
                            ...current,
                            [field.blank]: value,
                          }));
                        }}
                      />
                    ))}
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={fields.every(
                        (field) => (values[field.blank] ?? '').trim() === '',
                      )}
                      onClick={() => {
                        update({ text: fillBlanks(form.text, values) });
                        setValues({});
                      }}
                    >
                      Fill the blanks
                    </Button>
                  </fieldset>
                )}
              </>
            ) : (
              <TextField
                id="legal-url"
                label="Address"
                value={form.url}
                placeholder="https://example.com/terms"
                autoComplete="off"
                required
                onChange={(url) => {
                  update({ url });
                }}
              />
            )}
            <TextField
              id="legal-version"
              label="Version"
              value={form.version}
              required
              hint="Change the version when every person must accept the document again. Keep it for a fixed typo."
              onChange={(version) => {
                update({ version });
              }}
            />
            {/* The refusal stands next to Save, where the person is. */}
            {failure === '' ? null : (
              <Notice tone="problem" message={failure} />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                busy ||
                form.version.trim() === '' ||
                (form.kind === 'text'
                  ? form.text.trim() === ''
                  : form.url.trim() === '')
              }
            >
              {busy ? 'Saving' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}
