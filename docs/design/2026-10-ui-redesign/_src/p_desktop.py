from kit import *  # noqa: F403
from p_templates import preview_doc, TEMPLATES


DIS = 'aria-disabled="true"'


def sidebar(sel="all", save=("dot", "All changes saved")):
    def r(key, icon, name, right=""):
        return nav_row(icon, name, right, "sel" if sel == key else "")
    folders = "".join(nav_row("folder", n, f'<span class="count">{c}</span>', "sel" if sel == n else "") for n, c in
                      [("Projects", 6), ("Templates", 4), ("Travel", 4)])
    return (f'<aside class="dside"><div class="dws"><span class="wsicon">P</span><span class="nm">Personal</span>'
            f'<span class="ibtn" style="width:32px;height:32px" role="button" aria-label="Switch workspace">{ic("down", "s")}</span>'
            f'<span class="ibtn" style="width:36px;height:36px" role="button" aria-label="Account menu"><span class="avatar" style="width:28px;height:28px;font-size:12px">M</span></span></div>'
            f'<div class="dsearch">{ic("search")}Search<kbd>Ctrl K</kbd></div>'
            f'<ul class="rows">{r("all", "file", "All notes", "<span class=count>28</span>")}{r("today", "today", "Today&#39;s note")}'
            f'{r("cal", "calendar", "Calendar")}{r("att", "bell", "Needs attention", "<span class=badge>1</span>")}{r("trash", "trash", "Trash")}</ul>'
            f'<div class="grouplabel" style="display:flex;align-items:center;padding-right:10px"><span style="flex:1">Folders</span>'
            f'<span class="ibtn" style="width:28px;height:28px" role="button" aria-label="New folder" title="New folder">{ic("folderplus", "xs")}</span></div>'
            f'<ul class="rows">{folders}</ul>'
            f'<div style="margin-top:auto"><ul class="rows" style="padding-bottom:4px">{nav_row("settings", "Settings")}</ul>'
            f'<div class="dfoot" style="margin-top:0"><span class="dot {"" if save[0] == "dot" else save[0]}"></span>{save[1]}'
            f'</div></div></aside>')


def drow(name, when, folder=None, cls=""):
    f = f' <span class="fold">&middot; {folder}</span>' if folder else ""
    return (f'<li class="row {cls}"><span class="ic">{ic("file")}</span><span class="main"><span class="nm">{name}{f}</span></span>'
            f'<span class="meta">{when}</span></li>')


def all_notes_desk(theme="", tip=True, hover=None):
    t = (f'<div style="margin-top:20px">{tipline("Press <kbd>Ctrl K</kbd> to search or run a command.")}</div>' if tip else "")
    lst = (f'<div class="dlist"><div class="grouplabel">Today</div><ul class="rows" style="padding:0">'
           f'{drow("2026-10-27", "22 minutes ago")}{drow("Shared artefacts", "4 hours ago", cls="hov" if hover == 1 else "")}{drow("Weight", "14 hours ago")}</ul>'
           f'<div class="grouplabel">Yesterday</div><ul class="rows" style="padding:0">{drow("2026-10-26", "1 day ago")}'
           f'{drow("Trip plan", "1 day ago", "Travel")}{drow("Reading list", "1 day ago")}</ul>'
           f'<div class="grouplabel">Earlier this week</div><ul class="rows" style="padding:0">{drow("Q4 roadmap", "3 days ago", "Projects")}</ul></div>')
    main = (f'<div class="dmain"><div class="dcontent"><div class="measure">'
            f'<div class="dpage-h"><div class="tt"><h1>All notes</h1><p class="pmeta">28 notes</p></div>'
            f'{btn("Use template", "s md", "template")}{btn("New note", "p md", "plus")}</div>{t}{lst}</div></div></div>')
    return desktop(f'<div class="dapp">{sidebar()}{main}</div>', "notes.example.com/w/personal", theme)


