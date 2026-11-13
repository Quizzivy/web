# Design

`deck/` is the product design: seven Claude Design pages that draw every screen of the three
consoles, the front door and the public site, and in `page-width-proposal/` three later answers
from the design team (the page width, the cloze, Grading's finish states). **It is the single
source of truth for the UI.**
`deck/proposals/` holds pages written in this repository for screens the deck does not draw yet.
A proposal is not the design of record until Thuong approves it (see "Proposals").
It replaced the earlier hand-built mockups (`docs/design/mockups`, removed with T-R0.1) and every
rule that came with them. Where the product deliberately departs from the deck, the departure is
listed below, and the reason is in the plan (`docs/plan/70-redesign-overview.md`).

`brand/` is Thuong's brand kit and stays the kit of record for every logo, icon and brand colour.

## Viewing the deck

```bash
python3 -m http.server 5175 --directory docs/design/deck
```

Open <http://localhost:5175/Quizzivy%20Teacher.dc.html> (or any other page). The `design-deck`
entry in `.claude/launch.json` runs the same server.

The pages need the network: `support.js` loads React, ReactDOM and Babel from unpkg, and each
page loads Be Vietnam Pro from Google Fonts and the lucide icon font from unpkg. Opening a page
from the filesystem does not work, because the pages link to each other and to their assets by
relative name.

## The pages

| Page | Audience | Console / route tree | What it draws |
|---|---|---|---|
| `Quizzivy Landing.dc.html` | Anyone | `/` on quizzivy.com | Marketing page, join by code, role tabs, consultation form, FAQ; en + vi copy |
| `Quizzivy Sign in.dc.html` | Signed out | `/login`, `/forgot-password`, `/join`, `/change-password` | Sign in, forgot password, join a class, joined, first sign-in password change |
| `Quizzivy Splash.dc.html` | Everyone | App boot | Loading steps, skeleton hand-off per shell, slow, offline, new version, session expired; en + vi copy |
| `Quizzivy System pages.dc.html` | Everyone | `*`, `/403`, error boundary, maintenance | 404, no access, unexpected error, maintenance |
| `Quizzivy Student.dc.html` | Student | `/app/*` | Home, classes, join dialog, test intro, take test (one data-driven screen that the Teacher page also mounts), result, learn, course, lesson, flashcards, grades, messages, this week, settings |
| `Quizzivy Teacher.dc.html` | Teacher (and Admin) | `/teacher/*` | Dashboard, calendar, messages, assignments, grading, classes, students, attendance, tests, shared with me, question bank, media, courses, vocabulary, gradebook, reports, imports (a Word or PDF file, or pasted text), settings, and the AI assistant (its panel and entry points) |
| `Quizzivy Admin.dc.html` | Admin | `/admin/*` | Overview, users, roles and permissions, all classes, AI credits, audit log, API reference, system settings |

Supporting files: `support.js` is the Claude Design canvas runtime (nothing in it is product
behaviour); `qz-controls.js` draws the select popover and the date and time picker the pages use;
`github.md` is Claude Design's own sync log and its screen-to-repo map; the SVGs are the assets
the pages reference by name. `MANIFEST.sha256` pins every file.

## Reading a page

Each `.dc.html` is one `<x-dc>` template followed by one `<script type="text/x-dc">`:

- The template holds the markup. `data-screen-label` names each screen; `{{ bindings }}`,
  `<sc-if>` and `<sc-for>` carry the logic; `style-hover="…"` is the hover state.
- The script holds the fixtures (which show the data model), the state, every handler and
  `renderVals()`. Most option sets, labels, defaults and breakpoints live here, not in the
  template. The Teacher page builds its screens in layers (`renderValsInner → wire → … →
  shareVals → peVals`); the last layer wins, so a dialog is built from the layer that overrides
  the `toast*` stub beneath it. `peVals` (2026-10-04) is the content editor: it feeds the
  builder's "Prompt", "Explanation" and "Question media", the review's "Question" field and the
  two dialogs they open.
- The Teacher page mounts the Student page three times through `<dc-import name="Quizzivy Student">`
  with the props `exam` and `dark` (the builder's preview, Test detail's preview and the import's
  preview), and `scripts/check-design-deck.mjs` reads the import as a reference to
  `Quizzivy Student.dc.html`. On the Student page `renderVals()` is `renderValsBase()` overlaid by
  `examVals()`, which holds every take-test rule: the sections rail, the sheet, the stimulus pane,
  the gap card, the phone drawer and the recording card.
- Breakpoints are measured from the page's own width with a ResizeObserver: `< 768` is mobile,
  `>= 1024` is wide, and most tables drop columns by the content width
  (`width − sidebar − padding`).

**Prototype chrome never ships:** the floating screen-switcher pills, the demo accounts box and
the "Try T6NB-4WLQ" hint on Sign in, the canvas theme buttons, the `frame: mobile` prop, the
Teacher page's "Coming next" screen, `RULES_UNUSED`, and the import page's "Use a sample" buttons
(one in each file slot and one in the paste box, which loads `WI_PZ_SAMPLE`). Since the fourth
import also `previewExam` and `builderPreviewVals` (the previews' demo wiring), and `sharedVals`'
`pickFile`, which always attaches "part-1-asking-the-way.mp3", and its `+plays || 99`.

A pasted import's numbers are demo data, not behaviour: fixture row `i9` ("Pasted text", 1,186
characters), the counts the prototype copies from its own quick count (`WI_detect`) into the
history row, the stages and the Ready card after Start, beside a hard-coded "1 to confirm" and
"1 note", and the fixed date of the fallback title ("Pasted test · 2 Oct"). The product reads the
counts from the server's review summary and puts the day of the import in the fallback title.

The content editor's engine and data are a prototype too (2026-10-04 export). `PE_LIB` (the
eight Media files, their counts and their "Used in …" and "Shared by …" lines), `B_BLANK_DEF`,
`B_MATCH_DEF`, the sample answer of question 6, the option list every question shares and the
prompts seeded from question titles are demo data. The upload that always succeeds after about
a second, the playback that jumps to 0:34, the name "pasted-image-{n}.png" and the `media:{file
name}` addresses in Markdown are stand-ins. The rich mode runs on `document.execCommand`; the
product's editor is TipTap (`web/src/components/shared/content/editor/`), and the drawing
specifies the controls, not the engine. In the review the prototype saves the editor's plain
text only; the product stores the content.

