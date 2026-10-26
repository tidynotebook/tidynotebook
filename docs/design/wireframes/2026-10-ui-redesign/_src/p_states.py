from kit import *  # noqa: F403
from p_notes import all_notes, home_header, rows, NOTES_TODAY, NOTES_YDAY


def note_state(icon, title, text, actions, theme="", signal=True, extra=""):
    body = (appbar("back", "", "", line=False) +
            f'<div class="scroll" style="display:flex;flex-direction:column;justify-content:center;padding-bottom:90px">'
            f'<div class="empty"><span class="eic">{ic(icon)}</span><h2>{title}</h2><p>{text}</p>'
            f'<div class="btncol">{actions}</div>{extra}</div></div>')
    return phone(body, theme, signal=signal)


def note_loading():
    body = (appbar("back", "", "", line=True) +
            '<div class="scroll" style="padding:20px">'
            '<span class="skel" style="display:block;width:30%;height:10px"></span>'
            '<span class="skel" style="display:block;width:70%;height:26px;margin:12px 0 22px"></span>' +
            "".join(f'<span class="skel" style="display:block;width:{w}%;height:12px;margin:12px 0"></span>' for w in (92, 85, 60, 0, 40, 88, 76, 30)) +
            '</div>')
    return phone(body)


def attention():
    def r(name, sub):
        return (f'<li class="row"><span class="ic">{ic("file")}</span><span class="main"><span class="nm">{name}</span>'
                f'<span class="sub" style="display:block">{sub}</span></span><span class="chev">{ic("chev")}</span></li>')
    body = (appbar("menu", "", ibtn("search", "Search") + avatar()) +
            '<div class="scroll"><div class="hdr"><h1 class="pt">Needs attention</h1><p class="pmeta">Kept text that did not save. Nothing here is lost.</p></div>'
            f'<div class="grouplabel">Today</div><ul class="rows">{r("Launch sync", "Text from this device, 9:31")}'
            f'{r("Weight", "Not uploaded, note was deleted")}</ul>'
            '</div>')
    return phone(body)


def attention_item():
    body = (appbar("back", "Launch sync", "", line=True) +
            '<div class="scroll" style="padding:16px">'
            '<p class="help" style="margin:0 0 12px">Text from this device, 9:31. Not in the note.</p>'
            '<div class="cmp"><b>Notes</b><br>We agreed on the new plan for the launch.<br>Sam owns the budget.</div></div>'
            f'<div style="padding:12px 16px 34px;border-top:1px solid var(--subtle);display:flex;flex-direction:column;gap:8px">'
            f'{btn("Save as new note", "p full", "plus")}{btn("Try saving again", "s full", "refresh")}{btn("Discard", "t full")}</div>')
    return phone(body)


def search_screen(state="results", signal=True):
    q = "launch" if state != "empty-q" else ""
    head = (f'<div class="appbar" style="gap:8px;padding:0 8px 0 16px"><div class="search v" style="flex:1">{ic("search")}'
            f'{q or "Search notes"}<span class="caret" style="height:20px"></span></div>{btn("Cancel", "t")}</div>')
    scope = "In Personal" + (" &middot; Offline, results from this device" if not signal else "")
    if state == "results" or state == "offline":
        def h(name, snippet, folder=""):
            f = f'{folder} &middot; ' if folder else ""
            return (f'<li class="row"><span class="ic">{ic("file")}</span><span class="main"><span class="nm">{name}</span>'
                    f'<span class="sub" style="display:block">{f}{snippet}</span></span></li>')
        content = (f'<div class="grouplabel" style="padding-top:8px">Notes</div><ul class="rows">'
                   f'{h("Launch sync", "...new plan for the <b>launch</b>.", "Projects")}{h("Q4 roadmap", "<b>Launch</b> in March", "Projects")}'
                   f'{h("Launch checklist", "Venue, brief, budget", "Projects")}</ul>'
                   f'<div class="grouplabel">Actions</div><ul class="rows">{nav_row("plus", "New note &quot;launch&quot;")}</ul>')
    elif state == "pending":
        content = f'<div style="padding:24px 16px;display:flex;gap:10px;align-items:center;color:var(--muted)" role="status"><span class="spin"></span>Searching</div>'
    else:
        content = (f'<div class="empty" style="padding-top:60px"><span class="eic">{ic("search")}</span>'
                   f'<h2 style="font-size:17px">No results for &quot;launch&quot;</h2><p>Check the spelling or try fewer words.</p>'
                   f'{btn("New note &quot;launch&quot;", "s", "plus")}</div>')
    body = head + f'<div class="scroll"><p class="help" style="padding:0 16px;margin:4px 0 0">{scope}</p>{content}</div>'
    return phone(body + keyboard() if state == "pending" else body, signal=signal)


