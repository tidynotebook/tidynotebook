from kit import *  # noqa: F403
from p_notes import all_notes, account_menu


def settings_list(theme="", hots="", appearance="System", billing=True):
    rows_general = srow("palette", "Appearance", appearance) + srow("spell", "Check spelling", chev=False, right='<span class="switch on" role="switch" aria-checked="true" aria-label="Check spelling"></span>')
    rows_notes = (srow("today", "Daily notes") + srow("template", "Templates") + srow("offline", "Offline") +
                  srow("archive", "Export and import"))
    rows_acc = (srow("user", "Profile and email") + (srow("card", "Plan and billing", "Trial") if billing else "") +
                srow("laptop", "Devices", "3") + srow("key", "API keys and apps"))
    body = (appbar("back", "Settings", "", line=False) +
            f'<div class="scroll sbg" style="padding:4px 16px 24px">'
            f'<div class="slabel">General</div><ul class="slist">{rows_general}</ul>'
            f'<div class="slabel">Notes</div><ul class="slist">{rows_notes}</ul>'
            f'<div class="slabel">Account</div><ul class="slist">{rows_acc}</ul>'
            f'<div style="height:16px"></div><ul class="slist">{srow("out", "Sign out", chev=False)}</ul></div>')
    return phone(body, theme, hots=hots, bg="var(--surface)")


def detail(title, inner, theme="", overlay="", hots="", foot=""):
    f = (f'<div style="padding:12px 16px 34px;border-top:1px solid var(--subtle);background:var(--surface)">{foot}</div>' if foot else "")
    body = (appbar("back", title, "", line=False) +
            f'<div class="scroll sbg" style="padding:4px 16px 24px">{inner}</div>{f}')
    return phone(body, theme, overlay=overlay, hots=hots, bg="var(--surface)")


def swatch(name, a, b, on=False):
    border = "2px solid var(--strong)" if on else "1px solid var(--subtle)"
    chk = f'<span style="position:absolute;top:8px;right:8px;width:22px;height:22px;border-radius:50%;background:var(--fill);color:var(--onfill);display:flex;align-items:center;justify-content:center">{ic("check", "xs")}</span>' if on else ""
    return (f'<div style="border:{border};border-radius:14px;padding:8px;background:var(--card);position:relative">'
            f'<div style="height:52px;border-radius:9px;background:linear-gradient(90deg,{a} 50%,{b} 50%);border:1px solid var(--subtle)"></div>'
            f'<div style="font-size:14px;font-weight:600;color:var(--strong);margin-top:6px">{name}</div>{chk}</div>')


def appearance(mode="System", theme="", hots=""):
    seg = "".join(f'<span class="{"on" if mode == m else ""}">{ic(i)}{m}</span>' for m, i in
                  [("System", "monitor"), ("Light", "sun"), ("Dark", "moon")])
    grid_ = (f'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
             f'{swatch("Default", "#ffffff", "#191919", True)}{swatch("Nord", "#eceff4", "#2e3440")}'
             f'{swatch("Solarized", "#fdf6e3", "#002b36")}{swatch("Tokyo Night", "#e1e2e7", "#1a1b26")}</div>')
    inner = (f'<div class="slabel">Mode</div><div class="seg" role="radiogroup" aria-label="Mode">{seg}</div>'
             f'<p class="sfoot">System follows your device.</p>'
             f'<div class="slabel">Theme</div>{grid_}'
             f'<div style="margin-top:6px">{btn("Show all 12 themes", "t md", "down")}</div>'
             f'<div style="margin-top:4px">{btn("Import theme file", "s md full", "upload")}</div>')
    return detail("Appearance", inner, theme, hots=hots)


def spelling():
    spelling_switch = '<span class="switch on" role="switch" aria-checked="true"></span>'
    inner = (f'<div style="height:8px"></div><ul class="slist">{srow("", "Check spelling", chev=False, sub="Uses your browser languages", right=spelling_switch)}</ul>'
             f'<p class="sfoot">Code and web addresses are not checked.</p>')
    return detail("Spelling", inner)


