# API keys and programs

This page is for the person who connects a program to their own account.

A key lets a program use your account without your password. You make the key
in Settings, and you give it to the program.

## Create a key

1. Select your avatar at the right end of the header, then select **Settings**.
2. Go to **API keys**, then select **Create API key**.
3. In **Program name**, type a name for the program. Use one key for each
   program.
4. In **Expires after**, choose when the key stops.
5. Select **Create key**, then select **Copy key**.
6. Store the key in a secret store. After you close the dialog, you cannot read
   the key again.

An account holds up to 25 keys.

A key has all the current access of your account. It can read, change, and
permanently delete your notes. The key of an administrator can also manage the
installation. It cannot read the notes of another account.

Keep a key as safe as its password. Do not share it. Do not store it in source
code.

## What a program can do

The [API reference](../../packages/api-contract/openapi.yaml) lists the
operations, the sign-in rules, the requests, the responses, and the schemas. The
generated client uses the same reference.

## Revoke or replace a key

Under **API keys**, each row shows the name, when the key expires, and when the
program last used it.

To stop a key, select **Revoke**, then select **Revoke key**. Access stops at
once.

To replace a key:

1. Create a new key.
2. Change the secret in the program.
3. Revoke the old key.

## When a key stops working

- A password change or reset revokes all keys.
- Disabling or deleting an account also revokes its keys. Enabling an account
  again does not bring its keys back.
- A locked account can list and revoke keys. It cannot create a key, and it
  cannot use a key to change notes.
