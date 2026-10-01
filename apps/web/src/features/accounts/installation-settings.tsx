/**
 * The mail server and the legal documents of the installation, as two
 * sections of the accounts page (record 0148).
 *
 * Both are settings of the page itself, as the profile is a setting of
 * Settings: the fields stand in the section and Save stores them, with no
 * dialog. A group that the server environment sets is locked, so its section
 * states what applies and offers no change. The mail section sends a test
 * message to the address of the administrator. A legal document opens its
 * editor in place of the list: each blank of the template is a field, and
 * what a person types there fills the text below at once.
 *
 * The one filled action of the page stays Invite a person, so every action
 * here is a secondary button. Every word and every rule lives in
 * `lib/installation-settings.ts` with its unit test, and every server call is
 * a generated operation.
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
  legalRemovedText,
  legalSavedText,
  mailFacts,
  mailFailureReasonOf,
  mailFailureText,
  mailFormChanged,
  mailPortOf,
  mailSecurityOf,
  mailSecurityOptions,
  portAfterSecurity,
  textToSave,
  unfinishedText,
  type LegalDocumentRowName,
  type MailForm,
} from '../../lib/installation-settings.ts';

/** The outcome of the last action of a section, which it states in place. */
type Outcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'done'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string };

const noOutcome: Outcome = { kind: 'none' };

/** The notice of one outcome, or nothing. */
function OutcomeNotice({ outcome }: { readonly outcome: Outcome }): ReactNode {
  if (outcome.kind === 'none') return null;
  return (
    <Notice
      className="mb-3"
      tone={outcome.kind === 'done' ? 'success' : 'problem'}
      message={outcome.message}
    />
  );
}

/** The sentence of a test message, from its answer. */
async function testOutcome(): Promise<Outcome> {
  const result = await sendTestMessage();
  if (result.data !== undefined)
    return {
      kind: 'done',
      message: `A test message went to ${result.data.to}. Check that it arrived in the inbox and not in spam.`,
    };
  return {
    kind: 'failed',
    message:
      problemCode(result.error) === 'mail_failed'
        ? mailFailureText(mailFailureReasonOf(result.error))
        : problemMessage(result.error),
  };
}

/** The body of the mail section. */
export function MailSettingsBody({
  mail,
  onSaved,
}: {
  readonly mail: MailSettings;
  /** Reads the page again after a change. */
  readonly onSaved: () => void;
}): ReactNode {
  if (mail.source === 'environment') return <EnvironmentMail mail={mail} />;
  return <MailSettingsForm mail={mail} onSaved={onSaved} />;
}

/** The mail server that the server environment sets, with its test. */
function EnvironmentMail({ mail }: { readonly mail: MailSettings }): ReactNode {
  const [outcome, setOutcome] = useState<Outcome>(noOutcome);
  const [busy, setBusy] = useState(false);
  const facts = mailFacts(mail);
  return (
    <>
      {facts.length === 0 ? null : (
        <p className="mb-3 mt-0 flex flex-wrap gap-cluster text-control text-muted">
          {facts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </p>
      )}
      <OutcomeNotice outcome={outcome} />
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setOutcome(noOutcome);
          void testOutcome().then((next) => {
            setBusy(false);
            setOutcome(next);
          });
        }}
      >
        {busy ? 'Sending' : 'Send a test message'}
      </Button>
    </>
  );
}

/** The form of a mail server that the stored settings hold. */
function formOf(mail: MailSettings): MailForm {
  const security: MailSecurity = mail.security ?? 'starttls';
  return {
    host: mail.host ?? '',
    security,
    port: String(mail.port ?? defaultMailPort[security]),
    username: mail.username ?? '',
    password: '',
    sender: mail.sender ?? '',
  };
}