def daily_notes():
    inner = (f'<div style="height:8px"></div>{destrow("Folder", "Daily")}'
             f'<div class="slabel">Note name</div><ul class="slist">'
             f'<li class="srow"><span class="radio on"></span><span class="main"><span class="nm">2026-10-27</span></span></li>'
             f'<li class="srow"><span class="radio"></span><span class="main"><span class="nm">27 October 2026</span></span></li>'
             f'<li class="srow"><span class="radio"></span><span class="main"><span class="nm">Tuesday, 27 October</span></span></li></ul>'
             f'<div style="height:12px"></div>{destrow("Template", "Daily", "template")}'
             f'<p class="sfoot">These settings apply to Personal on every device.</p>')
    return detail("Daily notes", inner)


def templates_settings():
    def t(n):
        return f'<li class="row"><span class="ic">{ic("template")}</span><span class="main"><span class="nm">{n}</span></span><span class="chev">{ic("chev")}</span></li>'
    inner = (f'<div style="height:8px"></div>{destrow("Folder", "Templates")}'
             f'<p class="sfoot">Notes in this folder show in Use template.</p>'
             f'<div class="slabel">4 templates</div><div class="slist" style="padding:4px 0"><ul class="rows">{t("Meeting notes")}{t("Weekly review")}{t("Trip plan")}{t("Book notes")}</ul></div>'
             f'<div style="margin-top:12px">{btn("New template", "s md", "plus")}</div>'
             f'<p class="sfoot" style="margin-top:12px">Applies to Personal.</p>')
    return detail("Templates", inner)


def offline(state="ready", theme=""):
    sw = '<span class="switch on" role="switch" aria-checked="true"></span>'
    swo = '<span class="switch" role="switch" aria-checked="false"></span>'
    if state == "loading":
        lst = ('<ul class="slist">' + '<li class="srow"><span class="main"><span class="skel" style="display:block;width:40%"></span></span><span class="skel" style="width:51px;height:31px;border-radius:16px"></span></li>' * 2 + '</ul>')
    elif state == "failed":
        lst = notice("bad", "Can&#39;t read offline settings on this device.", act=btn("Try again", "s sm", "refresh"))
    else:
        lst = (f'<ul class="slist">{srow("image", "Images", chev=False, sub="Uses more space", right=sw)}'
               f'{srow("history", "Older versions", chev=False, sub="Add a version first", right=swo.replace("switch", "switch dis"), cls="dim")}</ul>')
    meter = ('<div class="slabel">This device</div><div class="slist" style="padding:14px">'
             '<div style="display:flex;justify-content:space-between;font-size:15px;color:var(--strong);margin-bottom:8px"><span>Used</span><span class="muted">120 MB</span></div>'
             '<div class="meter"><i style="width:24%"></i></div></div>') if state == "ready" else ""
    inner = (f'<p class="sfoot" style="padding-top:8px">Notes are always on this device. Choose what else to keep.</p>'
             f'<div style="height:12px"></div>{lst}{meter}')
    return detail("Offline", inner, theme)


def export_import(state="ready"):
    if state == "busy":
        exp = (f'<div class="slist" style="padding:14px"><div class="strong">Preparing your download</div>'
               f'<div class="meter" style="margin:10px 0 6px"><i style="width:62%"></i></div><p class="sfoot" style="padding:0">31 of 50 notes</p></div>')
    else:
        exp = (f'<div class="slist" style="padding:14px"><div class="strong">Download a zip</div>'
               f'<p class="help" style="margin:2px 0 12px">Notes, images and folders in Personal.</p>{btn("Download", "s md", "download")}</div>')
    res = ""
    if state == "done":
        res = '<div style="margin-top:12px">' + notice("ok", "Imported 42 notes and 8 images.") + "</div>"
    imp = (f'<div class="slist" style="padding:14px"><div class="strong">Import a zip</div>'
           f'<p class="help" style="margin:2px 0 12px">Markdown files and images. Folders and links stay.</p>{btn("Choose zip file", "s md", "upload")}</div>{res}')
    inner = f'<div class="slabel">Export</div>{exp}<div class="slabel">Import</div>{imp}'
    return detail("Export and import", inner)