The Student page's take-test fixtures are demo data too (fourth import): `EXAMS`, `EX_RAW`,
`EX_GROUP`, `EX_MATCH`, `EX_UL`, `EX_SIGN`, `AUD_LEN` and `MAP_CELLS`, including their answer keys
(the seventh tuple entry and `ans`), which a student payload never carries. The 45:00 timer of a
preview, the two toasts after Submit for papers s2 and s9 and the dead branches `hasPaneTabs`,
`dotsMode`, `hasRef` and `isSign` are prototype plumbing, and so are the fixture fields nothing
reads: `q.orig`, `q.stem`, `printed`, `multiSec`, `pauses` and `examBold` (S 1470, on q12). On the
Teacher page the script values no markup reads any more are `wi.preview`, `wi.pvOptCols` (T
7427-7428), `td.preview`, `td.pvFoot` ("Showing 5 of … questions") and `td.pvOptCols` (T
7508-7509). Three slips of the prototype are not to be copied: the arrow keys set the open question
without going through `go()` (S 1616 against 1639), so they neither close the drawer or the sheet
nor pause a recording when the section changes; Esc clears the old `sheet` state, not `exSheet` (S
1530); and in a preview the header still says "All answers saved" and "Saving…" (S 961-963, `saved()`
in `exPick`, S 1617). "S n" and "T n" are lines of the pretty form of the fourth export's pages (see
`docs/plan/74d-d4-deck-update.md`, "Reading the references").

The AI assistant of the v2 export is a prototype too. `aiAsk` calls a browser-side model with inline
prompts and shows the `AI_*_DEMO` arrays when it fails; `AI_USE0` and `aiSpend` fake usage,
`AI_LIMIT` is 50,000, the per-kind costs are placeholders and every run takes at least 3.2 seconds.
The Admin page's `AI_POOL`, `AI_DAY`, `AI_DAYS`, `AI_TEACHERS` and `AI_REQ0` and the attendance
fixtures `ATT_TODAY`, `ATT_ROOM` and `ATT_SES` are demo data. The fixture persona (Giàu Bùi, Thường
Võ, the demo accounts) is not content to copy.

## Where the product departs from the deck

Decided with Thuong on 2026-09-26. The design team has these as requests
(`docs/design/gaps.md`), so later exports should converge.

- **Join codes are always shown in full** to their teacher and to admins (card, class detail,
  admin table, copy link, QR). The deck's "shown only once" and "only the last 4 characters"
  copy is rewritten. Codes keep the §6 alphabet, so the `ABCD-1234` placeholder changes.
- **The public join preview never shows a student count.** It may show schedule and room.
- **Every control has a visible `:focus-visible` ring.** The deck draws none.
- **"Create student accounts" is a permission row** (Admin and Teacher), because the Teacher page
  has "Add student" while the matrix gives "Add and disable users" to Admin only.
- **Assistant** stays hidden from role pickers until the deck draws how an assistant joins a
  class.
- **Emails carry a one-time set-password link, never a temporary password.**
- **The consultation form gets a consent checkbox and a privacy notice.**
- **Media replace and delete follow the publish snapshot:** a replaced file reaches drafts and
  bank questions only, and a file in use cannot be deleted. The deck's copy says otherwise.

Decided on 2026-10-03, with the second import (DG-12 to DG-19 in `docs/design/gaps.md`):

