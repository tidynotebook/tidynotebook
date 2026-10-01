/**
 * The one decider of the mail transport and of the legal documents
 * (record 0148).
 *
 * Each group comes from the server environment or from the settings that an
 * administrator stores. A group that the environment sets wins and is
 * locked. Every reader of either group asks this module, at the moment it
 * needs the value, so a change in the application reaches every server
 * process of the installation at its next request (record 0121), and no
 * caller reads the environment or the row alone.
 */
import type {
  InstallationEnvironment,
  InstallationSettingsReader,
  LegalDocumentName,
  LegalDocuments,
  StoredInstallationSettings,
  StoredLegalDocument,
} from '@notesapp/core';
import { legalTemplate } from '@notesapp/core';
import {
  connectMailTransport,
  MailUnavailableError,
  type ApplicationMail,
  type Mailer,
  type MailMessage,
  type MailTransport,
} from './auth/mail.ts';
import type { Seal } from './auth/seal.ts';
import {
  legalDocumentPath,
  type LegalTexts,
  type ServerConfig,
} from './config.ts';
import { publishedOrigin } from './served-origins.ts';

/** Where a group of settings comes from. */
export type SettingSource = 'environment' | 'application' | 'none';

/** The mail transport as an administrator reads it. It holds no password. */
export type MailView = {
  readonly source: SettingSource;
  readonly host: string | null;
  readonly port: number | null;
  readonly security: 'tls' | 'starttls' | 'none' | null;
  readonly username: string | null;
  readonly sender: string | null;
  readonly passwordStored: boolean;
};

/** One legal document as a person reads it. */
export type LegalSummary = {
  readonly kind: 'text' | 'address';
  readonly url: string;
  readonly version: string;
};

/** The legal documents that apply now. */
export type LegalState = {
  readonly source: SettingSource;
  /** Both documents, or `null` while one of them is missing (record 0120). */
  readonly documents: LegalDocuments | null;
  /** The Markdown text that this server serves for each document, or `null`. */
  readonly texts: LegalTexts;
  /** Each document that exists, as the accounts page lists it. */
  readonly summaries: Readonly<Record<LegalDocumentName, LegalSummary | null>>;
};

/** What the composition gives the decider. */
export type InstallationSettingsInput = {
  readonly config: ServerConfig;
  readonly reader: InstallationSettingsReader;
  /**
   * The transport of the environment, or `null`. A test gives its own here,
   * and it then stands for `NOTESAPP_SMTP_URL`.
   */
  readonly environmentMail: MailTransport | null;
  /** The texts of the legal files that the environment names. */
  readonly environmentTexts: LegalTexts;
  /** The seal of the mail password. */
  readonly passwordSeal: Seal;
  /** Builds the transport of the stored settings. A test gives its own. */
  readonly connect?: (mail: ApplicationMail) => MailTransport;
};

/** The decider, which every reader of the two groups asks. */
export type InstallationSettings = {
  /** What the environment sets. A group that it sets is locked. */
  readonly environment: InstallationEnvironment;
  /** The transport that applies at the moment of each message. */
  readonly mailer: Mailer;
  /** The stored row. */
  stored(): Promise<StoredInstallationSettings>;
  /** The mail transport that applies now, for the accounts page. */
  mailView(stored?: StoredInstallationSettings): Promise<MailView>;
  /** The legal documents that apply now. */
  legal(stored?: StoredInstallationSettings): Promise<LegalState>;
  /** The template of one document, with the facts of this server filled. */
  template(name: LegalDocumentName): string;
};

/** The parts of `NOTESAPP_SMTP_URL` that a person may read. */
function environmentMailView(config: ServerConfig): MailView {
  const empty: MailView = {
    source: 'environment',
    host: null,
    port: null,
    security: null,
    username: null,
    sender: config.mail?.from ?? null,
    passwordStored: false,
  };
  if (config.mail === null) return empty;
  try {
    const url = new URL(config.mail.smtpUrl);
    return {
      ...empty,
      host: url.hostname,
      port: url.port === '' ? null : Number(url.port),
      security: url.protocol === 'smtps:' ? 'tls' : null,
      username: url.username === '' ? null : decodeURIComponent(url.username),
    };
  } catch {
    return empty;
  }
}

