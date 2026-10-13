# Settings

This page is for the person who writes the notes. It states each section of
the Settings page, what each control does, and where the application keeps the
choice.

## Open Settings

1. Select your avatar at the right end of the header.
2. Select **Settings**.

You can also press **Ctrl + P**, or **Cmd + P** on a Mac, to open the command
palette. Then select **Go to Settings**. The list under **On this page** jumps
to each section.

Some sections act on the workspace that you have open. A choice of this kind
follows you to every device. A choice of a device stays on this browser only.
Each section below says which kind it is.

## Profile

Your name appears with your account. Type it in **Name** and select **Save**.

The page shows your email address under the name. You sign in with that
address. You cannot change it here.

## Appearance

Use these controls to change how the application looks. The choice applies at
once on this device. Then it goes to your account, so a new device starts with
it.

- **System**, **Light** and **Dark** choose the light. **System** follows the
  device.
- **Theme** chooses the colours. **Default** is the theme that a new account
  starts with.
- **Import a theme** adds a theme file with your own colours. See
  [Your own theme](custom-themes.md).
- **Download this theme** saves the theme that you use as a file. You can
  change the file and import it again.
- **Imported themes** lists the themes that you imported. **Delete** removes
  one. If you delete the theme that you use, the application uses **Default**.

The avatar menu also has a **Theme** item. It moves from **System** to
**Light** to **Dark**. See [Appearance and shortcuts](appearance-and-shortcuts.md).

## Spelling

**Check spelling** lets your browser mark the words that it does not know in a
note. It does not check code or addresses. The settings of your browser choose
the languages. This choice belongs to your account. See
[Spelling](spelling.md).

## Daily notes

These settings apply to the workspace that you have open, and they follow you
to every device. See [Daily notes](daily-notes.md) for the date tokens and the
placeholders.

- **Template** is the note whose text starts each new daily note. **No
  template** starts an empty note.
- **Open today's note when the app opens** opens the note of today when the
  application starts on the list of notes.
- **Folder** is the folder of the daily notes. Leave it empty to keep them at
  the top of the workspace.
- **Name format** makes the name of each note from date tokens. A slash makes
  a folder. The line under the fields shows the name of the note of today.

A folder and a format save when you leave the field or press **Enter**. When a
format cannot make a name, the page says what to change.

## Templates

**Folder** is the folder that holds your templates. **Insert from template** in
the command palette lists the notes in this folder and in its subfolders. The
line under the field states how many templates the folder holds.

This setting applies to the workspace that you have open, and it follows you to
every device. See [Templates](templates.md).

## Available offline

Your notes are always kept on this device. Images and older versions take more
space, so this section asks whether to keep them too.

- **Keep images on this device** is for the images of the workspace.
- **Keep older versions on this device** is for the older versions of each
  note.

This browser keeps each choice for your account and the workspace that you
have open. A box shows as on only while the application keeps everything of its
kind. A new image can turn it off again. See [Working offline](offline.md).

## Export

**Export all notes** downloads every note and image of the workspace as one zip
file. The files keep their folders, and any Markdown editor reads them. See
[Export](export.md).

## Import

**Import workspace** reads a zip file of Markdown files and images into the
workspace that you have open. The files keep their paths and their links.

The page states how many notes and images it imported. An import stops when a
file of the zip has the path of a note that is already there.

## Account

This section states how much of its storage limit your account uses. Your
account owns every note in your workspaces, and no other account can read
them.

An administrator also sees **Manage accounts**, which opens the accounts page.
See [Accounts and invitations](accounts.md). When the installation has terms
and a privacy notice, this section links them.

## Billing

This section shows only when the installation has a billing service. Select
**Open billing** to see and change your plan, your payment method and your
invoices. The billing pages open in the same tab and know your account, so you
do not sign in again. A locked account opens billing from the screen that it
signs in to.

## API keys

Create a separate key for each program that needs your account. Each key has
all your current access and stops at its expiry. A new key appears once, so
copy it when it shows. Select **Revoke** to stop a program at once. See
[API keys and programs](api.md).

## Sessions

Each device that is signed in to your account has one row. The row shows its
browser, its system, and when it was last active. The device that you use now
says **This device**.

- **Sign out** on a row signs out that device.
- **Sign out every other device** signs out every device but this one. Use it
  when another person can know your password. Then change your password.

## Sign out

**Sign out on this device** ends the session on this browser. When some saves
have not reached the server yet, the section says so, and you choose:

- **Sign out and keep them** keeps the saves on this device for the next
  sign-in.
- **Sign out and remove them** removes them from this device for good.

## Delete account

**Delete my account** deletes your account and every note in your workspaces
for good. It also signs you out on every device. Enter your password to
confirm. Export your notes first if you want to keep them.

The last administrator of an installation must first make another account an
administrator.