def template_dialog(theme=""):
    rows_ = "".join(f'<li class="row {"sel" if k == 0 else ""}" style="min-height:52px"><span class="ic">{ic("template")}</span><span class="main">'
                    f'<span class="nm" style="font-size:15px">{n}</span><span class="sub" style="display:block">{d}</span></span></li>'
                    for k, (n, d) in enumerate(TEMPLATES))
    dlg = (f'<div class="scrim"></div><div class="dialog" style="width:820px" role="dialog" aria-label="Use a template">'
           f'<div class="dh"><span class="st">Use a template</span>{ibtn("x", "Close")}</div>'
           f'<div style="display:flex;flex:1;min-height:0"><div style="width:300px;border-right:1px solid var(--subtle);padding:12px 8px">'
           f'<div class="search" style="height:38px;margin:0 6px 8px;font-size:14px">{ic("search")}Search templates</div><ul class="rows" style="padding:0">{rows_}</ul></div>'
           f'<div style="flex:1;padding:16px 20px;overflow:hidden">{preview_doc()}'
           f'<p class="help" style="display:flex;gap:6px;align-items:center">{ic("info", "xs")}Date fills in when you create the note.</p></div></div>'
           f'<div class="df"><span class="muted" style="font-size:14px">Folder</span><span class="strong">None</span>{btn("Change", "s sm")}'
           f'<span style="flex:1"></span>{btn("Cancel", "t md")}{btn("Create note", "p md")}</div></div>')
    main = (f'<div class="dmain"><div class="dcontent"><div class="measure"><div class="dpage-h"><div class="tt"><h1>All notes</h1>'
            f'<p class="pmeta">28 notes</p></div></div></div></div></div>')
    return desktop(f'<div class="dapp">{sidebar()}{main}</div>', "notes.example.com/w/personal", theme, overlay=dlg)


def editor_desk(theme="", tooltip=True):
    tip = ('<span class="tooltip" style="left:6px;top:46px">Undo <kbd>Ctrl Z</kbd></span>' if tooltip else "")
    toolbar = (f'<div class="dtoolbar" role="toolbar" aria-label="Format"><span style="position:relative;display:inline-flex">'
               f'{ibtn("undo", "Undo (Ctrl Z)", "hov")}{tip}</span>{ibtn("redo", "Redo (Ctrl Shift Z)", "dis", DIS)}'
               f'<span class="vr"></span>{ibtn("heading", "Heading")}{ibtn("bold", "Bold (Ctrl B)")}{ibtn("italic", "Italic (Ctrl I)")}'
               f'<span class="vr"></span>{ibtn("list", "List")}{ibtn("task", "Checklist")}<span class="vr"></span>'
               f'{ibtn("link", "Link")}{ibtn("image", "Image")}{ibtn("code", "Code")}</div>')
    top = (f'<div class="dtop"><span class="crumb">{ic("folder", "xs")}Projects <span style="opacity:.5">/</span> <b>Launch sync</b></span>'
           f'<span style="flex:1"></span><span class="pill"><span class="dot"></span>Saved</span>{ibtn("more", "Note actions")}</div>')
    doc = ('<div class="dcontent" style="padding-top:28px"><div class="measure docv ddoc" style="padding:0">'
           '<div style="font-size:32px;line-height:40px;font-weight:700;color:var(--strong);margin:0 0 16px;letter-spacing:-.02em">Launch sync</div>'
           '<h2 style="margin-top:0">People</h2><p>Sam, Priya, <span class="wl">Mira Patel</span></p>'
           '<h2>Notes</h2><p>We agreed on the new plan for the launch.<span class="caret"></span></p>'
           '<div class="task done"><i></i><span>Book the venue</span></div><div class="task"><i></i><span>Send the brief to Sam</span></div></div></div>')
    return desktop(f'<div class="dapp">{sidebar("Projects")}<div class="dmain">{top}{toolbar}{doc}</div></div>',
                   "notes.example.com/w/personal/notes/launch-sync", theme)


