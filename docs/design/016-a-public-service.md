# 016: A public service

Status: complete

This design states what one installation needs before a stranger can sign up
and write notes on it. It builds on
[design 015](015-several-accounts-on-one-installation.md), which gives an
installation several isolated accounts, invitations, administrators, removal
and an account quota. The owner runs one such installation as a public cloud
service. The same code still runs a self-hosted installation, which keeps its
invitations and never meets a stranger.

Collaboration comes later and sits on top of both designs.

## The problem

A self-hosted installation trusts every account, because the operator invited
each one. A public installation trusts no account. Six things change when the
person on the other side is a stranger.

1. **Anyone can make an account.** A script can make thousands. Each account
   takes disk, mail and attempt budget.
2. **An address is only a claim.** A stranger can type the address of another
   person. Mail to that address then goes to a person who did not ask for it.
3. **A published link puts content of a stranger on the origin of the
   service.** A phishing page or a malware file on a published link damages
   the reputation of the whole origin. A browser block list then blocks the
   application too.
4. **Passwords of strangers are weak and reused.** The installation must refuse
   a password that is on a breach list.
5. **The service has legal duties.** A person must see the terms and the
   privacy notice before they sign up, and the service must record what they
   accepted. A person must be able to export their notes and remove their
   account. Design 015 already gives removal, and export already exists.
6. **One process is not enough.** A deployment without downtime runs two
   processes for a short time, and a busy service runs several. Some limits
   live in the memory of one process today.

## What the code already does

**The sign-up route of Better Auth is not mounted.** `authRoutes` in
`apps/server/src/auth/better-auth.ts` lists every mounted route, and sign-up is
not one of them. Only the setup operation and the bootstrap command create an
account, through an internal instance with sign-up permitted.

**Mail is optional.** `loadServerConfig` in `apps/server/src/config.ts` makes
the transport `null` when it is not configured, and password recovery then
falls back to the operator command.

**Address verification is off.** `better-auth.ts` sets
`requireEmailVerification` to false. The first account never needed it,
because the operator typed the address. Better Auth reads the option once at
startup, and every existing identity user is unverified.

**A published page holds no script.** Records 0031, 0046 and 0047 make the
reader path a closed, read only boundary with no script, no cookie and no
application shell. A published page cannot run code on the origin. The risk
that remains is what the page says and what file it offers, not what it runs.

**The attempt counters live in one process.** The comment in
`apps/server/src/plugins/attempt-store.ts` says so and names where a shared
counter would go. The Better Auth rate limit uses memory storage. The cleanup
jobs of `apps/server/src/app.ts` run on a timer in each process.

**The sync path holds no process state.** The feed, the snapshots, the
receipts and the cursors live in PostgreSQL. A second process can serve the
same account with no change.

## The first question: who may sign up

A registration policy decides it. Mastodon uses the same model with three
modes: open, approval and closed.

**Invitation.** Only an invitation makes an account. This is the policy of
every installation at first, and of every self-hosted installation that keeps
the default.

**Open.** Any person who proves their address makes an account.

**Approval.** A person asks, and an administrator approves. This costs a queue,
a notice to the administrator and a notice to the person. It does not stop a
script, because the queue fills instead of the disk. It stays out.

The policy lives in the database as an installation setting, not in the
environment. An administrator changes it without a restart, and the database
function that makes an account reads it in the same transaction. The function
therefore refuses an open sign-up on an installation whose policy is
invitation, whatever the layers above it do. That is the rule of
[record 0108](../decisions/0108-an-account-comes-in-through-one-registration-path.md).

The open policy has preconditions. The use case refuses to turn it on until
the installation has a mail transport, a published origin, and the addresses
of the terms and the privacy notice. Each one is below.

## The second question: how a stranger proves an address

**Option A. Verify after sign-in.** The account works at once, and a banner asks
for verification. The cost is an account that writes, publishes and uses
quota under an address that nobody proved.

**Option B. Verify before the first session.** The account exists in a pending
state. Better Auth sends a verification link and refuses a sign-in until the
address is verified. This is what Better Auth does with
`requireEmailVerification`, and it is the common default.

Option B is the recommendation. A pending account that nobody verifies expires,
and a job removes it with its identity user.

**Verification is on for every installation.** The policy changes while the
server runs, and Better Auth reads its option at startup, so the option cannot
follow the policy. Every sign-in needs a verified address. First-run setup and
an accepted invitation mark the address verified when they make the account,
and the migration marks every existing identity user verified. Without that
step, the upgrade would lock the owner of every installation out.

