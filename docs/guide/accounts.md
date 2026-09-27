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

Select **Let anybody sign up** under **Who can make an account** on the
accounts page. The server allows this only when the installation has a mail
transport, a separate address for published pages, and the terms and the
privacy notice of the service. If a part is missing, the page names it. Select
**Require an invitation** to stop new sign-ups.

## Terms and privacy notice

When the installation names its terms and its privacy notice, each person
accepts them. The sign-up form links both and asks for consent. When a new
version comes out, each person accepts it at the next visit, before the notes
open. A person who does not accept can export their notes, remove their
account, or sign out.

## Open the accounts page

Select **Accounts** at the bottom of the sidebar. You can also open
**Settings** and select **Manage accounts**, or search for "accounts" in the
command palette. A person who is not an administrator does not see these
entries.

## Invite a person

1. Select **Invite a person**.
2. Enter the email address of the person, and select **Invite**.

When the server can send mail, the link goes to that address. When it cannot,
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