/** The fields of the mail server, its Save, its test and its removal. */
function MailSettingsForm({
  mail,
  onSaved,
}: {
  readonly mail: MailSettings;
  readonly onSaved: () => void;
}): ReactNode {
  const saved = formOf(mail);
  const [form, setForm] = useState<MailForm>(saved);
  const [fieldErrors, setFieldErrors] = useState<
    Readonly<{ port?: string; password?: string }>
  >({});
  const [outcome, setOutcome] = useState<Outcome>(noOutcome);
  const [working, setWorking] = useState<'save' | 'test' | 'remove' | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const busy = working !== null;
  // A stored server that changes is what the fields show next. A read of the
  // page that another section caused keeps what the person typed.
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    setForm(formOf(mail));
  }, [savedKey]);
  const changed = mailFormChanged(saved, form);
  const stored = mail.source === 'application';
  // A saved password belongs to its user name, so a new user name needs one.
  const keepsPassword =
    mail.passwordStored &&
    form.username.trim() !== '' &&
    form.username.trim() === mail.username;
  const lostPassword = stored && mail.username !== null && !mail.passwordStored;

  const update = (change: Partial<MailForm>): void => {
    setForm((current) => ({ ...current, ...change }));
    setOutcome(noOutcome);
  };

  const run = (
    kind: 'save' | 'test' | 'remove',
    action: () => Promise<Outcome>,
  ): void => {
    if (busy) return;
    setWorking(kind);
    setOutcome(noOutcome);
    void action().then((next) => {
      setWorking(null);
      setOutcome(next);
    });
  };

  const save = (): void => {
    const port = mailPortOf(form.port);
    const name = form.username.trim();
    // A new user name needs its password. A saved one is kept when the field
    // stays empty.
    const needsPassword = name !== '' && form.password === '' && !keepsPassword;
    setFieldErrors({
      ...(port === null ? { port: 'Enter a port from 1 to 65535.' } : {}),
      ...(needsPassword
        ? { password: 'Enter the password of the user name.' }
        : {}),
    });
    if (port === null || needsPassword) return;
    run('save', async () => {
      const result = await updateMailSettings({
        body: {
          host: form.host.trim(),
          port,
          security: form.security,
          sender: form.sender.trim(),
          ...(name === '' ? {} : { username: name }),
          ...(name === '' || form.password === ''
            ? {}
            : { password: form.password }),
        },
      });
      if (result.error !== undefined)
        return { kind: 'failed', message: problemMessage(result.error) };
      onSaved();
      return {
        kind: 'done',
        message: 'The mail server is saved. Send a test message to check it.',
      };
    });
  };

  const remove = (): void => {
    setConfirming(false);
    run('remove', async () => {
      const result = await removeMailSettings();
      if (result.error !== undefined)
        return { kind: 'failed', message: problemMessage(result.error) };
      onSaved();
      return {
        kind: 'done',
        message:
          'The mail server is removed. An invitation shows its link once again.',
      };
    });
  };

  return (
    <form
      onSubmit={(event): void => {
        event.preventDefault();
        save();
      }}
    >
      {lostPassword ? (
        <Notice
          className="mb-3"
          tone="problem"
          message="The server can no longer read the saved password. Enter it again and save."
        />
      ) : null}
      <div className="md:grid md:grid-cols-3 md:gap-x-group">
        <div className="md:col-span-2">
          <TextField
            id="mail-host"
            label="Server"
            value={form.host}
            placeholder="smtp.example.com"
            autoComplete="off"
            required
            onChange={(host) => {
              update({ host });
            }}
          />
        </div>
        <TextField
          id="mail-port"
          label="Port"
          value={form.port}
          required
          error={fieldErrors.port}
          onChange={(port) => {
            update({ port });
          }}
        />
      </div>
      <SelectField
        id="mail-security"
        label="Security"
        value={form.security}
        options={mailSecurityOptions}
        hint="TLS and STARTTLS protect the connection."
        onChange={(value) => {
          const next = mailSecurityOf(value);
          if (next === null) return;
          update({
            security: next,
            port: portAfterSecurity(form.port, form.security, next),
          });
        }}
      />
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-1 p-0 text-control font-medium text-strong">
          Sign-in
        </legend>
        <p className="mb-3 mt-0 text-control text-muted">
          {keepsPassword
            ? 'Leave the password empty to keep the saved one. Leave both fields empty for a server that takes mail with no sign-in.'
            : 'Leave both fields empty for a server that takes mail with no sign-in.'}
        </p>
        <div className="md:grid md:grid-cols-2 md:gap-x-group">
          <TextField
            id="mail-username"
            label="User name"
            value={form.username}
            autoComplete="off"
            onChange={(username) => {
              update({ username });
            }}
          />
          <TextField
            id="mail-password"
            label="Password"
            value={form.password}
            inputType="password"
            autoComplete="new-password"
            error={fieldErrors.password}
            onChange={(password) => {
              update({ password });
            }}
          />
        </div>
      </fieldset>
      <TextField
        id="mail-sender"
        label="Sender"
        value={form.sender}
        placeholder="NotesApp <no-reply@notes.example.com>"
        autoComplete="off"
        required
        hint="An address that the mail server lets you send from."
        onChange={(sender) => {
          update({ sender });
        }}
      />
      <OutcomeNotice outcome={outcome} />
      <div className="flex flex-wrap gap-cluster">
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={
            busy ||
            !changed ||
            form.host.trim() === '' ||
            form.sender.trim() === ''
          }
        >
          {working === 'save' ? 'Saving' : 'Save'}
        </Button>
        {stored ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || changed}
            title={changed ? 'Save the changes first.' : undefined}
            onClick={() => {
              run('test', testOutcome);
            }}
          >
            {working === 'test' ? 'Sending' : 'Send a test message'}
          </Button>
        ) : null}
        {stored ? (
          <Button
            variant="secondary"
            tone="danger"
            size="sm"
            disabled={busy}
            onClick={() => {
              setConfirming(true);
            }}
          >
            {working === 'remove' ? 'Removing' : 'Remove'}
          </Button>
        ) : null}
      </div>
      {confirming ? (
        <ConfirmRemoval
          title="Remove the mail server?"
          message="The server sends no mail, and the saved password goes for good. An invitation shows its link once again."
          action="Remove mail server"
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={remove}
        />
      ) : null}
    </form>
  );
}