def profile(overlay=""):
    inner = (f'<div style="height:8px"></div><label class="flabel">Name</label><div class="field">Mira Patel</div>'
             f'<div style="margin-top:10px">{btn("Save name", "s md dis", extra='aria-disabled="true"')}</div>'
             f'<div class="slabel">Email</div><ul class="slist">{srow("mail", "mira@example.com", chev=False, sub="Used to sign in")}</ul>'
             f'<div class="slabel" style="margin-top:32px">Delete account</div><div class="slist" style="padding:14px">'
             f'<p class="help" style="margin:0 0 12px">Deletes your account and all notes. Export first.</p>{btn("Delete account", "dl md", "trash")}</div>')
    return detail("Profile and email", inner, overlay=overlay)


def delete_alert():
    return ('<div class="scrim"></div><div class="alert"><h2>Delete your account?</h2>'
            '<p>All notes in all workspaces are deleted for good.</p>'
            '<label class="flabel">Password</label><div class="field focus">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</div>'
            f'<div class="btncol" style="margin-top:16px">{btn("Delete account", "d full")}{btn("Cancel", "s full")}</div></div>')


def billing():
    inner = (f'<div style="height:8px"></div><div class="slist" style="padding:16px">'
             f'<div style="display:flex;align-items:center;gap:8px"><span class="strong" style="font-size:17px">Free trial</span>'
             f'<span class="pill" style="height:26px;font-size:13px">12 days left</span></div>'
             f'<p class="help" style="margin:4px 0 14px">Ends 8 November 2026. No automatic charge.</p>'
             f'{btn("Upgrade", "p md full")}</div>'
             f'<div style="height:12px"></div><ul class="slist">{srow("external", "Invoices and payment", chev=False, right="")}</ul>'
             f'<p class="sfoot">Opens the billing page in a new tab.</p>')
    return detail("Plan and billing", inner)


def devices():
    def d(icon, name, sub, act=True):
        b = btn("Sign out", "s sm") if act else ""
        return srow(icon, name, chev=False, sub=sub, right=b)
    inner = (f'<p class="sfoot" style="padding-top:8px">Signed in to your account.</p><div style="height:8px"></div><ul class="slist">'
             f'{d("phone", "iPhone, Safari", "This device", False)}{d("laptop", "Mac, Firefox", "Active 2 hours ago")}'
             f'{d("monitor", "Linux, Chrome", "Active 9 days ago")}</ul>'
             f'<div style="margin-top:16px">{btn("Sign out all other devices", "dl md full")}</div>')
    return detail("Devices", inner)


def keys(overlay=""):
    def k(name, sub):
        return srow("key", name, chev=False, sub=sub, right=btn("Revoke", "s sm"))
    inner = (f'<div class="slabel">API keys</div><p class="sfoot" style="padding:0 4px 8px">A key can read and change all your notes. Keep it secret.</p>'
             f'<ul class="slist">{k("Backup script", "Expires in 80 days")}{k("Laptop CLI", "Never used")}</ul>'
             f'<div style="margin-top:10px">{btn("Create API key", "s md", "plus")}</div>'
             f'<div class="slabel">Connected apps</div><ul class="slist">{srow("plug", "Claude", chev=False, sub="Connected 12 October", right=btn("Revoke", "s sm"))}</ul>')
    return detail("API keys and apps", inner, overlay=overlay)


def create_key_sheet(step="form"):
    if step == "form":
        body = (f'<label class="flabel">Program name</label><div class="field focus">Backup script<span class="caret" style="height:20px"></span></div>'
                f'<div style="height:14px"></div><label class="flabel">Expires after</label>'
                f'<div class="field" style="justify-content:space-between">90 days{ic("down")}</div>')
        return sheet("Create API key", body, btn("Create key", "p full"))
    body = (notice("warn", "Copy it now. You can&#39;t see it again.") +
            f'<div style="height:12px"></div><div class="field" style="font-family:var(--mono);font-size:14px;justify-content:space-between">tnk_8f2c...41ad{ic("copy")}</div>')
    return sheet("Copy your API key", body, btn("Copy key", "p full", "copy") + btn("Done", "s full"))


def signout_sheet(unsent=True):
    if unsent:
        body = notice("warn", "2 changes are not uploaded yet.") + '<p class="help" style="margin-top:10px">Keep them on this device for your next sign-in, or remove them.</p>'
        foot = btn("Sign out and keep them", "p full") + btn("Sign out and remove them", "dl full") + btn("Cancel", "t full")
    else:
        body = '<p class="body">All changes are uploaded.</p>'
        foot = btn("Sign out", "p full") + btn("Cancel", "s full")
    return sheet("Sign out of this device?", body, foot)