- **A pasted test is plain text.** The paste box keeps no formatting, so its kind pill has one
  state and the "Formatting kept from …" lines do not ship.
- **The paste box's quick count follows the server's recognition rules,** not the prototype's
  `WI_detect`, so the page and the review cannot disagree.
- **Status filters are a group of toggle buttons with counts,** not a `tablist`, and the counts
  follow the search (in the audit log, the date range as well).
- **The Imports history switches between its grid and its cards by a container query** at 960px
  of the list's own width, not by the deck's viewport arithmetic.
- **The To review chips and the Ready card's pill read "{n} need action" for every import,**
  pasted or not (DG-14).

Defaults taken on 2026-10-04, with the third import (DG-108 to DG-116 in `docs/design/gaps.md`).
Thuong has not decided these; the plan builds them until he or the design team answers:

- **The toolbar's "Image" and "Audio" are not built in R4.** A prompt and an explanation hold no
  media in the contract, so a pasted or dropped file is refused with a notice, and audio or an
  image is attached as question media (DG-109).
- **The editing mode is the form the field is stored in.** Rich text is stored content, Markdown
  is the stored Markdown string, and nothing converts without the teacher's "Switch to Markdown"
  or "Apply conversion". The prototype opens every question in Rich text (DG-110).
- **One question editor serves the builder and the bank.** The builder's drawing of the prompt,
  the explanation, the answer areas and the question media is built on both pages; the bank's
  Question editor screen was not redrawn (DG-108).
- **The type menu offers the five types the product stores.** "Matching" and the "Include “Not
  given”" switch arrive with R6 (DG-60, DG-113).
- **"Students can pause" is not built in R4** (D4 reopens it, DG-183); "Allow skipping ahead" and
  "Show transcript after submitting" stay. Audio is MP3 or M4A up to 50 MB and an image JPG, PNG or WebP up to 10 MB;
  the builder's "25 MB", "WAV" and "GIF" do not ship (DG-63, DG-111).
- **"Choose from Media" lists the caller's own files.** Media is not a shared kind, so "files
  other teachers shared with you" and "Shared by …" do not ship (DG-112).
- **A pasted image is left out and counted.** Today a paste that holds an image is refused
  whole (spec §7.1). The converter keeps every other refusal, and the paste preview says how
  many images were left out (DG-115).
- **The review's "Question" editor keeps what the product has:** stored content, gaps for a
  fill-in-the-blank item, a read view where the review is read-only, and no Markdown mode
  (DG-114).

Defaults taken on 2026-10-12, with the fourth import (DG-182 to DG-195 in `docs/design/gaps.md`).
Thuong has not decided these either. D4 (`docs/plan/74d-d4-deck-update.md`, v0.11.0) built them, and
each row in `gaps.md` says how; a later answer from him or the design team reopens the row:

- **A recording never locks at its play limit.** The button stays live and the status reports the
  extra plays, as spec §11.4 says (DG-182).
- **"Students can pause" is one boolean, `allowPause`, on by default,** on a question's audio and on
  a group's recording (DG-183).
- **A cloze stays one question per gap.** The engine shows a run of them as one screen (DG-184).
- **Every question has one number,** and the cloze screen reads "Questions 23–27 of {total}" (DG-185).
- **The builder keeps two levels:** the deck's group is the product's section, and shared content
  belongs to a shared-context group inside it (DG-186).
- **The Shared content dialog uses the content editor and the product's rules** (targets, limits,
  both switches); its English says "beside the questions", not "on the left" (DG-187).
- **A preview shows no time and claims no save:** the timer pill reads "––:––" and the save line
  "Answers here are not saved." (DG-188).
- **The frames with no model are not built:** the sign card, the word tiles, the image caption, the
  per-question hint and the paragraph letters (DG-189).
- **The phone drawer gains Esc, a focus move, `inert` and a reduced-motion form** (DG-190).
- **Every move in a paper, by key or by click, goes through one function,** and the rail, the sheet
  and the squares follow the 44px floor below 1024 (DG-191).
- **Section instructions show above every question,** and the builder's sentence follows (DG-192).
- **A start spends a play and a resume none;** unlimited plays read "Play {n}" (DG-193).
- **Matching waits for R6** (DG-194).
- **The next sync reads the contract, the engine and the group editor** (DG-195).

Defaults taken on 2026-10-12, with the v2 export (DG-196 to DG-202):

- **The centre pool has one rule, "Pause AI for everyone".** "Add credits" is the Admin's approval and
  nothing is billed (DG-196).
- **A variant is a new draft test, and the bank clean-up merges nothing** (DG-197).
- **The Attendance sentences wait for R8** (DG-198).
- **The permissions matrix gains "Use AI features" and "Manage AI credits"** (DG-199).
- **Settings › AI assistant gains "Ask for more credits"** (DG-200).
- **The AI panel's off, paused, exhausted, failed and invalid states are built from deck parts,** with
  Esc, a focus trap and focus return (DG-201).
