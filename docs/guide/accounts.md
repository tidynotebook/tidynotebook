# Accounts and invitations

This page is for the administrator of an installation, the person who invites
other people and manages their accounts. After this page you can invite a
person, let anybody sign up, set up mail, and manage the accounts of your
installation.

## Open the accounts page

You do every task on this page on the accounts page. Only an administrator
sees it.

1. Open **Settings**.
2. In the **Account** section, select **Manage accounts**.
3. To go back, select **Back to Settings**.

You can also open the command palette and select **Go to Accounts**.

## Who is an administrator

The first account of an installation is an administrator. An administrator can
make another account an administrator too.

An installation always keeps at least one enabled administrator. The last
administrator cannot lose the role, cannot be disabled, and cannot be deleted.

An administrator manages accounts and does not read notes. You see the address,
the name, the state, the last activity and the storage of each account. You
cannot open a note of another account.

## Who can make an account

By default, a person needs an invitation. You can let anybody sign up instead.

1. Under **Who can make an account**, select **Let anybody sign up**.
2. The choice applies at once. Clear the box to require an invitation again.

The server allows open sign-up only when the installation has all of these:

- a mail server (see **Mail** below)
- the terms
- the privacy notice

If a part is missing, the page names it. While anybody can sign up, you cannot
remove the mail server or a legal document, because sign-up needs them.

This is what a new person does:

1. On the sign-in screen, the person selects **Create an account**.
2. The person enters an address and a password. The browser does a short check
   that takes a few seconds.
3. The server sends a message with a link to the address.
4. The person opens the link. The account exists now, and the person signs in.

A sign-up that nobody finishes goes away after a time that the server sets.

The person who runs the server can set this choice in the server environment,
with `NOTESAPP_REGISTRATION_POLICY`. Then the section shows the choice and
offers no change. See [Configuration reference](configuration.md#accounts).

## Mail

The mail server sends invitations, the links of a sign-up, and the links of a
password reset. Without one, an invitation shows its link once, and nobody can
reset a password alone.

1. Under **Mail**, enter the values that your mail provider gives you:
   **Server**, **Port**, **Security**, **User name** and **Password**. The port
   follows the security that you choose, and you can change it. Leave **User
   name** and **Password** empty for a server that takes mail with no sign-in.
2. In **Sender**, enter an address that the mail server lets you send from, for
   example `tidy notebook <no-reply@notes.example.com>`.
3. Select **Save**.
4. Select **Send a test message**. The message goes to your own address. Check
   that it arrives in the inbox and not in spam.

The server keeps the password sealed and never shows it again. To change other
values and keep the password, leave **Password** empty.

If the test message does not go, the page states the kind of the failure, for
example a refused password or a server that does not answer.

Select **Remove** to stop all mail. Then confirm with **Remove mail server**.
Invitations show their link once again.

The person who runs the server can set the mail server in the server
environment. Then the page shows its values and offers no change. You can still
select **Send a test message**. See [Mail](operations.md#mail).

## Legal documents

A public installation names its terms and its privacy notice. When both
exist, each person accepts them:

- The sign-up form and the invitation form link both documents and ask for
  consent.
- The sign-in screen and **Settings** link both documents.
- When a new version comes out, each person accepts it at the next visit,
  before the notes open.
- A person who does not accept can export their notes, delete their account,
  or sign out.

To add a document:

1. Under **Legal documents**, select **Add** on the row of **Terms** or
   **Privacy notice**. The editor opens in the same section.
2. In **Source**, choose where the document lives:
   - **Text on this server** shows the document on a page of the installation.
   - **Page on another site** links a page that you host elsewhere. Enter its
     **Address**.
3. For a text, start from the template of tidy notebook. The template states
   what the product keeps, for how long, and where it sends data. Each blank in
   double braces shows as a field under **Facts of your service**. Type the
   facts of your service, for example who runs it and the law that applies.
   Each fact fills its place in the text at once. You can also change any word
   of the text. **Start again from the template** brings back the original.
4. In **Version**, enter a version, for example the date.
5. Select **Save**.

The server does not save a text that still has a blank. The template is not
legal advice. Ask a person who knows the law of your country to read both
documents.

Change the version when every person must accept the document again. Keep the
version for a fixed typo, and nobody accepts it again.

To change or remove a document later, select **Change** or **Remove** on its
row. The page of each document states its version.

The person who runs the server can name the documents in the server
environment. Then the page shows them and offers no change. See
[Open sign-up](operations.md#open-sign-up).

## Reports of published links

A reader can report a published page. The reader selects **Report this page**
at the foot of the page. Each open report shows under **Reports of published
links**, with its reason and the words of the reader.

- **Open link** opens the page as any reader sees it. You read nothing else of
  the workspace.
- **Take down** stops the link at once and closes every report of it. The owner
  sees that an administrator took the link down, and cannot open it again.
- **Close** closes the report and keeps the link.

## Invitations

An invitation lets one person make an account with the address that you enter.

1. Under **Invitations**, select **Invite a person**.
2. Enter the email address of the person, and select **Invite**.

What happens next depends on the mail server:

- With a mail server, the link goes to that address, from the sender that the
  server names.
- Without a mail server, the dialog shows the link once. Select **Copy link**
  and send it to the person yourself, for example in a message. After you
  select **Done**, the link does not appear again.

The invitation works for one address and for a limited time. The person cannot
change the address when they accept it.

Each waiting invitation shows when it expires. Select **Revoke** to stop one. A
revoked or expired link opens nothing. You can invite the same address again.

## Accounts

This section lists every account of the installation. A row shows the name and
the first facts of the account. Hold the pointer over the facts to see all of
them: the role, the state, the last activity, the storage and the address.

Each row has a menu. It holds the changes for that account:

- **Make administrator** and **Make member** change the role.
- **Disable** signs the account out on every device and stops the next sign-in.
  The notes stay. **Enable** lets the person sign in again.
- **Change limits and access** opens a dialog. It sets the **Storage limit in
  gigabytes** and the other monthly limits of the account, and it sets
  **Access** to **Active** or **Locked**. The limits count every workspace that
  the account owns. An empty limit is no limit. A locked account can only
  export its notes, delete itself, or open billing.
- **Delete account** deletes the account and every note in its workspaces for
  good. Nobody can undo it, not even you.

The menu does not show a change that would leave the installation without an
enabled administrator.

## Your own account

**Settings** has two sections for the devices and the account of your own.

- Under **Sessions**, you see each device that is signed in to your account.
  The device that you use now is first. Select **Sign out** on a row to sign out
  a device that you lost. Select **Sign out every other device** if another
  person can know your password, then change your password.
- Under **Delete account**, you delete your own account. You enter your
  password to confirm. If you are the last administrator, first make another
  account an administrator.

If no administrator can sign in any more, the person who runs the server can
make an account an administrator again. See
[Account commands](operations.md#account-commands).
