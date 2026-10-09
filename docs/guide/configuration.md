# Configuration reference

This page is for the person who runs the server. It names every setting of the
server and of its Compose file, and states what each one does.

[Self-hosting](self-hosting.md) is the installation guide, and it explains when
you need a setting. This page is the list to look a name up in.

## Where a setting lives

- **`.env`** holds the nonsecret settings. Copy `.env.example`, which states an
  example value for each line, and change the values.
- **The secret directory**, `NOTESAPP_SECRETS_DIR`, holds one file for each
  secret. A secret never goes in `.env`.
- **A platform that mounts no file**, such as a platform that gives a service
  variables only, sets each secret in its variable instead of its file. Each
  secret has a variable and a `_FILE` variable. Set one of the two, never
  both. With Compose, use the file.
- **The accounts page** of the application holds the mail server, the two
  legal documents and who can make an account, unless the environment names
  them. See [Accounts and invitations](accounts.md).

An empty value is a value that is not set. A setting applies at the next start:

```sh
docker compose up -d
```

A server that cannot use a value does not start. Its log names the setting and
the form that it needs.

## The address of the installation

| Setting                       | What it does                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NOTESAPP_ORIGIN`             | Required. The public address of the installation, with its scheme, for example `https://notes.example.com`. Cookies and every full address belong to it.                                                                                                |
| `NOTESAPP_ADDITIONAL_ORIGINS` | More addresses that reach this installation, separated by commas. Write each one in full, with the scheme of `NOTESAPP_ORIGIN`. Empty serves `NOTESAPP_ORIGIN` alone.                                                                                   |
| `NOTESAPP_PUBLISHED_ORIGIN`   | The address that shows published pages and nothing else, on a host name of its own. Open sign-up does not need it. Empty shows published pages on `NOTESAPP_ORIGIN`.                                                                                    |
| `NOTESAPP_BIND_HOST`          | The address of the host where Compose publishes the application. Keep the loopback address behind a reverse proxy.                                                                                                                                      |
| `NOTESAPP_PORT`               | In `.env`, the port of the host where Compose publishes the application. Inside the container the server always listens on port 3000. Without Compose, it is the port that the server listens on, and an origin with a port requires it.                |
| `NOTESAPP_TRUSTED_PROXIES`    | The proxies whose forwarded headers the server believes: an address, a range in CIDR form, or `loopback`, `linklocal` or `uniquelocal`, separated by commas. Empty believes none. See [Behind a reverse proxy](self-hosting.md#behind-a-reverse-proxy). |

## The TLS profile

These settings apply only when you start the optional Caddy proxy with
`docker compose --profile tls up -d`.

| Setting                     | What it does                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `NOTESAPP_DOMAIN`           | The domain that Caddy answers and gets a certificate for. Empty answers `localhost` with a certificate that only serves a local check. |
| `NOTESAPP_PUBLISHED_DOMAIN` | The host name of `NOTESAPP_PUBLISHED_ORIGIN`, which Caddy answers too.                                                                 |
| `NOTESAPP_TLS_DIR`          | The host directory where Caddy keeps the certificates and their private keys. Put it on encrypted storage.                             |

## Data, secrets and the image

| Setting                 | What it does                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `NOTESAPP_DATABASE_DIR` | Required. The host directory of the PostgreSQL data.                                                                       |
| `NOTESAPP_STORAGE_DIR`  | Required. The host directory of the images and files of the notes. It must belong to uid 10001, the user of the image.     |
| `NOTESAPP_SECRETS_DIR`  | Required. The host directory of the secret files below. Keep it outside the repository.                                    |
| `POSTGRES_USER`         | The administrator of the database that Compose starts.                                                                     |
| `POSTGRES_DB`           | The name of the database.                                                                                                  |
| `NOTESAPP_IMAGE`        | The name and the tag of the application image that Compose runs, for example a release from the registry.                  |
| `COMPOSE_FILE`          | The Compose files that `docker compose` reads, separated by colons. Add the mail file or the legal file below to use them. |

The secret directory holds these files. Each one has mode `0600` and belongs to
uid 10001. [Self-hosting](self-hosting.md#protected-configuration) states the
content of each one and a command that writes them.

- `postgres_password`, `migration_database_url`, `runtime_database_password`,
  `auth_database_password`, `runtime_database_url`, `auth_database_url` and
  `auth_secret`, for every installation.
- `smtp_password`, with `docker/compose.mail.yaml`.
- `smtp_url`, with `docker/compose.mail-url.yaml`.
- `s3_access_key_id` and `s3_secret_access_key`, with
  `docker/compose.s3.yaml`.

## Object storage

The server keeps the images of the notes, an upload that waits for its note,
and an import that arrives in parts in an object store. To use an S3
compatible store, add `docker/compose.s3.yaml` to `COMPOSE_FILE`, then set
these values. See [Object storage](self-hosting.md#object-storage).

| Setting                              | What it does                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `NOTESAPP_OBJECT_STORE`              | `filesystem`, the default, keeps everything in the storage directory. `s3` uses an S3 compatible store. `docker/compose.s3.yaml` sets it. |
| `NOTESAPP_S3_BUCKET`                 | The bucket of the store.                                                                                                                  |
| `NOTESAPP_S3_REGION`                 | The region of the bucket, for example `auto` for Cloudflare R2 or `us-east-1` for AWS.                                                    |
| `NOTESAPP_S3_ENDPOINT`               | The address of the store, for example the address of R2 or of a MinIO server. Empty uses AWS itself.                                      |
| `NOTESAPP_S3_ACCESS_KEY_ID`          | The access key ID, on a platform that mounts no file. Compose reads it from the `s3_access_key_id` file.                                  |
| `NOTESAPP_S3_ACCESS_KEY_ID_FILE`     | The file that holds the access key ID, from `s3_access_key_id`. Compose sets it.                                                          |
| `NOTESAPP_S3_SECRET_ACCESS_KEY`      | The secret access key, on a platform that mounts no file. Compose reads it from the `s3_secret_access_key` file.                          |
| `NOTESAPP_S3_SECRET_ACCESS_KEY_FILE` | The file that holds the secret access key, from `s3_secret_access_key`. Compose sets it.                                                  |

## Requests and limits

| Setting                           | What it does                                                                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NOTESAPP_LOG_LEVEL`              | Required without Compose. How much the server logs: `fatal`, `error`, `warn`, `info`, `debug` or `silent`.                                                                         |
| `NOTESAPP_MAX_BODY_BYTES`         | Required without Compose. The largest body of a request, in bytes. An image upload and a workspace import have bounds of their own, which this value does not change.              |
| `NOTESAPP_MAX_HEADER_BYTES`       | Required without Compose. The largest headers of one request, in bytes.                                                                                                            |
| `NOTESAPP_REQUEST_TIMEOUT_MS`     | Required without Compose. The time in which a whole request must arrive, in milliseconds. It includes the body of an upload on a slow link.                                        |
| `NOTESAPP_UPLOAD_IDLE_TIMEOUT_MS` | The longest pause between two parts of an upload, in milliseconds. It must be shorter than the request timeout.                                                                    |
| `NOTESAPP_RATE_LIMIT_WINDOW_S`    | The window of the attempt limit, in seconds. The limit counts the attempts of one client at the screens and actions that a stranger can reach, such as setup, sign-in and sign-up. |
| `NOTESAPP_RATE_LIMIT_MAX`         | How many attempts one client makes in one window.                                                                                                                                  |
| `NOTESAPP_SESSION_MAX_AGE_S`      | How long a session that nobody uses lasts, in seconds. A browser that uses its session keeps it longer, so a person who works every day stays signed in.                           |

## Stopping the server

| Setting                         | What it does                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NOTESAPP_SHUTDOWN_GRACE_MS`    | The time between the moment the server says that it is not ready and the moment it stops taking requests, in milliseconds. `0` suits an installation with no proxy. |
| `NOTESAPP_SHUTDOWN_DEADLINE_MS` | The whole time of a stop before the server ends at once, in milliseconds. It must be longer than the grace.                                                         |

See [Stopping the server](self-hosting.md#stopping-the-server).

## Accounts

| Setting                              | What it does                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NOTESAPP_ACCOUNT_LIMIT_BYTES`       | The storage limit that a new account starts with, in bytes. An administrator changes the limit of one account.                                                                                                                                                                                                                                                           |
| `NOTESAPP_INVITATION_LIFETIME_HOURS` | How long a new invitation works, in hours.                                                                                                                                                                                                                                                                                                                               |
| `NOTESAPP_PENDING_ACCOUNT_HOURS`     | How long a sign-up waits for the person to open the link in its message, in hours.                                                                                                                                                                                                                                                                                       |
| `NOTESAPP_SIGNUP_DIFFICULTY`         | How hard the check of the browser is at a sign-up, from 8 to 28. Each step doubles the time that it takes.                                                                                                                                                                                                                                                               |
| `NOTESAPP_BREACH_CHECK`              | `on` checks a new password against the range service of Have I Been Pwned. `off` suits a server with no outbound network.                                                                                                                                                                                                                                                |
| `NOTESAPP_NEW_ACCOUNT_STANDING`      | `active` or `locked`, the standing that a new account starts with. Empty is `active`, so a new account uses every operation, as before. A `locked` account signs in to one screen and can only export its notes, remove itself, or open billing. The first account is always `active`.                                                                                   |
| `NOTESAPP_NEW_ACCOUNT_REMOVE_AFTER`  | How long a new `locked` account lives before the daily run removes it, as a number of days and `d`, for example `30d`. It needs `NOTESAPP_NEW_ACCOUNT_STANDING` set to `locked`. Empty sets no removal time.                                                                                                                                                             |
| `NOTESAPP_REGISTRATION_POLICY`       | Who can make an account: `invitation` or `open`. A value here wins over the accounts page, which then offers no change. The server writes it at each start. `open` needs a mail server and both legal documents in the environment too, or the server does not start. Empty leaves the choice to an administrator, who keeps the last policy that the environment named. |

## The operator API

A service of the operator, such as a billing service, can read and set the
controls of an account with one secret. With no setting, the operator API is
off and the installation sends nothing anywhere.

| Setting                        | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NOTESAPP_OPERATOR_TOKEN`      | The one secret of the operator API, of at least 32 characters with no space. A service sends it as a bearer token to the operations under `/api/operator/`. These operations answer on any host name, so a service on a private network can reach them. Set it here on a platform that mounts no file, or set the file below. Empty in both turns the operator API off, and each of its operations answers that it is off.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `NOTESAPP_OPERATOR_TOKEN_FILE` | The file that holds that secret. Use it with Compose.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `NOTESAPP_ACCOUNT_PORTAL_URL`  | The full address of the account portal of that service, with no query, for example `https://billing.example.com`. The application calls it Billing. Every account opens it from the Billing section of Settings, and a locked account opens it to unlock itself. A page or a message of the portal can send a person back to `/portal?path=<path>` of the application, for example `/portal?path=/account`. The application signs the person in first when needed, then opens that path of the portal. A path that the portal cannot take opens the root of the portal. The server adds a single-use token that works for 60 seconds, and the portal gives the token back to the operator API to learn the account. The portal needs the operator API, so set its secret too, or the server does not start. Empty shows no portal. |

## Limits of each month

The server counts, for each calendar month in UTC, the bytes that the published
pages send, the bytes that each account downloads, and each write and read
call to an S3 store. An administrator or the operator API can give one account
a published transfer limit and a download limit. The settings below are caps
for the whole installation. A count stays in the memory of the server for at
most 10 seconds, so two servers can pass a cap by the traffic of 10 seconds.
Each cap holds until the first day of the next month. With no cap and no limit
of an account, the server refuses nothing.

| Setting                                 | What it does                                                                                                                                                                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NOTESAPP_PUBLISHED_TRANSFER_CAP_BYTES` | The most bytes that all published pages send in one month. Past it, each published link shows a page that says that the link opens nothing. Empty sets no cap.                                                                                                                             |
| `NOTESAPP_DOWNLOAD_CAP_BYTES`           | The most bytes that all accounts download in one month. Past it, an export, an image and the first copy of the notes on a new device wait for the next month. The rest of the application still works. Empty sets no cap.                                                                  |
| `NOTESAPP_OBJECT_WRITE_CAP`             | The most write calls to the S3 store in one month: a write, a copy, a part of an upload and a list. Past it, an image upload and a workspace import wait for the next month. The file store of the storage directory makes no call, so this cap holds an S3 store only. Empty sets no cap. |
| `NOTESAPP_OBJECT_READ_CAP`              | The most read calls to the S3 store in one month. Past it, an image does not load, and a published page shows no image. This cap holds an S3 store only. Empty sets no cap.                                                                                                                |

## Mail

The mail server sends invitations, the links of a sign-up and the links of a
password reset. You can set it on the accounts page instead. A mail server in
the environment wins, and the page then offers no change. See
[Mail](self-hosting.md#mail).

To name it in the environment, add `docker/compose.mail.yaml` to
`COMPOSE_FILE`, then set these values. The Compose file passes them only with
that file.

| Setting                       | What it does                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `NOTESAPP_SMTP_HOST`          | The host name of the mail server, with no scheme and no port.                                        |
| `NOTESAPP_SMTP_PORT`          | The port of the mail server.                                                                         |
| `NOTESAPP_SMTP_SECURITY`      | `tls` speaks TLS from the start, `starttls` switches to TLS before the password, `none` uses no TLS. |
| `NOTESAPP_SMTP_USERNAME`      | The user name of the mail server. This file requires it, and a user name needs a password.           |
| `NOTESAPP_SMTP_PASSWORD`      | The password of the mail server. Compose reads it from the `smtp_password` file.                     |
| `NOTESAPP_SMTP_PASSWORD_FILE` | The file that holds the password. Compose sets it.                                                   |
| `NOTESAPP_MAIL_FROM`          | The sender, an address that the mail server lets you send from, with a name or without one.          |

A mail server that takes mail with no sign-in, such as a relay inside your
network, is named as one address instead, with `docker/compose.mail-url.yaml`.
Use the fields or the address, never both.

| Setting                  | What it does                                                           |
| ------------------------ | ---------------------------------------------------------------------- |
| `NOTESAPP_SMTP_URL`      | The mail server as one `smtp` or `smtps` address. It needs the sender. |
| `NOTESAPP_SMTP_URL_FILE` | The file that holds that address. Compose sets it.                     |

## Legal documents

A public installation names its terms and its privacy notice. You can write
both on the accounts page instead. Documents in the environment win, and the
page then offers no change. Name both documents or neither. Each one has a
version and one source: an address on another site, or a Markdown file that
the server shows. See [Open sign-up](self-hosting.md#open-sign-up).

| Setting                    | What it does                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `NOTESAPP_TERMS_URL`       | The address of the terms on another site.                                                                      |
| `NOTESAPP_TERMS_FILE`      | The Markdown file of the terms that the server shows. `docker/compose.legal.yaml` sets it.                     |
| `NOTESAPP_TERMS_VERSION`   | The version of the terms. A new version asks every person to accept the terms again.                           |
| `NOTESAPP_PRIVACY_URL`     | The address of the privacy notice on another site.                                                             |
| `NOTESAPP_PRIVACY_FILE`    | The Markdown file of the privacy notice that the server shows. `docker/compose.legal.yaml` sets it.            |
| `NOTESAPP_PRIVACY_VERSION` | The version of the privacy notice.                                                                             |
| `NOTESAPP_LEGAL_DIR`       | The host directory that holds `terms.md` and `privacy.md`, which `docker/compose.legal.yaml` gives the server. |

## Logs

| Setting                 | What it does                                                   |
| ----------------------- | -------------------------------------------------------------- |
| `NOTESAPP_LOG_MAX_SIZE` | The size at which Docker starts a new log file of a container. |
| `NOTESAPP_LOG_MAX_FILE` | How many log files of each container Docker keeps.             |

See [Logs](self-hosting.md#logs).

## The migration

The `migrate` command of the image applies the migrations and stops. It reads
three secrets and no setting of the server, and the `serve` command reads none
of them. See [Migrate and serve as two steps](self-hosting.md#migrate-and-serve-as-two-steps).
Each secret comes from its variable or from its file, never both. When neither
is set, the command reads the file that Compose puts in the container.

| Setting                                | What it does                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------- |
| `NOTESAPP_MIGRATION_DATABASE_URL`      | The database address of the administrator or of the migration role.                       |
| `NOTESAPP_MIGRATION_DATABASE_URL_FILE` | The file that holds that address. Empty reads `migration_database_url`.                   |
| `NOTESAPP_RUNTIME_PASSWORD`            | The password that the migration gives `notesapp_app`, of at least 12 characters.          |
| `NOTESAPP_RUNTIME_PASSWORD_FILE`       | The file that holds that password. Empty reads `runtime_database_password`.               |
| `NOTESAPP_AUTH_PASSWORD`               | The password that the migration gives `notesapp_auth`. It must differ from the other one. |
| `NOTESAPP_AUTH_PASSWORD_FILE`          | The file that holds that password. Empty reads `auth_database_password`.                  |

## Settings that the Compose file sets

Do not set these in `.env`. The Compose file and the image set them, and they
matter only when you run the server without Compose.

| Setting                           | What it does                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| `NOTESAPP_HOST`                   | The address that the server listens on inside the container.                           |
| `NOTESAPP_STORAGE_ROOT`           | The directory of the images and files of the notes inside the container.               |
| `NOTESAPP_DATABASE_URL`           | The database address of the application.                                               |
| `NOTESAPP_DATABASE_URL_FILE`      | The file that holds that address, from `runtime_database_url`.                         |
| `NOTESAPP_AUTH_DATABASE_URL`      | The database address of the sign-in service, which must differ from the address above. |
| `NOTESAPP_AUTH_DATABASE_URL_FILE` | The file that holds that address, from `auth_database_url`.                            |
| `NOTESAPP_AUTH_SECRET`            | The secret that signs the sessions, from 32 to 512 characters.                         |
| `NOTESAPP_AUTH_SECRET_FILE`       | The file that holds the secret, from `auth_secret`.                                    |

A value and its file are never set together. A server that finds both does not
start.
