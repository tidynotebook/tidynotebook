from kit import *  # noqa: F403

NOTES_TODAY = [
    ("2026-10-26", "22 min"),
    ("Shared artefacts", "4 h"),
    ("Weight", "14 h"),
]
NOTES_YDAY = [
    ("2026-10-25", "1 d"),
    ("Trip plan", "1 d", "Travel"),
    ("Reading list", "1 d"),
]
NOTES_WEEK = [
    ("Q4 roadmap", "3 d", "Projects"),
    ("Book club", "4 d"),
    ("Groceries", "5 d"),
]


def rows(items, sel=None):
    """Return note rows with an optional selected row."""
    out = []
    for k, it in enumerate(items):
        out.append(note_row(it[0], it[1], it[2] if len(it) > 2 else None, "hov" if sel == k else ""))
    return f'<ul class="rows">{"".join(out)}</ul>'


def home_header(count="28 notes", ring=None):
    """Return the All notes header with the note count."""
    r = " ring" if ring else ""
    return (f'<div class="hdr"><h1 class="pt">All notes</h1><p class="pmeta">{count}</p>'
            f'<div class="acts">{btn("New note", "p" + r, "plus")}{btn("Use template", "s", "template")}</div></div>')


def all_notes(tip=True, sel=None, theme="", hots="", ring=None, extra_overlay=""):
    """Return the phone All notes screen."""
    t = f'<div style="padding:16px 16px 0">{tipline("Type <kbd>[[</kbd> to link a note.")}</div>' if tip else ""
    body = (topbar_home() + '<div class="scroll">' + home_header(ring=ring) + t +
            '<div class="grouplabel">Today</div>' + rows(NOTES_TODAY, sel) +
            '<div class="grouplabel">Yesterday</div>' + rows(NOTES_YDAY) +
            ('' if tip else '<div class="grouplabel">Earlier this week</div>' + rows(NOTES_WEEK)) + '</div>')
    return phone(body, theme, overlay=extra_overlay, hots=hots)


def drawer(theme="", sel="all", hots=""):
    """Return the phone navigation drawer."""
    def r(key, icon, name, right=""):
        """Return one drawer row."""
        return nav_row(icon, name, right, "sel" if sel == key else "")
    d = (f'<div class="drawer">{statusbar()}'
         f'<div class="dws"><span class="wsicon">P</span><span class="nm">Personal</span>{ibtn("down", "Switch workspace")}</div>'
         f'<ul class="rows" style="margin-top:4px">'
         f'{r("all", "file", "All notes", "<span class=count>28</span>")}{r("today", "today", "Today&#39;s note")}'
         f'{r("cal", "calendar", "Calendar")}'
         f'{r("att", "bell", "Needs attention", "<span class=badge>1</span>")}{r("trash", "trash", "Trash")}</ul>'
         f'<div class="grouplabel" style="display:flex;align-items:center;padding:16px 8px 2px 16px">'
         f'<span style="flex:1">Folders</span>{ibtn("folderplus", "New folder")}</div>'
         f'<ul class="rows">{folder_row("Projects", 6, "sel" if sel == "projects" else "")}'
         f'{folder_row("Templates", 3)}{folder_row("Travel", 4)}</ul>'
         f'<div style="margin-top:auto;border-top:1px solid var(--subtle);padding:6px 0 30px">'
         f'<ul class="rows">{nav_row("settings", "Settings")}</ul>'
         f'<div style="display:flex;align-items:center;gap:8px;padding:6px 16px 0;font-size:13px;color:var(--muted)">'
         f'<span class="dot"></span>All changes saved</div></div></div>')
    body = topbar_home() + '<div class="scroll">' + home_header() + "</div>"
    return phone(body, theme, overlay='<div class="scrim"></div>' + d, hots=hots)


def folder_page(theme="", overlay="", hots="", empty=False):
    """Return the phone folder page, with an optional empty state."""
    if empty:
        content = (f'<div class="hdr"><p class="eyebrow">{ic("folder")}Folder</p><h1 class="pt">Ideas</h1>'
                   f'<p class="pmeta">Empty</p></div>'
                   f'<div class="empty" style="padding-top:96px"><span class="eic">{ic("folder")}</span>'
                   f'<h2>This folder is empty</h2><p>New notes here go in Ideas.</p>'
                   f'<div class="btnrow">{btn("New note", "p", "plus")}{btn("Use template", "s", "template")}</div></div>')
    else:
        content = (f'<div class="hdr"><p class="eyebrow">{ic("folder")}Folder</p><h1 class="pt">Projects</h1>'
                   f'<p class="pmeta">2 folders, 6 notes</p>'
                   f'<div class="acts">{btn("New note", "p", "plus")}{btn("Use template", "s", "template")}</div></div>'
                   f'<div class="grouplabel">Folders</div><ul class="rows">{folder_row("Archive", 9)}{folder_row("Clients", 3)}</ul>'
                   f'<div class="grouplabel">Notes</div><ul class="rows">'
                   f'{note_row("Q4 roadmap", "3 d")}{note_row("Hiring plan", "5 d")}{note_row("Budget", "1 wk")}'
                   f'{note_row("Launch checklist", "2 wk")}</ul>')
    body = (appbar("back", "", ibtn("search", "Search") + ibtn("more", "Folder actions")) +
            f'<div class="scroll">{content}</div>')
    return phone(body, theme, overlay=overlay, hots=hots)


