# Guide readability audit

Date: 2026-10-13
Commit: `343be44bcdb6ba527fa6a48e84f9925905fd49b1`

This audit is for the owner. It reads the public guide, `README.md`,
`CONTRIBUTING.md` and `SECURITY.md` as a person who follows each step for the
first time. It asks two questions of each page: can that person do the task
from the page alone, and does that person understand each command before they
run it.

## Method

Each page was read from start to end, in the order of the guide index. Each
shell command was read as a person who knows Docker but not this product. The
quick start was run on a Linux host with Docker Compose v2. The account
commands, a backup and a backup verification were run against that test
installation. The rewritten restore steps were run into a second, new test
installation: the account and its note came back, and the account signed in.

## Summary

The pages for the person who writes notes are mostly clear. They have
inconsistent control names, and some pages use words that only a developer
reads, such as "construct", "surface" and "reference renderer".

The pages for the person who runs a server are not ready for that person. The
commands are correct, but several are not readable, and some do not work in
the place where the page tells the person to run them. The self-hosting page
is one long page that mixes the installation steps with reference material,
so a person cannot tell where the steps end.

## Findings: commands that a person cannot read

1. `docs/guide/quickstart.md` steps 1 and 2 set `umask`, test for `.env`,
   keep a shell variable that later steps need, write `.env` with a `printf`
   format string, set mode `711`, and write seven secret files in a subshell
   with `openssl` and `printf`. The page asks the person to use one shell for
   every step, because of the variable. A person cannot check what these lines
   do before they run them with `sudo`.
2. `docs/guide/operator.md` holds 25 lines of Bash: a regular expression, two
   `git rev-parse` calls and a `jq` filter of 10 lines. A person must run it
   as it is and trust it.
3. `docs/guide/self-hosting.md` lists the seven secret files in a table but
   gives no way to write them. It sends the person to the quick start for the
   commands, which write into a test directory.
4. `docs/guide/self-hosting.md` shows lines of `.env`, such as
   `NOTESAPP_BIND_HOST=0.0.0.0`, in `bash` blocks. A person who runs them in a
   shell changes nothing, and the page does not say that these lines go into
   `.env`.
5. `docs/guide/backup-and-restore.md` shows `./tools/ops/backup.sh ...` with
   three dots in place of the options, and checks the age of a backup with
   `ls -t | head -1` and `find -mtime -1 | head -1`.
6. `CONTRIBUTING.md` tells a contributor to run `git rebase --signoff`. That
   rewrites the commits of a branch that may be pushed already, so the next
   push needs force.

## Findings: steps that do not work as written

7. `pnpm account:invite`, `pnpm account:promote`, `pnpm account:recover` and
   `pnpm owner:bootstrap` need Node.js, pnpm and an installed checkout on the
   host. The database has the host name `postgres`, which only the containers
   resolve, and the Compose file publishes no database port. On a Compose
   host these commands cannot reach the database. The same programs are in
   the image under `/app/server/dist/cli/`, and
   `docker compose exec app node server/dist/cli/<name>.js` runs them. The
   four commands were run that way against the test installation and passed.
   Each one also prints a Node.js `ExperimentalWarning` about `localStorage`.
8. `docs/guide/backup-and-restore.md` asks for a backup key file, an
   installation ID file and a database URL file, and gives no way to make
   them. The migration URL secret already serves as the database URL, because
   `tools/ops/backup.sh` replaces its host when it runs inside the database
   container.
9. `tools/ops/backup.sh` runs `node` on the host, but the host requirements do
   not name Node.js. When the person runs the backup with `sudo`, the `PATH`
   of `sudo` must hold `node`.
10. The backup example names the container `notesapp-postgres-1`. Compose
    takes the first part of that name from the name of the checkout
    directory, so the name is different for most installations.
11. `docs/guide/upgrade.md` has no command. It says to build the new image,
    but not how to get the new code or how to start it.
12. `docs/guide/appearance-and-shortcuts.md` opens Settings from a
    **More actions** menu. The header has no such menu. Settings is in the
    menu of the avatar, as `docs/guide/settings.md` states.
13. `docs/guide/appearance-and-shortcuts.md` says that three keys are worth
    knowing and lists four.
14. `docs/guide/offline.md` lists **Save** as an action, and
    `docs/guide/saving-and-history.md` says that there is no Save button.
15. `README.md`, `docs/guide/README.md`, `docs/guide/markdown.md` and
    `docs/guide/notes-and-folders.md` name a Read mode. Record 0025 retired
    it, and the application has no such mode.
16. Some control names on the pages do not match the application, for
    example **Publish folder** (the menu says **Publish**), **Attach image**
    (the menu says **Attach an image**) and **Change storage limit** (the menu
    says **Change limits and access**).

## Findings: structure

17. `docs/guide/self-hosting.md` is 589 lines. The installation steps are not
    in order: the reverse proxy comes before the host requirements, and the
    secret files come after the data directories but before the first start,
    with no numbered path. Reference material about stops, timeouts, live
    updates and logs sits between the steps and the end.
18. Mail, legal documents and open sign-up are explained on three pages:
    self-hosting, configuration and accounts. Each page has a different part.
19. `docs/guide/operator.md` names a decision record and an image package
    policy. A guide page holds no internal rule.
20. `docs/guide/getting-started.md` sends a person who lost a password to the
    backup page.
21. `docs/guide/workspaces.md` does not mark control names in bold, as the
    other pages do.
22. `docs/guide/markdown.md` opens with words for a developer: "surface",
    "block construct", "inline construct", "grammar".

## Changes

The change that carries this audit makes these changes.

- Three tested scripts replace the long command blocks:
  `tools/ops/quickstart.sh`, `tools/ops/create-secrets.sh` and
  `tools/ops/select-image.sh`. Each one prints what it did, refuses to
  replace a file that exists, and names the cause when it stops.
- The quick start is three commands after the clone.
- The self-hosting page becomes the installation steps, in order. A new page,
  Server operations, holds the reference material.
- The account commands run in the application container.
- The backup page states how to get each file that the backup needs.
- Each page for the person who writes notes uses the control names of the
  application.