**A pending account cannot be held by the wrong person.** An attacker can sign
up first with the address of another person and choose the password. If the
owner of the address later clicks the verification link, the attacker holds a
password on a verified account. This attack is known as account
pre-hijacking. A second sign-up for a pending address therefore replaces the
pending account and its password, and the verification mail says to ignore it
when the reader did not sign up.

**A sign-up must not reveal an account.** When a stranger signs up with an
address that has an account, the answer is the same as for a new address:
check your mail. The mail to the existing owner says that somebody tried to
sign up with their address, and it offers sign-in and password reset. This is
the OWASP guidance for account enumeration. The handler also does the same
work in both branches, so the time of the answer does not reveal the branch.
The mail of a sign-up counts against a limit for each target address, so a
sign-up cannot flood the mailbox of another person.

**Sign-up is an operation of this server.** The Better Auth sign-up route stays
unmounted. A contract operation of this server takes the address, the password,
the consent, the proof of work and an optional invitation token. It applies the
policy, then calls the internal instance, then links the account through the
one registration function. One operation serves the invitation path and the
open path, so one set of checks guards both.

## The third question: how to slow a script

**Option A. A captcha service.** Better Auth ships a plugin for Cloudflare
Turnstile, reCAPTCHA, hCaptcha and CaptchaFox. The cost is a request from the
browser of each person to a third party, a script from another origin in the
content security policy, and a widget outside the design system. The product
does not load an external picture by itself without a reason (record 0067),
and it should not load a tracking script on its sign-up page.

**Option B. A proof of work that this server issues.** The server signs a
random challenge with a difficulty and an expiry. The browser finds a solution
with Web Crypto, which takes a person a moment and takes a script the same
moment for each account. The server checks the signature, the expiry and the
solution, and it keeps the digest of a used challenge until the expiry, so one
solution cannot make two accounts. This is the hashcash model, which ALTCHA and
similar tools use. No third party sees the person.

**Option C. Attempt limits only.** Limits per client address exist now. A count
per /64 prefix for IPv6 would close the gap of a host that holds a whole
prefix. Neither stops a script that rotates addresses.

Option B is the recommendation, with the limits of option C beside it. A proof
of work makes each account cost something, and verification makes each account
need a mailbox. Neither is a wall. An operator who meets a determined attacker
can add a captcha service later as a configured choice, and this design leaves
room for that.

## The fourth question: the password

NIST SP 800-63B revision 4 sets the current rule for a password that is the
only factor. It asks for a longer minimum than the product uses now, a maximum
that allows a passphrase, no composition rule, no forced rotation, and a check
against a list of breached passwords.

The breach check has two options. **A local list** needs a large file that the
operator keeps up to date. **The range service of Have I Been Pwned** takes
the first five characters of the SHA-1 digest of the password and answers every
suffix that shares them, so the service never learns the password. Better Auth
ships this as a plugin. The recommendation is the range service, from the
server and never from the browser. When the service does not answer, the check
accepts the password and writes a log event, because an outage of a third
party must not stop every sign-up. An operator of an installation with no
outbound network turns the check off.

The rule applies when a person sets or changes a password. An existing
password that is shorter still signs in.

The minimum lives in five places today: `better-auth.ts`, `bootstrap.ts`,
`apps/web/src/lib/password-policy.ts`, `api_setup.yaml` and
`CreatePublishedLinkInput.yaml`. The review gives it one source in
`packages/core`, which both runtimes import, and one contract component that
every password field references. A contract test fails when the two disagree.

**A person sees their own sessions.** A public service lets a person list the
devices that are signed in and sign out one of them, or all but the current
one. Better Auth has the routes. Each one joins the reviewed route list of
`better-auth.ts`.

A second factor, through the two-factor or passkey plugins of Better Auth, is
the next step for a public service. It is a separate design, because it changes
the sign-in flow on every device and the recovery path.

## The fifth question: content of strangers on the origin

A published page holds no script, so it cannot steal a session. It can still
hold a phishing form made of text and a link, or offer a harmful attachment.
Browser block lists act on a whole host. One bad page can therefore block the
application for every person.

**A separate origin for published pages.** GitHub serves user content from
`githubusercontent.com`, and Google serves it from `googleusercontent.com`, for
this reason. The installation gets a second origin that serves the reader path
and nothing else. That origin sets no cookie, serves no API and serves no
application shell. The application origin answers a reader address with a
redirect to the published origin. The one list of served origins of
[record 0039](../decisions/0039-one-list-of-served-origins.md) gets a role for
each origin, so the cookie write check and the identity routes trust the
application origins only. A self-hosted installation can keep one origin. The
open policy requires the second origin.