def folder_actions():
    """Return the folder actions sheet."""
    rows_ = (nav_row("folderplus", "New folder inside") + nav_row("pen", "Rename") + nav_row("move", "Move") +
             nav_row("trash", "Delete folder", cls="danger"))
    return (f'<div class="scrim"></div><div class="sheet actionsheet"><span class="grab"></span>'
            f'<div class="shd"><span class="st">Projects</span>{ibtn("x", "Close")}</div>'
            f'<ul class="rows">{rows_}</ul></div>')


def new_folder_sheet():
    """Return the New folder sheet."""
    body = (f'<label class="flabel">Name</label><div class="field focus">Clients<span class="caret" style="height:20px"></span></div>'
            f'<div style="height:12px"></div>{destrow("Inside", "Projects")}')
    return sheet("New folder", body, btn("Create folder", "p full"))


def account_menu():
    """Return the account menu sheet."""
    head = (f'<div style="display:flex;align-items:center;gap:12px;padding:4px 20px 12px">'
            f'<span class="avatar" style="width:44px;height:44px;font-size:17px">M</span>'
            f'<div><div class="strong">Mira Patel</div><div class="muted" style="font-size:14px">mira@example.com</div></div></div>')
    rows_ = nav_row("settings", "Settings") + nav_row("external", "Help") + nav_row("out", "Sign out")
    return (f'<div class="scrim"></div><div class="sheet actionsheet"><span class="grab"></span>'
            f'<div style="height:10px"></div>{head}<div class="divider" style="margin:0 16px 6px"></div>'
            f'<ul class="rows">{rows_}</ul></div>')


def calendar_sheet():
    """Return the daily note calendar sheet."""
    days = ["M", "T", "W", "T", "F", "S", "S"]
    head = "".join(f'<span style="text-align:center;font-size:12px;font-weight:600;color:var(--muted)">{d}</span>' for d in days)
    cells = []
    # October 2026 starts on Thursday.
    for _ in range(3):
        cells.append("<span></span>")
    has = {3, 5, 9, 12, 14, 19, 20, 22, 23, 25}
    for d in range(1, 32):
        style = "height:40px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:12px;font-size:15px;color:var(--strong);position:relative"
        if d == 26:
            style += ";background:var(--fill);color:var(--onfill);font-weight:700"
        dot = '<i style="position:absolute;bottom:5px;width:4px;height:4px;border-radius:50%;background:var(--muted)"></i>' if d in has else ""
        cells.append(f'<span style="{style}">{d}{dot}</span>')
    grid_ = f'<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">{head}{"".join(cells)}</div>'
    body = (f'<div style="display:flex;align-items:center;margin-bottom:8px"><span class="strong" style="flex:1;font-size:17px">October 2026</span>'
            f'{ibtn("back", "Previous month")}{ibtn("chev", "Next month")}</div>{grid_}'
            f'<p class="help" style="margin-top:12px">A dot means the day has a note.</p>')
    return sheet("Calendar", body, btn("Open today&#39;s note", "p full", "today"), top=250)


def new_note_editor(theme="", hots=""):
    """Return the editor for a new empty note."""
    body = (appbar("back", "", '<span class="pill"><span class="dot pend"></span>Saving</span>' + ibtn("more", "Note actions"), line=True) +
            '<div class="scroll"><div class="docv">'
            '<div style="font-size:28px;line-height:34px;font-weight:700;color:var(--strong);margin:4px 0 14px">'
            '<span style="background:color-mix(in srgb,var(--link) 22%,transparent);border-radius:4px">New note</span></div>'
            '<p class="muted" style="font-size:17px">Start writing</p></div></div>' +
            format_bar(undo=False, redo=False) + keyboard())
    return phone(body, theme, hots=hots)


def loading_home():
    """Return the loading All notes screen."""
    body = (topbar_home() + '<div class="scroll">' +
            '<div class="hdr"><h1 class="pt">All notes</h1><p class="pmeta"><span class="skel" style="display:inline-block;width:70px;height:10px"></span></p>'
            f'<div class="acts">{btn("New note", "p", "plus")}{btn("Use template", "s", "template")}</div></div>'
            '<div class="grouplabel"><span class="skel" style="display:inline-block;width:48px;height:10px"></span></div>' + skel_rows(8) +
            '<span style="position:absolute;width:1px;height:1px;overflow:hidden">Loading notes</span></div>')
    return phone(body)


def empty_home(theme=""):
    """Return the empty workspace screen."""
    body = (topbar_home() + '<div class="scroll"><div class="hdr"><h1 class="pt">All notes</h1></div>'
            f'<div class="empty" style="padding-top:110px"><span class="eic">{ic("file")}</span>'
            f'<h2>No notes yet</h2><p>Write your first note.</p>'
            f'<div class="btnrow">{btn("New note", "p", "plus")}{btn("Use template", "s", "template")}</div></div>'
            f'<div style="position:absolute;left:16px;right:16px;bottom:40px">{tipline("Notes save on this device first.")}</div></div>')
    return phone(body, theme)


