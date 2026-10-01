# 019: Installation settings in the application

Status: complete

This design states how an administrator sets the mail transport and the legal
documents of an installation in the application, instead of in the files of
one deployment. It follows the
[audit of 2026-10-01](../audits/2026-10-01/self-hosting-settings.md).

## The problem

An installation that sends mail or asks for consent must change its
deployment files today. The SMTP address is a secret file, the sender is a
variable, and each legal document is a file or an address with a version in
the environment. A change needs a shell on the host and a restart. The
administrator in the application sees only whether mail exists, and cannot
check that a message arrives.

The legal templates in `docker/legal/` make the problem worse. An operator
copies them out of the checkout, fills each blank in a text editor, and mounts
the result. The filled files then live in the repository of one deployment,
next to its name, its address and its country. That is where the report of the
owner found them.

## What other self-hosted products do

Mattermost, Nextcloud, Vaultwarden and Listmonk each set the mail server in an
administration screen and send a test message from it. Mattermost also reads
each setting from the environment, and a value that the environment sets wins
and shows as locked in the console. That keeps a deployment that is written as
code exactly as it is.

Mastodon 4.4 keeps its terms and its privacy policy as Markdown that an
administrator writes in the application, starts from a template, and gives
each version of the terms an effective date. Discourse fills its default terms
from a few settings, and also takes an external address for each document.

## Options

**Keep the environment only.** Nothing changes for an operator who writes
deployment files, and the report stays true. Rejected.

**Move every setting into the database.** One source for each value. An
upgrade would break each deployment that sets a variable now, and an operator
who keeps the secret of the mail server out of the database loses that choice.

**The database, with the environment as a lock.** The administrator sets a
group in the application. A group that the environment sets wins, and the
application shows it as set by the server. This is the Mattermost model. A
deployment of today keeps working, and an operator can remove the variables
when the settings are in the application. The cost is one decider that reads
two sources, so no caller reads either source alone.

**Fill the legal documents from fields only.** The product would hold the
text and ask for the facts. A legal text depends on the law of a country, so
the operator must be able to change any word. Rejected as the only path. The
fields stay as a help: each blank of the template is a field.

## The cost of the chosen option

- A secret moves into the database. The password of the mail server is sealed
  with a key that the server secret derives, as the address of a reported
  link is (record 0123). A read of the database alone opens nothing. A change
  of the server secret loses the password, and the administrator enters it
  again.
- Each request that reads the mail, the documents, or the consent of an
  account reads one more row. The row is small, and the read keeps every
  server process of one installation in step (record 0121).
- The templates move from `docker/legal/` into `packages/core`, so the
  server and the browser read one text. An operator who mounts a file copies
  the template from the application.

## Open questions

- The limit of a new account and the life of an invitation are also settings
  of an administrator. They have a good default, and the accounts page states
  both. They can follow with the same lock, in their own change.

## Decisions

- [0148. An administrator sets the mail and the legal documents](../decisions/0148-an-administrator-sets-the-mail-and-the-legal-documents.md)