/** The small dialog that confirms a removal that cannot be undone. */
function ConfirmRemoval({
  title,
  message,
  action,
  onCancel,
  onConfirm,
}: {
  readonly title: string;
  readonly message: string;
  readonly action: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}): ReactNode {
  return (
    <Dialog
      open
      title={title}
      titleId="confirm-removal-title"
      width="small"
      onClose={onCancel}
    >
      <DialogBody>
        <p className="m-0 text-ui text-strong">{message}</p>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {action}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

/** The body of the legal documents section. */
export function LegalDocumentsBody({
  legal,
  onSaved,
}: {
  readonly legal: LegalSettings;
  /** Reads the page again after a change. */
  readonly onSaved: () => void;
}): ReactNode {
  const [editing, setEditing] = useState<LegalDocumentRowName | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(noOutcome);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<{
    readonly name: LegalDocumentRowName;
    readonly title: string;
  } | null>(null);
  const locked = legal.source === 'environment';

  if (editing !== null)
    return (
      <LegalDocumentEditor
        name={editing}
        onClose={() => {
          setEditing(null);
        }}
        onSaved={(title) => {
          setEditing(null);
          setOutcome({ kind: 'done', message: legalSavedText(title) });
          onSaved();
        }}
      />
    );

  const remove = (name: LegalDocumentRowName, title: string): void => {
    setConfirming(null);
    if (busy) return;
    setBusy(true);
    setOutcome(noOutcome);
    void removeLegalDocument({ path: { document: name } }).then((result) => {
      setBusy(false);
      if (result.error !== undefined) {
        setOutcome({ kind: 'failed', message: problemMessage(result.error) });
        return;
      }
      setOutcome({
        kind: 'done',
        message: legalRemovedText(title),
      });
      onSaved();
    });
  };

  return (
    <>
      <OutcomeNotice outcome={outcome} />
      <ul className={pageListClassName()}>
        {legalDocumentRows.map((row) => {
          const document: LegalDocumentSummary | null = legal[row.name];
          const name = row.title.toLowerCase();
          return (
            <ListRow key={row.name}>
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
                    aria-label={`Open the ${name}`}
                    title={`Open the ${name}`}
                  >
                    <ExternalLinkIcon />
                  </a>
                )}
                {locked ? null : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    label={
                      document === null
                        ? `Add the ${name}`
                        : `Change the ${name}`
                    }
                    onClick={() => {
                      setOutcome(noOutcome);
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
                    disabled={busy}
                    label={`Remove the ${name}`}
                    onClick={() => {
                      setConfirming({ name: row.name, title: name });
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
      {confirming === null ? null : (
        <ConfirmRemoval
          title={`Remove the ${confirming.title}?`}
          message={`This removes the text of the ${confirming.title} for good. Nobody accepts the documents until both exist again.`}
          action={`Remove ${confirming.title}`}
          onCancel={() => {
            setConfirming(null);
          }}
          onConfirm={() => {
            remove(confirming.name, confirming.title);
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
  /** The text as the person wrote it, with the blanks that remain. */
  readonly text: string;
  readonly url: string;
  readonly version: string;
};

/** Today as a version, for example 2026-10-01. */
function todayVersion(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The editor of one legal document, in place of the list of the section. */
function LegalDocumentEditor({
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

  if (form === null)
    return loadFailure === '' ? (
      <LoadingState shape="list" rows={3} label="The document is loading." />
    ) : (
      <Notice tone="problem" message={loadFailure}>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Back
        </Button>
      </Notice>
    );

  const version = form.version.trim();
  const fields = blankFields(form.text);
  // What a person types into a field fills its place in the text at once.
  const text = textToSave(form.text, values);
  const update = (change: Partial<LegalForm>): void => {
    setForm({ ...form, ...change });
    setFailure('');
  };

  const save = (): void => {
    if (busy) return;
    if (form.kind === 'text') {
      const left = blankFields(text);
      if (left.length > 0) {
        setFailure(unfinishedText(left.map((field) => field.blank)));
        return;
      }
    }
    setFailure('');
    setBusy(true);
    void updateLegalDocument({
      path: { document: name },
      body:
        form.kind === 'text'
          ? { kind: 'text', text, version }
          : { kind: 'address', url: form.url.trim(), version },
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
      onSaved(title.toLowerCase());
    });
  };

  return (
    <form
      aria-labelledby="legal-editor-title"
      onSubmit={(event): void => {
        event.preventDefault();
        save();
      }}
    >
      <h3
        className="mb-3 mt-0 text-ui font-semibold text-strong"
        id="legal-editor-title"
      >
        {title}
      </h3>
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
      {form.kind === 'address' ? (
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
      ) : (
        <>
          {fields.length === 0 ? null : (
            <fieldset className="m-0 mb-1 min-w-0 border-0 p-0">
              <legend className="mb-1 p-0 text-control font-medium text-strong">
                Facts of your service
              </legend>
              <p className="mb-3 mt-0 text-control text-muted">
                Each fact fills its place in the text below.
              </p>
              <div className="md:grid md:grid-cols-2 md:gap-x-group">
                {fields.map((field, index) => (
                  <div
                    key={field.blank}
                    className={field.wide ? 'md:col-span-2' : undefined}
                  >
                    <TextField
                      id={`legal-blank-${String(index)}`}
                      label={field.label}
                      value={values[field.blank] ?? ''}
                      autoComplete="off"
                      onChange={(value) => {
                        setValues((current) => ({
                          ...current,
                          [field.blank]: value,
                        }));
                        setFailure('');
                      }}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          )}
          <TextAreaField
            id="legal-text"
            label="Text in Markdown"
            value={text}
            required
            hint="The template states what NotesApp keeps and where it sends data. It is not legal advice. Ask a person who knows the law of your country to read the document."
            onChange={(next) => {
              // An edit of the text keeps what the fields filled, and the
              // blanks that remain stay fields.
              update({ text: next });
              setValues({});
            }}
          />
        </>
      )}
      <TextField
        id="legal-version"
        label="Version"
        value={form.version}
        required
        hint="The page of the document states its version. A new version asks every person to accept the document again. Keep the version for a fixed typo."
        onChange={(next) => {
          update({ version: next });
        }}
      />
      {failure === '' ? null : (
        <Notice className="mb-3" tone="problem" message={failure} />
      )}
      <div className="flex flex-wrap gap-cluster">
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={
            busy ||
            version === '' ||
            (form.kind === 'text' ? text.trim() === '' : form.url.trim() === '')
          }
        >
          {busy ? 'Saving' : 'Save'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        {form.kind === 'text' && form.text !== form.template ? (
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            onClick={() => {
              update({ text: form.template });
              setValues({});
            }}
          >
            Start again from the template
          </Button>
        ) : null}
      </div>
    </form>
  );
}
