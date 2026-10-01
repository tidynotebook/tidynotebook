# Accounts and invitations

This page is for the administrator of an installation, the person who invites
other people and manages their accounts.

## Who is an administrator

The first account of an installation is an administrator. An administrator can
make another account an administrator too. An installation always keeps at
least one enabled administrator, so NotesApp does not let the last one lose the
role, disable the account, or remove it.

An administrator manages accounts and does not read notes. You see the address,
the name, the state, the last activity and the storage of each account. You
cannot open a note of another account.

## Let anybody sign up

An installation can let a person make an account without an invitation. The
sign-in screen then offers **Create an account**. The person gives an address
and a password. The browser then does a short check that takes a few seconds,
and a message with a link goes to the address. The account
exists after the person opens the link, and then the person signs in. A sign-up
that nobody finishes goes away after a time that the server sets.

Turn on **Let anybody sign up** under **Who can make an account** on the
accounts page. The server allows this only when the installation has a mail
server, a separate address for published pages, and the terms and the
privacy notice of the service. If a part is missing, the page names it. You set
the mail server and the two documents on the same page. The person who runs
the server sets the address for published pages. Turn the choice off to
require an invitation again.

While anybody can sign up, the page does not let you remove the mail server or
a legal document, because sign-up needs them.

## Mail

The mail server sends invitations, the links of a sign-up, and the links of a
password reset. Without one, an invitation shows its link once, and nobody can
reset a password alone.

1. Under **Mail** on the accounts page, enter the values that your mail
   provider gives: the server, the port, the security, the user name and the
   password. The port follows the security that you choose, and you can
   change it. Leave the user name and the password empty for a server that
   takes mail with no sign-in.
2. Enter the sender, an address that the mail server lets you send from, for
   example `NotesApp <no-reply@notes.example.com>`.
3. Select **Save**, then select **Send a test message**. The message goes to
   your own address. Check that it arrives in the inbox and not in spam.

The server keeps the password sealed and never shows it again. To change the
other values and keep the password, leave **Password** empty. When the test
message does not go, the page states the kind of the failure, for example a
refused password or a server that does not answer. **Remove** stops all mail.

When the person who runs the server sets the mail server in the server
environment, the page shows it and offers no change. See
[Self-hosting](self-hosting.md#mail).

## Terms and privacy notice

When the installation names its terms and its privacy notice, each person
accepts them. The sign-up form and the invitation form link both and ask for
consent. The sign-in screen and **Settings** link them too. When a new version
comes out, each person accepts it at the next visit, before the notes open. A
person who does not accept can export their notes, remove their account, or
sign out.

You add both documents under **Legal documents** on the accounts page. They
apply when both exist.

1. Select **Add** on the row of a document. Its editor opens in the section.
2. Choose the source. **Text on this server** shows the document on a page of
   the installation. **Page on another site** links a page that you host
   elsewhere.
3. A text starts from the template of NotesApp. The template states what the
   product keeps, for how long, and where it sends data. Each blank in double
   braces shows as a field under **Facts of your service**. Type the facts of
   your service, for example who runs it and the law that applies. Each fact
   fills its place in the text at once. You can change any word of the text
   too.
4. Enter the version, for example the date, and select **Save**. The version
   also fills its place in the text.

The server does not save a text that still holds a blank. The template is not
legal advice. Ask a person who knows the law of your country to read both
documents.

Change the version when every person must accept the document again. Keep the
version for a fixed typo, and nobody accepts it again.

When the person who runs the server names the documents in the server
environment, the page shows them and offers no change. See
[Self-hosting](self-hosting.md#open-sign-up).

## Open the accounts page

Open **Settings** and select **Manage accounts** in the Account section. You
can also search for "accounts" in the command palette. A person who is not an
administrator does not see these entries. The caret before the page title
goes back to Settings.

## Invite a person

1. Select **Invite a person** under **Invitations**.
2. Enter the email address of the person, and select **Invite**.

When the server can send mail, the link goes to that address, from the sender
that the server names. When it cannot,
the dialog shows the link once. Select **Copy link** and send the link to the
person yourself, for example in a message. After you close the dialog, the
link does not appear again.

The invitation works for one address and for a limited time. The person cannot
change the address when they accept. Under **Invitations**, each waiting
invitation shows when it expires. Select **Revoke** to stop one. A revoked or
expired link opens nothing, and you can invite the same address again.

## Change an account

Each account row has a menu. It holds the changes that apply to that account:

- **Make administrator** and **Make member** change the role.
- **Disable** signs the account out on every device and stops the next sign-in.
  The notes stay. **Enable** lets the person sign in again.
- **Change storage limit** sets the space of the account, in gigabytes. The
  limit counts every workspace that the account owns.
- **Remove account** removes the account and every note in its workspaces for
  good. The person cannot undo it, and neither can you.

The menu does not show a change that would leave the installation without an
enabled administrator.

## Reports of published links

A reader can report a published page from the **Report this page** link at its
foot. The accounts page lists each open report under **Reports of published
links**, with its reason and the words of the reader.

- **Open link** opens the page as any reader sees it. You read nothing else of
  the workspace.
- **Take down** stops the link at once and closes every report of it. The owner
  sees that an administrator took the link down, and cannot open it again.
- **Close** closes the report and keeps the link.

## Your own account

**Settings** shows each device that is signed in to your account, under
**Sessions**. The device that you use now is first. Select **Sign out** on a
row to sign out a device that you lost. Select **Sign out every other device**
if another person can know your password, then change your password.

You remove your own account in **Settings**, under **Remove account**, with your
password. If you are the last administrator, first make another account an
administrator.

If no administrator can sign in any more, the person who runs the server can
make an account an administrator again. See [Self-hosting](self-hosting.md).
