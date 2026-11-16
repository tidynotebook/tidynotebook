from kit import *  # noqa: F403

PAGES = [
    ("01-notes.html", "Notes and navigation", "All notes, tips, menu, account menu, calendar, folders. 14 screens, 1 journey."),
    ("02-templates.html", "New from template", "Pick, preview, choose folder, create. 17 screens, 1 journey."),
    ("03-editor.html", "Editor", "Undo and Redo icons, save status, version history, choose a version, images. 21 screens, 3 journeys."),
    ("04-settings.html", "Settings", "List, every page, confirmations, dark. 24 screens, 1 journey."),
    ("05-states.html", "States and account", "Note states, Needs attention, search, trial, sign up, limits. 22 screens."),
    ("06-desktop.html", "Desktop", "All notes, folders, calendar, template dialog, editor menus, settings, choose a version, search, history, medium width. 17 screens."),
]

BEFORE_AFTER = [
    ("&quot;28 notes. New notes go in this workspace root.&quot;", "&quot;28 notes&quot;. The page title says where notes go."),
    ("Sidebar text &quot;Create in: Personal workspace root&quot;", "Removed. Template preview has &quot;Folder: None [Change]&quot;."),
    ("&quot;From template&quot; as plain ghost text", "&quot;Use template&quot;: outlined button with icon, same size as New note."),
    ("Tips card: heading, sentence, 4 indented lines, 2 buttons", "One tip line, 6 words or less, one Close button."),
    ("&quot;Open today&#39;s note&quot; inside the tips", "Fixed &quot;Today&#39;s note&quot; row in the menu."),
    ("Template dialog: chip buttons and a paragraph", "Sheet with rows, then a real preview with field chips."),
    ("Settings: wrapping text links, then every section on one page", "A list of rows. Each row opens one page with Back."),
    ("Repeated &quot;Appearance&quot; heading 3 times", "Title once, in the bar."),
    ("Long settings paragraphs", "One help line at most."),
    ("&quot;Undo&quot; and &quot;Redo&quot; as text buttons", "Arrow icon buttons with names, tooltips and a dimmed state."),
    ("&quot;Recover local draft&quot;: two long text blocks", "&quot;Choose a version&quot;: tabs on phone, columns on desktop."),
    ("&quot;Remove image&quot; with a long tooltip and status sentence", "&quot;Remove from note&quot;, then a short message with Undo."),
    ("&quot;Search in: Personal. Results include note names and body text...&quot;", "Quiet scope line: &quot;In Personal&quot;."),
    ("Trial: two long sentences", "&quot;Trial: 12 days left [Upgrade]&quot;."),
    ("Sign-up: a paragraph about browsers, spam and limits", "&quot;Check your email&quot;, two short lines, two clear buttons."),
]

COVERAGE = [
    ("All notes header, New note, tips, today&#39;s note", "notes-home, writing-start, today-note-action, new-note", "A1 to A5, A13, G1, G2"),
    ("Sidebar: Create in, From template, save line", "shell", "A6, A9 to A12, A14, E1, G1"),
    ("New folder text", "folders", "A11"),
    ("New from template, errors by workspace", "new-from-template, workspace-problem, templates", "B1 to B17, G3"),
    ("Search scope and pending state", "command-palette, content-search-state", "E10 to E13, G8"),
    ("Undo and Redo", "format-toolbar, editor-history", "D1 to D3, Undo spec, D21, G4"),
    ("Remove image", "image-viewer", "D17 to D20"),
    ("Pending save, save line, open note status", "note-editor, save-status, save-state, sync-state, note-save-facts", "D4 to D7, E1, A6"),
    ("Recover local draft", "stale-draft-recovery, device-note", "D11 to D16, G7"),
    ("Purged, deleted, restored, unavailable notes", "note-loader, note-load-state", "E2 to E7"),
    ("Kept text", "Needs attention (target of recovery)", "E8, E9"),
    ("Version history copy", "history, history-rows", "D8 to D10, G9"),
    ("Settings groups and sections", "account-settings, settings-section, page-sections", "C1 to C24, G5, G6"),
    ("Offline settings", "offline-settings, offline-files", "C8, C14, C15, C24"),
    ("Trial notice", "trial-notice, trial", "E14 to E16, C11"),
    ("Sign-up verification and sign-in email", "sign-up, accounts", "E18 to E22"),
    ("Account limits in GiB", "administration", "E23"),
    ("Pressed state on buttons", "packages/ui controls (ariaPressed)", "Mode control, tabs, Undo spec"),
]

OMITTED = [
    "Tablet widths (768 to 1023 px): phone layout with a wider column. Not drawn.",
    "Move note dialog: reuses the folder picker B4. Not drawn on its own.",
    "Trash list, Publish dialog, workspace create, rename and delete dialogs, shortcuts dialog: not changed in v0.22.0. Out of scope. They take the new tokens and buttons when touched.",
    "Administration page apart from the limits form, documentation site, published pages: out of scope.",
    "Plain sign-in screen: the same layout as E20 without the verified mark.",
]