def build():
    j = journey("Journey 6: switch to dark mode", "From any screen: avatar, Settings, Appearance, Dark.", [
        fig("C1", "Account menu", all_notes(extra_overlay=account_menu(), hots=tap(120, 579)), ["Tap Settings."]),
        arrow("Tap Settings"),
        fig("C2", "Settings", settings_list(hots=tap(120, 158)),
            ["One list. Each row opens one page. The current value shows on the right.",
             "15 sections become 9 rows and 1 switch. Short familiar names.",
             "Rows are 52 px with an icon tile. Sign out stands apart."]),
        arrow("Tap Appearance"),
        fig("C3", "Appearance", appearance(hots=tap(290, 166)),
            ["Title once, in the bar. No repeated &quot;Appearance&quot;.",
             "Mode is a 3-part control, 40 px tall.", "Themes show their colours."]),
        arrow("Tap Dark"),
        fig("C4", "Dark is on", appearance("Dark", "dark"), ["The change shows at once. It also saves to the account."]),
    ])
    pages_ = grid(
        fig("C5", "Spelling is a switch", settings_list(hots=hot(1, 300, 194)),
            ["Spelling needs no page of its own. The switch sits in the list.", "It uses the browser languages. Code and web addresses are not checked, as now."]),
        fig("C6", "Daily notes", daily_notes(), ["Folder row with Change, as in templates.", "Name shows real examples, not a pattern code."]),
        fig("C7", "Templates", templates_settings(), ["The same Folder row.", "Workspace name in one quiet line."]),
        fig("C8", "Offline", offline(), ["Switches, whole row is the target.", "A dimmed switch says why in its row."]),
        fig("C9", "Export and import", export_import(), ["Two small cards, one button each."]),
        fig("C10", "Profile and email", profile(), ["Save is dimmed until the name changes.", "Delete account sits at the end, in red outline."]),
        fig("C11", "Plan and billing", billing(), ["Shows only when the server has a billing page, as now.", "Upgrade is the one filled button."]),
        fig("C12", "Devices", devices(), ["Each device has its own Sign out.", "Sign out all other devices is red outline and asks first."]),
        fig("C13", "API keys and apps", keys(), ["Connected apps shows only when the server supports it, as now."]),
    )
    states = grid(
        fig("C14", "Offline, loading", offline("loading")),
        fig("C15", "Offline, error", offline("failed")),
        fig("C16", "Export in progress", export_import("busy")),
        fig("C17", "Import done", export_import("done")),
        fig("C18", "Delete account", profile(overlay=delete_alert()), ["Password confirms. Red filled button only inside this alert."]),
        fig("C19", "Create API key", keys(overlay=create_key_sheet()), []),
        fig("C20", "Copy API key", keys(overlay=create_key_sheet("copy")), ["Shown once. Copy key is the main action."]),
        fig("C21", "Sign out, work waiting", phone(appbar("back", "Settings") + '<div class="scroll sbg"></div>', overlay=signout_sheet(True), bg="var(--surface)"),
            ["Shown only when changes wait. Same choices as now, shorter words.",
             "Keep is the safe default, so it is filled."]),
        fig("C22", "Sign out, all uploaded", phone(appbar("back", "Settings") + '<div class="scroll sbg"></div>', overlay=signout_sheet(False), bg="var(--surface)")),
    )
    dark = grid(
        fig("C23", "Settings, dark", settings_list(theme="dark", appearance="Dark", billing=False),
            ["No Plan and billing row: this server has no billing page."]),
        fig("C24", "Offline, dark", offline(theme="dark")),
    )
    body = ('<div class="hero"><span class="proto">PROTOTYPE</span><h1>Settings</h1>'
            '<p>Replaces the long page with wrapping text links, repeated titles and paragraphs. '
            'Phone: a list, then one page per topic, with Back. Desktop: list and page side by side (Desktop page, G5).</p></div>' +
            section("j", "Main journey", "", j) +
            section("pages", "Every settings page", "One line of help at most. Real values, real buttons.", pages_) +
            section("states", "States and confirmations", "Loading, errors, progress and the confirm steps that protect data.", states) +
            section("dark", "Dark mode", "", dark))
    return page("04-settings.html", "Settings", "04-settings.html", body)
