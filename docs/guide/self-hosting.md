# Self-hosting

This page is for the person who runs the server. It is the production
installation guide.

For the shortest path from a clone to the setup screen, read
[Quick start](quickstart.md). When the installation runs, read
[Backup and restore](backup-and-restore.md), [Upgrade](upgrade.md), and the
[Security model](security-model.md).

NotesApp runs as one application service and one PostgreSQL service. The
application container applies the database migrations and then serves the web
app, the REST API, and the authentication routes on one origin.

Put an HTTPS reverse proxy in front of `127.0.0.1:3000`. The Compose file
carries an optional profile that starts one for you. Read
[Behind a reverse proxy](#behind-a-reverse-proxy) below. Do not publish the
PostgreSQL port. The Compose database network is private. The application uses
a second network for optional SMTP and other required outbound traffic.

The Compose file publishes the application on `127.0.0.1` only. For temporary
access from a trusted local network, publish it on all interfaces and use the
local-network URL as the origin:

```bash
NOTESAPP_BIND_HOST=0.0.0.0
NOTESAPP_ORIGIN=http://192.0.2.10:3000
```

Replace the documentation address with the host address. Run only one
application listener on port 3000. The core workspace, identifier, digest, and
save paths work when a plain HTTP browser does not provide secure-context APIs.
Some optional browser functions, such as service worker installation and the
asynchronous clipboard, can still be unavailable on plain HTTP. Use HTTPS for
a permanent deployment and for full offline installation behavior.

## Behind a reverse proxy

A proxy terminates HTTPS and sends each request to the application. Three
things belong to you.

**Pass the original `Host` header.** The application answers the host name of
each origin it serves and refuses every other host. Caddy and Traefik pass the
header on their own. nginx passes it when you set it.

**Name the proxy.** A proxy replaces the address of the caller with its own,
and it states the original address in a forwarded header. Any caller that
reaches the listening port can write that header, so the application believes
it only from a proxy that you name in `NOTESAPP_TRUSTED_PROXIES`. The value is
empty by default, which believes no forwarded header at all. Name an IP
address, a range in CIDR form, or one of `loopback`, `linklocal` and
`uniquelocal`, and separate two entries with a comma. The attempt limits of the
setup screen and the sign-in screen count each client only when this value
names your proxy. Without it every client behind the proxy shares one count.

A range such as `uniquelocal` covers every private address, so name a range
only when the proxy is the one caller that reaches the listening port. Keep
`NOTESAPP_BIND_HOST` on the loopback address, and prefer the address of the
proxy itself when you know it.

**Name the listening port when your origin carries one.** `NOTESAPP_ORIGIN` is
the public address, and `NOTESAPP_PORT` is the port that the server listens on.
The two are different addresses when a proxy publishes the installation on
another port. A server that starts with a port in the origin and no
`NOTESAPP_PORT` stops and names the value to set. The Compose file and the
image both set it already.

### The TLS profile

The Compose file holds an optional Caddy service in the `tls` profile. It
terminates HTTPS, gets the certificate on its own, passes the original `Host`,
and adds the forwarded headers. `docker/Caddyfile` is its whole configuration.
A default `docker compose up` does not start it.

Name the domain and the trusted proxy in `.env`, then start the profile:

```bash
NOTESAPP_DOMAIN=notes.example.com
NOTESAPP_ORIGIN=https://notes.example.com
NOTESAPP_TRUSTED_PROXIES=uniquelocal
NOTESAPP_TLS_DIR=/srv/notesapp/tls
```

```bash
docker compose --profile tls up -d
docker compose --profile tls ps
```

The domain must resolve to this host, and ports 80 and 443 must reach it, so
that the certificate authority can answer the challenge. Caddy writes the
certificate and its private key under `NOTESAPP_TLS_DIR`, so put that directory
on encrypted host storage with the other data directories.

An installation with a separate address for published pages names that host
in `NOTESAPP_PUBLISHED_DOMAIN` too, and the proxy gets a certificate for each
of the two.

With no `NOTESAPP_DOMAIN` the proxy answers `localhost` with a certificate that
it makes itself. That serves a check on your own machine and nothing else,
because no browser trusts that certificate.

Stop the profile with the profile name, so that the proxy stops as well:

```bash
docker compose --profile tls down
```

The proxy does not read the readiness answer of the application. With one
application container a stop is short, and the proxy reports a failure until
the container serves again.

## Host requirements

Install Docker Engine, Docker Compose, GnuPG, the PostgreSQL client tools, and
`lsblk`. The versions this installation was built against are in
`docker-compose.yml`, `.node-version`, and the root `package.json`. A newer
compatible host tool can work. Record the version you used in your own
installation record.

Use encrypted host storage before you create the data directories. The
encryption boundary must include:

1. PostgreSQL data and WAL.
2. NotesApp attachment data.
3. Persistent temporary files.
4. Swap.
5. Core files and other crash output.
6. Local and remote backup storage.

Run the host check with the real host paths:

```bash
./tools/ops/check-host.sh \
  --storage-dir /srv/notesapp/storage \
  --db-dir /srv/notesapp/postgres \
  --wal-dir /srv/notesapp/postgres-wal \
  --backup-dir /mnt/separate-backups/notesapp \
  --temp-dir /srv/notesapp/tmp \
  --crash-dir /var/lib/systemd/coredump
```

The command fails if it cannot prove that a target has an encrypted block-device parent. It also checks active swap and the configured core-dump target. A container cannot perform this host check reliably.

Store volume keys outside the data directories and outside all data backups. Use a protected key store, TPM policy, HSM, or an operator-held offline key. Record the unlock procedure. Test it after a restart. For LUKS rotation, add and test a new key slot before you remove the old key slot. Never generate an automatic replacement key when an existing key is missing.

## Data directories

Both services bind-mount host directories, so the host check, the backup
script, and the restore script all name the same paths. Create them before the
first start:

```bash
sudo mkdir -p /srv/notesapp/postgres /srv/notesapp/storage
sudo chown 10001:10001 /srv/notesapp/storage
```

The storage directory must belong to uid 10001, which is the `notesapp` user of
the image. PostgreSQL sets the owner of its own directory. Name both paths in
`.env` with `NOTESAPP_DATABASE_DIR` and `NOTESAPP_STORAGE_DIR`. Both are
required and neither has a default.

## Protected configuration

Copy `.env.example` to `.env`. The `.env` file contains only nonsecret
settings. Set `NOTESAPP_ORIGIN` to the public HTTPS origin. This value is
required and has no default: `docker compose up` stops with a message that
names it when it is not set. Leave `NOTESAPP_ADDITIONAL_ORIGINS` empty unless a
second address reaches this installation. Write each additional origin in full,
with its scheme and its port, and use the scheme of `NOTESAPP_ORIGIN` for each
one. One installation serves HTTP or HTTPS, not both, because one cookie policy
serves all of its origins. An empty list serves `NOTESAPP_ORIGIN` and nothing
else.

A public installation shows published pages on an origin of their own. Set
`NOTESAPP_PUBLISHED_ORIGIN` to that origin, for example
`https://pages.example.net`, and point that host name at the same server. Use
a host name that no other origin uses, and the scheme of `NOTESAPP_ORIGIN`. The
published origin serves published pages and nothing else, and it sets no
cookie, so a harmful page cannot reach an account. A browser block of one page
then does not block the application. An empty value shows published pages on
`NOTESAPP_ORIGIN`.

Set `NOTESAPP_SECRETS_DIR` and create the directory it names. This value is
required and has no default, as `NOTESAPP_DATABASE_DIR` and
`NOTESAPP_STORAGE_DIR` are: `docker compose up` stops with a message that
names the one that is missing. Keep all three outside the repository, so that
a checkout, a copy, or a `git clean` cannot carry the secrets or delete the
data, and so that a service that writes its tree as its own user cannot leave
a directory that you cannot read. `.env.example` already names
`/etc/notesapp/secrets`.

Create these files with mode `0600` and owner uid 10001, which is
the `notesapp` user of the image. The application runs as that user and cannot
read a file that belongs to another owner:

| File                        | Content                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `postgres_password`         | Password for the initial PostgreSQL administrator.                            |
| `migration_database_url`    | PostgreSQL URL for the administrator or migration role, with host `postgres`. |
| `runtime_database_password` | A unique password of at least 12 characters for `notesapp_app`.               |
| `auth_database_password`    | A different password of at least 12 characters for `notesapp_auth`.           |
| `runtime_database_url`      | URL for `notesapp_app`, with host `postgres`.                                 |
| `auth_database_url`         | URL for `notesapp_auth`, with host `postgres`.                                |
| `auth_secret`               | A random session-signing secret of at least 32 characters.                    |

Set the owner and the mode after you write the files:

```bash
sudo chown 10001:10001 /etc/notesapp/secrets/*
sudo chmod 600 /etc/notesapp/secrets/*
```

The migration URL can use the initial PostgreSQL administrator for the first installation. The migration creates the restricted application roles and sets their passwords. Do not give either application role migration rights.

An administrator can set the mail server in the application, so it needs no
secret file. When you set it in the environment instead, its SMTP URL is a
secret too. `docker/compose.mail.yaml` adds it, and [Mail](#mail) states how.
Do not put credentials in `.env`, process arguments, logs, or Git.

Validate and start the installation:

```bash
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
```

Compose waits for PostgreSQL. The application container then runs its entry
point, which applies the migrations with the migration role and starts the
server with the restricted runtime role.

When a migration fails, the entry point exits with a nonzero status and the
container stops. The `unless-stopped` restart policy starts it again, so the
container repeats the attempt until the cause is fixed. Read
`docker compose logs app` for the failure, fix the cause, and the next attempt
completes. Both services rotate their container logs, so a repeated attempt
cannot fill the disk. Startup also fails when a required secret file, storage
mount, or database connection is not usable.

Open the web application after the first startup. Enter the email address and
password of the first account, which is the administrator. The setup operation
is available only until this account exists. Use `pnpm owner:bootstrap` only
when an unattended installation must create the same first account before a
browser opens.

## Accounts and invitations

Every later account needs an invitation. An administrator invites a person in
the application, as [Accounts and invitations](accounts.md) states. You can
also invite a person from the server:

```sh
pnpm account:invite --email person@example.com
```

With a mail server, the link goes to the address. Without one, the command
prints the link once. Send it to the person yourself.

When no administrator can sign in any more, make an account an administrator
again. The command also enables the account:

```sh
pnpm account:promote --email person@example.com
```

These optional settings of `.env` apply to accounts.
`NOTESAPP_ACCOUNT_LIMIT_BYTES` is the storage limit, in bytes, that a new
account starts with. An administrator changes the limit of one account in the
application. `NOTESAPP_INVITATION_LIFETIME_HOURS` is how long a new invitation
works. `NOTESAPP_PENDING_ACCOUNT_HOURS` is how long a sign-up waits for the
person to open the link in its message. After that the server removes the
sign-up. `NOTESAPP_SIGNUP_DIFFICULTY` sets how hard the check of the browser is
at a sign-up, from 8 to 28. Each step doubles the time that the browser takes.
The check runs in the browser and sends nothing to another service.

A public service names its terms and its privacy notice. An administrator
writes both in the application, from a template, as
[Accounts and invitations](accounts.md#terms-and-privacy-notice) states. Each
account stores the versions that it accepted and when. When a version changes,
each person accepts it again before the application opens. An installation
with no documents asks for nothing.

You can name both documents in the environment instead. The environment then
wins, and the accounts page shows the documents and offers no change. Each
document has a version, `NOTESAPP_TERMS_VERSION` and
`NOTESAPP_PRIVACY_VERSION`, and one source: an address on another site,
`NOTESAPP_TERMS_URL` and `NOTESAPP_PRIVACY_URL`, or a Markdown file that the
server shows itself, as [Open sign-up](#open-sign-up) states. Name both
documents or neither. A change of a file with the same version reaches a
person at the next start and asks nobody again, which suits a fixed typo.

A sign-in needs a proved address. The first account and an invited account
prove their address when they are made, so an installation that upgrades keeps
every account. When anybody can sign up, the server sends a link to the
address, and the account exists only after the person opens it.

A new password is checked against the range service of Have I Been Pwned. The
server sends five characters of a digest of the password and never the
password. When the service does not answer, the server accepts the password and
writes a log event. Set `NOTESAPP_BREACH_CHECK` to `off` in `.env` for an
installation with no outbound network.

## Mail

A mail server sends invitations, the links of a sign-up, and the links of a
password reset. Without one, an invitation shows its link once, a person
cannot reset a password alone, and nobody can sign up without an invitation.

Set it up in the application: open **Settings**, select **Manage accounts**,
and enter the values of your mail provider under **Mail**. Select **Save**,
then **Send a test message**, as
[Accounts and invitations](accounts.md#mail) states. The server keeps the
password sealed with a key that it derives from `NOTESAPP_AUTH_SECRET`. When
you change that secret, enter the mail password again.

To set the mail server in the environment instead, do these steps. The
environment then wins, and the accounts page shows the server and offers no
change.

1. Write the SMTP URL of your mail provider, for example
   `smtps://user:password@smtp.example.com:465`, to the file `smtp_url` in
   `NOTESAPP_SECRETS_DIR`, with mode `0600` and owner uid 10001.
2. Set `NOTESAPP_MAIL_FROM` in `.env` to the sender, for example
   `NotesApp <no-reply@notes.example.com>`.
3. Add the override file to `COMPOSE_FILE` in `.env`, as `.env.example`
   shows, and start again.

A mailbox provider refuses or hides a message that the domain of the sender
does not vouch for. Before you open sign-up, publish these three records for
that domain, with the values that your mail provider gives:

- An SPF record that names the servers of the provider.
- A DKIM key, so that each message carries a signature of the domain.
- A DMARC policy, for example `p=quarantine`, so that a message that forges
  the domain goes nowhere.

Then select **Send a test message**, or send an invitation to an address of
your own at a large mailbox provider, and check that it arrives in the inbox
and not in spam. Each message is plain
text. It names the product and the host of the installation, and it states that
a program wrote it, so a vacation responder does not answer it.

## Open sign-up

An installation lets anybody sign up only when it has a mail server, a
separate address for published pages, and both legal documents. The accounts
page names each part that is missing. Do these steps in order.

1. **Mail.** Set up the mail server and the three domain records, as
   [Mail](#mail) states.
2. **Published pages.** Point a second host name at this server, for example
   `pages.example.net`, and set `NOTESAPP_PUBLISHED_ORIGIN` to it. With the
   `tls` profile, also set `NOTESAPP_PUBLISHED_DOMAIN` to that host name, so
   that the proxy gets a certificate for it.
3. **Legal documents.** Add the terms and the privacy notice on the accounts
   page, as [Accounts and invitations](accounts.md#terms-and-privacy-notice)
   states. Fill each blank of the template with the facts of your service:
   who runs it, the address to write to, the law that applies, and how long
   you keep backups and logs. Have a person who knows the law of your country
   read both. The server shows a text at `/legal/terms` and `/legal/privacy`.

   To keep the documents in files instead, copy each template from that page
   to `terms.md` and `privacy.md` in a directory outside this checkout, and
   name it in `NOTESAPP_LEGAL_DIR`. Fill each blank, set
   `NOTESAPP_TERMS_VERSION` and `NOTESAPP_PRIVACY_VERSION`, for example to the
   date, and add `docker/compose.legal.yaml` to `COMPOSE_FILE`. The server
   refuses to start while a file still holds a blank.

4. **The proxy.** Name the proxy in `NOTESAPP_TRUSTED_PROXIES`, so that the
   attempt limits of sign-up and sign-in count each client on its own.
5. **Backups.** Check that the backup runs, and that a restore works. See
   [Backup and restore](backup-and-restore.md).
6. **Turn it on.** Sign in as an administrator, open **Settings**, select
   **Manage accounts**, and select **Let anybody sign up**.

Then sign up yourself with a new address from a private window, open the link,
and sign in. Select **Forgot password** once, and check that the reset works.

## Health and readiness

`GET /health` reports process liveness. `GET /ready` checks configuration, database connectivity, storage access, and the required database schema version. The container health check uses readiness. A failed migration keeps the application unready.

The application uses `/api/health` and `/api/ready`. The two addresses of
each answer are one operation of the contract, so they always report the same
result.

The deployment answers the host name of each origin it serves, so the container
health check sends the host name of the origin. A request that names another
host is refused. Your reverse proxy must pass the original `Host` header to the
application. See [Behind a reverse proxy](#behind-a-reverse-proxy).

## Stopping the server

`docker compose stop` and `docker compose down` send a stop signal to the
application. The server does not stop at once. It first reports that it is not
ready, so the reverse proxy in front of it sends new requests elsewhere. It then
closes its listener, completes the requests that are already open, and closes
its database connections. A deadline ends the process when one request does not
complete, so a stop always finishes.

`NOTESAPP_SHUTDOWN_GRACE_MS` is the time between the report and the close of the
listener. Make it longer than the interval at which your proxy reads readiness.
Set it to 0 when no proxy is in front of the server.
`NOTESAPP_SHUTDOWN_DEADLINE_MS` is the whole time from the signal to a forced
end. `.env.example` holds both values.

A second stop signal changes nothing, because the server is already stopping.
The container health check accepts the readiness answer of a server that stops,
so a normal stop does not mark the container unhealthy. The Compose file gives
the container more time than the deadline, so Docker never ends a stop that
still runs.

## Request and upload timing

`NOTESAPP_REQUEST_TIMEOUT_MS` is the time that a whole request has to arrive. It
covers the body of an image upload, so a large image over a slow link needs a
value well above a few seconds. Keep the default unless you know the speed of
every link that reaches the server.

`NOTESAPP_UPLOAD_IDLE_TIMEOUT_MS` is the longest gap between two parts of an
upload body. An upload that stops for longer than this gap is refused, and the
person reads a message that asks for the image again. A large image that keeps
arriving is not refused, because the gap is what this value measures. It must be
shorter than `NOTESAPP_REQUEST_TIMEOUT_MS`. The server refuses to start when it
is not, and it names both values. `.env.example` holds both.

## Live updates

Each browser holds one WebSocket connection to the server. When another device
saves a change, the server sends a short notice on that connection, and the
browser reads the change in less than a second. A notice holds no note text.
The browser reads the change itself over HTTP, so a missed notice costs time
and never data. This needs no setting.

The proxy in front of the server must pass a WebSocket upgrade on the address
`/api/sync/notices` and keep the connection open. The Caddy service of the
`tls` profile does this with no change. For nginx, pass the `Upgrade` and
`Connection` headers and set a read timeout above one minute.

A browser that cannot hold the connection, for example behind a proxy that
refuses the upgrade, reads the changes on its own schedule, about every 15
seconds. No saved or queued work depends on the connection.

## Logs

Structured request logs contain the request ID, method, redacted URL, status, and duration. They do not contain headers, cookies, credentials, request bodies, note text, search text, or query values.

Both Compose services use the `json-file` driver with rotation.
`NOTESAPP_LOG_MAX_SIZE` and `NOTESAPP_LOG_MAX_FILE` in `.env` set the size of
one file and the number of files that are kept.

This release serves no metrics route. Watch the readiness result, the container
log, and the age of the newest backup archive.