def settings_desk(page="appearance", theme=""):
    def r(name, key, val=""):
        v = f'<span class="meta">{val}</span>' if val else ""
        return f'<li class="row {"sel" if key == page else ""}"><span class="main"><span class="nm">{name}</span></span>{v}</li>'
    nav = (f'<aside class="dside"><div class="dws">{ibtn("back", "Back to notes")}<span class="nm">Settings</span></div>'
           f'<div class="grouplabel">General</div><ul class="rows">{r("Appearance", "appearance", "System")}'
           f'<li class="row"><span class="main"><span class="nm">Check spelling</span></span><span class="switch on" style="transform:scale(.8)"></span></li></ul>'
           f'<div class="grouplabel">Notes</div><ul class="rows">{r("Daily notes", "daily")}{r("Templates", "tpl")}{r("Offline", "offline")}{r("Export and import", "export")}</ul>'
           f'<div class="grouplabel">Account</div><ul class="rows">{r("Profile and email", "profile")}{r("Plan and billing", "billing", "Trial")}'
           f'{r("Devices", "devices", "3")}{r("API keys and apps", "keys")}</ul>'
           f'<div style="margin-top:auto;padding:8px 0 12px"><ul class="rows">{nav_row("out", "Sign out")}</ul></div></aside>')
    if page == "appearance":
        def sw(name, a, b, on=False):
            border = "2px solid var(--strong)" if on else "1px solid var(--subtle)"
            return (f'<div style="border:{border};border-radius:12px;padding:8px;background:var(--card)">'
                    f'<div style="height:56px;border-radius:8px;background:linear-gradient(90deg,{a} 50%,{b} 50%);border:1px solid var(--subtle)"></div>'
                    f'<div style="font-size:14px;font-weight:600;color:var(--strong);margin-top:6px">{name}</div></div>')
        seg = "".join(f'<span class="{"on" if m == "System" else ""}">{ic(i)}{m}</span>' for m, i in
                      [("System", "monitor"), ("Light", "sun"), ("Dark", "moon")])
        content = (f'<h1 style="margin:0 0 24px;font-size:28px;color:var(--strong)">Appearance</h1>'
                   f'<div class="label" style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:8px">Mode</div>'
                   f'<div class="seg" style="max-width:420px">{seg}</div><p class="help">System follows your device.</p>'
                   f'<div style="font-size:13px;font-weight:600;color:var(--muted);margin:28px 0 8px">Theme</div>'
                   f'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">{sw("Default", "#fff", "#191919", True)}'
                   f'{sw("Nord", "#eceff4", "#2e3440")}{sw("Solarized", "#fdf6e3", "#002b36")}{sw("Tokyo Night", "#e1e2e7", "#1a1b26")}'
                   f'{sw("GitHub", "#ffffff", "#0d1117")}{sw("Gruvbox", "#fbf1c7", "#282828")}{sw("Rose Pine", "#faf4ed", "#191724")}{sw("Dracula", "#f8f8f2", "#282a36")}</div>'
                   f'<div style="display:flex;gap:8px;margin-top:14px">{btn("Show all 12 themes", "t md", "down")}{btn("Import theme file", "s md", "upload")}</div>')
    else:
        def d(icon, name, sub, act=True):
            b = btn("Sign out", "s sm") if act else '<span class="pill" style="height:26px;font-size:12px">This device</span>'
            return srow(icon, name, chev=False, sub=sub, right=b)
        content = (f'<h1 style="margin:0 0 6px;font-size:28px;color:var(--strong)">Devices</h1><p class="help" style="margin:0 0 20px">Signed in to your account.</p>'
                   f'<ul class="slist">{d("laptop", "Mac, Firefox", "Active now", False)}{d("phone", "iPhone, Safari", "Active 2 hours ago")}'
                   f'{d("monitor", "Linux, Chrome", "Active 9 days ago")}</ul><div style="margin-top:16px">{btn("Sign out all other devices", "dl md")}</div>')
    main = f'<div class="dmain"><div class="dcontent"><div style="max-width:720px">{content}</div></div></div>'
    return desktop(f'<div class="dapp">{nav}{main}</div>', f"notes.example.com/settings/{page}", theme, size="h-s")


