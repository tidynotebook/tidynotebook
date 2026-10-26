from kit import *  # noqa: F403

PILLS = {
    "saved": '<span class="pill" role="button" aria-label="Saved. Show save details"><span class="dot"></span>Saved</span>',
    "saving": '<span class="pill" role="button" aria-label="Saving. Show save details"><span class="dot pend"></span>Saving</span>',
    "offline": '<span class="pill" role="button" aria-label="Offline. Show save details"><span class="dot off"></span>Offline</span>',
    "paused": '<span class="pill warn" role="button" aria-label="Upload paused. Show save details"><span class="dot warn"></span>Paused</span>',
    "bad": '<span class="pill bad" role="button" aria-label="Not saved. Show save details"><span class="dot bad"></span>Not saved</span>',
}


def ebar(pill="saved", extra=""):
    return appbar("back", "", PILLS[pill] + extra + ibtn("more", "Note actions"), line=True)


def meeting_doc(typed=True, caret=True, img=False, extra=""):
    c = '<span class="caret"></span>' if caret else ""
    last = f'We agreed on the new plan for the launch.{c}' if typed else f'We agreed on the new plan for the{c}'
    image = '<div class="img" role="img" aria-label="Whiteboard photo"></div>' if img else ""
    return ('<div class="docv"><p class="eyebrow" style="font-size:13px">' + ic("folder", "xs") + 'Projects</p>'
            '<div style="font-size:28px;line-height:34px;font-weight:700;color:var(--strong);margin:2px 0 14px">Launch sync</div>'
            '<h2 style="margin-top:0">People</h2><p>Sam, Priya, <span class="wl">Mira Patel</span></p>'
            f'<h2>Notes</h2>{image}<p>{last}</p>'
            '<div class="task done"><i></i><span>Book the venue</span></div>'
            '<div class="task"><i></i><span>Send the brief to Sam</span></div>' + extra + '</div>')


def editor(pill="saved", kb=True, undo=True, redo=False, typed=True, theme="", hots="", overlay="", img=False, ring=None, caret=True):
    tools = (format_bar(undo=undo, redo=redo, ring=ring) + keyboard()) if kb else ""
    body = ebar(pill) + f'<div class="scroll">{meeting_doc(typed, caret and kb, img)}</div>' + tools
    return phone(body, theme, overlay=overlay, hots=hots, signal=pill != "offline")


def undo_spec():
    def cell(label, u="", r="", tip=False, dark=False):
        uu = ibtn("undo", "Undo", u, ' aria-disabled="true"' if "dis" in u else "")
        rr = ibtn("redo", "Redo", r, ' aria-disabled="true"' if "dis" in r else "")
        t = ('<span class="tooltip" style="left:4px;top:56px">Undo <kbd>Ctrl Z</kbd></span>' if tip else "")
        return (f'<div><div class="screen{" t-dark" if dark else ""}" style="height:auto;border-radius:12px;flex-direction:row;padding:6px;gap:2px;'
                f'border:1px solid var(--subtle);background:var(--surface);overflow:visible">{uu}{rr}{t}</div>'
                f'<span style="{"margin-top:30px" if tip else ""}">{label}</span></div>')

    def row(dark):
        return ('<div class="statecells">' +
                cell("Both active", dark=dark) + cell("Nothing to redo", r="dis", dark=dark) +
                cell("Nothing to undo or redo", u="dis", r="dis", dark=dark) + cell("Keyboard focus", u="ring", dark=dark) +
                cell("Pressed", u="on", dark=dark) + cell("Desktop hover", u="hov", tip=True, dark=dark) + "</div>")
    table = """<table class="spec" style="margin-top:18px">
<tr><th>Rule</th><th>Value</th></tr>
<tr><td class="k">Look</td><td>Curved arrow icons, 22 px, same stroke as every icon. No visible text.</td></tr>
<tr><td class="k">Size</td><td>44 x 44 px touch target on phone. 36 x 36 px with 4 px spacing on desktop, where a pointer is used.</td></tr>
<tr><td class="k">Name</td><td>Accessible names "Undo" and "Redo". The icon itself is hidden from screen readers.</td></tr>
<tr><td class="k">Tooltip</td><td>Desktop only, on hover and keyboard focus: "Undo Ctrl Z", "Redo Ctrl Shift Z". Mac shows Cmd.</td></tr>
<tr><td class="k">Disabled</td><td>40% opacity, muted colour, no hover fill. It stays in place, so the bar never moves. aria-disabled keeps it in the keyboard order.</td></tr>
<tr><td class="k">Place</td><td>Phone: first two buttons above the keyboard (D1). Desktop: first two buttons of the editor bar (G4).</td></tr>
<tr><td class="k">Scope</td><td>Works on the open note's local history, as shipped. The "Undo" text button in a short message (D20) is a different action and keeps its word.</td></tr>
</table>"""
    return (f'<div class="card" style="max-width:860px"><h3>Undo and Redo buttons</h3>'
            f'<p class="cl">Icons only, as the owner asked. Light row, then dark row.</p>{row(False)}'
            f'<div style="background:#191919;border-radius:12px;padding:14px;margin-top:14px">{row(True)}</div>{table}</div>')