def trial_home(kind="active"):
    if kind == "active":
        strip = (f'<div style="display:flex;align-items:center;gap:8px;padding:6px 8px 6px 16px;background:var(--surface);border-bottom:1px solid var(--subtle);font-size:14px">'
                 f'<span style="flex:1">Trial: 12 days left</span>{btn("Upgrade", "s sm")}</div>')
        body = topbar_home() + strip + '<div class="scroll" style="padding-top:12px">' + home_header() + '<div class="grouplabel">Today</div>' + rows(NOTES_TODAY) + '<div class="grouplabel">Yesterday</div>' + rows(NOTES_YDAY) + '</div>'
        return phone(body)
    if kind == "checking":
        body = topbar_home() + (f'<div style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:var(--surface);border-bottom:1px solid var(--subtle);font-size:14px;color:var(--muted)">'
                                f'<span class="spin" style="width:14px;height:14px"></span>Checking your trial</div>') + '<div class="scroll" style="padding-top:12px">' + home_header() + '<div class="grouplabel">Today</div>' + rows(NOTES_TODAY) + '<div class="grouplabel">Yesterday</div>' + rows(NOTES_YDAY) + '</div>'
        return phone(body)
    body = (appbar("", "", avatar()) +
            f'<div class="scroll" style="display:flex;flex-direction:column;justify-content:center;padding-bottom:90px">'
            f'<div class="empty"><span class="eic">{ic("lock")}</span><h2>Your trial has ended</h2>'
            f'<p>Upgrade to use your account again. No charge was made.</p>'
            f'<div class="btncol">{btn("Upgrade", "p full")}{btn("Sign out", "t full")}</div></div></div>')
    return phone(body)


def create_error():
    return all_notes(extra_overlay=f'<div class="toast">{ic("alert", "lead")}<span class="txt">Device full. Note not made.</span>{btn("Try again", "t")}</div>')


def auth(kind):
    logo = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:28px"><span class="wsicon">t</span><span class="strong">tidy notebook</span></div>'
    if kind == "signup":
        inner = (f'{logo}<h1 class="pt" style="font-size:26px">Create your account</h1><p class="help" style="margin:6px 0 22px">Start with a free trial. No card needed.</p>'
                 f'<label class="flabel">Email</label><div class="field focus">mira@example.com</div><div style="height:12px"></div>'
                 f'<label class="flabel">Password</label><div class="field">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</div>'
                 f'<div style="height:20px"></div>{btn("Create account", "p full")}'
                 f'<p class="help" style="text-align:center;margin-top:16px">Have an account? <span style="color:var(--link);font-weight:600">Sign in</span></p>')
    elif kind == "check":
        inner = (f'{logo}<span class="eic" style="width:56px;height:56px;border-radius:18px;background:var(--surface);border:1px solid var(--subtle);display:flex;align-items:center;justify-content:center;color:var(--strong);margin-bottom:16px">{ic("mail")}</span>'
                 f'<h1 class="pt" style="font-size:26px">Check your email</h1><p class="help" style="margin:6px 0 4px">We sent a link to <b style="color:var(--strong)">mira@example.com</b>.</p>'
                 f'<p class="help" style="margin:0 0 22px">No email? Check spam.</p>'
                 f'<div class="btncol">{btn("Send another link", "s full", "refresh")}{btn("Use a different email", "t full")}</div>')
    elif kind == "verified":
        inner = (f'{logo}<span class="eic" style="width:56px;height:56px;border-radius:50%;background:var(--okbg);display:flex;align-items:center;justify-content:center;color:var(--ok);margin-bottom:16px">{ic("check")}</span>'
                 f'<h1 class="pt" style="font-size:26px">Email verified</h1><p class="help" style="margin:6px 0 22px">Enter your password to sign in.</p>'
                 f'<label class="flabel">Email</label><div class="field">mira@example.com</div><div style="height:12px"></div>'
                 f'<label class="flabel">Password</label><div class="field focus"><span class="caret" style="height:20px"></span></div>'
                 f'<div style="height:20px"></div>{btn("Sign in", "p full")}')
    elif kind == "expired":
        inner = (f'{logo}<span class="eic" style="width:56px;height:56px;border-radius:18px;background:var(--warnbg);display:flex;align-items:center;justify-content:center;color:var(--warn);margin-bottom:16px">{ic("warn")}</span>'
                 f'<h1 class="pt" style="font-size:26px">This link no longer works</h1><p class="help" style="margin:6px 0 22px">Links work once and for a short time.</p>'
                 f'{btn("Get a new link", "p full")}')
    else:
        inner = (f'{logo}<span class="eic" style="width:56px;height:56px;border-radius:18px;background:var(--surface);border:1px solid var(--subtle);display:flex;align-items:center;justify-content:center;color:var(--muted);margin-bottom:16px">{ic("lock")}</span>'
                 f'<h1 class="pt" style="font-size:26px">New accounts are closed</h1><p class="help" style="margin:6px 0 22px">Ask the owner of this server for an invitation.</p>'
                 f'{btn("Sign in", "s full")}')
    return phone(f'<div class="scroll" style="padding:40px 24px">{inner}</div>')


