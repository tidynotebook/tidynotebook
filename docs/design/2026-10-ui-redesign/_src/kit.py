"""Shared kit for the prototype design pages. Not product code.

Each page is one self-contained HTML file: shared CSS and the icon sprite are
inlined, so a page opens from disk with no server and no network.
"""
from pathlib import Path

SRC = Path(__file__).resolve().parent
OUT = SRC.parent
CSS = (SRC / "base.css").read_text()

# 24 px grid, 1.75 stroke, round caps and joins: one icon family.
_P = 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"'
ICONS = {
    "menu": '<path d="M4 7h16M4 12h16M4 17h16"/>',
    "search": '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "template": '<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h4"/>',
    "file": '<path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z"/><path d="M14 3v5h5"/>',
    "folder": '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.6l2 2.2H18a2.5 2.5 0 0 1 2.5 2.5v7.8A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5z"/>',
    "folderplus": '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.6l2 2.2H18a2.5 2.5 0 0 1 2.5 2.5v7.8A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5z"/><path d="M12 10.5v6M9 13.5h6"/>',
    "x": '<path d="M6 6l12 12M18 6 6 18"/>',
    "back": '<path d="m15 5-7 7 7 7"/>',
    "chev": '<path d="m9 6 6 6-6 6"/>',
    "down": '<path d="m6 9 6 6 6-6"/>',
    "more": '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
    "calendar": '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/>',
    "today": '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/><rect x="8" y="13" width="3.5" height="3.5" rx=".8" fill="currentColor" stroke="none"/>',
    "trash": '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12a1.8 1.8 0 0 0 1.8 1.6h5.6a1.8 1.8 0 0 0 1.8-1.6l.9-12"/>',
    "settings": '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    "alert": '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><circle cx="12" cy="16.3" r=".6" fill="currentColor"/>',
    "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/>',
    "warn": '<path d="M10.3 4.2 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4"/><circle cx="12" cy="16.6" r=".6" fill="currentColor"/>',
    "check": '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    "checkcircle": '<circle cx="12" cy="12" r="9"/><path d="m8.2 12.3 2.6 2.6 5-5.3"/>',
    "undo": '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    "redo": '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    "bold": '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
    "italic": '<path d="M14 5h5M5 19h5M15 5 9 19"/>',
    "heading": '<path d="M6 5v14M18 5v14M6 12h12"/>',
    "list": '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="4.5" cy="7" r=".9" fill="currentColor"/><circle cx="4.5" cy="12" r=".9" fill="currentColor"/><circle cx="4.5" cy="17" r=".9" fill="currentColor"/>',
    "task": '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    "link": '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    "image": '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m20.5 16-4.5-4.5L6 19.5"/>',
    "code": '<path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    "moon": '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    "monitor": '<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>',
    "phone": '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    "laptop": '<path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5V15H5z"/><path d="M3 18h18"/>',
    "pen": '<path d="M4 20l1-4.5L16.5 4a2.1 2.1 0 0 1 3 3L8 18.5z"/>',
    "cloud": '<path d="M7 18.5h10a4 4 0 0 0 .6-8 6 6 0 0 0-11.5 1.4A3.4 3.4 0 0 0 7 18.5z"/>',
    "cloudoff": '<path d="M3 3l18 18"/><path d="M9 5.4A6 6 0 0 1 17.6 10.5a4 4 0 0 1 2.3 7M17 18.5H7a3.4 3.4 0 0 1-.9-6.6 6 6 0 0 1 .4-2"/>',
    "user": '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    "key": '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M16 7l2.5 2.5M18.5 4.5 21 7"/>',
    "out": '<path d="M14 4h-7.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H14"/><path d="M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5"/>',
    "download": '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
    "upload": '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 20h14"/>',
    "card": '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
    "bell": '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2.5h-15z"/><path d="M10 21h4"/>',
    "spell": '<path d="m4 16 4-10 4 10M5.5 12.5h5"/><path d="m14 15 2.5 2.5L21 12"/>',
    "palette": '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11" r="1" fill="currentColor"/><circle cx="10.5" cy="7" r="1" fill="currentColor"/><circle cx="15.5" cy="7.5" r="1" fill="currentColor"/>',
    "offline": '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M12 7.5v6M9.5 11 12 13.5l2.5-2.5"/>',
    "archive": '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4"/>',
    "plug": '<path d="M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0zM12 16.5V21"/>',
    "history": '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4.5V9H8"/><path d="M12 7.5V12l3 2"/>',
    "move": '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.6l2 2.2H18a2.5 2.5 0 0 1 2.5 2.5v7.8A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5z"/><path d="M9 13.5h6M12.5 11l2.5 2.5-2.5 2.5"/>',
    "globe": '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    "zoomin": '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M11 8v6M8 11h6"/>',
    "zoomout": '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M8 11h6"/>',
    "external": '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
    "bulb": '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    "refresh": '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
    "mail": '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
    "lock": '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    "copy": '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>',
    "restore": '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4.5V9H8"/>',
    "wifi": '<path d="M2 8.5a15 15 0 0 1 20 0M5 12a10.5 10.5 0 0 1 14 0M8.5 15.5a5.5 5.5 0 0 1 7 0"/><circle cx="12" cy="19" r="1" fill="currentColor"/>',
    "signal": '<path d="M5 18v-2M9.5 18v-5M14 18v-8M18.5 18V7" stroke-width="2.4"/>',
    "arrow": '<path d="M2 10h48M42 3l8 7-8 7"/>',
}