NEW_BEHAVIOUR = [
    "Tips: no Next button. A different tip shows each time All notes opens.",
    "Spelling: a switch in the Settings list, with no page of its own.",
    "Settings merges: Export with Import, API keys with Connected apps, Profile with Account. Delete account moves into Profile and email. Sessions is renamed Devices.",
    "Account menu on the avatar: Settings, Help, Sign out.",
    "Image removal: a short message with Undo for 6 seconds. Undo in the editor stays.",
    "Save details sheet: shows last upload time and waiting count only if the app can read them.",
    "Search with no results offers &quot;New note&quot; with the search words as its name.",
]

CHECKLIST = [
    ("Look and feel: type, colour, spacing, icons and components on this page.", "Foundations below"),
    ("Button rules: one filled button per screen, outlined secondary with icon, text buttons only for Cancel and Discard, red only for delete.", "Foundations, every page"),
    ("All notes: count only, New note and Use template side by side, no &quot;workspace root&quot;.", "A1 to A5, G1"),
    ("Tips: one line, 6 words or less, one tip per visit, Close only.", "A1, Tip line card"),
    ("Menu: Today&#39;s note and Calendar rows, folders with +, short save line.", "A6, A8, G1"),
    ("Where notes go: folder page title, &quot;Folder: None [Change]&quot;, &quot;Inside: Projects&quot; for new folders.", "A9, A11, B3, B4"),
    ("Template flow: pick, preview, create on phone. One dialog on desktop. All states.", "B1 to B17, G3"),
    ("Undo and Redo are arrow icons only. No visible text. Names for screen readers, desktop tooltips with shortcut, dimmed when not available, 44 px on phone.", "D1 to D3, Undo spec, D21, G4"),
    ("Save status: one pill, words for each state.", "E1, D6, D7"),
    ("Choose a version: tabs on phone, columns on desktop, &quot;Keep this device&#39;s text&quot; filled.", "D11 to D16, G7"),
    ("Image: &quot;Remove from note&quot;, short message with Undo.", "D17 to D20"),
    ("Settings: list of 9 rows and 1 switch, one page each, merges and renames.", "C1 to C24, G5, G6"),
    ("Sign out with waiting changes: &quot;Sign out and keep them&quot; filled.", "C21"),
    ("States and account copy: Trash, deleted, not found, offline, trial, sign up, limits.", "E2 to E23"),
    ("Dark mode matches light in every screen.", "Switch at top, A13, B16, C4, C23, D16, D21, G2, G6, G9"),
    ("New behaviour listed below is acceptable.", "New behaviour list"),
    ("The omitted screens listed below can wait.", "Omitted list"),
]


