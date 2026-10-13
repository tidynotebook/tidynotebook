# Quick start

This page is for the person who runs the server. It takes you from a clone of
the code to a running tidy notebook on your own machine. You do four things:
clone, prepare, start, and open the application in a browser.

This is a test installation. It keeps all data in a folder inside the clone and
serves only your own machine. Read [Self-hosting](self-hosting.md) before you
store data that you care about. A real installation puts the secrets, the
database and the attachments outside the clone, on encrypted storage, behind
HTTPS.

## What you need

- Docker Engine and Docker Compose.
- Git, `openssl` and `sudo`.
- A new clone. Do not use an existing installation. The script in step 2
  refuses a clone that already has a `.env` file.

## 1. Get the code

This command copies the code to a new folder named `notesapp`. The second
command goes into that folder. Run all later commands in it.

```bash
git clone https://github.com/tidynotebook/tidynotebook.git notesapp
cd notesapp
```

The repository is private until launch. Before launch, a clone needs access
from the owner.

## 2. Prepare the test installation

This script does the whole setup. It needs `sudo` for two small steps, so it
can ask for your password.

```bash
tools/ops/quickstart.sh
```

The script does these things:

1. It stops with a message when `.env` or the folder `.tooling/quickstart`
   exists. It never changes an installation that exists.
2. It makes three folders under `.tooling/quickstart`: one for the database
   (`postgres`), one for the attachments (`storage`) and one for the secrets
   (`secrets`).
3. It runs `tools/ops/create-secrets.sh` with `sudo`. This writes the secret
   files: random passwords and keys that the application and the database use.
   [Create the secret files](self-hosting.md#create-the-secret-files) names
   each file.
4. It gives the attachments folder to user 10001 with `sudo`. That is the user
   inside the application container. The container cannot write to a folder
   that belongs to another user.
5. It writes the settings file `.env`. The file sets the address
   `http://127.0.0.1:3000` and the three folders.

Git and the Docker build ignore `.env` and `.tooling/`, so none of this goes
into a commit or an image.

## 3. Build and start

The first command builds the application image from the code. This takes a few
minutes the first time. The second command starts the database and the
application in the background. The third command shows their state.

```bash
docker compose build
docker compose up -d
docker compose ps
```

Wait until `docker compose ps` shows the application as healthy. Compose
starts the database first. The application then updates the database and
starts the server. Run `docker compose ps` again when the state is still
starting.

To see that the server is ready, run this command. It prints a short answer
that starts with `{"status":"ok"` when the server is ready.

```bash
curl http://127.0.0.1:3000/ready
```

When the application does not become healthy, read its log:

```bash
docker compose logs app
```

## 4. Open the application

Open `http://127.0.0.1:3000` in a browser. Use this exact address. The server
serves the address that is set in `.env` and refuses a request for any other
host name, so `localhost` does not work.

The first visit shows a screen to create the first account. Enter an email
address and a password. This account is the administrator. The screen closes
after that account exists, and every later visit shows the sign-in page.

## Stop and remove

This command stops the application and the database. It keeps all your data.

```bash
docker compose down
```

To start again, run `docker compose up -d`.

The data of the test stays in `.tooling/quickstart`. Files in that folder
belong to the container user, so deleting the folder needs administrator
rights. Stop the containers first. Then delete the folder and the settings
file:

```bash
sudo rm -rf .tooling/quickstart
rm .env
```

## Next steps

When the test works, install for real. Follow [Self-hosting](self-hosting.md).
It uses the same scripts, with folders outside the clone and HTTPS.