- **"Suggest a score" uses the grading card's own set;** the band form joins R6 (DG-202).

## Updating the deck

A new export from Claude Design (project `49cb45cb-7a21-441e-bb39-4261e0f38372`) replaces the
files in `deck/` byte for byte.

The deck's `github.md` still says `repo: SekiroKenjii/Quizzivy`, because Claude Design wrote it
before the web moved to `Quizzivy/web`. The path, `web/src`, is the same here. Point the Claude
Design project at `Quizzivy/web` before its next sync, and let that sync rewrite the line; do not
edit `github.md` by hand, since the manifest pins it.


1. Copy the pages, `support.js`, `qz-controls.js`, `github.md`, the SVGs and `brand/` over the
   old ones. Do not import `screenshots/`, `uploads/` or `.thumbnail` (see below).
2. Regenerate the manifest:
   `cd docs/design/deck && find . -type f ! -name MANIFEST.sha256 | sed 's|^\./||' | LC_ALL=C sort | while IFS= read -r f; do sha256sum "$f"; done > MANIFEST.sha256`
3. `node scripts/check-design-deck.mjs` — it checks the manifest, that every page is one
   template and one script, and that every file a page references is in the deck, a
   `<dc-import name="X">` included (it must find `X.dc.html`). A `src` or `href` that a page's
   script builds (its target holds a quote or a `$`) is not read as a file reference.
4. Add a line to the log below, and say in the PR which screens changed.

## Proposals

`deck/proposals/` holds pages written in this repository, not exported from Claude Design. A
proposal draws what `gaps.md` says the deck does not: one page for one topic, laid out as the
pages in `page-width-proposal/` are (cover, decisions, frames, state table, copy, open questions,
handoff), with the deck's tokens, typeface, icons and brand files. It loads `../support.js` and
the deck's SVGs by relative path, so nothing is copied. Its frames are in Vietnamese first, with
the English strings beside them.

No rounded box in a proposal carries a border on one side only: no card, panel, callout or quote
with rounded corners and an accent edge along its top or its side (Thuong, 2026-11-12, for every
surface; `AGENTS.md`, "Design"). Set such a box apart by space, by a quieter ground, or by a
hairline all the way round. Lines that mark a state are not boxes and stay as the deck draws
them: the line on the grading queue's active row, the line under the selected tab.

A proposal is not the design of record until Thuong approves it. Until then its `gaps.md` rows
stay Open and carry a note that names the page. On approval they become Answered, and the release
that builds the screens reads the page as it reads the deck.

1. Add or change the page under `deck/proposals/`. Never edit the seven exported pages or
   `page-width-proposal/`: the next export replaces them.
2. Regenerate the manifest with the command above and run `node scripts/check-design-deck.mjs`.
3. Add a line to the log below, and a note to each `gaps.md` row the page answers.

To view one, start the server above and open, for example,
<http://localhost:5175/proposals/R7%20Question%20Sets.dc.html>.

## Not imported

- `screenshots/` holds Claude Design's own before-and-after captures at about 924px, several of
  them broken intermediate renders. They are not a reference.
- `uploads/` holds eleven red-pen markups on earlier revisions. All eleven are resolved in the deck as
  imported:

  | Markup | Resolved as |
  |---|---|
  | Assignment detail, Settings tab: a cramped key/value table | Grouped sections (test and time, window, integrity, results), locked while live |
  | Test builder: narrow, truncating outline | A draggable "Resize outline" splitter; double-click resets it |
  | Student join dialog: "6-character" copy and `ABC-123` | "8-character" copy, `XXXX-XXXX` |
  | Roles and permissions: the Teacher column | "Edit permissions" scrolls to the matrix and highlights that role's column |
  | Calendar: the sticky day header clipped 08:00 | The first hour is fully visible |
  | Test builder under a very long title | Marquee titles, points never wrap, "Drag questions here" in an empty group |
  | New assignment stepper: truncated summaries | Four steps (test, students, schedule, rules) with marquee summaries |
  | Test builder title row: badges drifted right | Status and save state sit beside the title |
  | Imports history: the action column and the row menu clipped at the card's right edge | No sideways scroll: a grid from 960px of content width, stacked cards below |
  | Imports history: a cramped row of search and six filter chips | Segmented status tabs with counts on the left, the search on the right |
