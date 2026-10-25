# Connect an AI assistant

This page is for the person who connects an AI assistant to their notes.

An assistant connects through the Model Context Protocol (MCP). You sign in
to tidy notebook and choose what the app can do. You can end its access in
Settings.

## Choose your server

**tidy notebook cloud:** use `https://mcp.tidynotebook.com/mcp`. Sign in with
your account at `https://app.tidynotebook.com`. If you need an account, follow
[Getting started](getting-started.md#sign-up-for-cloud) first.

**Self-hosted:** ask the server operator for the full MCP address. The operator
must [turn on MCP](self-hosting.md#turn-on-mcp). The address is the configured
MCP origin followed by `/mcp`. It can use a different host from the application.
Use an `https://` address for an installation that you access over a network.
In the commands below, replace `https://mcp.tidynotebook.com/mcp` with that
address. Sign in to your own installation when the browser opens.

A personal API key does not work at this endpoint. Use browser OAuth sign-in.
You do not need to copy a password or token into the assistant configuration.

## Connect Claude Code

Install [Claude Code](https://code.claude.com/docs/en/setup) first. In a terminal, run:

```bash
claude mcp add --transport http --scope user tidy-notebook https://mcp.tidynotebook.com/mcp
claude
```

The server is available to your user across projects. In Claude Code, enter
`/mcp`, select **tidy-notebook**, and start authentication. Complete
[Allow access](#allow-access) in the browser. Then return to Claude Code and
check the server in `/mcp`.

Command syntax was checked against Claude Code 2.1.310 help and the
[official MCP instructions](https://code.claude.com/docs/en/mcp#authenticate-with-remote-mcp-servers)
on 25 October 2026.

## Connect Codex

Install [Codex CLI](https://developers.openai.com/codex/cli/) first. In a terminal, run:

```bash
codex mcp add tidy-notebook --url https://mcp.tidynotebook.com/mcp
```

If the add command starts browser sign-in, complete
[Allow access](#allow-access). To start sign-in separately, run:

```bash
codex mcp login tidy-notebook
```

Complete the browser steps, then run `codex`. Enter `/mcp` to check the server.

Command syntax was checked against Codex CLI 0.164.0 help and the
[official OpenAI MCP instructions](https://developers.openai.com/codex/mcp/)
on 25 October 2026.

## Allow access

1. Sign in to tidy notebook in the browser if asked. Use the account whose
   notes you want to connect.
2. On **Allow access to your notes**, check the client identity and where your
   answer goes. The client chooses its own name. A name alone does not prove
   its identity. **Not verified** means the client registers itself. The page
   also warns when your answer goes to an app on this computer.
3. If the app asks to change notes, choose **Read only** or **Read and write**
   in **Access to give**. If it asks only to read, there is no access choice.
4. Select **Allow** to give access. Select **Deny** if you do not want to give
   access.
5. Return to the terminal when the browser finishes. Keep the client running
   until it confirms the connection.

Access covers all your workspaces. Each action still needs the current
rights of your account. You cannot connect a new app while your account is
locked.

## Check the connection

If the consent page offers an access choice, choose **Read only** for the first
check. Ask the assistant: "Use tidy notebook to list my workspaces. Do not
create or change any notes." The assistant uses
`list_workspaces`. Check that the names match your account.

To change from read-only access to write access later, revoke the connection
in tidy notebook, then authenticate again and choose **Read and write**.

## If sign-in fails

- If the browser does not open, open the sign-in URL that the client shows.
  Use the same computer as the client so the browser can return to it.
- If access expired or you revoked it, authenticate again. In Claude Code,
  use `/mcp` and the server's authentication action. In Codex, run
  `codex mcp login tidy-notebook`.
- If Codex keeps an old sign-in, run `codex mcp logout tidy-notebook`, then
  log in again. In Claude Code, clear authentication for the server in
  `/mcp`, then authenticate again. To end server access, also
  [revoke the connected app](#revoke-a-connected-app).
- If the Claude Code server name already exists, run `claude mcp list` and
  `claude mcp get tidy-notebook`. Check the address and configuration scope.
  Local and project entries take priority over user entries. Remove a wrong
  entry with `claude mcp remove --scope local tidy-notebook`,
  `claude mcp remove --scope project tidy-notebook`, or
  `claude mcp remove --scope user tidy-notebook`, to match its scope. Then add
  the user entry again if needed.
- In Codex, check an existing entry with `codex mcp get tidy-notebook`. If its
  address is wrong, run `codex mcp remove tidy-notebook`, then add it again.
- If a self-hosted address does not connect, ask the operator to check MCP
  and HTTPS. Use the full `/mcp` address, not the application sign-in page.

Keep passwords, tokens and sign-in callback URLs out of notes and issue
reports. Report the client version and the failed step instead.

## Choose the access

**Read only** lets the assistant list your workspaces and notes, read notes
and earlier versions, search, and read backlinks and History. It cannot
change a note.

**Read and write** also lets the assistant create, edit, rename and move
notes, and move them to Trash. You can use **Restore** in Trash to bring a
note back. See [Trash](trash.md).

Neither kind of access lets the assistant delete a note for good, publish a
link, or change accounts, workspaces, members, API keys or connected apps.

The assistant can use `append_to_note` to add whole lines at the end of a
note or a section. It can use `patch_note` to insert or replace exact text
that occurs once. Each accepted call makes one version in History. These
tools can merge while you type. They keep characters that you insert at the
same time, but the result can need a text or Markdown correction. Two appends
at the same point can arrive in either order, with no line break between them.

Both tools need the version that the assistant read. The same input and
version through the same connection make one change. After a lost answer, a
retry says that an earlier attempt made the change. That answer has no
version. The assistant must read the note for its current version. To make
the same change again on purpose, it must use the new version.

The existing `edit_note` tool, which can replace the whole text, still
refuses a write if the note changed. Rename, move and Move to Trash also
keep this version check. Ask the assistant to read the note again before
it tries a refused change. An edit that starts before a concurrent move to
Trash can bring the note back. Both versions stay in History.

## Revoke a connected app

1. Select your avatar at the right end of the header, then select **Settings**.
2. Go to **Connected apps**. Each row shows the name that the app claims,
   its client identity, its access and the time since its last use.
3. Select **Revoke** for the app, then select **Revoke app** to confirm.

The app loses access at once. You can connect it again later. Revoke cannot
remove a copy of a note that the app receives before you revoke access.

A password change or reset also ends every app's access. Disabling or
deleting the account does the same. You can list and revoke connected apps
while your account is locked.