def foundations():
    """Return the foundations section with colors, controls and icons."""
    type_rows = [
        ("Page title, phone", "30 / 36, bold", '<span style="font-size:30px;font-weight:700;letter-spacing:-.02em">All notes</span>'),
        ("Sheet and bar title", "17 to 18 / 24, bold", '<span style="font-size:18px;font-weight:700">Use a template</span>'),
        ("Body and rows", "16 / 22", '<span style="font-size:16px">Shared artefacts</span>'),
        ("Help and meta", "14 / 20, muted", '<span style="font-size:14px;color:#67655f">System follows your device.</span>'),
        ("Group label", "13 / 18, semibold, muted", '<span style="font-size:13px;font-weight:600;color:#67655f">Today</span>'),
        ("Note heading", "28 / 34, bold", '<span style="font-size:28px;font-weight:700">Launch sync</span>'),
    ]
    typ = "".join(f'<div><span class="m">{a}<br>{b}</span>{c}</div>' for a, b, c in type_rows)
    light = [("Background", "#ffffff"), ("Surface", "#f7f7f5"), ("Hover", "#f0efec"), ("Active", "#e8e7e3"),
             ("Text", "#37352f"), ("Strong", "#191917"), ("Muted", "#67655f"), ("Fill (primary)", "#1a1917"),
             ("Link and focus", "#1a63c4"), ("Success", "#1c6f37"), ("Danger", "#c02b3a"), ("Border", "#85837d")]
    dark = [("Background", "#191919"), ("Surface", "#141414"), ("Card", "#222222"), ("Active", "#323232"),
            ("Text", "#d0cfcc"), ("Strong", "#f5f4f2"), ("Muted", "#a5a39e"), ("Fill (primary)", "#ececea"),
            ("Link", "#6fa8f5"), ("Success", "#59b871"), ("Danger", "#f5817d"), ("Border", "#807e79")]

    def sw(lst):
        """Return color swatches for one token list."""
        return '<div class="swatches">' + "".join(f'<div class="sw"><i style="background:{v}"></i><span><b>{n}</b>{v}</span></div>' for n, v in lst) + "</div>"
    spacing = '<div class="spacing">' + "".join(f'<div><i style="width:{s}px;height:{s}px"></i>{s}</div>' for s in (4, 8, 12, 16, 24, 32)) + "</div>"

    def bstates(dark_):
        """Return the button states in light or dark theme."""
        cls = " t-dark" if dark_ else ""
        cells = [
            ("Primary", btn("New note", "p md", "plus")), ("Secondary", btn("Use template", "s md", "template")),
            ("Text", btn("Cancel", "t md")), ("Danger outline", btn("Delete account", "dl md")),
            ("Danger fill, confirm only", btn("Delete", "d md")), ("Hover", btn("New note", "p md hov", "plus")),
            ("Focus", btn("New note", "p md ring", "plus")), ("Disabled", btn("Create note", "p md dis")),
            ("Busy", btn('<span class="spin"></span>Creating note', "p md dis")),
        ]
        return (f'<div class="screen{cls}" style="height:auto;border-radius:12px;padding:18px;border:1px solid var(--subtle)">'
                f'<div class="statecells" style="align-items:flex-start">' +
                "".join(f'<div>{b}<span>{n}</span></div>' for n, b in cells) + "</div></div>")
    icons = '<div class="iconset">' + "".join(f'<div>{ic(n)}{n}</div>' for n in ICONS if n not in ("arrow", "signal", "wifi", "quote", "sparkle", "users", "eye", "share")) + "</div>"

    def comps(dark_):
        """Return the shared components in light or dark theme."""
        spelling_switch = '<span class="switch on" role="switch" aria-checked="true" aria-label="Check spelling"></span>'
        cls = " t-dark" if dark_ else ""
        return (f'<div class="screen{cls}" style="height:auto;border-radius:12px;padding:18px;border:1px solid var(--subtle);gap:12px">'
                f'<ul class="rows" style="padding:0">{note_row("Shared artefacts", "4 h")}{note_row("Trip plan", "1 d", "Travel", "hov")}</ul>'
                f'<ul class="slist">{srow("palette", "Appearance", "System")}{srow("spell", "Check spelling", chev=False, right=spelling_switch)}</ul>'
                f'{destrow("Folder", "Projects")}'
                f'<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center"><span class="switch on"></span><span class="switch"></span><span class="switch dis"></span>'
                f'<span class="pill"><span class="dot"></span>Saved</span><span class="pill bad"><span class="dot bad"></span>Not saved</span></div>'
                f'<div class="seg"><span class="on">{ic("monitor")}System</span><span>{ic("sun")}Light</span><span>{ic("moon")}Dark</span></div>'
                f'<div class="field ph">{ic("search")}Search templates</div><div class="field focus">Clients<span class="caret" style="height:20px"></span></div>'
                f'{notice("info", "Some templates may be missing.")}{notice("bad", "Templates did not load.", act=btn("Try again", "s sm", "refresh"))}'
                f'{tipline("Type <kbd>[[</kbd> to link a note.")}'
                f'<div class="toast" style="position:static">{ic("checkcircle", "lead")}<span class="txt">Kept this device&#39;s text.</span></div></div>')
    sizes = """<table class="spec">
<tr><th>Element</th><th>Phone</th><th>Desktop</th></tr>
<tr><td class="k">Button</td><td>48 px high, 12 px radius</td><td>40 px high, 10 px radius</td></tr>
<tr><td class="k">Small button</td><td>36 px, inside a 52 px row</td><td>36 px</td></tr>
<tr><td class="k">Icon button</td><td>44 x 44 px</td><td>36 x 36 px</td></tr>
<tr><td class="k">Row</td><td>52 px, 64 px with a second line</td><td>36 to 44 px</td></tr>
<tr><td class="k">Gutter</td><td>16 px</td><td>48 px, text column 680 px</td></tr>
<tr><td class="k">Sheet and dialog</td><td>Bottom sheet, 22 px top radius</td><td>Centred dialog, 18 px radius</td></tr>
<tr><td class="k">Focus</td><td colspan="2">2 px ring in the focus colour, 2 px offset, on every control</td></tr>
<tr><td class="k">Contrast</td><td colspan="2">Theme tokens as shipped. Text and controls meet the contrast rules in theme.ts</td></tr>
</table>"""
    rules = """<table class="spec">
<tr><th>Rule</th><th>How it shows</th></tr>
<tr><td class="k">One main action</td><td>One filled button per screen. Confirm dialogs may use a red filled button.</td></tr>
<tr><td class="k">Buttons look like buttons</td><td>Secondary buttons are outlined and most have an icon. Text-only buttons: Cancel, Discard, Show all.</td></tr>
<tr><td class="k">Short words</td><td>One help line at most. No paragraphs in the app. No internal words like &quot;workspace root&quot; or &quot;checkpoint&quot;.</td></tr>
<tr><td class="k">Progressive disclosure</td><td>Details sit one tap away: status sheet, settings pages, template preview.</td></tr>
<tr><td class="k">Icons</td><td>One outline family, 24 px grid, 1.75 stroke, round ends. Icon-only buttons always have a name and, on desktop, a tooltip.</td></tr>
<tr><td class="k">Data safety</td><td>The safe choice is the filled button. Delete and discard always ask first.</td></tr>
</table>"""
    return (
        f'<div class="cards">'
        f'<div class="card"><h3>Typography</h3><p class="cl">System sans. Five sizes cover the app.</p><div class="typespec">{typ}</div></div>'
        f'<div class="card"><h3>Rules</h3><p class="cl">Used on every screen.</p>{rules}</div>'
        f'<div class="card"><h3>Colour, light</h3><p class="cl">Default Light theme tokens, as shipped. No new colours.</p>{sw(light)}</div>'
        f'<div class="card"><h3>Colour, dark</h3><p class="cl">Default Dark theme tokens, as shipped.</p>{sw(dark)}</div>'
        f'<div class="card"><h3>Spacing and sizes</h3><p class="cl">4 px grid.</p>{spacing}<div style="height:14px"></div>{sizes}</div>'
        f'<div class="card"><h3>Icons</h3><p class="cl">One outline family.</p>{icons}</div>'
        f'</div><div class="cards" style="margin-top:20px">'
        f'<div class="card"><h3>Buttons and states, light</h3><p class="cl">Hierarchy left to right, then states.</p>{bstates(False)}</div>'
        f'<div class="card"><h3>Buttons and states, dark</h3><p class="cl">The filled button turns light.</p>{bstates(True)}</div>'
        f'<div class="card"><h3>Components, light</h3><p class="cl">Rows, settings rows, Folder row, switches, pills, mode control, fields, notices, tip, message.</p>{comps(False)}</div>'
        f'<div class="card"><h3>Components, dark</h3><p class="cl">Same parts in dark.</p>{comps(True)}</div></div>')


