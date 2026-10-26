from kit import *  # noqa: F403
from p_notes import folder_page, all_notes

TEMPLATES = [
    ("Meeting notes", "Date, people, notes, actions"),
    ("Weekly review", "Wins, misses, next week"),
    ("Trip plan", "Dates, bookings, packing list"),
    ("Book notes", "Title, author, quotes"),
]


def tpl_row(name, sub, cls=""):
    return (f'<li class="row {cls}"><span class="ic">{ic("template")}</span><span class="main"><span class="nm">{name}</span>'
            f'<span class="sub" style="display:block">{sub}</span></span><span class="chev">{ic("chev")}</span></li>')


def chooser_body(sel=None, search=False, items=TEMPLATES, query=""):
    s = ""
    if search:
        s = (f'<div class="search{" v" if query else ""}" style="margin:0 16px 8px">{ic("search")}'
             f'{query or "Search templates"}</div>')
    rows_ = "".join(tpl_row(n, d, "hov" if sel == k else "") for k, (n, d) in enumerate(items))
    return (f'{s}<ul class="rows">{rows_}</ul>'
            f'<p class="help" style="padding:4px 16px 0">From the Templates folder. <span style="color:var(--link);font-weight:600">Manage</span></p>')


def chooser(sel=None, top=None, search=False, items=TEMPLATES, query=""):
    return sheet("Use a template", chooser_body(sel, search, items, query), top=top, np=True)


def preview_doc(compact=False):
    return ('<div class="cmp" style="padding:16px 18px;font-size:15px;line-height:23px">'
            '<div style="font-size:21px;line-height:28px;font-weight:700;color:var(--strong);margin-bottom:10px">Meeting <span class="field-chip">Date</span></div>'
            '<div class="muted" style="font-size:13px;font-weight:600;margin-top:4px">People</div><div>&nbsp;</div>'
            '<div class="muted" style="font-size:13px;font-weight:600;margin-top:4px">Notes</div><div>&nbsp;</div>' +
            ('' if compact else '<div class="muted" style="font-size:13px;font-weight:600;margin-top:4px">Actions</div>'
             '<div style="display:flex;gap:8px;align-items:center"><i style="width:16px;height:16px;border:1.5px solid var(--border);border-radius:4px;display:inline-block"></i>&nbsp;</div>') +
            '</div>')


def preview_sheet(folder="None", state="ready", top=None, title="Meeting notes"):
    help_ = f'<p class="help" style="display:flex;align-items:center;gap:6px">{ic("info", "xs")}Date fills in when you create the note.</p>'
    if state == "loading":
        main = ('<div class="cmp" style="height:230px;display:flex;flex-direction:column;gap:12px">'
                '<span class="skel" style="width:60%;height:18px"></span><span class="skel" style="width:30%"></span>'
                '<span class="skel" style="width:80%"></span><span class="skel" style="width:45%"></span></div>')
        help_ = '<p class="help">Loading preview</p>'
    elif state == "failed":
        main = notice("bad", "Can&#39;t load this template. It is not on this device yet.", act=btn("Try again", "s sm", "refresh"))
        help_ = ""
    else:
        main = preview_doc()
    err = ""
    if state == "full":
        err = '<div style="margin-top:12px">' + notice("bad", "Note not made. This device is full. Free some space, then try again.") + "</div>"
    foot = {
        "ready": btn("Create note", "p full"),
        "full": btn("Create note", "p full"),
        "loading": btn("Create note", "p full dis", extra='aria-disabled="true"'),
        "failed": btn("Create note", "p full dis", extra='aria-disabled="true"'),
        "creating": btn('<span class="spin"></span>Creating note', "p full dis", extra='aria-busy="true"'),
    }[state if state in ("ready", "full", "loading", "failed", "creating") else "ready"]
    if state == "creating":
        main = preview_doc()
    body = f'{main}{help_}<div style="height:14px"></div>{destrow("Folder", folder)}{err}'
    return sheet(title, body, foot, top=top, back=True)


def folder_picker(sel="Projects", top=None):
    def r(name, ind=False, icon="folder", sub=""):
        on = name == sel
        s = f'<span class="sub" style="display:block">{sub}</span>' if sub else ""
        chk = f'<span class="check">{ic("check")}</span>' if on else ""
        return (f'<li class="row{" sel" if on else ""}{" indent" if ind else ""}"><span class="ic">{ic(icon)}</span>'
                f'<span class="main"><span class="nm">{name}</span>{s}</span>{chk}</li>')
    rows_ = (r("None", icon="file", sub="Shows in All notes only") + r("Projects") + r("Archive", True) + r("Clients", True) +
             r("Templates") + r("Travel"))
    return sheet("Choose folder", f'<ul class="rows">{rows_}</ul>', btn("Done", "p full"), top=top, back=True, np=True)