def sprite():
    out = ['<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>']
    for name, body in ICONS.items():
        vb = "0 0 52 20" if name == "arrow" else "0 0 24 24"
        out.append(f'<symbol id="i-{name}" viewBox="{vb}" {_P}>{body}</symbol>')
    out.append("</defs></svg>")
    return "".join(out)


def ic(name, cls="", label=None):
    aria = f'role="img" aria-label="{label}"' if label else 'aria-hidden="true"'
    return f'<svg class="i {cls}" {aria}><use href="#i-{name}"/></svg>'


# ---------------- primitives ----------------

def ibtn(name, label, cls="", extra=""):
    return f'<span class="ibtn {cls}" role="button" aria-label="{label}" title="{label}" {extra}>{ic(name)}</span>'


def btn(label, kind="s", icon=None, cls="", extra=""):
    i = ic(icon) if icon else ""
    return f'<span class="btn {kind} {cls}" role="button" {extra}>{i}{label}</span>'


def avatar(letter="M"):
    return f'<span class="ibtn" role="button" aria-label="Account menu"><span class="avatar">{letter}</span></span>'


def statusbar(time="9:41", signal=True):
    sig = ic("signal") if signal else '<span style="opacity:.3;display:inline-flex">' + ic("signal") + "</span>"
    return (f'<div class="statusbar"><span>{time}</span><span class="island"></span>'
            f'<span class="sys">{sig}{ic("wifi") if signal else ""}<span class="batt"></span></span></div>')


def appbar(left="menu", title="", right="", line=False, center=False):
    lefts = {
        "menu": ibtn("menu", "Open menu"),
        "back": ibtn("back", "Back"),
        "close": ibtn("x", "Close"),
        "": "",
    }
    lh = lefts.get(left, left)
    t = f'<span class="ttl{" c" if center else ""}">{title}</span>' if title else '<span class="sp"></span>'
    return f'<div class="appbar{" line" if line else ""}">{lh}{t}{right}</div>'


def topbar_home():
    return appbar("menu", "", ibtn("search", "Search") + avatar())


