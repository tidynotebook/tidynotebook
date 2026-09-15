# 0034. The open note selects its folder

- Status: Accepted
- Date: 2026-09-15

## Context

Decision 0029 made one selected folder the parent of New note and New folder,
and it rejected deriving that parent from the open note because the result
would change without a visible selection. Two faults came out of that.

Nothing moved the selection when a person opened a note, so New folder made its
folder at the top while the person was reading a note three folders deep. The
selection also reset on its own: `apps/web/src/shell/files.tsx` emptied the
note list before every background read, the folder of the selection left the
tree for that moment, and `selectedFolderOrRoot` sent the selection back to the
root.

## Decision

Opening a note selects the folder that holds it.
`selectionForOpenNote` in `apps/web/src/lib/folder-selection.ts` states the
rule, and `apps/web/src/shell/shell.tsx` applies it when the path of the open
note changes. The selection stays visible in the tree, so the parent of a
create action is still something a person reads before they act, which is what
0029 asked for. A person can still select any other folder, and the next note
they open moves the selection again.

`selectedFolderOrRoot` runs only after the list of the area has answered, so a
list that is still loading never resets the choice of the person.

The folder row menu gains New folder in this folder, and the New folder dialog
states the parent it will use. This record refines decision 0029; it does not
replace it, because the selected folder is still the one create parent.

## Consequences

- New note and New folder land next to the note a person is reading.
- A background refresh of the note list cannot move the create parent.
- A person who wants another parent selects the folder row, or uses the menu of
  that row, and the dialog states which parent it took.
- `folder-selection.test.ts` holds both rules. A browser journey opens a note
  in a folder, makes a folder, and checks where it lands.