**A report and a takedown.** Each published page has a plain link to a report
page on the published origin. That page is a server built form with no script.
It records the link, a reason and an optional note. A report is a write on the
reader path, which record 0031 keeps read only except for the unlock of a
password. The report becomes its second write, through one narrow function. An administrator sees the
reports, opens the link as any reader does, and takes the link down. A takedown
revokes the link through a database function that checks the installation
role. It does not make the administrator a member of the workspace, so the
administrator still reads no note that the owner did not publish. The owner
sees that an administrator took the link down. An account that repeats the
abuse is disabled by the rules of design 015.

## The sixth question: legal consent

The operator writes the terms and the privacy notice. The product does not.
The configuration names the address and the version of each document. The
sign-up form links both and asks for consent. The account records the version
that the person accepted and the time. When the operator raises a version, the
next sign-in asks for consent again before the application opens.

A self-hosted installation with no legal documents asks for nothing. The open
policy requires both documents.

The security model page changes too. It says now that the operator and the
reader are the same person. On a public service they are not, and the page
must say that the operator of the service can read every note, as the privacy
notice must. End to end encryption would remove server search, the published
reader and the server side merge of design 013. It is not part of this design.

## The seventh question: several processes

Three things hold state in one process today.

**The attempt counters.** `attempt-store.ts` keeps them in a bounded map. They
move to PostgreSQL, in a table that the runtime role writes through one
function. Better Auth moves its own rate limit to its database storage, in the
identity schema. The cost is one write for each counted attempt, which only
the identity and reader routes make.

**The background jobs.** Each job takes a PostgreSQL advisory lock for its run,
and a process that does not get the lock skips that run. Two processes then
never reclaim the same attachment or remove the same pending account.

**Redis** is the other common answer. It adds a service to run, to back up and
to secure. PostgreSQL already holds every other shared fact of the product, so
it holds these too. A later measurement can move the counters, and the attempt
store is the one file that would change.

## What stays out

- **The approval policy.**
- **A captcha service.** It stays a later choice of the operator.
- **A second factor and passkeys.** They get their own design.
- **Payment, plans and billing.** The account quota of design 015 is the point
  where a plan would attach.
- **End to end encryption.**
- **An administrator read of a note that is not published.**

## What the gate must prove

- The database refuses an open sign-up while the policy is invitation.
- The use case refuses the open policy without mail, a published origin, and
  the two legal documents, each with its exact error code.
- A sign-up with a known address and one with a new address answer the same
  status and body.
- A pending account cannot sign in, and the job removes it after its expiry.
- A second sign-up for a pending address replaces the pending account.
- An upgraded installation still signs in its existing accounts.
- A used or expired proof of work makes no account.
- A breached password is refused, and an outage of the range service accepts
  the password and writes the event.
- The published origin answers no API route, sets no cookie, and the
  application origin redirects a reader address to it.
- A takedown by an administrator revokes the link, and the administrator still
  reads no row of that workspace.
- Two processes share one attempt count, and one job run happens once.

## Decisions

- [0114. Open registration verifies the address before the first session](../decisions/0114-open-registration-verifies-the-address-before-the-first-session.md)
- [0115. A sign-up pays a proof of work that this server issues](../decisions/0115-a-sign-up-pays-a-proof-of-work-that-this-server-issues.md)
- [0116. One password policy follows NIST SP 800-63B revision 4](../decisions/0116-one-password-policy-follows-nist-800-63b-revision-4.md)
- [0117. A person manages their own sessions](../decisions/0117-a-person-manages-their-own-sessions.md)
- [0118. A published page of a public installation has its own origin](../decisions/0118-a-published-page-of-a-public-installation-has-its-own-origin.md)
- [0119. A report reaches an administrator who can take a link down](../decisions/0119-a-report-reaches-an-administrator-who-can-take-a-link-down.md)
- [0120. An account records the legal documents it accepted](../decisions/0120-an-account-records-the-legal-documents-it-accepted.md)
- [0121. Every limit and every job holds across server processes](../decisions/0121-every-limit-and-every-job-holds-across-server-processes.md)

[Plan 015](../plans/015-several-accounts-and-a-public-service.md) orders the
work of this design after the work of design 015.