def recovery_desk(theme=""):
    col = ('<div class="cmp" style="flex:1"><div class="cm">{icon}{meta}</div><b>People</b><br>Sam, Priya<br><br><b>Notes</b><br>{txt}</div>')
    a = col.format(icon=ic("laptop", "xs"), meta="This device, 9:31",
                   txt='We agreed on the <ins>new plan for the launch</ins>.<br><ins>Sam owns the budget.</ins>')
    b = col.format(icon=ic("cloud", "xs"), meta="Saved version, from iPhone, 9:35",
                   txt='We agreed on the <del>old</del> plan.<br>Priya books the venue.')
    top = (f'<div class="dtop"><span class="crumb">{ic("folder", "xs")}Projects <span style="opacity:.5">/</span> <b>Launch sync</b></span></div>')
    content = (f'<div class="dcontent"><div style="max-width:960px;margin:0 auto">'
               f'<h1 style="margin:0;font-size:28px;color:var(--strong)">Choose a version</h1>'
               f'<p class="help" style="margin:4px 0 20px">This note changed on another device. The text you do not keep stays in Needs attention.</p>'
               f'<div style="display:flex;gap:16px">{a}{b}</div>'
               f'<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">{btn("Use saved version", "s md")}{btn("Keep this device&#39;s text", "p md")}</div>'
               f'</div></div>')
    return desktop(f'<div class="dapp">{sidebar("Projects")}<div class="dmain">{top}{content}</div></div>',
                   "notes.example.com/w/personal/notes/launch-sync", theme, size="h-s")


def palette_desk(theme=""):
    def h(name, snip, sel=False):
        return (f'<li class="row {"sel" if sel else ""}" style="min-height:52px"><span class="ic">{ic("file")}</span><span class="main">'
                f'<span class="nm" style="font-size:15px">{name}</span><span class="sub" style="display:block">{snip}</span></span>'
                f'{"<kbd>Enter</kbd>" if sel else ""}</li>')
    dlg = (f'<div class="scrim"></div><div class="dialog" style="width:640px;top:250px">'
           f'<div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--subtle)">{ic("search")}'
           f'<span style="font-size:17px;color:var(--strong);flex:1">launch<span class="caret" style="height:20px"></span></span>'
           f'<span class="muted" style="font-size:13px">In Personal</span></div>'
           f'<div style="padding:8px"><div class="grouplabel" style="padding:6px 10px">Notes</div><ul class="rows" style="padding:0">'
           f'{h("Launch sync", "Projects &middot; ...new plan for the <b>launch</b>.", True)}{h("Q4 roadmap", "Projects &middot; <b>Launch</b> in March")}</ul>'
           f'<div class="grouplabel" style="padding:10px 10px 6px">Actions</div><ul class="rows" style="padding:0">'
           f'{nav_row("plus", "New note &quot;launch&quot;")}{nav_row("template", "Use a template")}</ul></div>'
           f'<div style="display:flex;gap:16px;padding:10px 18px;border-top:1px solid var(--subtle);font-size:12px;color:var(--muted)">'
           f'<span><kbd>&uarr;</kbd> <kbd>&darr;</kbd> Move</span><span><kbd>Enter</kbd> Open</span><span><kbd>Esc</kbd> Close</span></div></div>')
    return desktop(f'<div class="dapp">{sidebar()}<div class="dmain"></div></div>', "notes.example.com/w/personal", theme, overlay=dlg, size="h-s")


def history_desk(theme=""):
    def v(when, sub, sel=False):
        return (f'<li class="row {"sel" if sel else ""}" style="min-height:52px"><span class="main"><span class="nm" style="font-size:15px">{when}</span>'
                f'<span class="sub" style="display:block">{sub}</span></span></li>')
    left = (f'<div style="width:300px;border-right:1px solid var(--subtle);padding:16px 8px;overflow:hidden">'
            f'<div class="grouplabel" style="padding:0 12px 6px">Today</div><ul class="rows" style="padding:0">'
            f'{v("Current version, 9:41", "Saved")}{v("9:12", "+42 words, -3 words", True)}{v("8:30", "+120 words")}</ul>'
            f'<div class="grouplabel" style="padding:14px 12px 6px">Yesterday</div><ul class="rows" style="padding:0">{v("17:05", "+18 words, -40 words")}{v("11:20", "+6 words")}</ul></div>')
    right = (f'<div style="flex:1;padding:20px 28px;overflow:hidden"><div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">'
             f'<div class="tabs" style="width:260px"><span class="on">Changes</span><span>Preview</span></div><span style="flex:1"></span>'
             f'{btn("Restore this version", "p md", "restore")}</div>'
             f'<div class="cmp"><div class="cm">Compared with current</div><b>People</b><br>Sam, Priya, <ins>Mira Patel</ins><br><br>'
             f'<b>Notes</b><br>We agreed on the <del>old plan</del><ins>new plan for the launch</ins>.<br><ins>Sam owns the budget.</ins></div></div>')
    top = (f'<div class="dtop">{ibtn("back", "Back to note")}<span class="crumb"><b>Version history</b> <span style="opacity:.5">&middot;</span> Launch sync</span>'
           f'<span style="flex:1"></span><span class="help" style="margin:0">Restore makes a version the newest. Nothing is lost.</span></div>')
    return desktop(f'<div class="dapp">{sidebar("Projects")}<div class="dmain">{top}<div style="display:flex;flex:1;min-height:0">{left}{right}</div></div></div>',
                   "notes.example.com/w/personal/notes/launch-sync/history", theme, size="h-s")