def phone(body, theme="", time="9:41", signal=True, overlay="", hots="", bg=""):
    th = (" t-dark" if theme == "dark" else "") + (" sbgs" if bg else "")
    style = f' style="background:{bg}"' if bg else ""
    return (f'<div class="phone"><div class="screen{th}"{style}>{statusbar(time, signal)}{body}{overlay}'
            f'<span class="homebar"></span>{hots}</div></div>')


def desktop(body, url="notes.example.com", theme="", overlay="", hots="", size=""):
    th = " t-dark" if theme == "dark" else ""
    return (f'<div class="desktop {size}"><div class="chrome"><span class="lights"><i></i><i></i><i></i></span>'
            f'<span class="url">{ic("lock", "xs")}&nbsp;{url}</span><span style="width:52px"></span></div>'
            f'<div class="screen{th}">{body}{overlay}{hots}</div></div>')


def fig(sid, title, frame, notes=(), wide=False, tags=()):
    ol = "".join(f"<li>{n}</li>" for n in notes)
    tg = "".join(f"<span>{t}</span>" for t in tags)
    chips = f'<div class="chiplist">{tg}</div>' if tags else ""
    return (f'<figure class="fig{" w-desk" if wide else ""}" id="{sid}">{frame}'
            f'<figcaption><div class="t"><span class="sid">{sid}</span>{title}</div>{chips}'
            f'{"<ol>" + ol + "</ol>" if ol else ""}</figcaption></figure>')


def hot(n, x, y):
    return f'<span class="hot" style="left:{x}px;top:{y}px">{n}</span>'


def tap(x, y):
    return f'<span class="tap" style="left:{x}px;top:{y}px"></span>'


def arrow(label):
    return f'<div class="step-arrow"><svg viewBox="0 0 52 20"><use href="#i-arrow"/></svg>{label}</div>'


def journey(title, desc, items):
    inner = "".join(items)
    return f'<div class="jhead"><h3>{title}</h3><p>{desc}</p></div><div class="journey">{inner}</div>'


def section(sid, title, lead, inner):
    return f'<section class="sec" id="{sid}"><h2>{title}</h2><p class="lead">{lead}</p>{inner}</section>'


def grid(*figs):
    return f'<div class="grid">{"".join(figs)}</div>'


# ---------------- composite pieces ----------------

def note_row(name, when, folder=None, cls="", icon="file"):
    f = f' <span class="fold">· {folder}</span>' if folder else ""
    return (f'<li class="row {cls}"><span class="ic">{ic(icon)}</span><span class="main"><span class="nm">{name}{f}</span></span>'
            f'<span class="meta">{when}</span></li>')


def folder_row(name, count, cls=""):
    return (f'<li class="row {cls}"><span class="ic">{ic("folder")}</span><span class="main"><span class="nm">{name}</span></span>'
            f'<span class="count">{count}</span></li>')


def nav_row(icon, name, right="", cls=""):
    return f'<li class="row {cls}"><span class="ic">{ic(icon)}</span><span class="main"><span class="nm">{name}</span></span>{right}</li>'


def srow(icon, name, val="", chev=True, cls="", sub="", right=""):
    ico = f'<span class="ico">{ic(icon)}</span>' if icon else ""
    s = f'<span class="sub">{sub}</span>' if sub else ""
    v = f'<span class="val">{val}</span>' if val else ""
    c = f'<span class="chev">{ic("chev")}</span>' if chev else ""
    return f'<li class="srow {cls}">{ico}<span class="main"><span class="nm">{name}</span>{s}</span>{v}{right}{c}</li>'


def tipline(text, extra=""):
    return (f'<div class="tipline" role="note" {extra}>{ic("bulb")}<span class="txt">{text}</span>'
            f'{ibtn("x", "Hide tips")}</div>')


def notice(kind, text, icon=None, act=""):
    icons = {"bad": "alert", "info": "info", "warn": "warn", "ok": "checkcircle"}
    a = f'<div class="act">{act}</div>' if act else ""
    return f'<div class="notice {kind}">{ic(icon or icons[kind])}<div class="txt">{text}{a}</div></div>'