def created_editor(folder="Clients", theme=""):
    body = (appbar("back", "", '<span class="pill"><span class="dot"></span>Saved</span>' + ibtn("more", "Note actions"), line=True) +
            '<div class="scroll"><div class="docv" style="padding-top:8px">'
            f'<p class="eyebrow" style="font-size:13px">{ic("folder", "xs")}{folder}</p>'
            '<div style="font-size:28px;line-height:34px;font-weight:700;color:var(--strong);margin:2px 0 14px">'
            '<span style="background:color-mix(in srgb,var(--link) 22%,transparent);border-radius:4px">New note</span></div>'
            '<h2 style="margin-top:0">Meeting 26 October 2026</h2><p class="muted" style="font-size:14px;margin-top:-4px">People</p><p>&nbsp;</p>'
            '<p class="muted" style="font-size:14px">Notes</p></div></div>' + format_bar(undo=True, redo=False) + keyboard())
    return phone(body, theme)


def templates_desktop_note():
    return ""


def build():
    j = journey("Journey 2: note from a template, in a folder", "Five taps. Every step has one clear action.", [
        fig("B1", "Folder page", folder_page(hots=tap(261, 225)), ["Tap Use template. The folder is already known."]),
        arrow("Tap Use template"),
        fig("B2", "Use a template", folder_page(overlay=chooser(sel=0), hots=tap(150, 535)),
            ["One row per template: name and first line.", "Rows are 64 px. The whole row opens the preview."]),
        arrow("Tap a template"),
        fig("B3", "Preview", folder_page(overlay=preview_sheet("Projects"), hots=tap(291, 630)),
            ["The preview is read only and looks like the note will look.",
             "Fields show as blue chips. One line says when they fill in.",
             "&quot;Folder: Projects&quot; with Change. It starts with the folder you came from."]),
        arrow("Tap Change"),
        fig("B4", "Choose folder", folder_page(overlay=folder_picker("Clients"), hots=tap(160, 529)),
            ["Plain tree, check mark on the choice.", "&quot;None&quot; replaces &quot;workspace root&quot;."]),
        arrow("Tap Done, then Create note"),
        fig("B5", "Note created", created_editor(),
            ["The note opens in Clients with its name selected.", "Date is filled in. Undo is ready: it removes the template text."]),
    ])
    states = grid(
        fig("B6", "Loading templates", all_notes(extra_overlay=sheet("Use a template", skel_rows(4), np=True)),
            ["Row shapes, no spinner."]),
        fig("B7", "No templates yet", all_notes(extra_overlay=sheet("Use a template",
            f'<div class="empty" style="padding:16px 12px 8px"><span class="eic">{ic("template")}</span><h2>No templates yet</h2>'
            f'<p>A template is a note in the Templates folder.</p><div class="btncol">{btn("Create a template", "p full", "plus")}</div></div>',
            )),
            ["One sentence, one button.", "The button makes a note in the Templates folder and opens it."]),
        fig("B8", "Many templates, with search", all_notes(extra_overlay=chooser(search=True, items=TEMPLATES + [("Project brief", "Goal, scope, owner"), ("1:1 notes", "Wins, blockers, asks")], sel=None)),
            ["Search shows when there are more than 5 templates."]),
        fig("B9", "Search, no match", all_notes(extra_overlay=sheet("Use a template",
            f'<div class="search v" style="margin:0 16px 8px">{ic("search")}invoice</div>'
            f'<div class="empty" style="padding:28px 12px 8px"><h2 style="font-size:17px">No template matches &quot;invoice&quot;</h2></div>',
            np=True))),
        fig("B10", "Some templates missing", all_notes(extra_overlay=sheet("Use a template",
            '<div style="padding:0 16px 8px">' + notice("info", "Some templates may be missing. Connect to see all.") + "</div>" +
            '<ul class="rows">' + tpl_row(*TEMPLATES[0]) + tpl_row(*TEMPLATES[1]) + "</ul>", np=True)),
            ["Shown when the note list is not complete on this device."]),
        fig("B11", "Templates did not load", all_notes(extra_overlay=sheet("Use a template",
            notice("bad", "Templates did not load. Check your connection.", act=btn("Try again", "s sm", "refresh")), ))),
        fig("B12", "Preview loading", all_notes(extra_overlay=preview_sheet("None", "loading")),
            ["Create note is off until the text loads. No empty note can be made."]),
        fig("B13", "Preview failed", all_notes(extra_overlay=preview_sheet("None", "failed", title="Weekly review")),
            ["Short reason, one Try again."]),
        fig("B14", "Creating", all_notes(extra_overlay=preview_sheet("None", "creating")),
            ["Button shows progress and blocks a second tap."]),
        fig("B15", "Device full", all_notes(extra_overlay=preview_sheet("None", "full")),
            ["The sheet stays open, so nothing is lost.", "The person can try again after freeing space."]),
    )
    dark = grid(
        fig("B16", "Preview, dark", folder_page(theme="dark", overlay=preview_sheet("Projects"))),
        fig("B17", "Choose folder, dark", folder_page(theme="dark", overlay=folder_picker("None"))),
    )
    body = ('<div class="hero"><span class="proto">PROTOTYPE</span><h1>New note from a template</h1>'
            '<p>Replaces the dialog with chips and the &quot;Create in: workspace root&quot; text. '
            'Phone uses a two-step sheet. Desktop uses one dialog with the list and preview side by side (Desktop page, G3).</p></div>' +
            section("j", "Main journey", "From a folder page, so the folder is set for the person.", j) +
            section("states", "States", "Loading, empty, search, partial, errors and progress.", states) +
            section("dark", "Dark mode", "", dark))
    return page("02-templates.html", "New from template", "02-templates.html", body)
