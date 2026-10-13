# Security model

This page is for the person who runs the server, and for the person who trusts
that server with their notes. Read it before you decide whether tidy notebook
fits your situation, and before you report a vulnerability.

To report a problem privately, read [SECURITY.md](../../SECURITY.md).

## What the operator can see

**The server operator can read every note.** The server stores notes so that it
can index them and search them. There is no end-to-end encryption. The operator
can read the content, the note names, and the attachments. So can anyone with
access to the database or the disk.

- **Personal installation:** the operator and the reader are the same person.
- **Shared installation:** the operator invites other people, or lets anybody
  sign up. Each of them trusts the operator completely. Nothing in this product
  changes that. The operator of a public service must say so in its privacy
  notice. The template of that notice says it.
- **Administrator:** an administrator of the installation is not the operator.
  An administrator sees the address, the state, the last activity and the
  storage use of each account. An administrator cannot open a note of another
  account.
- **Passwords:** the operator cannot read a password. The database stores a
  password as a hash. Only the identity database role can reach the hash, and
  the application role cannot read that table. See
  [Accounts and identity](../development/identity.md).

## What the product expects from you

The operator does these tasks. The product cannot do them.

- **Encrypt the disk.** Use encrypted host storage for the database, the
  attachments, the temporary files, swap, crash output, and the backups. See
  [Prepare encrypted storage](self-hosting.md#prepare-encrypted-storage).
- **Provide HTTPS.** The application publishes a plain HTTP listener on the
  loopback address. Put a reverse proxy that ends HTTPS in front of it. The
  Compose file has an optional profile that starts one. See
  [Set up HTTPS](self-hosting.md#set-up-https).
- **Name your proxy.** The application reads the address of the caller from the
  connection. It reads a forwarded header only from a proxy that you name. It
  names none by default, so a caller cannot state an address of its own choice.
- **Set the origin.** The origin has no default. Cookies and absolute addresses
  belong to that origin. The installation serves the origins that you name and
  no other, and it adds no scheme and no port to them. It refuses a request from
  another origin.
- **Keep your keys.** A lost volume key or backup key cannot be recovered. The
  data that it protects is lost too. See
  [Backup and restore](backup-and-restore.md).

## How accounts come in

- An account comes in by invitation, or by a sign-up that proves its address.
- The setup screen creates the first account, an administrator, and then closes
  itself.
- Every later account needs an invitation from an administrator, unless an
  administrator lets anybody sign up.
- A sign-up makes an account only after the person opens the link in a message
  to the address. A sign-up answers the same for a new and a known address. It
  costs the browser a short check.
- Each account has its own notes. No account reads the notes of another.
- The one way to show a note to another person is a link that you publish
  yourself. You can stop it at any moment. See
  [Published links](published-links.md).

## What the application does on its own

**Sessions and keys**

- A browser session or a personal API key reaches the notes of its account. A
  key does not reach another account.
- The session cookie is `HttpOnly` and `SameSite`. An HTTPS deployment marks it
  secure.
- A published link carries its own secret in the address. That secret opens what
  you published, for reading only, and it reaches nothing else.
- A write with a browser session must name an origin that the installation
  serves. An API key uses its authorization header.

**What a note can show**

- The server cleans all note content before it shows it. It keeps a safe set of
  HTML elements with no script, no style and no event. A link to anything other
  than a web address, a mail address, another note, or an attachment loses its
  destination.
- A published page runs no script, except one file of the server. That file
  draws a diagram in a sandboxed frame and adds a **Copy** button to a code
  block. A page with no diagram and no code block runs no script.
- An image from another site loads when you open the note. The image must use
  HTTPS. Its server receives a request from your browser and can see your
  address. Do not open a note with an external image if you do not trust its
  source.

**Data and logs**

- The database refuses on its own what the application refuses. Its row rules
  limit every row to its workspace. The role of the running application has no
  right to migrate the database and no right on the identity tables.
- No log holds a note, a search term, a header, a cookie, or a credential.

**Password reset**

- A reset link goes only to the address of the account.
- A reset link works once, for 1 hour.
- A reset ends every session of the account.
- One address gets at most three messages in an hour that a person with no
  session can cause, whoever asks for them.

## What is a vulnerability

The operator reading the notes of their own installation is not a
vulnerability. Neither is an attack that needs the operator's host account,
their database credentials, or physical access. The full scope list is in
[SECURITY.md](../../SECURITY.md).