def tips_card():
    """Return the writing tips card."""
    tips = [
        ("Type <kbd>[[</kbd> to link a note.", "1"),
        ("Templates save repeat typing.", "2"),
        ("Search finds text in notes.", "3"),
        ("Today&#39;s note is in the menu.", "4"),
        ("Notes save on this device first.", "5, also on the empty list"),
    ]
    rows_ = "".join(f'<div style="margin-top:10px">{tipline(t)}</div><div style="font-size:12px;color:var(--note);margin:4px 0 0 4px">{d}</div>' for t, d in tips)
    return (f'<div class="card" style="width:375px"><h3>Tip line</h3><p class="cl">One tip, one line, 6 words or less. '
            f'A different tip shows each time All notes opens. Close hides all tips for this account and workspace. Never more than one tip on a screen. No Next button: less to read, nothing to manage.</p>'
            f'<div class="screen" style="border-radius:12px;height:auto;padding:4px 0">{rows_}</div></div>')


def build():
    """Build the notes prototype page."""
    j1 = journey("Journey 1: write a new note", "Two taps from the list to typing.", [
        fig("A1", "All notes", all_notes(hots=tap(98, 205)),
            ["Count only. No sentence about where notes go.",
             "One filled button, &quot;New note&quot;. &quot;Use template&quot; is outlined with an icon, so it reads as a button.",
             "One tip line, 52 px, with a 44 px Close button. The next visit shows the next tip."]),
        arrow("Tap New note"),
        fig("A2", "New note opens", new_note_editor(),
            ["The note opens with its name selected, so typing replaces &quot;New note&quot;.",
             "The status shows &quot;Saving&quot; until the device has the note.",
             "Undo and Redo are icons. Both are dimmed: nothing to undo yet."]),
    ])
    states = grid(
        fig("A3", "All notes, tips closed", all_notes(tip=False),
            ["The list moves up. Nothing else changes.",
             "Group names: Today, Yesterday, Earlier this week, Earlier this month, Older.",
             "A note in a folder shows the folder after its name."]),
        fig("A4", "All notes, loading", loading_home(),
            ["Buttons work while the list loads.", "Rows show their shape, not a spinner."]),
        fig("A5", "All notes, empty", empty_home(),
            ["The same two buttons, centred. They are not also at the top.",
             "The tip line sits low, away from the main action."]),
        tips_card(),
    )
    nav = grid(
        fig("A6", "Menu", drawer(hots=hot(1, 120, 112) + hot(2, 150, 205) + hot(3, 250, 368) + hot(4, 120, 707)),
            ["Workspace switch at the top.", "Today&#39;s note and Calendar are fixed rows.",
             "The + next to Folders makes a folder at the top level.", "One short save line. All lines are in E1 on the Editor page."]),
        fig("A7", "Account menu", all_notes(extra_overlay=account_menu()),
            ["Opens from the avatar.", "Settings, Help, Sign out. Large rows."]),
        fig("A8", "Calendar", all_notes(extra_overlay=calendar_sheet()),
            ["Opens from the Calendar row.", "Tap a day to open its note. Today is filled."]),
    )
    folders = grid(
        fig("A9", "Folder page", folder_page(),
            ["The title is the place. Both buttons create notes in Projects. No &quot;Create in&quot; text.",
             "Sub-folders first, then notes."]),
        fig("A10", "Folder actions", folder_page(overlay=folder_actions()),
            ["From the &quot;...&quot; button.", "Delete is red and last. It asks first."]),
        fig("A11", "New folder", folder_page(overlay=new_folder_sheet()),
            ["&quot;Inside: Projects&quot; with Change. From the menu + it says &quot;Inside: None&quot;.",
             "Replaces the long sentence about the workspace root."]),
        fig("A12", "Empty folder", folder_page(empty=True),
            ["One line says where new notes go."]),
    )
    dark = grid(
        fig("A13", "All notes, dark", all_notes(theme="dark", sel=1, ring=True),
            ["Filled button turns light. Outlined buttons keep a visible edge.",
             "Focus ring shown on New note. Hover fill shown on a row."]),
        fig("A14", "Menu, dark", drawer(theme="dark", sel="projects")),
    )
    body = ('<div class="hero"><span class="proto">PROTOTYPE</span><h1>Notes and navigation</h1>'
            '<p>All notes, the menu, folders and tips. Phone first. Desktop versions are on the Desktop page.</p></div>' +
            section("j", "Main journey", "Tap marks show where the person taps. Numbers in the caption match the purple markers.", j1) +
            section("states", "All notes states", "Default, closed tips, loading and empty.", states) +
            section("nav", "Menu, account and calendar", "One menu for places, one menu for the account.", nav) +
            section("folders", "Folders", "The page title says where new notes go.", folders) +
            section("dark", "Dark mode", "The same layout and tokens as the current Default Dark theme.", dark))
    return page("01-notes.html", "Notes and navigation", "01-notes.html", body)