def destrow(key, val, icon="folder", action="Change"):
    return (f'<div class="destrow"><span class="ic">{ic(icon, "s")}</span><span class="main"><span class="k">{key}</span>'
            f'<span class="v" style="display:block">{val}</span></span>{btn(action, "s sm")}</div>')


def sheet(title, body, foot="", top=None, back=False, close=True, height=None, np=False):
    pos = f"top:{top}px" if top is not None else (f"height:{height}px" if height else "")
    lb = ibtn("back", "Back") if back else ""
    cb = ibtn("x", "Close") if close else ""
    ft = f'<div class="sft">{foot}</div>' if foot else ""
    return (f'<div class="scrim"></div><div class="sheet" style="{pos}"><span class="grab"></span>'
            f'<div class="shd{" back" if back else ""}">{lb}<span class="st">{title}</span>{cb}</div>'
            f'<div class="sbody{" np" if np else ""}">{body}</div>{ft}</div>')


def skel_rows(n=6, widths=(62, 45, 70, 38, 55, 66, 48, 58)):
    out = []
    for k in range(n):
        w = widths[k % len(widths)]
        out.append(f'<div class="skelrow"><span class="skel ic"></span><span class="skel" style="width:{w}%"></span>'
                   f'<span class="skel" style="width:44px;margin-left:auto"></span></div>')
    return "".join(out)


def keyboard():
    r1 = "<i></i>" * 10
    r2 = "<i></i>" * 9
    r3 = '<i class="m"></i>' + "<i></i>" * 7 + '<i class="m"></i>'
    r4 = '<i class="w m"></i><i class="xw"></i><i class="w m"></i>'
    return f'<div class="kbd"><div class="kr">{r1}</div><div class="kr">{r2}</div><div class="kr">{r3}</div><div class="kr">{r4}</div></div>'


def format_bar(bottom=291, undo=True, redo=False, ring=None):
    u = "" if undo else " dis"
    r = "" if redo else " dis"
    ua = "" if undo else ' aria-disabled="true"'
    ra = "" if redo else ' aria-disabled="true"'
    ur = " ring" if ring == "undo" else ""
    return (f'<div class="ftool" style="bottom:{bottom}px" role="toolbar" aria-label="Format">'
            f'{ibtn("undo", "Undo", u + ur, ua)}{ibtn("redo", "Redo", r, ra)}<span class="vr"></span>'
            f'{ibtn("heading", "Heading")}{ibtn("bold", "Bold")}{ibtn("italic", "Italic")}<span class="vr"></span>'
            f'{ibtn("list", "List")}{ibtn("task", "Checklist")}{ibtn("link", "Link")}{ibtn("image", "Image")}'
            f'<span class="fade-r"></span></div>')


def page(filename, title, active, body):
    nav_items = [
        ("index.html", "Overview and system"),
        ("01-notes.html", "Notes and navigation"),
        ("02-templates.html", "New from template"),
        ("03-editor.html", "Editor"),
        ("04-settings.html", "Settings"),
        ("05-states.html", "States and account"),
        ("06-desktop.html", "Desktop"),
    ]
    nav = "".join(f'<a href="{h}" class="{"on" if h == active else ""}">{t}</a>' for h, t in nav_items)
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} | tidy notebook redesign prototype</title>
<style>{CSS}</style>
</head>
<body>
{sprite()}
<input type="checkbox" id="mode" aria-label="Show every frame in dark mode">
<header class="doc-top"><div class="in">
<span class="proto">PROTOTYPE FOR APPROVAL</span>
<span class="brand">tidy notebook redesign</span>
<nav>{nav}</nav>
<label class="modetoggle" for="mode"><span class="bx"></span>All frames dark</label>
</div></header>
<main>
{body}
</main>
</body>
</html>
"""
    (OUT / filename).write_text(html)
    return len(html)