def status_card():
    pills = "".join(f'<div>{PILLS[k]}<span>{lab}</span></div>' for k, lab in
                    [("saved", "On the server"), ("saving", "Saving now"), ("offline", "No connection"),
                     ("paused", "Upload paused"), ("bad", "Not saved")])
    table = """<table class="spec" style="margin-top:16px">
<tr><th>State</th><th>Pill</th><th>Menu line</th><th>Details sheet</th></tr>
<tr><td class="k">On the server</td><td>Saved</td><td>All changes saved</td><td>Saved to your account.</td></tr>
<tr><td class="k">Typing</td><td>Saving</td><td>Saving</td><td>Saving on this device.</td></tr>
<tr><td class="k">Upload waiting</td><td>Saving</td><td>Uploading</td><td>Saved on this device. Uploading now.</td></tr>
<tr><td class="k">Offline</td><td>Offline</td><td>Offline. Saved on this device.</td><td>No connection. Your changes are safe here. They upload when you are online.</td></tr>
<tr><td class="k">Monthly limit</td><td>Paused</td><td>Upload paused</td><td>Monthly upload limit reached. Changes stay on this device until next month.</td></tr>
<tr><td class="k">Signed out</td><td>Paused</td><td>Sign in to upload</td><td>You are signed out. Changes stay on this device. [Sign in]</td></tr>
<tr><td class="k">Other account</td><td>Paused</td><td>Sign in to upload</td><td>Another account is signed in. Your changes wait on this device. [Switch account]</td></tr>
<tr><td class="k">Server update</td><td>Paused</td><td>Waiting for update</td><td>The server needs an update. Changes stay on this device.</td></tr>
<tr><td class="k">Device write failed</td><td>Not saved</td><td>Not saved</td><td>Could not save on this device. Copy your text, then free some space. [Copy text] [Try again]</td></tr>
</table>"""
    return (f'<div class="card" style="max-width:860px" id="E1"><h3><span class="sid">E1</span> Save status</h3>'
            f'<p class="cl">One pill in the editor bar. One line at the bottom of the menu. Details on tap. Words are short and say where the work is.</p>'
            f'<div class="screen" style="height:auto;border-radius:12px;padding:16px;background:var(--surface)"><div class="statecells">{pills}</div></div>'
            f'<div class="screen t-dark" style="height:auto;border-radius:12px;padding:16px;margin-top:10px"><div class="statecells">{pills}</div></div>{table}</div>')


def status_sheet(kind="offline"):
    if kind == "offline":
        body = ('<p class="body" style="margin-bottom:14px">No connection. Your changes are safe here. They upload when you are online.</p>'
                f'<ul class="slist">{srow("", "Last upload", "9:38", False)}{srow("", "Waiting to upload", "2 changes", False)}</ul>')
        return sheet("Saved on this device", body + '<div style="height:24px"></div>')
    body = (notice("bad", "Could not save on this device. Copy your text so it is safe, then free some space.") +
            '<div style="height:4px"></div>')
    foot = btn("Copy text", "p full", "copy") + btn("Try again", "s full", "refresh")
    return sheet("Not saved", body, foot)