def folder_desk(theme="", menu=False, empty=False):
    if empty:
        content = (f'<div class="dpage-h"><div class="tt"><p class="eyebrow" style="font-size:13px">{ic("folder", "xs")}Folder</p><h1>Ideas</h1>'
                   f'<p class="pmeta">Empty</p></div>{btn("Use template", "s md", "template")}{btn("New note", "p md", "plus")}</div>'
                   f'<div class="empty" style="padding-top:80px"><span class="eic">{ic("folder")}</span><h2>This folder is empty</h2>'
                   f'<p>New notes here go in Ideas.</p></div>')
    else:
        content = (f'<div class="dpage-h"><div class="tt"><p class="eyebrow" style="font-size:13px">{ic("folder", "xs")}Folder</p><h1>Projects</h1>'
                   f'<p class="pmeta">2 folders, 6 notes</p></div>{ibtn("more", "Folder actions", "on" if menu else "")}'
                   f'{btn("Use template", "s md", "template")}{btn("New note", "p md", "plus")}</div>'
                   f'<div class="dlist"><div class="grouplabel">Folders</div><ul class="rows" style="padding:0">'
                   f'{nav_row("folder", "Archive", "<span class=count>9</span>")}{nav_row("folder", "Clients", "<span class=count>3</span>")}</ul>'
                   f'<div class="grouplabel">Notes</div><ul class="rows" style="padding:0">{drow("Q4 roadmap", "3 days ago")}'
                   f'{drow("Hiring plan", "5 days ago", cls="hov")}{drow("Budget", "1 week ago")}{drow("Launch checklist", "2 weeks ago")}</ul></div>')
    menu_html = ""
    if menu:
        menu_html = (f'<div class="menu" style="left:calc(50% + 20px);top:150px" role="menu">'
                     f'<ul class="rows" style="padding:0">{nav_row("folderplus", "New folder inside")}{nav_row("pen", "Rename")}{nav_row("move", "Move")}</ul>'
                     f'<div class="sep"></div><ul class="rows" style="padding:0">{nav_row("trash", "Delete folder", cls="danger")}</ul></div>')
    name = "Ideas" if empty else "Projects"
    main = f'<div class="dmain"><div class="dcontent"><div class="measure">{content}</div></div>{menu_html}</div>'
    return desktop(f'<div class="dapp">{sidebar(name if not empty else "")}{main}</div>', f"notes.example.com/w/personal/folders/{name.lower()}", theme, size="h-s")


