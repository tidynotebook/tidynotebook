# Audit of the settings of a self-hosted installation

- Date: 2026-10-01
- Commit read: 982afaf

This audit reads every value that one installation can need to change, and
states where each value comes from. It follows the owner report of
2026-10-01: the mail server and the legal documents of the installation at
notes.bhu.sh are set in the files of that one deployment, and an operator
cannot set either one in the application. A finding names the code by path.

## How the audit ran

The audit read every variable of `apps/server/src/config.ts`, the files under
`docker/`, `docker-compose.yml`, `.env.example` and the release workflow. It
searched the whole repository for a host name, an address, a person and a
company. It also read the deployment repository of notes.bhu.sh, so that it
could tell a value of the product from a value of that deployment.

## Finding 1: no value of one deployment is in the product

The product names no host, no mail server, no address and no person of
notes.bhu.sh. Each one is in the deployment repository: its Compose file sets
the SMTP secret and the sender, and its legal files hold the name of the
operator, the contact address and the law of one country.

The product still caused the report. An operator can set the mail transport
only by `NOTESAPP_SMTP_URL` and `NOTESAPP_MAIL_FROM`, and the legal documents
only by `NOTESAPP_TERMS_FILE`, `NOTESAPP_PRIVACY_FILE`, the two address
variables and the two versions. Each of them needs a change of the deployment
files and a restart. An administrator of the application sees only whether
mail exists.

## Finding 2: the settings by kind

**A setting that an administrator changes, and that the environment holds
now.** These are the candidates for the application.

- The mail transport and its sender: `NOTESAPP_SMTP_URL`,
  `NOTESAPP_MAIL_FROM`. Read once in `loadServerConfig`, used by
  `createMailTransport` in `apps/server/src/auth/mail.ts`.
- The terms and the privacy notice, each with a source and a version: the six
  `NOTESAPP_TERMS_*` and `NOTESAPP_PRIVACY_*` variables. Read once in
  `readLegalDocuments` and `loadLegalTexts` of `apps/server/src/config.ts`.
- The limit of a new account and the life of an invitation:
  `NOTESAPP_ACCOUNT_LIMIT_BYTES`, `NOTESAPP_INVITATION_LIFETIME_HOURS`. Each
  has a default in `packages/core`, and the accounts page shows both.

**A setting that stays in the environment.** Each one is needed before the
database opens, protects the database, or is a property of the host.

- The origins, the listening socket and the trusted proxies:
  `NOTESAPP_ORIGIN`, `NOTESAPP_ADDITIONAL_ORIGINS`,
  `NOTESAPP_PUBLISHED_ORIGIN`, `NOTESAPP_HOST`, `NOTESAPP_PORT`,
  `NOTESAPP_TRUSTED_PROXIES`. Records 0039, 0042, 0043 and 0118.
- The connections and the secret: `NOTESAPP_DATABASE_URL`,
  `NOTESAPP_AUTH_DATABASE_URL`, `NOTESAPP_AUTH_SECRET`,
  `NOTESAPP_STORAGE_ROOT`.
- The bounds of a request and of a stop, the log level, the session life and
  the attempt limit. Better Auth and Fastify read these when the process
  starts.
- The outbound check of a password, `NOTESAPP_BREACH_CHECK`, which depends
  on the network of the host.
- The life of a pending sign-up and the cost of its proof of work:
  `NOTESAPP_PENDING_ACCOUNT_HOURS`, `NOTESAPP_SIGNUP_DIFFICULTY`. These tune
  the abuse defence of record 0115.

## Finding 3: values that the product writes for itself

- `.github/workflows/release.yml` pushes the image to the registry path of
  the upstream repository. A fork changes that line, and no installation
  reads it.
- `packages/ui/src/themes/default.ts` and `packages/ui/src/themes/ink.ts`
  credit the upstream repository as the author of two themes. This is an
  attribution, not a setting.
- `LICENSE` names the copyright holder.
- `docker/legal/terms.md` and `docker/legal/privacy.md` are templates. Each
  blank is a marker in double braces, and the server refuses a file that still
  holds one.

## Finding 4: what the standard practice is

- Mattermost lets an administrator set the SMTP server in its System Console,
  with a test of the connection. A value that an environment variable sets
  wins, and the console shows it locked.
- Nextcloud, Vaultwarden and Listmonk each set the mail server in an
  administration screen, with a test message.
- Mastodon 4.4 keeps the terms of service and the privacy policy as Markdown
  that an administrator writes in the administration screens. It gives a
  template, and each version of the terms has an effective date.
- Discourse fills its default terms from settings such as the company name,
  the contact address and the governing law, and it also takes an external
  address for each document.

## Result

[Design 019](../../design/019-installation-settings-in-the-application.md) takes
the first group of finding 2 into the application, and
[record 0148](../../decisions/0148-an-administrator-sets-the-mail-and-the-legal-documents.md)
states the choice.