def admin_limits():
    def f(label, val):
        return (f'<label class="flabel">{label}</label><div class="field" style="justify-content:space-between">{val}'
                f'<span class="muted" style="font-size:14px">GiB</span></div><div style="height:12px"></div>')
    body = (f'{f("Storage", "5")}{f("Text and history", "1")}{f("Published pages each month", "2")}{f("Downloads each month", "10")}'
            f'<p class="help" style="margin-top:0">1 GiB is about 1.07 GB. Use is shown in GB.</p>')
    return phone(appbar("back", "Accounts") + '<div class="scroll"></div>',
                 overlay=sheet("Limits for Sam Lee", body, btn("Save limits", "p full")))


def build():
    note = grid(
        fig("E2", "Note loading", note_loading(), ["Text shape while the note opens."]),
        fig("E3", "Note in Trash", note_state("trash", "Weight is in Trash", "Restore it to edit.",
                                              btn("Restore note", "p full", "restore") + btn("Go to All notes", "s full")),
            ["One filled button. The note name is in the title."]),
        fig("E4", "In Trash, offline", note_state("cloudoff", "Weight is in Trash", "Moved to Trash on this device. It uploads when you are online.",
                                                  btn("Restore note", "p full", "restore") + btn("Go to All notes", "s full"), signal=False)),
        fig("E5", "Deleted for good", note_state("alert", "This note was deleted", "It is gone for good. Text from this device is in Needs attention.",
                                                 btn("Open Needs attention", "p full", "bell") + btn("Go to All notes", "s full")),
            ["Needs attention shows only when this device has text for the note."]),
        fig("E6", "Not found", note_state("search", "Note not found", "Check the link, or find the note in All notes.",
                                          btn("Go to All notes", "s full")), ["Not an empty note. No filled button: there is no main action."]),
        fig("E7", "Can&#39;t open", note_state("cloudoff", "Can&#39;t open this note", "It is not on this device and there is no connection.",
                                               btn("Try again", "p full", "refresh") + btn("Go to All notes", "s full"), signal=False)),
    )
    att = grid(
        fig("E8", "Needs attention", attention(), ["Where kept text goes. Plain words for each item."]),
        fig("E9", "An item", attention_item(), ["The same three actions as now: new note, try again, discard.", "Save as new note never loses text, so it is the filled button. Discard is quiet and asks first."]),
    )
    search = grid(
        fig("E10", "Search results", search_screen(), ["Scope is one quiet line with the workspace name.", "Each result shows its folder and the matching words."]),
        fig("E11", "Searching", search_screen("pending"), ["Short status, keyboard stays up."]),
        fig("E12", "Offline results", search_screen("offline", signal=False), ["Offline joins the scope line."]),
        fig("E13", "No results", search_screen("none"), ["Offers to make the note."]),
    )
    acct = grid(
        fig("E14", "Trial strip", trial_home(), ["One short strip, one button. Replaces two long sentences."]),
        fig("E15", "Checking trial", trial_home("checking")),
        fig("E16", "Trial ended", trial_home("ended"), ["Same rule as now, in two short sentences."]),
        fig("E17", "Note not made", create_error(), ["A short message with Try again. Nothing in the page moves."]),
    )
    signup = grid(
        fig("E18", "Create account", auth("signup")),
        fig("E19", "Check your email", auth("check"), ["Two short lines. Replaces the paragraph about browsers and limits.",
                                                      "Send another link and Use a different email are separate, clear buttons."]),
        fig("E20", "Email verified", auth("verified"), ["When this browser can sign in by itself, it goes to All notes and this screen is skipped.",
                                                       "Otherwise the email is filled in. Only the password is left."]),
        fig("E21", "Link no longer works", auth("expired")),
        fig("E22", "Sign up closed", auth("closed")),
        fig("E23", "Account limits (administrator)", admin_limits(), ["Unit sits in the field. One line explains GiB."]),
    )
    body = ('<div class="hero"><span class="proto">PROTOTYPE</span><h1>States, search and account</h1>'
            '<p>Every state reads as itself: loading, in Trash, deleted, not found, offline. Each has one clear next step.</p></div>' +
            section("note", "Note states", "", note) +
            section("attention", "Needs attention", "Where text from &quot;Choose a version&quot; and deleted notes is kept.", att) +
            section("search", "Search", "", search) +
            section("account", "Trial and errors", "", acct) +
            section("signup", "Sign up and sign in", "Shipped changes to verification, with short copy.", signup))
    return page("05-states.html", "States and account", "05-states.html", body)
