# Settings

This page is for the person who writes the notes. It states each section of
Settings, what each control does, and where the application keeps the choice.

## Open Settings

Settings opens over the note or page that you have open. It never replaces
it, so when you close Settings, the note is the same, with its scroll and
cursor.

1. Select your avatar at the right end of the header.
2. Select **Settings**.

You can also press **Ctrl + ,**, or **Cmd + ,** on a Mac. Or open the command
palette and select **Open Settings**.

On a desktop, Settings has a list of sections on the left: **General**
(**Appearance and editor**, **Offline**), **Workspace** with the name of the
workspace (**Daily notes**, **Templates**, **Export and import**) and
**Account** (**Account**, **Plan and billing**, **Devices**, **API keys and
apps**). On a phone, Settings fills the screen. Select a section to open it,
and select **Back** to go back to the list.

Forms and confirmations open inside Settings. They do not add another modal.
Use **Back**, **Cancel**, or **Done** to return to the section. Escape returns
to the section while a form is open.

Press **Escape**, select the close button or select outside Settings to close
it. The browser Back button also closes it. The address of the page shows the
open section, for example `?settings=account`, so a link can open Settings at
a section. Old Settings links open Settings over the last page of the
workspace, or over the list of notes.

The Workspace sections act on the workspace that you have open. A choice of
this kind follows you to every device. A choice of a device stays on this
browser only. Each section below says which kind it is.

## Profile

Open **Account** for your name, email, account limits and account deletion.

Your name appears with your account. Select **Edit** next to **Name**, type the
name and select **Save name**.

The **Email** row shows the address that you sign in with. You cannot change
it here.

## Appearance

Open **Appearance and editor** to change how the application looks. The
choice applies at once on this device. Then it goes to your account, so a new
device starts with it.

- **Mode** has three cards: **System**, **Light** and **Dark**. **System**
  follows the device. Each card shows a small picture of the application.
- **Theme** has one card for each theme, with a small picture of the theme in
  the mode that you use. A theme that has only dark colours says **dark
  only**. **Default** is the theme that a new account starts with.
- **Import theme file** adds a theme file with your own colours. The theme
  shows as one more card. See [Your own theme](custom-themes.md).
- **Download** saves the theme that you use as a file. You can change the file
  and import it again.
- An imported theme has **Delete** under its card. If you delete the theme that
  you use, the application uses **Default**.

The avatar menu also has a **Theme** item. It moves from **System** to
**Light** to **Dark**. See [Appearance and shortcuts](appearance-and-shortcuts.md).

## Spelling

**Check spelling** is under **Editor** on **Appearance and editor**. It lets
your browser mark the words that it does not know in a note. It does not check
code or addresses. The settings of your browser choose the languages. This
choice belongs to your account. Old links to the Spelling page open
**Appearance and editor**. See [Spelling](spelling.md).

## Daily notes

These settings apply to the workspace that you have open, and they follow you
to every device. See [Daily notes](daily-notes.md) for the date tokens and the
placeholders.

- **Template** opens a searchable list from the Templates folder, with a preview.
  **No template** starts an empty note. A current template outside this folder
  stays available until you change it.
- **Open today's note when the app opens** opens the note of today when the
  application starts on the list of notes.
- **Folder** is the folder of the daily notes. Leave it empty to keep them at
  the top of the workspace.
- **Name format** makes the name of each note from date tokens. A slash makes
  a folder. The line under the fields shows the name of the note of today.

Select a folder from the tree. Use **Search folders** to find one in a large
workspace, or **New folder here** to make one. Select **Done** to apply a
template, folder, or format. **Back** and **Cancel** discard the draft. When a
format cannot make a name, the form says what to change.

## Templates

**Templates folder** is the folder that holds your templates. **New note from
template** and **Insert from template** in
the command palette lists the notes in this folder and in its subfolders. The
line under the field states how many templates the folder holds.

This setting applies to the workspace that you have open, and it follows you to
every device. See [Templates](templates.md).

## Offline

Your notes are always kept on this device. Images and older versions take more
space. The Offline page has two switches:

- **Images** is for the images of the workspace.
- **Older versions** is for the older versions of each
  note.

This browser keeps each choice for your account and the workspace that you
have open. A switch shows as on only while the application keeps everything of its
kind. An empty group has no available control. Add an image or save a version
to make its control available. A failed change shows a message and reads the
stored state again. If settings cannot be read, select **Try again**. A new image can turn the switch off again. See [Working offline](offline.md).

## Export

Export and import are two rows of one section.

**Export this workspace** downloads every note and image of the workspace as one zip
file. The files keep their folders, and any Markdown editor reads them. See
[Export](export.md).

## Import

**Import workspace** reads a zip file of Markdown files and images into the
workspace that you have open. The files keep their paths and their links.

The page states how many notes and images it imported. An import stops when a
file of the zip has the path of a note that is already there.

## Account

The **Usage** part of **Account** states how much of its storage limit your account uses. Your
account owns every note in your workspaces, and no other account can read
them. Storage and transfer usage use decimal units: 1 GB is 1,000,000,000
bytes. Administrator limit fields also use GB. New accounts without a configured
limit start with 5 GB. Existing stored limits keep their byte values; an old
5 GiB limit therefore shows as 5.4 GB. No account limit is reduced.

An administrator also sees **Manage accounts** at the bottom of the list of
sections, which opens the accounts page.
See [Accounts and invitations](accounts.md). When the installation has terms
and a privacy notice, this section links them.

## Billing

**Plan and billing** shows only when the installation has a billing service. Select
**Open billing** to see and change your plan, your payment method and your
invoices. The billing pages open in the same tab and know your account, so you
do not sign in again. A locked account opens billing from the screen that it
signs in to.

## API keys

API keys and connected apps share one section, **API keys and apps**.

Create a separate key for each program that needs your account. Each key has
all your current access and stops at its expiry. A new key appears once, so
copy it when it shows. Select **Revoke** to stop a program at once. See
[API keys and programs](api.md).

## Connected apps

This section shows only when the server permits connected apps. Each row shows
the name that the app claims, its identity, its access and when it was last
used. Read access covers every workspace of your account. Write access also
lets the app change notes. A name alone does not prove who made the app.

Select **Revoke** to stop an app at once. You can connect it again from the
app later. Your account can hold 25 connected apps. Remove one before you
connect another when the list is full.

## Devices

Each device that is signed in to your account has one row. The row shows its
browser, its system, and when it was last active. The device that you use now
says **This device**.

- **Sign out** on a row signs out that device.
- **Sign out every other device** signs out every device but this one. Use it
  when another person can know your password. Then change your password.

To sign out of this device, use the avatar menu.

## Sign out

Sign out is not a section of Settings. Select your avatar, then **Sign out**
at the end of the menu. When some saves have not reached the server yet, a
message asks what to do:

- **Sign out and keep them** keeps the saves on this device for the next
  sign-in.
- **Remove and sign out** removes them from this device for good.

## Delete account

**Delete account** is in the **Danger zone** at the end of **Account**. It
deletes your account and every note in your workspaces
for good. It also signs you out on every device. Enter your password to
confirm. Export your notes first if you want to keep them.

The last administrator of an installation must first make another account an
administrator.
