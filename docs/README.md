# Documentation

This page describes the purpose and format of each documentation directory.

## The code is the source of truth

A document holds intent, a decision, an invariant, and a pointer. It names the
code by path and lets the reader open it. It never copies source, a
configuration value, a schema, a column list, SQL, TypeScript, YAML, a version
number, or a measured result. A copy goes stale in silence, because no check
fails when the code moves away from it.

The one exception is a shell command that the reader runs. A quick start and a
backup procedure need the command, so a fenced block in `sh`, `bash` or `shell`
is allowed. A fenced block with no language or with any other language is
refused, also a `text` block and a `console` block. A file whose status line
says that it is superseded is frozen, so no check holds its blocks.
`tools/docs-fence-allow.json` names the audits that were accepted before a
block with no language was refused, and that list only shrinks.

A measured result goes stale in the same way. A decision record, a design, a
plan and a page under `development/` hold no quantity with a unit of time, of
size or of share outside a code span or a link address. Say what the number
shows in words, and link the audit that measured it or name the code that
holds it. A guide page may state a limit as a number, because its reader does
not open the code. `tools/docs-measured-allow.json` names the documents that
were accepted before this rule held, and that list only shrinks.

A document points at code by path, and that path is checked. A page under
`development/` or `guide/` states what the product is now, so every
repository path it names inside a code span must be there. A decision record,
a design, an audit and a plan state what somebody believed at one moment and
are never edited again, so a path in one of them is history.

`tools/check-docs.mjs` runs inside `pnpm lint` and holds the rules on this
page.

## Tone

- Write in ASD-STE100 Simplified Technical English. One idea per sentence, the
  active voice, the present tense.
- Do not use an em dash or an en dash.
- Use sentence case for every heading.
- Say what a thing is and why it is that way. Do not narrate the task that
  made it.

Every file starts with one `#` title line.

A file in `plans/` or `design/` carries a status line directly under the title:

    Status: active | complete | superseded by <relative link>

A superseded file stays where it is, with its kind. Nobody edits it again,
except its status line.

## Agent context

`AGENTS.md` holds the required agent context and the development process.
Edit it directly. Keep it short and use simple statements.
`CLAUDE.md` imports that file. `.claude/skills/` links to `.agents/skills/`.
Skills contain optional Markdown instructions for repeated tasks.
Code is the source of truth. Agents select additional context as needed.

Designs, plans, and decision records are optional. Use them when they preserve
useful reasoning that the code cannot explain. They are not merge requirements.
Existing records remain as history.

## guide/

**Audience:** the person who writes notes, and the person who runs a server.
Public. `apps/docs` publishes this directory as the documentation site
(record 0152), so a page here is a page of the site and the index below is its
contents. See [development/docs-site.md](development/docs-site.md).

**Purpose:** how to use the product and how to host it. It is written from the
visible behaviour of the application, not from a design document.

`guide/README.md` is the landing page. It lists the pages in two groups,
"Writing notes" and "Hosting a server", so the audience split lives in the
index and not in a folder.

**Belongs:** a short task page. What the person sees, what they select, what
happens next. A shell command the host runs.

**Does not belong:** an internal rule, a package name, a file path, a planned
feature, or an operation that the product does not have today.

**Header:** the title line, then one sentence that starts with "This page is
for" and names the reader, for example "This page is for the person who writes
notes." A guide page with no such sentence fails the check.

## development/

**Audience:** contributors and agents.

**Purpose:** the design intent, the invariants, and the rules of one area,
with pointers into the code.

**Belongs:** why a boundary exists, what a rule refuses, which file or
function or table carries it, and which command proves it.

**Does not belong:** a copied schema, a pinned version list, a per task log, a
measured number, or a restated decision. Link the decision record instead.

**Header:** the title line, then the sentence that states what the document
owns.

Keep a page under 150 lines. A page that grows past that is two pages, and
the check refuses it.

## design/

**Audience:** a person who reviews the problem before the work starts.

**Purpose:** one long exploration of one problem. It states the problem, the
options, and the cost of each option. A design that concludes produces one or
more decision records.

**Belongs:** the problem, the options, the trade-offs, and the open questions.
Prose and a diagram belong here, because a reviewer reads the page once, end
to end, and argues with it.

**Does not belong:** a task list, and a choice that no record holds.

**Layout:** a new design keeps every file of its task in one folder,
`design/<task>/`, named with lowercase letters, digits and hyphens, for
example `design/028-a-task/`. The `README.md` of the folder is the design.
Other Markdown files of the task sit beside it, one directory deep. Static
prototypes, plain text samples and images can also sit in a subfolder of the
task, but a Markdown file cannot, so no task nests inside another. Every
folder of `design/` is a task folder, also one that holds only a prototype,
so it needs a task name and a `README.md`. An older design stays as one
numbered file in `design/`.

**Header:** the title line, then the status line. A `## Decisions` heading
links every record that the design produced. In a task folder, the
`README.md` carries this header, and every other Markdown file carries only
its title line.

## decisions/

**Audience:** contributors and agents.

**Purpose:** one architectural choice each, with its context and its cost. A
record does not change after it is accepted.

**Belongs:** the choice, the facts that forced it, and what it excludes.

**Does not belong:** a plan, a task list, or a status report.

**Header:** the template in `decisions/0000-template.md`. The status line, the
date, and the `Context`, `Decision` and `Consequences` headings are required.
`decisions/README.md` holds the index and the rule for when a choice needs a
record.

**Tone:** structured and minimal. An agent reads a record many times, so give
it paths, record numbers and release rows, not a story.

## audits/

**Audience:** the owner.

**Purpose:** a read only report of the state of the product at one moment. An
audit is evidence, so it is never edited after it lands.

One directory per audit date, `audits/YYYY-MM-DD/`.

**Belongs:** findings with their file and line evidence.

**Does not belong:** a fix. A finding becomes an issue on the
[GitHub project board](https://github.com/users/bkhanale/projects/2). See
[development/tracking.md](development/tracking.md).

**Header:** the title line, then a date and the commit that was read, both
inside the first ten lines.

## plans/

**Audience:** an agent that does the work.

**Purpose:** the ordered work that follows from the decision records of one
design. A plan stays here after it ships, with the status `complete`.

**Belongs:** the items, in order, with the record and the release row that each
item answers.

**Does not belong:** the argument that chose the approach. That is the design.

**Header:** the title line, then the status line, then the pointer to the
[GitHub project board](https://github.com/users/bkhanale/projects/2). A
`## Decisions` heading links into `decisions/`.

**Tone:** structured and minimal, like a decision record. An agent reads a plan
many times.