def build():
    """Build the index page."""
    toc = '<div class="toc">' + "".join(f'<a href="{h}"><b>{t}</b><span>{d}</span></a>' for h, t, d in PAGES) + "</div>"
    ba = ('<div class="beforeafter"><div>Shipped in v0.22.0</div><div>Proposed</div>' +
          "".join(f"<div>{a}</div><div>{b}</div>" for a, b in BEFORE_AFTER) + "</div>")
    cov = ('<table class="spec" style="background:#fff;border-radius:12px;overflow:hidden"><tr><th>Shipped UI change</th><th>Source area</th><th>Screens</th></tr>' +
           "".join(f'<tr><td class="k" style="white-space:normal">{a}</td><td>{b}</td><td>{c}</td></tr>' for a, b, c in COVERAGE) + "</table>")
    om = '<ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.7">' + "".join(f"<li>{o}</li>" for o in OMITTED) + "</ul>"
    nb = '<ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.7">' + "".join(f"<li>{o}</li>" for o in NEW_BEHAVIOUR) + "</ul>"
    chk = '<ol class="checklist">' + "".join(f'<li><div>{a}<span class="ref">{b}</span></div></li>' for a, b in CHECKLIST) + "</ol>"
    body = (
        '<div class="hero"><span class="proto">APPROVED DESIGN, FROZEN FOR IMPLEMENTATION</span>'
        '<h1>Redesign of the UI shipped in v0.22.0</h1>'
        '<p>APPROVED by the owner on 2026-10-27 (structure, flows and icon-only Undo and Redo), with the condition that every fix also applies on desktop. Mobile first, with desktop at medium (1024 px) and wide widths, light and dark. 115 screens across 6 pages. Every screen uses the tokens of the current Default theme. '
        'No app code is changed. Implementation starts only after approval.</p></div>' +
        section("pages", "Pages", "Open a page. The switch at the top shows every frame in dark mode.", toc) +
        section("changes", "What changes", "Each problem in the shipped UI and its fix.", ba) +
        section("foundations", "Design foundations", "The system every screen uses.", foundations()) +
        section("coverage", "Coverage map", "Every user-facing change between v0.21.0 and v0.22.0 and where it is designed.", cov) +
        section("new", "New behaviour to confirm", "These go beyond the shipped behaviour. Each needs a yes.", nb) +
        section("omitted", "Not drawn", "Listed so nothing is missed.", om) +
        section("checklist", "Approval checklist", "Approved by the owner. Desktop must match every item.",
                f'<div class="card" style="max-width:920px">{chk}</div>'))
    return page("index.html", "Overview and system", "index.html", body)
