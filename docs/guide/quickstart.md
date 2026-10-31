# Quick start

This page is for the person who runs the server.

Run the stable release on your own machine with Docker Compose. You do not
need a GitHub account, a registry login, Node.js, or a source build.

This is a test installation. It keeps data inside the clone and serves only
your own machine. Use [Self-hosting](self-hosting.md) before you store data
that you need to keep.

## What you need

- Docker Engine and Docker Compose with support for `up --wait`.
  Check that `docker compose up --help` lists `--wait`. Update Compose if it
  does not.
- Git, Bash, `curl`, `jq`, `openssl`, and `sudo`.
- A new clone. The setup script refuses an existing `.env` file.
- A Linux `amd64` or `arm64` host. On macOS, use Docker with Linux
  containers. On Windows, use WSL2 with Docker Linux containers and the shell
  tools above. See [Supported platforms](published-images.md#supported-platforms).

## 1. Get the release files

Use the public stable tag. The clone provides Compose files and operator
scripts that match the image.

```bash
git clone --branch v0.23.1 --depth 1 \
  https://github.com/tidynotebook/tidynotebook.git notesapp
cd notesapp
```

Run the remaining commands in this folder.

## 2. Prepare the test installation

```bash
tools/ops/quickstart.sh
```

The script asks for `sudo` to create secret files and set the attachment
folder owner. It writes `.env` and creates database, attachment, and secret
folders under `.tooling/quickstart`. Git ignores these files.

If the setup script's final message suggests a source build, continue with
step 3 below to select and start the stable image.

## 3. Select and start the stable image

Complete [Select the stable image](published-images.md#select-the-stable-image).
That step checks the release checkout and writes the verified image digest
to `.env`. Stop if the check fails.

Then download and start the image:

```bash
docker compose pull app
docker compose up -d --no-build --wait
docker compose ps
```

Compose starts PostgreSQL first. The application updates the database and
then starts the server. To check readiness:

```bash
curl --fail http://127.0.0.1:3000/ready
```

The answer starts with `{"status":"ok"`. If startup fails, read the log:

```bash
docker compose logs app
```

## 4. Open the application

Open `http://127.0.0.1:3000`. Use this exact address. The default settings do
not serve the host name `localhost`.

Create the first account with an email address and a password. This account
is the administrator. Later visits show the sign-in page.

To write and save a note, continue with
[Write your first note](getting-started.md#write-your-first-note). To invite
people, see [Accounts and invitations](accounts.md). For password recovery,
see [Forgot your password](joining.md#forgot-your-password).

## Stop and remove

To stop the containers and keep the data:

```bash
docker compose down
```

To start again, use `docker compose up -d --no-build --wait`.

To remove this test installation, stop the containers first. Then remove its
data and settings:

```bash
sudo rm -rf .tooling/quickstart
rm .env
```

## Build from source

For a tagged source checkout, complete
[Contributor source builds](upgrade.md#contributor-source-builds).
That procedure builds a per-tag local image and saves its name in `.env`
before startup. Later Compose commands keep that image selection.

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the code setup and checks.

For a server that holds real data, use [Self-hosting](self-hosting.md).
