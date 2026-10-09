# API keys and programs

This page is for the person who connects a program to their own account.

## Create a key

1. Open **Settings**, then **API keys**.
2. Select **Create API key**. Give the program a name and choose when the key
   expires. Use one key for each program.
3. Select **Create key**, then **Copy key**. Store the key in a secret store.
   After you close the dialog, you cannot read the key again.

A key has all the current access of your account. It can read, change, and
permanently delete your notes. An administrator's key can also manage the
installation. It cannot read another account's notes. Keep a key as safe as
its password. Do not share it or store it in source code.

## API reference

Open the [API reference](../../packages/api-contract/openapi.yaml) for the
operations, authentication rules, requests, responses, and schemas. The
reference comes from the same contract as the generated client.

## Revoke or replace a key

Under **API keys**, each row shows its name, when it expires, and when the
program last used it. Select **Revoke**, then **Revoke key**. Access stops at
once. To replace a key, create a new one, change the program's secret, then
revoke the old one.

A password change or reset revokes all keys. Disabling or deleting an account
also revokes its keys. Enabling an account again does not bring its keys back.
A locked account can list and revoke keys, but it cannot create a key or use a
key to change notes.