def note_actions():
    rows_ = (nav_row("history", "Version history") + nav_row("pen", "Rename") + nav_row("move", "Move") +
             nav_row("globe", "Publish") + nav_row("copy", "Make a copy") + nav_row("trash", "Move to Trash", cls="danger"))
    return (f'<div class="scrim"></div><div class="sheet actionsheet"><span class="grab"></span>'
            f'<div class="shd"><span class="st">Launch sync</span>{ibtn("x", "Close")}</div><ul class="rows">{rows_}</ul></div>')


def history_list(theme="", hots=""):
    def v(when, sub, cls=""):
        return (f'<li class="row {cls}"><span class="ic">{ic("history")}</span><span class="main"><span class="nm">{when}</span>'
                f'<span class="sub" style="display:block">{sub}</span></span><span class="chev">{ic("chev")}</span></li>')
    body = (appbar("back", "Version history", "", line=False) +
            '<div class="scroll"><div class="hdr"><p class="pmeta" style="margin-top:0">Launch sync</p>'
            '<p class="help" style="margin-top:4px">Restore makes a version the newest. Nothing is lost.</p></div>'
            '<div class="grouplabel">Today</div><ul class="rows">' +
            v("Current version, 9:41", "Saved", "") + v("9:12", "+42 words, -3 words", "hov") + v("8:30", "+120 words") +
            '</ul><div class="grouplabel">Yesterday</div><ul class="rows">' + v("17:05", "+18 words, -40 words") + v("11:20", "+6 words") +
            '</ul><div class="grouplabel">Earlier this week</div><ul class="rows">' + v("Monday, 16:48", "First version") +
            f'</ul><div style="padding:12px 16px">{btn("Show older versions", "s full")}</div></div>')
    return phone(body, theme, hots=hots)


def version_detail(tab="changes", theme=""):
    if tab == "changes":
        content = ('<div class="cmp"><div class="cm">Compared with current</div>'
                   '<b>People</b><br>Sam, Priya, <ins>Mira Patel</ins><br><br>'
                   '<b>Notes</b><br>We agreed on the <del>old plan</del><ins>new plan for the launch</ins>.<br>'
                   '<ins>Sam owns the budget.</ins><br><br><b>Actions</b><br>Book the venue<br><del>Ask finance about dates</del><br>Send the brief to Sam</div>'
                   '<p class="help">Green: added since this version. Red: removed since this version.</p>')
    else:
        content = ('<div class="cmp" style="padding:16px 18px"><div style="font-size:21px;font-weight:700;color:var(--strong)">Launch sync</div>'
                   '<div style="font-size:15px;font-weight:700;color:var(--strong);margin-top:12px">People</div><p style="margin:2px 0 0">Sam, Priya</p>'
                   '<div style="font-size:15px;font-weight:700;color:var(--strong);margin-top:12px">Notes</div><p style="margin:2px 0 0">We agreed on the old plan.</p>'
                   '<div style="font-size:15px;font-weight:700;color:var(--strong);margin-top:12px">Actions</div><p style="margin:2px 0 0">Book the venue<br>Ask finance about dates<br>Send the brief to Sam</p></div>')
    tabs = (f'<div class="tabs" role="tablist"><span class="{"on" if tab == "changes" else ""}">Changes</span>'
            f'<span class="{"on" if tab != "changes" else ""}">Preview</span></div>')
    body = (appbar("back", "Today, 9:12", "", line=False) +
            f'<div class="scroll"><div style="padding:4px 16px">{tabs}<div style="height:14px"></div>{content}</div></div>'
            f'<div class="sft" style="padding:12px 16px 34px;border-top:1px solid var(--subtle)">{btn("Restore this version", "p full", "restore")}</div>')
    return phone(body, theme)


