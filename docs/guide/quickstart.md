# Quick start

This page is for the person who runs the server. It is the shortest path from a
clone to the setup screen on your own machine. It uses the Compose defaults, so every path stays inside the
checkout. Read [Self-hosting](self-hosting.md) before you store
data you care about: a real installation puts the secrets, the database and
the attachments outside the repository, on encrypted storage, behind an HTTPS
reverse proxy.

You need Docker Engine, Docker Compose v2 and `openssl`.

## 1. Clone and configure

```bash
git clone <repository-url> notesapp && cd notesapp
echo 'NOTESAPP_ORIGIN=http://127.0.0.1:3000' > .env
mkdir -p .secrets .data/postgres .storage
```

`NOTESAPP_ORIGIN` is the only value with no default. Compose stops with a
message that names it when it is missing.

## 2. Create the secret files

Compose reads seven secret files and creates none of them. Run this block
once:

```bash
( cd .secrets &&
  openssl rand -hex 24 > postgres_password &&
  openssl rand -hex 24 > runtime_database_password &&
  openssl rand -hex 24 > auth_database_password &&
  openssl rand -hex 32 > auth_secret &&
  printf 'postgres://postgres:%s@postgres:5432/notesapp\n' "$(cat postgres_password)" > migration_database_url &&
  printf 'postgres://notesapp_app:%s@postgres:5432/notesapp\n' "$(cat runtime_database_password)" > runtime_database_url &&
  printf 'postgres://notesapp_auth:%s@postgres:5432/notesapp\n' "$(cat auth_database_password)" > auth_database_url )
sudo chown 10001:10001 .storage .secrets/* && sudo chmod 600 .secrets/*
```

`openssl rand -hex` writes characters that are safe inside a URL, so no
password needs escaping. The application container runs as uid 10001 and
cannot read a file that belongs to another owner. The migration creates the
`notesapp_app` and `notesapp_auth` roles with the passwords above.

## 3. Build and start

```bash
docker compose build
docker compose up -d
docker compose ps
```

Compose waits for PostgreSQL. The application container then applies the
migrations with the migration role and starts the server with the restricted
runtime role.

## Open the application

```text
http://127.0.0.1:3000
```

The first visit shows the setup screen. Enter an email address and a password
for the first account, which is the administrator. The setup operation closes
after that account exists, and every later visit shows the sign-in page.

Check that the installation is ready:

```bash
curl -s http://127.0.0.1:3000/ready
docker compose logs app --tail 20
```

The installation serves the origin that you set, and nothing else. A request
that names another host is refused.

## What the defaults give you

| Setting              | Value in this quick start | Where it comes from               |
| -------------------- | ------------------------- | --------------------------------- |
| `NOTESAPP_ORIGIN`    | `http://127.0.0.1:3000`   | your `.env`, required, no default |
| Published address    | `127.0.0.1:3000`          | `docker-compose.yml` default      |
| Served origins       | the origin above only     | `docker-compose.yml` default      |
| Secrets directory    | `./.secrets`              | `docker-compose.yml` default      |
| Database directory   | `./.data/postgres`        | `docker-compose.yml` default      |
| Attachment directory | `./.storage`              | `docker-compose.yml` default      |

`.env`, `.secrets/`, `.data/` and `.storage/` are in `.gitignore`, so nothing
here reaches a commit.

`.env.example` holds the full list of settings with production values. Copy it
when you move to a real installation, and change the three directory settings
to paths outside the checkout.

## Stop and remove

```bash
docker compose down
```

Add `-v` only when you also want the data gone. The database and the
attachments are host directories, so `docker compose down` alone keeps them.
