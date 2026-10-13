# Server operations

This page is for the person who runs the server. It is the reference for a
running installation: the proxy, mail, sign-up, account commands, object
storage, stops, limits and logs. Use [Self-hosting](self-hosting.md) for the
installation steps and [Configuration](configuration.md) for the full list of
settings.

Run each command on this page in the clone folder, where `docker-compose.yml`
is. A line that goes into `.env` is not a command. Open `.env` in a text
editor, set the line, and then run `docker compose up -d` to apply it.

## Behind a reverse proxy

A proxy ends HTTPS and sends each request to the application. The Compose file
has a proxy that you can turn on, as [Self-hosting](self-hosting.md#set-up-https)
states. You can use your own proxy instead. Three things belong to you.

**Pass the original `Host` header.** The application answers the host name of
each address it serves and refuses every other host. Caddy and Traefik pass the
header on their own. nginx passes it when you set it.

**Name the proxy.** A proxy replaces the address of the caller with its own
address. It states the original address in a forwarded header. Any caller that
reaches the listening port can write that header. So the application believes
it only from a proxy that you name in `NOTESAPP_TRUSTED_PROXIES`. The value is
empty by default, which believes no forwarded header at all. Name an IP
address, a range in CIDR form, or one of `loopback`, `linklocal` and
`uniquelocal`. Separate two entries with a comma. The attempt limits of the
setup screen and the sign-in screen count each client only when this value
names your proxy. Without it, every client behind the proxy shares one count.

A range such as `uniquelocal` covers every private address. Name a range only
when the proxy is the one caller that reaches the listening port. Keep
`NOTESAPP_BIND_HOST` on the loopback address. Prefer the address of the proxy
itself when you know it.

**Name the listening port when your address has one.** `NOTESAPP_ORIGIN` is
the public address, and `NOTESAPP_PORT` is the port that the server listens on.
The two differ when a proxy publishes the installation on another port. A
server that starts with a port in the origin and no `NOTESAPP_PORT` stops and
names the value to set. The Compose file and the image both set it already.

The application compresses its own files and its large answers, so a proxy
does not have to. A proxy that compresses too leaves those answers as they are.
The proxy must also pass WebSocket connections. See
[Live updates](#live-updates).

### The TLS profile

The Compose file has an optional Caddy service in the `tls` profile. It ends
HTTPS, gets the certificate on its own, passes the original `Host`, and adds
the forwarded headers. `docker/Caddyfile` is its whole configuration. A normal
`docker compose up` does not start it.
[Set up HTTPS](self-hosting.md#set-up-https) states how to turn it on. These
facts complete that step.

An installation with a separate address for published pages names that host in
`NOTESAPP_PUBLISHED_DOMAIN` too. The proxy then gets a certificate for each of
the two.

With no `NOTESAPP_DOMAIN`, the proxy answers `localhost` with a certificate
that it makes itself. This serves a check on your own machine and nothing
else, because no browser trusts that certificate.

To stop the profile, name the profile, so that the proxy stops as well:

```bash
docker compose --profile tls down
```

The proxy does not read the readiness answer of the application. With one
application container a stop is short. The proxy reports a failure until the
container serves again.

### Temporary access from a local network

Compose publishes the application on `127.0.0.1` only. For temporary access
from a trusted local network, publish it on all interfaces and use the
local-network address as the origin. Open `.env` in a text editor and set these
lines:

- `NOTESAPP_BIND_HOST=0.0.0.0`
- `NOTESAPP_ORIGIN=http://192.0.2.10:3000`

Replace the example address with the address of your host. Run only one
application listener on port 3000. The core functions, such as notes, attachments and
Save, work on plain HTTP. Some browser functions can be missing on plain HTTP,
for example the install of the service worker and the clipboard. Use
HTTPS for a permanent installation and for full offline behavior. One
installation serves HTTP or HTTPS, never both.

## Mail

A mail server sends invitations, the links of a sign-up, and the links of a
password reset. Without one, an invitation shows its link once, a person cannot
reset a password alone, and nobody can sign up without an invitation.

The easy way is the application. Open **Settings**, select **Manage accounts**,
and enter the values of your mail provider under **Mail**. Select **Save**,
then **Send a test message**. [Accounts and invitations](accounts.md#mail)
states each step. The server keeps the password sealed with a key that it
derives from `NOTESAPP_AUTH_SECRET`. When you change that secret, enter the
mail password again.

### Set the mail server in the environment

Use this way when you want the settings in files. The environment then wins,
and the accounts page shows the mail server and offers no change.

1. Open `.env` in a text editor and set these lines, as your mail provider
   gives them. Write each value as it is. Do not encode a character such as `@`
   or `:`.
   - `NOTESAPP_SMTP_HOST`: the host of the mail server, for example
     `smtp.example.com`.
   - `NOTESAPP_SMTP_PORT`: the port, usually `465` or `587`.
   - `NOTESAPP_SMTP_SECURITY`: `tls` for a port that starts with TLS, usually
     `465`. `starttls` for a port that upgrades the connection, usually `587`.
   - `NOTESAPP_SMTP_USERNAME`: the user name that signs in.
   - `NOTESAPP_MAIL_FROM`: the sender, for example
     `tidy notebook <no-reply@notes.example.com>`.
2. In the same file, add `docker/compose.mail.yaml` to the `COMPOSE_FILE` line,
   as `.env.example` shows.
3. Write the mail password to a file named `smtp_password` in your secrets
   folder. Use a text editor that you start with `sudo`. Then set the owner
   and the mode of the file. The application cannot read a file that belongs to
   another user.

   ```bash
   sudo chown 10001:10001 /etc/notesapp/secrets/smtp_password
   sudo chmod 600 /etc/notesapp/secrets/smtp_password
   ```

4. Start again with `docker compose up -d`.
5. Open **Settings**, select **Manage accounts**, and select
   **Send a test message** under **Mail**. A wrong value shows here, before a
   person waits for a link.

The server does not start when a value is missing or not valid. The message
names the value and never shows the password.

A mail relay with no sign-in has no user name and no password. Use one SMTP
address for it, for example `smtp://relay.internal:25`. Write the address to a
file named `smtp_url` in your secrets folder, and set its owner and mode as
above. Use `docker/compose.mail-url.yaml` in place of
`docker/compose.mail.yaml`. In the address, encode each reserved character of
the user name and the password, for example `@` as `%40`. Set the address or
the separate values, never both. The server does not start when it gets both.

### Make mail reach the inbox

A mailbox provider refuses or hides a message that the domain of the sender
does not vouch for. Before you open sign-up, publish these three records for
that domain, with the values that your mail provider gives:

- An SPF record that names the servers of the provider.
- A DKIM key, so that each message carries a signature of the domain.
- A DMARC policy, for example `p=quarantine`, so that a message that forges the
  domain goes nowhere.

Then select **Send a test message**, or invite an address of your own at a
large mailbox provider. Check that the message arrives in the inbox and not in
spam. Each message is plain text. It names the product and the host of the
installation. It states that a program wrote it, so a vacation responder does
not answer it.

## Open sign-up

By default, a person needs an invitation. An installation lets anybody sign up
only when it has a mail server and both legal documents. The accounts page
names each part that is missing. [Accounts and invitations](accounts.md#who-can-make-an-account)
states what the person sees. Do these steps in order.

1. **Mail.** Set up the mail server and the three domain records, as
   [Mail](#mail) states.
2. **Published pages.** This step is optional. Without it, published pages show
   on the address of the application. To show them on a second host name, for
   example `pages.example.net`, point that name at this server. In `.env`, set
   `NOTESAPP_PUBLISHED_ORIGIN` to the address of that host name, with the
   scheme of `NOTESAPP_ORIGIN`. Use a host name that no other address uses. That
   address serves published pages and nothing else, and it sets no cookie. When
   a browser blocks a harmful page that a stranger published, the block stays
   on that address and does not block the application. With the `tls` profile,
   also set `NOTESAPP_PUBLISHED_DOMAIN` to the host name, so that the proxy gets
   a certificate for it.
3. **Legal documents.** Add the terms and the privacy notice on the accounts
   page, as [Accounts and invitations](accounts.md#legal-documents) states.
   Fill each blank of the template with the facts of your service: who runs it,
   the address to write to, the law that applies, and how long you keep backups
   and logs. Have a person who knows the law of your country read both. The
   server shows the texts at `/legal/terms` and `/legal/privacy`. Each account
   stores the versions that it accepted and when. When a version changes, each
   person accepts it again before the application opens. An installation with
   no documents asks for nothing.
4. **The proxy.** Name the proxy in `NOTESAPP_TRUSTED_PROXIES`, so that the
   attempt limits of sign-up and sign-in count each client on its own.
5. **Backups.** Check that the backup runs and that a restore works. See
   [Backup and restore](backup-and-restore.md).
6. **Turn it on.** Sign in as an administrator, open **Settings**, select
   **Manage accounts**, and select **Let anybody sign up**.

Then sign up yourself with a new address from a private window, open the link,
and sign in. Select **Forgot password** once, and check that the reset works.

### Keep the legal documents in files

You can name both documents in the environment instead of the accounts page.
The environment then wins, and the accounts page shows the documents and offers
no change. Name both documents or neither. Each document has a version and one
source: an address on another site, or a Markdown file that the server shows
itself.

To use files, do these steps:

1. Copy each template from the accounts page to `terms.md` and `privacy.md` in
   a folder outside the clone.
2. Fill each blank. The server refuses to start while a file still holds a
   blank.
3. Open `.env` in a text editor and set these lines. The version can be the
   date.
   - `NOTESAPP_LEGAL_DIR`: the folder of the two files.
   - `NOTESAPP_TERMS_VERSION`: the version of the terms.
   - `NOTESAPP_PRIVACY_VERSION`: the version of the privacy notice.
4. In the same file, add `docker/compose.legal.yaml` to the `COMPOSE_FILE`
   line.

For an address on another site, set `NOTESAPP_TERMS_URL` and
`NOTESAPP_PRIVACY_URL` instead of the folder. A change to a file with the same
version reaches a person at the next start and asks nobody again. This suits a
fixed typo. A new version asks every person again. The settings are in
[Configuration](configuration.md#legal-documents).

To turn on open sign-up from the environment, set `NOTESAPP_REGISTRATION_POLICY`
to `open`. The mail server and both documents must then be in the environment
too.

## Account commands

An administrator invites people in the application. See
[Accounts and invitations](accounts.md#invitations). The commands below do the
same work from the server. Each one runs inside the application container.
Run them in the clone folder.

Each command can first print a Node.js warning about `localStorage`. The
warning is harmless.

### Invite a person

This command makes an invitation for one address. With a mail server, the
server mails the link to the address. Without one, the command prints the link
once. Send it to the person yourself.

```bash
docker compose exec app node server/dist/cli/invite-account.js --email person@example.com
```

### Make an account an administrator

Use this command when no administrator can sign in any more. It makes the
account an administrator and enables it.

```bash
docker compose exec app node server/dist/cli/promote-account.js --email person@example.com
```

### Set a new password

Use this command when a person lost the password and cannot reset it by mail.
It asks for a new password twice, and does not show it. It then signs the
account out everywhere.

```bash
docker compose exec app node server/dist/cli/recover-account.js --email person@example.com
```

### Make the first account without a browser

The setup steps in [Self-hosting](self-hosting.md#create-the-first-account)
use this command. It fails when an account exists already. It asks for the
password on the terminal.

```bash
docker compose exec app node server/dist/cli/bootstrap.js --email you@example.com
```

Add `--name "Your name"` to set the name of the account. The default is Owner.

### Account settings

Open `.env` in a text editor to change these optional lines.
[Configuration](configuration.md#accounts) states each one.

- `NOTESAPP_ACCOUNT_LIMIT_BYTES`: the storage limit of a new account. An
  administrator changes the limit of one account in the application.
- `NOTESAPP_INVITATION_LIFETIME_HOURS`: how long a new invitation works.
- `NOTESAPP_PENDING_ACCOUNT_HOURS`: how long a sign-up waits for the person to
  open the link in its message. After that the server removes the sign-up.
- `NOTESAPP_SIGNUP_DIFFICULTY`: how hard the check of the browser is at a
  sign-up, from 8 to 28. Each step doubles the time that the browser takes. The
  check runs in the browser and sends nothing to another service.

### Proved address

A sign-in needs a proved address. The first account and an invited account
prove their address when they are made. So an installation that upgrades keeps
every account. When anybody can sign up, the server sends a link to the
address, and the account exists only after the person opens it.

### Password breach check

The server checks a new password against the range service of Have I Been
Pwned. It sends five characters of a digest of the password and never the
password. When the service does not answer, the server accepts the password and
writes a log event. Set `NOTESAPP_BREACH_CHECK` to `off` in `.env` for an
installation with no outbound network.

## Object storage

By default, the server keeps the images of the notes, an upload that waits for
its note, and an import that arrives in parts in the storage folder. One server
needs nothing more.

You can keep them in an S3 compatible store instead, such as Cloudflare R2,
MinIO or AWS S3. Use a store when more than one server runs the same
installation, because each server must read what another server wrote. The
object keys of the images are the paths in the storage folder, so you can move
an installation between the two by copying the files.

To use a store:

1. Make a bucket, and a key pair that can read, write, list and delete in it.
   Do not make the bucket public. The server sends each image itself, so it
   gives no address of the store to a browser.
2. Write the access key ID to a file named `s3_access_key_id`, and the secret
   access key to a file named `s3_secret_access_key`, in your secrets folder.
   Use a text editor that you start with `sudo`. Then set the owner and the
   mode of both files:

   ```bash
   sudo chown 10001:10001 /etc/notesapp/secrets/s3_access_key_id /etc/notesapp/secrets/s3_secret_access_key
   sudo chmod 600 /etc/notesapp/secrets/s3_access_key_id /etc/notesapp/secrets/s3_secret_access_key
   ```

3. Open `.env` in a text editor and set `NOTESAPP_S3_BUCKET` and
   `NOTESAPP_S3_REGION`. For R2 or MinIO, also set `NOTESAPP_S3_ENDPOINT`. R2
   takes the region `auto`.
4. In the same file, add `docker/compose.s3.yaml` to the `COMPOSE_FILE` line.
5. Start again with `docker compose up -d`.

The settings are in [Configuration](configuration.md#object-storage). The
server still needs the storage folder, because it checks each upload and each
import there for the time of one request. The readiness check reports
`storage` as degraded when the store does not answer, or when it does not take
a write. To check the write, each server writes and removes one small object
under `probe/` at most once in ten minutes.

Each day, the server removes an upload that nobody finished and an import that
nobody completed, when they are older than one day. Also add a lifecycle rule
to the bucket that aborts an incomplete multipart upload after one day. The
rule removes an upload that the server can no longer find, for example after a
stop in the middle of a start. R2, MinIO and AWS each have such a rule.

The backup script copies the storage folder and not a bucket. Back up the
bucket with the tools of the store. See
[Backup and restore](backup-and-restore.md).

## Migrate and serve as two steps

The entry point of the image takes one optional command. With no command, it
applies the migrations and then serves. A Compose installation needs no
command, and nothing changes for it.

A platform that runs more than one copy of the application can do the two
steps apart. Then only the migration step holds the migration secret.

- `migrate` applies the migrations with the migration role, and then the
  container stops. It reads `migration_database_url`,
  `runtime_database_password` and `auth_database_password`.
- `serve` starts the server with the restricted runtime role. It reads no
  migration setting, so a serving container needs no migration secret.

A platform that mounts no file, such as a platform that gives a service
variables only, sets each secret in a variable instead. `migrate` then reads
`NOTESAPP_MIGRATION_DATABASE_URL`, `NOTESAPP_RUNTIME_PASSWORD` and
`NOTESAPP_AUTH_PASSWORD`. `serve` reads `NOTESAPP_DATABASE_URL`,
`NOTESAPP_AUTH_DATABASE_URL`, `NOTESAPP_AUTH_SECRET`, and the other secrets that
you use. Each secret has a variable and a file. Set one of the two, never
both. [Configuration](configuration.md#the-migration) names each one.

Run `migrate` once for each new version. Do not run it in each serving
container. A serving container that starts before the migrations are complete
does not report ready, so the platform sends it no traffic. It reports ready
when the migrations are complete, with no restart.

Give the command after the path of the entry point. On a platform, set it as
the start command of the service, for example `/app/entrypoint.sh serve`. With
Compose, run the migration step like this:

```sh
docker compose run --rm app /app/entrypoint.sh migrate
```

## Health and readiness

`GET /health` reports that the process is alive. `GET /ready` checks the
configuration, the database connection, the storage access and the version of
the database schema. The container health check uses `/ready`. A failed
migration keeps the application not ready. To read the answer yourself, run
this command. It prints a short answer that starts with `{"status":"ok"` when
the server is ready.

```bash
curl http://127.0.0.1:3000/ready
```

`/api/health` and `/api/ready` give the same answers. The application itself
uses these two addresses.

The server answers the host name of each address it serves. A request that
names another host is refused. Your reverse proxy must pass the original `Host`
header to the application. See [Behind a reverse proxy](#behind-a-reverse-proxy).

The four health and readiness addresses answer any host, because a platform
such as Railway checks a container with a host name of its own. Their answers
hold no address and set no cookie.

## Stopping the server

`docker compose stop` and `docker compose down` send a stop signal to the
application. The server does not stop at once. It first reports that it is not
ready, so the reverse proxy in front of it sends new requests elsewhere. It
then closes its listener, completes the requests that are open, and closes its
database connections. A deadline ends the process when one request does not
complete, so a stop always finishes.

`NOTESAPP_SHUTDOWN_GRACE_MS` is the time between the report and the close of
the listener. Make it longer than the interval at which your proxy reads
readiness. Set it to 0 when no proxy is in front of the server.
`NOTESAPP_SHUTDOWN_DEADLINE_MS` is the whole time from the signal to a forced
end. `.env.example` holds both values.

A second stop signal changes nothing, because the server is already stopping.
The container health check accepts the readiness answer of a server that
stops, so a normal stop does not mark the container unhealthy. The Compose file
gives the container more time than the deadline, so Docker never ends a stop
that still runs.

## Uploads and imports

### Timing of requests and uploads

`NOTESAPP_REQUEST_TIMEOUT_MS` is the time that a whole request has to arrive.
It covers the body of an image upload. A large image over a slow link needs a
value well above a few seconds. Keep the default unless you know the speed of
every link that reaches the server.

`NOTESAPP_UPLOAD_IDLE_TIMEOUT_MS` is the longest gap between two parts of an
upload body. The server refuses an upload that stops for longer than this gap.
The person reads a message that asks for the image again. A large image that
keeps arriving is not refused, because this value measures the gap. It must be
shorter than `NOTESAPP_REQUEST_TIMEOUT_MS`. The server refuses to start when it
is not, and it names both values. `.env.example` holds both.

### Imports and exports

An import takes a zip file of up to 4 GiB. The browser sends it in parts of
50 MiB. So a proxy that refuses a large request body does not stop it. Each
part must arrive within `NOTESAPP_REQUEST_TIMEOUT_MS`. The parts wait in the
object store until the last one arrives.

One account has one open import. A new import removes an earlier one that did
not end. An import that fails removes its parts at once.

With the storage folder as the object store, the free space of the storage
volume matters:

- The server refuses a part when the free space, less 512 MiB, cannot hold it.
- While an import runs, the server keeps its zip file on the storage volume.
  It removes the file when the import ends.
- The server refuses an import when the free space, less 512 MiB and less the
  zip files of the imports that run now, cannot hold it.

An export writes no file on the server. It streams the zip file as it reads the
notes.

One account runs one import or export at a time. The server runs two at a time
for all accounts. A person who starts another one reads that the server is
busy, and tries again a minute later.

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

To read the log of the application, run this command:

```bash
docker compose logs app
```

Each request log holds the request ID, the method, the address with secrets
removed, the status and the duration. It holds no header, cookie, credential,
request body, note text, search text or query value.

Both Compose services use the `json-file` driver with rotation.
`NOTESAPP_LOG_MAX_SIZE` and `NOTESAPP_LOG_MAX_FILE` in `.env` set the size of
one file and the number of files that are kept.

This release serves no metrics route. Watch the readiness result, the
container log, and the age of the newest backup archive.