def recovery(tab="device", state="", theme="", hots=""):
    if tab == "device":
        txt = ('<div class="cmp"><div class="cm">' + ic("phone", "xs") + 'Edited on this device, 9:31</div>'
               '<b>People</b><br>Sam, Priya<br><br><b>Notes</b><br>We agreed on the <ins>new plan for the launch</ins>.<br><ins>Sam owns the budget.</ins></div>')
    else:
        txt = ('<div class="cmp"><div class="cm">' + ic("cloud", "xs") + 'Saved from Mac, 9:35</div>'
               '<b>People</b><br>Sam, Priya<br><br><b>Notes</b><br>We agreed on the <del>old</del> plan.<br>Priya books the venue.</div>')
    err = ""
    if state == "failed":
        err = '<div style="margin-top:12px">' + notice("bad", "Could not keep this text. Try again.") + "</div>"
    k_label = '<span class="spin"></span>Keeping text' if state == "busy" else "Keep this device&#39;s text"
    dis = " dis" if state == "busy" else ""
    body = (appbar("back", "Launch sync", "", line=True) +
            '<div class="scroll"><div style="padding:16px 16px 0">'
                        '<h1 class="pt" style="font-size:24px;line-height:30px">Choose a version</h1>'
            '<p class="help" style="margin-top:4px">This note changed on another device.</p>'
            f'<div style="height:16px"></div><div class="tabs" role="tablist"><span class="{"on" if tab == "device" else ""}">This device</span>'
            f'<span class="{"on" if tab != "device" else ""}">Saved version</span></div><div style="height:12px"></div>{txt}{err}'
            f'<div style="margin-top:12px">{notice("info", "The text you do not keep stays in Needs attention.")}</div></div></div>'
            f'<div style="padding:12px 16px 34px;border-top:1px solid var(--subtle);display:flex;flex-direction:column;gap:8px">'
            f'{btn(k_label, "p full" + dis)}{btn("Use saved version", "s full" + dis)}</div>')
    return phone(body, theme, hots=hots)


def viewer(state="", hots=""):
    msg = ""
    if state == "changed":
        msg = ('<div style="position:absolute;left:16px;right:16px;top:120px;z-index:30">' +
               notice("warn", "This image changed. Open it again to see the new one.", act=btn("Open again", "s sm", "refresh")) + "</div>")
    body = (appbar("close", "whiteboard.jpg", ibtn("download", "Download") + ibtn("more", "More")) +
            '<div class="scroll" style="display:flex;align-items:center;justify-content:center">'
            '<div style="width:100%;height:260px;background:linear-gradient(135deg,#7f98bd,#c3b0dd);position:relative">'
            '<div style="position:absolute;left:22%;right:22%;top:24%;bottom:24%;border:2px dashed rgba(255,255,255,.7);border-radius:8px"></div></div>'
            f'{msg}</div>'
            '<div style="display:flex;align-items:center;gap:8px;padding:12px 16px 40px;border-top:1px solid var(--subtle)">' +
            ibtn("zoomout", "Zoom out") + ibtn("zoomin", "Zoom in") + '<span style="flex:1"></span>' +
            btn("Remove from note", "dl md", "trash") + "</div>")
    return phone(body, "dark", hots=hots)