| Student take test, a cloze: the gap's options cut in one row and the footer's count cut | Options wrap in a grid of 132px minimum; the count gives way to a key hint when the rail shows, and is a short form otherwise |

  The fourth export also fixed two defects the drawing shows and the designer did not mark: the
  rail's "Grammar and vocabulary" overlapping its own second line (S 1011), and the header's "All
  answers saved" on two lines (the label is now `white-space: nowrap` and the leave button `flex:
  none`, S 952, 963; the product already truncates the line and pins the button).

## Log

- 2026-09-26 — First import (T-R0.1), from Thuong's 18:06 export. Teacher page sha256
  `93ded9aa…`. The inventories behind `docs/plan/70-*` were read from the 10:02 export the same
  day; the 18:06 export differs by a few hundred bytes in the Admin and Student pages and about
  3 KB in the Teacher page, so each release re-reads its screens from this deck, not from the
  inventories.
- 2026-10-03 — Second import, from Thuong's 09:55 export. Two pages changed: Teacher (sha256
  `12767a0c…`) and Admin (`72d4837a…`); the other thirteen files are byte-identical. Teacher:
  "Paste a test" (a button on the Tests list and on the Imports history, the Source switch
  "Upload a file | Paste text" on the import page, and the pasted variants of processing, the
  Ready card and the review's source pane); the Imports history no longer scrolls sideways (a
  grid from 960px of content width, stacked cards below), and its status filters are segmented
  tabs with counts, with the search on the right. Admin: the Audit log filters are the same
  segmented tabs with counts. The decisions taken with this import are DG-12 to DG-19 in
  `gaps.md`.
- 2026-10-04 — Third import, from Thuong's 01:14 export. Two files changed: the Teacher page
  (sha256 `44342870…`, 658,831 to 781,532 bytes) and `github.md`; the other thirteen are
  byte-identical. Teacher, Test builder: "Prompt" and "Explanation" are a rich content editor
  with a "Rich text | Markdown" switch, a toolbar (marks, heading, lists, "Link", "Image",
  "Audio", "Insert table", "Insert gap"), table tools, a notice band and a "{n} words" footer;
  the answer area has one block for each of six types, with a grading note, and the type menu
  gains "True / False" and "Short answer"; a "Question media" block attaches audio or an image
  ("Plays", "Students can pause", "Transcript", alt text); two dialogs are new, "Preview
  content after pasting" and "Choose from Media". Teacher, Review workspace: the question
  card's "Question" field is the same editor, with the same two dialogs. Nothing else on the
  page moved: the bank's Question editor screen, the builder's outline, title bar and publish
  dialog, the Student preview and the rest of the review are as they were. `github.md` records
  a sync of 2026-10-03 against `develop` and maps the editor to
  `web/src/components/shared/content/editor/` and the question bank's editor components. The
  check script changed with this import: a `src` or `href` built in a page's script is not
  read as a file reference. What the export answers and leaves open is DG-108 to DG-116 in
  `gaps.md`, with notes on DG-35, DG-36, DG-60, DG-63, DG-69, DG-80, DG-83 and DG-90.
- 2026-10-12 — Fourth import (T-D4.1), from the design team's export of 2026-10-04, 17:31, as
  carried by the v2 export below. Three files changed against the third import: the Student page
  (sha256 `0dfd2d54…`, 123,460 to 173,426 bytes), the Teacher page (`a4c08424…`, 781,532 to 794,309
  bytes) and `github.md`; the other twelve were byte-identical. Student, take test: one
  data-driven screen whose layout follows the open question's shared content (a passage, a cloze
  passage or a recording), with the sections rail, the stimulus pane, the phone drawer, the grid
  button and its question sheet, the gap card, matching, the inline blank and a "Student view"
  chip. Teacher, builder: "Shared content" in the group's menu and under its header, with its
  560px dialog; the builder's preview, Test detail's preview and the import's preview now embed
  the Student page. The check script changed with this import: a `<dc-import name="X">` is a
  reference to `X.dc.html`. What the export answers and leaves open is DG-182 to DG-195 in
  `gaps.md`, with notes on DG-36, DG-60, DG-63, DG-68, DG-69, DG-80, DG-111, DG-113, DG-115 and
  DG-116.
- 2026-10-12 — Fifth import (T-D4.1), the v2 export of 2026-10-10, 10:44 (`uiux/update-uiux-v2` @
  `26b60795`), which holds the fourth export in every file it did not touch. Five pages changed:
  Teacher (sha256 `184536f0…`, 794,309 to 907,000 bytes), Admin (`8c043d26…`, 151,390 to 171,480),
  Student (`dc6d6077…`, 173,426 to 173,401, fixtures only), Landing (`52196e86…`, 49,717 to 49,703,
  fixtures only) and Sign in (`15ab7e2b…`, 22,899 to 22,896, fixtures only). The take-test
  engine, the builder's shared content and the three previews are byte-identical to the fourth
  export. New: the AI assistant (the panel and its five kinds, "Suggest a score", "Explain results
  with AI", "Write with AI" and "Suggest wrong options", "Read with AI" on the import page,
  Settings › AI assistant, Admin › AI credits); the assignment detail's progress card; the grading
  pane's heights; the join-code card; sticky side columns and the collapsed sidebar's separator;
  the Attendance page and the class-detail Attendance tab; the Audit log's search and date range;
  the word list's progress card; and the persona renames. The decisions it needs are DG-196 to
  DG-202 in `gaps.md`, with DG-01 answered and notes on DG-22, DG-36, DG-63, DG-71, DG-100 and
  DG-106.
- 2026-10-12 — The approved page-width design (DG-205), from `origin/uiux/update-uiux-v2` at
  `c1472f4c`, in its own folder `page-width-proposal/`: `Page Width Proposal.dc.html`, its
  `support.js` and `github.md`, and the two brand marks it loads from
  `page-width-proposal/web/public/brand/`. The other pages are unchanged. It draws one page frame
  for eight Teacher screens at seven widths, the tokens behind it, the workspace pager and the
  merged import workspace (not yet built). The check script changed with this import: a page's
  references resolve from the page's own folder.
- 2026-10-13 — The design team's answer to Q6 (#581, DG-184, DG-185): `page-width-proposal/Cloze
  Decision.dc.html` is added, and `Page Width Proposal.dc.html` and `github.md` are updated to
  link it. #581 did not regenerate the manifest; the manifest is regenerated here, and no page
  changes. It draws a cloze as one question per gap shown as one screen (T-D4.10's default) and
  the pieces T-D4.10 adds: the run's ties and current ring in the rail and the sheet, the flag
  naming the open gap, the "{k} of {m} gaps" line, the hint, and the result's run line.
- 2026-10-13 — The design team's answer on Grading's two undrawn states (T-D4.21b), from
  `origin/uiux/grading-finish-states` at `fe9422c7`: `page-width-proposal/Grading Finish
  States.dc.html` is added, `github.md` maps it, and `Cloze Decision.dc.html` gains a
  `text-size-adjust` rule. The branch did not regenerate the manifest; it is regenerated here. It
  draws the empty queue (all graded, or papers still to finish) and the "Ready to finish" card at
  1280, 768 and 360, light and dark: Review on the row with Finish inside its check, the card
  folded below the panes while answers wait, rows grouped by assignment, and every English line.

- 2026-11-11 — First proposal page, written in this repository: `proposals/R7 Question
  Sets.dc.html`, for DG-90 (R7; `docs/plan/77-r7.md`, T-R7.19 and T-R7.16). It draws the Sets
  group in the bank's filter aside and Filters sheet, "Add to set" and "Share…" in the bulk bar,
  the Add to set dialog, the set page for its owner, a Can-edit and a Can-use recipient with its
  loading, empty, error and not-found states, and the share dialog for a set with the skeleton
  and the error line the deck leaves out. Frames at 1280 and 360, light and dark, Vietnamese and
  English. No exported page changes. It is a proposal until Thuong approves it, and its seven
  questions for him are on the page.

- 2026-11-12 — Second proposal page: `proposals/R7 Access Modes.dc.html`, for the rest of DG-90
  (R7; `docs/plan/77-r7.md`, T-R7.18 and the editor part of T-R7.19). It draws what the owner, a
  Can-edit recipient and a Can-use recipient see in the test builder, test detail, the Shared
  content dialog, the question editor and the assignment wizard's test step: the owner line and
  the access pill, the sentence under the heading, the read-only builder, and the three notices of
  co-editing (someone saved first, saved as a copy, sharing stopped). Frames at 1280 and 360,
  light and dark, Vietnamese and English. No exported page changes. It is a proposal until Thuong
  approves it, and its five questions for him are on the page.

- 2026-11-12 — Third proposal page: `proposals/Email Layout.dc.html`, for DG-229, opened with it:
  the deck draws no email. It draws one layout for the four emails the API sends today (R5) and
  the fifteen that R7, R10 and R11 plan, and seven of them in full, in a reading pane and on a
  phone, light and dark, Vietnamese and English, with the plain-text part. It keeps T-R5.2's rule
  (no images, no remote CSS, no tracking), so there is no logo, and the colours are the deck's
  tokens as hex. Redrawn the same day on Thuong's review as a flat layout: one white panel on a
  soft ground, blocks set apart by space and a quieter ground, with no outline and no accent
  edge: the first drawing's card had a lime top edge, the look he rules out for any rounded box
  ("Proposals", above). The emails are rendered in `Quizzivy/api`; the
  page is here because the deck is the design of record. It is a proposal until Thuong approves
  it, and its six questions for him are on the page.

- 2026-11-12 — Fourth proposal page: `proposals/Builder Shared Groups.dc.html`, for DG-231, opened
  with it: teachers tell the owner that questions on shared material are hard to build, the cloze
  most of all. The page reads the builder's code on `develop` (`bc20eec4`; the app was not run),
  sets what a teacher does today beside what is proposed for seven tasks, and ranks eleven things
  in the way. It draws one pane in place of the group row's shared-content line (DG-186) and the
  Shared content dialog (DG-187): the passage or the recording on the left, its questions as
  cards on the right, two tabs on a phone; a button under the outline that names a passage, a
  cloze and a recording; and a gap made by selecting a word, with its question made in the same
  write. Frames at 1280 and 360, light and dark, Vietnamese and English; a frame is as tall as
  its page. No stored shape changes, and no exported page changes. It is a
  proposal until Thuong approves it, and its seven questions for him are on the page. He decided
  the first two the same day, as drawn: a gap with no wrong options is one the student types,
  and the builder and the bank both use the three names. The page gained a table of the wording
  that follows ("One name each"); the bank's own screens are still not drawn (DG-68).
  He also decided the third: the Shared content dialog goes, with the group row's shared-content
  line and its menu item, when the page is built. And the fourth and fifth: two buttons under the
  outline, not one menu for everything; and a gap's word on a row picked at random among four.
  The seventh he decided against the first drawing: the gap's card offers the AI's wrong options
  now, not later. The page gained that step of the cloze ("4 · AI suggestions"), with the button
  and the panel the question editor has, and says what it needs: `suggestAiDistractors` has to
  accept a gap's typed question and read the sentence around the gap, a change in `Quizzivy/sdk`
  and `Quizzivy/api`. So the page no longer says that no operation changes.
  The sixth (who tries it before the build) was done another way: he showed the frames to
  teachers. They said they could tell at a glance what to do and that it is much easier than
  today, and added that a recording can have a cloze too, with other combinations besides. The
  page gained a listening gap-fill (step "Listen and fill the gaps" of the recording, and a
  fourth choice in the menu, "Bài nghe điền từ"), a row that adds a text under any recording,
  and a table, "What a teacher can build with it", of ten tasks: six drawn, three the pane makes
  without a drawing, and one the model cannot store (a word bank shared by all the gaps), which
  he says teachers do not need (Q8).
  Teachers then asked how one who has chosen one of the menu's four changes to another, and
  whether that means deleting. It does not: every pane now shows a row for the part it does not
  have ("Thêm bản ghi âm" above a text, "Thêm đoạn văn" under a recording), a part left empty is
  not kept, and a part with content is removed from its own card's menu. He decided that the
  row is enough and the pane needs no switch of kinds (Q9). All nine questions on the page are
  settled; the page itself still waits for his approval.

- 2026-11-13 — Fifth proposal page: `proposals/R7 Messages.dc.html`, for DG-83 and DG-91 (R7;
  `docs/plan/77-r7.md`, T-R7.20 and T-R7.21). The deck draws Messages for a teacher and for a
  student with every thread full and every send working. The page adds, from the deck's parts:
  a file as a chip in its sender's bubble or in the announcement's card, the Attach dialog's
  states (nothing chosen, uploading, ready, refused for size or kind), Details as a popover and
  as a sheet on a phone, the list's skeleton, empty sentence, error and no-match, an empty
  thread and channel, "Load earlier", a send on its way and one that failed, and the composer
  replaced when the two no longer share a class or the class is archived. Both screens are in
  Vietnamese for the first time. Frames at 1280 and 360, light and dark, Vietnamese and
  English. No exported page is edited and no operation of T-R7.10 to T-R7.12 changes. It is a
  proposal until Thuong approves it, and its six questions for him are on the page. He decided
  two the same day, neither as first drawn. In a class channel Enter makes a new line and only
  the button posts, because an announcement reaches a whole class and cannot be edited or
  deleted; no sentence on the screen says so. And the Attach dialog attaches and no longer
  sends: the file waits in the composer as a chip, the teacher writes a message with it or
  presses Send as it is, and both leave as one message. He kept "thông báo" as the
  word for an announcement, and asked that a Word file (DOC or DOCX) can be attached beside PDF,
  pictures and audio. So the page changes three things the deck draws, and the plan changes
  with them: two lines of T-R7.20, and the kinds of file T-R7.11's upload accepts. The page
  asked in return whether a Word file that carries macros is refused (Q7), and he decided that
  it is: the dialog gains that refusal as a state. An announcement keeps the count of who has
  seen it and shows no names (Q4). And a class ending closes no conversation (Q5): a teacher
  and a student who have one can go on writing after the student leaves the class. The page's
  refusal state became a disabled account, and the eligibility rule of T-R7.10a changes in the
  plan. He then decided that a teacher may write first to a former student never written to.
  The list gains a state for it: a search also finds the students the teacher may write to and
  has no conversation with, under "Học viên chưa nhắn tin", a former student marked "Học viên
  cũ". Finding a current student there was not asked; it comes with the same search. The
  server keeps no record of a past class membership, so the plan gains one (T-R7.9, O-R7.8),
  and a student who left before R7 is found only if they joined with a code. Asked about the
  other side, he kept it as planned: a student cannot write first to a teacher of a class
  they left. Last, he decided the page's Q6 as proposed: Admin › Data & privacy gets one
  read-only row saying that messages are kept and that anonymising an account deletes its
  direct messages. The page draws it on the card as the product has it (DG-96), and no
  question is open on the page. Two states the page had left to its tables were then drawn at
  his word: Details for a former student, which says so in one sentence and has no link, and
  the student's thread and list with a former teacher.
- 2026-11-13 — Sixth proposal page: `proposals/R7 Shared With Me.dc.html`, for DG-83 and DG-90
  (R7; T-R7.17). It draws Shared with me as R7 ships it: two kinds, tests and question sets, on
  three tabs, in Vietnamese for the first time, with the states the deck leaves out. Those are
  loading, nothing shared, nothing matching, a list that cannot load, an owner whose account is
  disabled, the Make a copy and Remove confirms, and an item that is no longer shared when the
  teacher acts on it. Frames at 1280 and 360, light and dark, Vietnamese and English. No
  exported page is edited and no operation changes. It is a proposal until Thuong approves it,
  and its four questions for him are on the page.
- 2026-11-13 — Seventh proposal page: `proposals/R7 Email Status.dc.html`, for DG-96 (O-R7.3).
  R7 stops sending to an address after a hard bounce or a spam report, and no screen says so.
  The page draws one notice in the Admin user sheet, with the product's warning callout: what
  happened, since when, and what still works. It adds no action. The sheet is drawn alone at
  440 and 360, light and dark, Vietnamese and English. R7's plan does not build it and the
  page changes no plan: it names the one field the read of an admin user would need. Its five
  questions for Thuong are on the page.
- 2026-11-13 — Eighth proposal page: `proposals/R8 Session Popover.dc.html`, for DG-92 (R8;
  T-R8.11). The deck's Calendar jumps to Attendance when a session is pressed, and R8's plan
  asks for a popover from deck primitives. The page draws it on the week grid and as a sheet
  on a phone: five facts and up to six actions; the dialog for one date and the one for the
  weeks to come; stopping a series; the Cancel and Delete confirms; and a cancelled session,
  which stays on the grid struck through. Ten states, at 1280 and 360, light and dark,
  Vietnamese and English. No operation of T-R8.4 changes. One sentence goes beyond the plan:
  the repeating-session dialog says, before saving, that dates already changed or cancelled
  will follow the new schedule. Its four questions for Thuong are on the page.
- 2026-11-13 — Ninth proposal page: `proposals/R8 Terms.dc.html`, for DG-93 and DG-57 (R8;
  T-R8.13). The deck has no screen for terms, and R8's plan builds one from deck parts as a
  fifth section of Admin › System settings. The page draws it in the product's settings
  layout: the list with a pill for current, upcoming or past and a row menu; one dialog to add
  and edit; an overlap named by the server and an end before the start; the delete confirm;
  and the empty, loading and failed states. Ten states, at 1280 and 360, light and dark,
  Vietnamese and English. No operation of T-R8.3 changes. One line goes beyond the plan: when
  a term's end date moves, the dialog says that repeating sessions already made keep their old
  last date. Its three questions for Thuong are on the page.
- 2026-11-13 — Tenth proposal page: `proposals/R8 Week and Class Schedule.dc.html`, for DG-83
  (R8; T-R8.10, T-R8.14, T-R8.15). Three things the deck draws only in part. The student's
  This week gains a cancelled class, a week with nothing, and its loading and failed states.
  Edit class shows the Schedule field read-only, with "Đổi trong Lịch", once the class has
  sessions, and as today when it has none. The teacher's Calendar is drawn loading, empty (the
  grid stays, with the sentence over it) and failed. Ten states in all, at 1280 and 360, light
  and dark, Vietnamese and English. No operation changes. One line goes beyond the plan: under
  Room in Edit class, what the room is for once sessions exist. Its four questions for Thuong
  are on the page.

## The brand

`brand/` is Thuong's kit, copied byte for byte from `~/Developer/designs/quizzivy-brand`. The
deck's own SVGs are re-serialised copies of it (the same geometry; only `<path/>` against
`<path></path>` and the trailing newline differ). If the two ever disagree, `brand/` wins.

| | |
|---|---|
| `brand/svg/quizzivy-mark-*.svg` | Symbol alone — `color`, `on-dark`, `black`, `white` |
| `brand/svg/quizzivy-logo-horizontal-*.svg` | Lockup with the wordmark — same four variants |
| `brand/svg/quizzivy-logo-vertical-*.svg` | Stacked lockup — `color`, `on-dark`, `white` |
| `brand/svg/quizzivy-appicon-{light,dark}.svg` | 1024 app icons, corner radius already applied |
| `brand/svg/quizzivy-favicon.svg` | Square favicon; copy to `web/public/favicon.svg` |
| `brand/png/` | Pre-exported PNGs, and `brand/README.md` is the kit's own documentation |

Rules that come from the kit itself: light ground → `color`, dark ground → `on-dark` or `white`,
one-colour printing → `black` / `white`; symbol never below 24px tall, horizontal lockup never
below 120px wide. The wordmark is Quicksand Bold converted to paths — never re-set it in the
interface typeface (Be Vietnam Pro).