/** The address of one document as a person reads it. */
function documentUrl(
  origin: string,
  name: LegalDocumentName,
  document: StoredLegalDocument,
): string {
  return document.kind === 'text'
    ? `${origin}${legalDocumentPath(name)}`
    : document.url;
}

/** Builds the decider of one installation. */
export function createInstallationSettings(
  input: InstallationSettingsInput,
): InstallationSettings {
  const { config, reader } = input;
  const connect = input.connect ?? connectMailTransport;
  /** The opened password of a stored transport, `null` for none. */
  const openPassword = (sealed: string | null): string | null =>
    sealed === null ? null : input.passwordSeal.open(sealed);
  const environment: InstallationEnvironment = {
    mail: input.environmentMail !== null,
    publishedOrigin: publishedOrigin(config.servedOrigins) !== null,
    legalDocuments: config.legalDocuments !== null,
    // A password that this key cannot open, after a change of the server
    // secret, is no transport. The accounts page then shows that the
    // password must be entered again.
    mailUsable: (mail) =>
      mail.passwordSealed === null ||
      openPassword(mail.passwordSealed) !== null,
  };

  const stored = (): Promise<StoredInstallationSettings> =>
    reader.installationSettings();

  /** The transport of the stored row, or `null` when it holds none. */
  const applicationTransport = (
    settings: StoredInstallationSettings,
  ): MailTransport | null => {
    const mail = settings.mail;
    if (mail === null || !environment.mailUsable(mail)) return null;
    return connect({ ...mail, password: openPassword(mail.passwordSealed) });
  };

  const currentTransport = async (): Promise<MailTransport | null> =>
    input.environmentMail ?? applicationTransport(await stored());

  const mailer: Mailer = {
    available: async () => (await currentTransport()) !== null,
    async send(message: MailMessage): Promise<void> {
      const transport = await currentTransport();
      if (transport === null) throw new MailUnavailableError();
      await transport.send(message);
    },
  };

  const legal = async (
    given?: StoredInstallationSettings,
  ): Promise<LegalState> => {
    if (config.legalDocuments !== null)
      return {
        source: 'environment',
        documents: config.legalDocuments,
        texts: input.environmentTexts,
        summaries: {
          terms: {
            kind: input.environmentTexts.terms === null ? 'address' : 'text',
            ...config.legalDocuments.terms,
          },
          privacy: {
            kind: input.environmentTexts.privacy === null ? 'address' : 'text',
            ...config.legalDocuments.privacy,
          },
        },
      };
    const settings = given ?? (await stored());
    const summary = (name: LegalDocumentName): LegalSummary | null => {
      const document = settings[name];
      return document === null
        ? null
        : {
            kind: document.kind,
            url: documentUrl(config.origin, name, document),
            version: document.version,
          };
    };
    const terms = summary('terms');
    const privacy = summary('privacy');
    const textOf = (name: LegalDocumentName): string | null => {
      const document = settings[name];
      return document?.kind === 'text' ? document.text : null;
    };
    return {
      source: terms === null && privacy === null ? 'none' : 'application',
      documents:
        terms === null || privacy === null
          ? null
          : {
              terms: { url: terms.url, version: terms.version },
              privacy: { url: privacy.url, version: privacy.version },
            },
      texts: { terms: textOf('terms'), privacy: textOf('privacy') },
      summaries: { terms, privacy },
    };
  };

  return {
    environment,
    mailer,
    stored,
    async mailView(given?: StoredInstallationSettings): Promise<MailView> {
      if (input.environmentMail !== null) return environmentMailView(config);
      const mail = (given ?? (await stored())).mail;
      if (mail === null)
        return {
          source: 'none',
          host: null,
          port: null,
          security: null,
          username: null,
          sender: null,
          passwordStored: false,
        };
      return {
        source: 'application',
        host: mail.host,
        port: mail.port,
        security: mail.security,
        username: mail.username,
        sender: mail.sender,
        // A password that this key cannot open counts as none.
        passwordStored: openPassword(mail.passwordSealed) !== null,
      };
    },
    legal,
    template(name: LegalDocumentName): string {
      return legalTemplate(name, {
        serviceAddress: new URL(config.origin).host,
        pendingHours: config.accounts.pendingHours,
        breachCheck: config.breachCheck,
      });
    },
  };
}