def build():
    j_undo = journey("Journey 3: undo and redo", "Icon buttons, first in the format bar. Dimmed when there is nothing to do.", [
        fig("D1", "Typing", editor(hots=tap(26, 455)),
            ["Undo is active after typing. Redo is dimmed.", "44 px targets. No text labels.", "Status pill says Saved. Tap it for details."]),
        arrow("Tap Undo"),
        fig("D2", "After Undo", editor(typed=False, redo=True, pill="saving", hots=tap(70, 455)),
            ["&quot;launch.&quot; is removed. Redo is now active.", "The pill shows Saving while the change is stored."]),
        arrow("Tap Redo"),
        fig("D3", "After Redo", editor(redo=False),
            ["The text is back. Redo is dimmed again."]),
    ])
    spec = f'<div class="grid">{undo_spec()}</div>'
    reading = grid(
        fig("D4", "Reading, no keyboard", editor(kb=False, img=True),
            ["The format bar shows only with the keyboard.", "Links are blue and underlined."]),
        fig("D5", "Note actions", editor(kb=False, overlay=note_actions()),
            ["From &quot;...&quot;. Version history is first.", "Move to Trash is red and last."]),
        fig("D6", "Offline details", editor(pill="offline", kb=False, overlay=status_sheet("offline")),
            ["Tap the pill to see this.", "Says where the work is, in plain words."]),
        fig("D7", "Not saved", editor(pill="bad", kb=False, overlay=status_sheet("bad")),
            ["The only red pill. Copy text is the main action, to protect the work."]),
    )
    status = f'<div class="grid">{status_card()}</div>'
    hist = grid(
        fig("D8", "Version history", history_list(),
            ["One line of help.", "Each row says what changed, in words."]),
        fig("D9", "A version: changes", version_detail("changes"),
            ["Tabs: Changes and Preview.", "&quot;Compared with current&quot; is a small label, not a sentence.", "One filled button: Restore this version."]),
        fig("D10", "A version: preview", version_detail("preview")),
    )
    j_rec = journey("Journey 4: choose a version", "Opens instead of the editor when the saved note changed after a local draft. Editing waits for a choice, as now.", [
        fig("D11", "Choose a version: this device", recovery(hots=tap(254, 210)),
            ["Short title, one line of help.", "Tabs show one text at a time. Added text is green.",
             "Buttons say what happens. Keeping this device&#39;s text is the safe default, so it is filled."]),
        arrow("Compare"),
        fig("D12", "Choose a version: saved", recovery("saved", hots=tap(178, 658)),
            ["Removed text is red."]),
        arrow("Tap Keep"),
        fig("D13", "Kept", phone(ebar("saving") + f'<div class="scroll">{meeting_doc(caret=False)}</div>',
                                 overlay=f'<div class="toast">{ic("checkcircle", "lead")}<span class="txt">Kept this device&#39;s text.</span></div>'),
            ["Back to the note. A short message confirms.", "The other text is in Needs attention."]),
    ])
    rec_states = grid(
        fig("D14", "Keeping", recovery(state="busy"), ["Both buttons wait. Progress is in the button."]),
        fig("D15", "Could not keep", recovery("saved", state="failed"), ["Problem line above the buttons. Both buttons work again."]),
        fig("D16", "Choose a version, dark", recovery(theme="dark")),
    )
    j_img = journey("Journey 5: remove an image", "The image file stays in the account. Only the note changes.", [
        fig("D17", "Tap an image", editor(kb=False, img=True, hots=tap(178, 361)), ["Tap opens the image viewer."]),
        arrow("Tap image"),
        fig("D18", "Image viewer", viewer(hots=tap(285, 710)),
            ["Zoom and Download are icons with names and tooltips.", "&quot;Remove from note&quot; keeps a text label: it changes the note."]),
        arrow("Tap Remove"),
        fig("D19", "Removed", phone(ebar("saving") + f'<div class="scroll">{meeting_doc(caret=False)}</div>',
                                    overlay=f'<div class="toast"><span class="txt">Image removed from note.</span>{btn("Undo", "t")}</div>'),
            ["The message has an Undo action for 6 seconds.", "Editor Undo also brings it back."]),
    ])
    img_states = grid(
        fig("D20", "Image changed", viewer("changed"), ["Shown when the image changed while open. One action."]),
        fig("D21", "Typing, dark", editor(theme="dark", ring="undo"),
            ["Focus ring on Undo for keyboard users.", "Dark keyboard and tokens."]),
    )
    body = ('<div class="hero"><span class="proto">PROTOTYPE</span><h1>Editor, save status and recovery</h1>'
            '<p>One status pill. Undo and Redo as icons. Clear choices for two versions and for removing an image.</p></div>' +
            section("undo", "Undo and Redo", "Owner requirement: icons, not text.", j_undo + spec) +
            section("reading", "Reading, actions and status", "Details stay one tap away.", reading) +
            section("status", "Save status words", "All states in one place.", status) +
            section("history", "Version history", "Shipped copy &quot;Compared with current&quot; becomes a label.", hist) +
            section("recovery", "Choose a version", "Replaces the shipped &quot;Recover local draft&quot; screen with two long text blocks.", j_rec + rec_states) +
            section("image", "Images", "", j_img + img_states))
    return page("03-editor.html", "Editor", "03-editor.html", body)
