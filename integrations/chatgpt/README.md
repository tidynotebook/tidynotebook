# tidy notebook plugin

This package connects ChatGPT and Codex to the hosted tidy notebook MCP server.
It preserves the server's OAuth flow and account permissions. It changes no
application endpoint, stored data, operator configuration, or image command.

The portable plugin lives in `tidy-notebook/`. Its light and dark PNGs use the
canonical mark from `packages/ui/assets/notebook.svg` and the Default theme's
text and accent colors. The root package license applies to these files.

Package only that directory, with the archive outside it:

```sh
cd integrations/chatgpt
zip -r /tmp/tidy-notebook-0.1.1.zip tidy-notebook
```

The package requests note read, note write, and refresh access. The consent
screen lets the user choose read-only access. CIMD registration is preferred;
the host can fall back to the discovered DCR endpoint. There are no packaged
credentials or app bindings.

Clients that use MCP annotations can request stronger confirmation before a
replacement or patch removes text. The tool inputs, outputs, and scopes stay
the same.

## Public submission preparation

The package is a development draft. It is not ready for public submission.

- The display name uses title case in the manifest, as selected by the owner.
  The public publisher uses the owner's verified individual identity. Confirm
  the exact byline in the portal before submission.
- The owner selected all available countries. The empty `countries` array
  deliberately removes country restrictions. Check the saved portal targeting.
- The listing discloses a free trial followed by a paid cloud subscription.
  Payment takes place through Paddle on the product website, outside the plugin.
- The website, support destination, Privacy notice, and Terms use existing
  public pages. The website has the support email link. Confirm that policy
  coverage explains connected assistants and note transfer before submission.
- The five positive and three negative cases in the manifest are **Not run**.
  Each description contains its setup. Use a dedicated test account, reset
  fixtures between runs, and record actual tool calls and results.
- Live OAuth discovery and authenticated discovery of all tools are verified
  through the local Codex connection. The installed private package did not
  start its bundled server in the current desktop client. This local connection
  does not establish a hosted ChatGPT connection or prove web compatibility.
  The review cases still require the dedicated test account.
- Tool annotations come from the server. The source marks replacement, patch,
  and Move to Trash as destructive because they can remove content. Check the
  live scan after an authorized core release and installation upgrade. A package
  cannot override the annotations of the currently hosted server.

## Demo and reviewer access

Use a dedicated test account with sample notes and working trial or subscription
access. Keep credentials and reviewer access instructions in secure portal
fields, outside this package and repository.

Rehearse these steps in ChatGPT with the development plugin installed:

1. Connect the test account through OAuth and show the access choice.
2. Run the Project Atlas search case and show its source note and summary.
3. Run the saved-version comparison case.
4. Create the meeting note, append the action item, and rename the sample note.
   Show the resulting notes in tidy notebook.
5. Ask for a public link and show the unsupported-action explanation.

Record the real prompts, tool results, and resulting notes with a screen
recorder. Check playback, legibility, and absence of credentials. Host the video
where reviewers can play it without private access, verify the URL, and add it
as `review.demo_recording_url`. The walkthrough above is not a recorded demo.

After the materials are complete, use the
[OpenAI submission guide](https://developers.openai.com/plugins/deploy/submission).
Select the intended publisher, upload the ZIP as a draft, complete domain
verification and OAuth, inspect the tool scan, and run the cases against that
saved version. The owner completes legal attestations. Upload, submission for
review, and publication after approval are separate actions.