def editor_menu_desk(theme=""):
    top = (f'<div class="dtop"><span class="crumb">{ic("folder", "xs")}Projects <span style="opacity:.5">/</span> <b>Launch sync</b></span>'
           f'<span style="flex:1"></span><span class="pill" style="border-color:var(--focus)"><span class="dot off"></span>Offline</span>{ibtn("more", "Note actions", "on")}</div>')
    pop = (f'<div class="menu" style="right:60px;top:52px;width:300px;padding:14px 16px" role="dialog" aria-label="Save details">'
           f'<div class="strong" style="margin-bottom:4px">Saved on this device</div>'
           f'<p class="help" style="margin:0 0 10px">No connection. Your changes upload when you are online.</p>'
           f'<div style="display:flex;justify-content:space-between;font-size:14px;padding:6px 0;border-top:1px solid var(--subtle)"><span>Waiting to upload</span><span class="muted">2 changes</span></div></div>')
    acts = (f'<div class="menu" style="right:12px;top:290px" role="menu"><ul class="rows" style="padding:0">'
            f'{nav_row("history", "Version history")}{nav_row("pen", "Rename")}{nav_row("move", "Move")}{nav_row("globe", "Publish")}{nav_row("copy", "Make a copy")}</ul>'
            f'<div class="sep"></div><ul class="rows" style="padding:0">{nav_row("trash", "Move to Trash", cls="danger")}</ul></div>')
    doc = ('<div class="dcontent" style="padding-top:28px"><div class="measure docv ddoc" style="padding:0">'
           '<div style="font-size:32px;line-height:40px;font-weight:700;color:var(--strong);margin:0 0 16px">Launch sync</div>'
           '<h2 style="margin-top:0">People</h2><p>Sam, Priya</p><h2>Notes</h2><p>We agreed on the new plan for the launch.</p></div></div>')
    toolbar = (f'<div class="dtoolbar">{ibtn("undo", "Undo (Ctrl Z)")}{ibtn("redo", "Redo (Ctrl Shift Z)", "dis", DIS)}'
               f'<span class="vr"></span>{ibtn("heading", "Heading")}{ibtn("bold", "Bold (Ctrl B)")}{ibtn("italic", "Italic (Ctrl I)")}'
               f'<span class="vr"></span>{ibtn("list", "List")}{ibtn("task", "Checklist")}<span class="vr"></span>{ibtn("link", "Link")}{ibtn("image", "Image")}{ibtn("code", "Code")}</div>')
    return desktop(f'<div class="dapp">{sidebar("Projects", ("off", "Offline. Saved on this device."))}<div class="dmain">{top}{toolbar}{doc}{pop}</div></div>',
                   "notes.example.com/w/personal/notes/launch-sync", theme, size="h-s")


def calendar_desk(theme=""):
    days = "".join(f'<span style="text-align:center;font-size:11px;font-weight:600;color:var(--muted)">{d}</span>' for d in "MTWTFSS")
    cells = "<span></span>" * 3
    has = {3, 5, 9, 12, 14, 19, 20, 22, 23, 25, 26}
    for n in range(1, 32):
        st = "height:30px;display:flex;align-items:center;justify-content:center;border-radius:8px;font-size:13px;color:var(--strong);position:relative"
        if n == 27:
            st += ";background:var(--fill);color:var(--onfill);font-weight:700"
        dot = '<i style="position:absolute;bottom:3px;width:3px;height:3px;border-radius:50%;background:var(--muted)"></i>' if n in has else ""
        cells += f'<span style="{st}">{n}{dot}</span>'
    pop = (f'<div class="menu" style="left:12px;top:150px;width:300px;padding:14px" role="dialog" aria-label="Calendar">'
           f'<div style="display:flex;align-items:center;margin-bottom:8px"><span class="strong" style="flex:1">October 2026</span>'
           f'<span class="ibtn" style="width:32px;height:32px">{ic("back", "s")}</span><span class="ibtn" style="width:32px;height:32px">{ic("chev", "s")}</span></div>'
           f'<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">{days}{cells}</div>'
           f'<div style="margin-top:12px">{btn("Open today&#39;s note", "p md full", "today")}</div></div>')
    main = (f'<div class="dmain"><div class="dcontent"><div class="measure"><div class="dpage-h"><div class="tt"><h1>All notes</h1><p class="pmeta">28 notes</p></div>'
            f'{btn("Use template", "s md", "template")}{btn("New note", "p md", "plus")}</div></div></div>{pop}</div>')
    return desktop(f'<div class="dapp">{sidebar("cal")}{main}</div>', "notes.example.com/w/personal", theme, size="h-s")


