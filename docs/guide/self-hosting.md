# Self-hosting

This page is for the person who runs the server. It takes you from an empty
Linux host to a tidy notebook server that runs behind HTTPS, with encrypted
storage and a first administrator account. Do the steps in order.

To try tidy notebook first, follow the [Quick start](quickstart.md). It sets up
a test installation on your own machine with one script.

tidy notebook runs as two Compose services: one application and one PostgreSQL
database. The application updates the database when it starts. It then serves
the web app, the REST API and the sign-in routes on one address. Do not
publish the database port. The database network is private.

1. [What you need](#what-you-need): the tools and the host.
2. [Get the code](#get-the-code): clone the repository.
3. [Prepare encrypted storage](#prepare-encrypted-storage): check that all
   data goes to an encrypted disk.
4. [Create the data directories](#create-the-data-directories): make the
   folders for the database and the attachments.
5. [Create the secret files](#create-the-secret-files): make the passwords and
   keys.
6. [Write the settings file](#write-the-settings-file): copy `.env.example` to
   `.env` and edit it.
7. [Start the server](#start-the-server): build and start the containers.
8. [Set up HTTPS](#set-up-https): put a TLS proxy in front.
9. [Create the first account](#create-the-first-account): make the
   administrator.

## What you need

You need a Linux host that you control, and a user that can run `sudo`.
Install these tools on the host:

- Docker Engine and Docker Compose. They run the server.
- Git. It gets the code.
- Node.js. The backup scripts run it on the host. Under `sudo`, the `PATH` of
  `sudo` must hold `node`.
- GnuPG. The backup scripts use it to encrypt the backups.
- The PostgreSQL client tools. They give the backup scripts access to the
  database when you do not use the container option.
- `lsblk`. The encrypted storage check uses it.

The versions that this code was built with are in `docker-compose.yml`,
`.node-version` and the root `package.json`. A newer compatible tool can work.
Write down the versions that you use.

For HTTPS you also need a domain name that points to the host, and open ports
80 and 443.

The database needs the `btree_gin` and `unaccent` extensions. The Compose
database image has both. A database that you run yourself needs the contrib
modules of PostgreSQL. The migrations add both extensions to the `public`
schema, and they need no superuser.

## Get the code

This command copies the code to a folder named `notesapp`. The second command
goes into that folder. Run all later commands in it.

```bash
git clone https://github.com/tidynotebook/tidynotebook.git notesapp
cd notesapp
```

The repository is private until launch. Before launch, a clone needs access
from the owner.

Compose names the containers after this folder. The backup steps use the
container name, so keep the folder name in your installation notes.

To install a fixed release, check out its tag in the clone, for example
`git checkout v1.2.3`.

## Prepare encrypted storage

Use encrypted host storage before you create the data directories. The
encryption must cover all of these:

1. PostgreSQL data and its write-ahead log (WAL).
2. The attachment data of tidy notebook.
3. Persistent temporary files.
4. Swap.
5. Core files and other crash output.
6. Local and remote backup storage.

This command checks that each path is on an encrypted disk. Replace each path
with a real path of your host. The paths are, in order: the attachments, the
database (PostgreSQL keeps its WAL inside the database directory), the
backups, the temporary files and the crash dumps. The command also checks
active swap.

```bash
tools/ops/check-host.sh \
  --storage-dir /srv/notesapp/storage \
  --db-dir /srv/notesapp/postgres \
  --backup-dir /mnt/separate-backups/notesapp \
  --temp-dir /tmp \
  --crash-dir /var/lib/systemd/coredump
```

The command prints `[OK]` for each path that it proves is encrypted. It fails
when it cannot prove that a path has an encrypted disk. Run it on the host. A
container cannot do this check.

Store the volume keys outside the data directories and outside all backups.
Use a protected key store, a TPM policy, an HSM or a key that you keep offline.
Write down how to unlock the disk. Test the unlock after a restart. To rotate
a LUKS key, add and test a new key slot before you remove the old one. When a
key is missing, never make a new key to replace it.

## Create the data directories

The database and the attachments live in folders on the host. The host check,
the backup script and the restore script all use these same paths. Create the
folders before the first start:

```bash
sudo mkdir -p /srv/notesapp/postgres /srv/notesapp/storage
sudo chown 10001:10001 /srv/notesapp/storage
```

The second command gives the attachments folder to user 10001. That is the
`notesapp` user inside the application container. The container cannot write
to a folder that belongs to another user. PostgreSQL sets the owner of its own
folder.

## Create the secret files

Compose reads seven secret files and makes none of them. A secret never goes
in `.env`. This script writes the seven files with new random passwords. It
also writes two more files that the backup scripts use.

```bash
sudo tools/ops/create-secrets.sh /etc/notesapp/secrets
```

The script makes the folder when it does not exist. Each file gets mode `0600`
and owner 10001, because the application cannot read a file that belongs to
another user. Only `root` can set that owner, so the script needs `sudo`. The
script never replaces a file that exists. This protects the passwords that
the database already holds.

These are the nine files:

| File                        | Content                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `postgres_password`         | The password of the database administrator.                                             |
| `migration_database_url`    | The database address of the administrator, with host `postgres`. The migration uses it. |
| `runtime_database_password` | The password of the restricted database role `notesapp_app`.                            |
| `auth_database_password`    | A different password, for the restricted role `notesapp_auth`.                          |
| `runtime_database_url`      | The database address of `notesapp_app`, with host `postgres`.                           |
| `auth_database_url`         | The database address of `notesapp_auth`, with host `postgres`.                          |
| `auth_secret`               | The random secret that signs the sessions.                                              |
| `backup_key`                | The passphrase that encrypts the backups. Compose does not read it.                     |
| `installation_id`           | A random ID of this installation, which each backup carries. Compose does not read it.  |

The first migration creates the two restricted roles and sets their passwords.
Never give either role the right to change the database structure.

Copy `backup_key` and `installation_id` to a safe place that is not this host,
for example a password manager. Without them, no backup of this installation
can be restored.

The mail password and the S3 keys are not in this list. You add them later,
only if you use them. [Server operations](operations.md) states how. An
administrator can also set the mail server in the application, and then it
needs no secret file.

## Write the settings file

The file `.env` holds the settings that are not secret. Copy the example file:

```bash
cp .env.example .env
```

Open `.env` in a text editor. Change these lines. `.env.example` shows an
example value for each one, and the examples match the folders of the steps
above.

- `NOTESAPP_ORIGIN`: the public address of the server, with `https://`. The
  server serves this address and refuses a request for any other host.
- `NOTESAPP_DATABASE_DIR`: the database folder.
- `NOTESAPP_STORAGE_DIR`: the attachments folder.
- `NOTESAPP_SECRETS_DIR`: the folder of the secret files.

These four values are required and have no default. `docker compose up` stops
and names the one that is missing. Keep the three folders outside the clone.
Then a copy of the clone or `git clean` cannot carry the secrets or delete the
data. A service that writes its folder as its own user also cannot leave a
folder that you cannot read.

One installation serves HTTP or HTTPS, never both, because one cookie policy
serves all its addresses. Leave `NOTESAPP_ADDITIONAL_ORIGINS` empty unless a
second address reaches this installation. Write each extra address in full,
with its port, and with the same scheme as `NOTESAPP_ORIGIN`.

Leave every other line as it is. [Configuration](configuration.md) states what
each line does. Never put a password in `.env`.

## Start the server

First check the settings. This command prints nothing when the settings are
valid. Otherwise it names the missing value.

```bash
docker compose config --quiet
```

Then build the image, start the containers in the background, and show their
state:

```bash
docker compose build
docker compose up -d
docker compose ps
```

The build takes a few minutes the first time. Compose starts the database
first. The application container then applies the database migrations with
the administrator role. After that it starts the server with the restricted
role. The application is ready when `docker compose ps` shows it as healthy.
Run `docker compose ps` again if it still shows starting.

When the application does not become healthy, read its log:

```bash
docker compose logs app
```

A failed migration stops the container. The restart policy starts it again, so
it repeats the attempt until you fix the cause. The log names the cause. A
missing secret file, storage folder or database connection also stops the
start. Both services rotate their logs, so repeated attempts cannot fill the
disk.

## Set up HTTPS

The server must run behind HTTPS. The short way is the Caddy proxy in the
Compose file. It gets a certificate for your domain on its own. To use your own
proxy instead, read
[Behind a reverse proxy](operations.md#behind-a-reverse-proxy).

1. Point the domain at this host. Check that ports 80 and 443 reach it. The
   certificate authority uses them to prove that the domain is yours.
2. Open `.env` in a text editor and set these lines:
   - `NOTESAPP_DOMAIN=notes.example.com`: your domain.
   - `NOTESAPP_ORIGIN=https://notes.example.com`: the same domain, with
     `https://`.
   - `NOTESAPP_TRUSTED_PROXIES=uniquelocal`: this names the proxy as the one
     caller that the server believes. Without it, every client behind the proxy
     shares one count in the attempt limits of the sign-in screen.
   - `NOTESAPP_TLS_DIR=/srv/notesapp/tls`: the folder where Caddy keeps the
     certificate and its private key. Put it on encrypted host storage.
3. Start the proxy with the application. This command starts the `tls`
   profile.

   ```bash
   docker compose --profile tls up -d
   docker compose --profile tls ps
   ```

4. Open your address in a browser. The setup screen shows. Continue with the
   next step.

The value `uniquelocal` covers every private address. It fits here because
the application port is open only to the host itself and to the proxy. Read the warning in
[Behind a reverse proxy](operations.md#behind-a-reverse-proxy) before you name
a range for another setup.

## Create the first account

The first account is the administrator. The setup screen is open only until
this account exists. Anyone who reaches it first can make the account, so
create it as soon as the proxy runs. Use one of these ways.

**In a browser.** Open the address from `NOTESAPP_ORIGIN`. Enter an email
address and a password.

**On the command line.** This needs no browser, and it works before HTTPS
too. Use it to close the setup screen before the server is public. Run it in
the clone folder. It asks for the password on the terminal and does not show
it.

```bash
docker compose exec app node server/dist/cli/bootstrap.js --email you@example.com
```

The command may print a Node.js warning about `localStorage` first. The
warning is harmless. Add `--name "Your name"` to set the name of the account.
The default name is Owner. Each later account needs an invitation. See
[Account commands](operations.md#account-commands).

## Next steps

The server runs. Do these things next.

- Make a backup and test a restore, before you store notes that you care
  about. See [Backup and restore](backup-and-restore.md).
- Read [Upgrade](upgrade.md) before you move to a new release.
- Set up mail, invite people, or open sign-up, in
  [Server operations](operations.md).
- Read the [Security model](security-model.md) to learn what the product
  protects and what it does not.