def empty_desk(theme=""):
    main = (f'<div class="dmain"><div class="dcontent"><div class="measure"><div class="dpage-h"><div class="tt"><h1>All notes</h1></div></div>'
            f'<div class="empty" style="padding-top:90px"><span class="eic">{ic("file")}</span><h2>No notes yet</h2><p>Write your first note.</p>'
            f'<div class="btnrow" style="max-width:340px">{btn("New note", "p md", "plus")}{btn("Use template", "s md", "template")}</div></div>'
            f'<div style="max-width:420px;margin:48px auto 0">{tipline("Notes save on this device first.")}</div></div></div></div>')
    return desktop(f'<div class="dapp">{sidebar()}{main}</div>', "notes.example.com/w/personal", theme, size="h-s")


def medium_notes(theme=""):
    return all_notes_desk(theme).replace('<div class="desktop ">', '<div class="desktop m">', 1)


def medium_settings(theme=""):
    return settings_desk("devices", theme).replace('<div class="desktop h-s">', '<div class="desktop m h-s">', 1)


def build():
    figs = [
        fig("G1", "All notes", all_notes_desk(),
            ["The menu is always open on the left. Search shows its shortcut.",
             "Buttons sit right of the title. The filled one is last.", "Relative times are written out on desktop."], wide=True),
        fig("G2", "All notes, dark, tips closed", all_notes_desk("dark", tip=False, hover=1), ["Hover fill on a row."], wide=True),
        fig("G3", "Use a template", template_dialog(),
            ["List and preview side by side. Arrow keys move the list, Enter creates.",
             "Folder row and the two buttons share the footer. Cancel is a quiet text button."], wide=True),
        fig("G4", "Editor with Undo and Redo", editor_desk(),
            ["Undo and Redo are icon buttons, first in the toolbar.", "Tooltip on hover and focus gives the name and shortcut.",
             "Redo is dimmed: nothing to redo."], wide=True),
        fig("G5", "Settings: Appearance", settings_desk(),
            ["The settings list replaces the note menu. Back returns to notes.",
             "Each page has its own address, so links and the browser Back button work."], wide=True),
        fig("G6", "Settings: Devices, dark", settings_desk("devices", "dark"), [], wide=True),
        fig("G7", "Choose a version", recovery_desk(),
            ["Wide screens show both texts side by side. No tabs needed.", "Filled button on the right, in reading order."], wide=True),
        fig("G8", "Search (Ctrl K)", palette_desk(),
            ["Scope sits in the field as a quiet label.", "Key hints in the footer."], wide=True),
        fig("G9", "Version history", history_desk("dark"), ["List and comparison side by side."], wide=True),
        fig("G10", "Folder page", folder_desk(), ["Same buttons as All notes. The title says where notes go.", "Folder actions sit in the &quot;...&quot; button."], wide=True),
        fig("G11", "Folder actions menu, dark", folder_desk("dark", menu=True), ["Delete is red, last, and asks first."], wide=True),
        fig("G12", "Empty folder", folder_desk(empty=True), ["No extra text about the workspace."], wide=True),
        fig("G13", "All notes, empty", empty_desk(), ["Buttons centred under the message. Tip line low."], wide=True),
        fig("G14", "Calendar", calendar_desk(), ["Opens from the Calendar row as a panel beside the menu.", "Today is filled. Open today&#39;s note is the one main action."], wide=True),
        fig("G15", "Save details and note actions", editor_menu_desk(),
            ["Pill opens a small panel, not a sheet. Focus ring shown on the pill.", "Note actions open from &quot;...&quot;. Two separate menus are shown together here only for review."], wide=True),
        fig("G16", "Medium width (1024 px): All notes", medium_notes(), ["The menu stays open. The text column narrows. Buttons stay on one line."], wide=True),
        fig("G17", "Medium width (1024 px): Settings, dark", medium_settings("dark"), ["Two panes still fit. Rows keep their buttons on one line."], wide=True),
    ]
    body = ('<div class="hero"><span class="proto">PROTOTYPE</span><h1>Desktop</h1>'
            '<p>From 1024 px wide (medium) up to wide screens. Same words, tokens and button rules as phone. Sheets become centred dialogs. '
            'Tabs become side by side columns where space allows.</p></div>' +
            section("d", "Desktop screens", "Light and dark mixed. Use the switch at the top to see all in dark.",
                    '<div class="grid" style="flex-direction:column">' + "".join(figs) + "</div>"))
    return page("06-desktop.html", "Desktop", "06-desktop.html", body)
