# Tvijo DSHREM for VS Code

Version 0.10.7. A project-scoped chat, bounded agent and coding-review client for the
Tvijo service (dsh.tvijo.com). Every task has a spending ceiling; provider credentials
stay on the service unless you explicitly connect your own provider (BYOK).

## Compact chat

The editor opens in the simple view: project title, conversation history and a new
chat button above the transcript; attachments, permission mode, model, settings
and Send/Stop stay beside the composer. Settings holds interrupted runs, account
usage, connections and an optional Engineering view. Failed requests keep your
draft and show one actionable message in the chat.

Use **Settings → Select project context** to choose top-level folders and files.
The preview is a bounded local summary with bytes and an approximate token count;
it is not a full repository index and makes no model call. Secrets, binaries and
excluded build directories stay excluded. Automatic context may be omitted to
fit the remaining trial allowance. Explicit attachments are not silently reduced.

TokenTvijo (TT) is service credit; model tokens measure text processed. Check the
quoted ceiling and actual receipt for each task. Pro orchestration, configurable
worker teams and research integrations are a planned managed service, not an
active subscription included with this extension. See the [workspace guide](https://dsh.tvijo.com/workspace-guide#product-value).

## Choose the execution folder

Right-click a **folder** in Explorer and choose **Work in Tvijo**. That exact
folder becomes the execution folder and chat opens immediately: no second picker
or path entry. Alternatively, click the folder button in chat (or **Choose
project** in the empty state). Click an arrow to browse subfolders; click a name
to select it. The button shows the selected folder name and its canonical path
on hover. This also works before sign-in. Open a folder in VS Code first if the
browser has no roots. Restricted Mode requires workspace trust before browsing.

The folder browser reads one level per expansion, up to 500 entries and 100
folder rows, omitting generated/cache folders. For a directory beyond those
limits, use Explorer → **Work in Tvijo**. Canonical volume symlink workspace
roots are supported; symlinks that escape their owning workspace are refused.
A containing root and an open nested project may both be selected explicitly.
Tools, terminal cwd, context, local history and permissions use the same selected
canonical folder. Editor focus does not change it; switching is blocked during
active work. Selecting a folder does not grant Full access.

New simple sessions use **Manual** Agent mode: the selected model can read,
propose edits and run tests, with confirmations for edits and commands. Selecting
**Full access** changes the next Send to the Agent loop only after host approval.
Cancellation or failure keeps the previous mode. An explicitly selected **Chat**
remains questions and answers without the Agent loop, including after reconnect.
Mode intent is saved per account and selected folder; old fallback Chat drafts
are preserved as text but no longer suppress tools after reconnect.

The account row shows the **running Tvijo version**. After installing an update,
click its version/reload button or run **Tvijo: Reload window**. Help also shows
the runtime version. A downloaded or installed VSIX version does not prove which
extension process is currently loaded.

## Permission presets

Plan is read-only. Manual, Edit automatically and Auto retain their existing
approval behavior. **Full access** approves edits, including whole-file and
whitespace fallback replacements, and supported commands without further prompts.
Enable it for the explicitly selected execution folder through the native modal. It requires a trusted workspace and a permission record
bound to this host's local folder identity; workspace settings cannot enable it.

A compact permission indicator shows the active selected folder grant. **Revert** stops active work using
that permission and removes it in one click. Full access leaves normal preset
settings unchanged, so reverting restores their behavior. Explicitly choosing
another Agent preset also revokes Full access for the current folder.

Hard command denials, file-tool workspace/symlink/secret guards, task budget
ceilings and reservations remain mandatory. Edits still require Rewind checkpoints
and leave editor buffers unsaved. Commands use local host permissions; this preset
does not provide an operating-system sandbox. Restricted Mode cannot enable it.

## Diagnostics after Agent edits

Before each Agent write, Tvijo captures the file's Error/Warning diagnostics.
The next step receives new and resolved items against that baseline, with only a
count of unchanged pre-existing items. Feedback is limited to 20 items total and
8 KiB. Truncation and provider freshness are labelled; a concurrent buffer edit
makes the delta unavailable. An empty delta does not mean compilation or tests
passed. Diagnostic identity includes severity, source, code, message and range;
locations moved by an edit can appear as resolved and new items.

## Replacement anchors

Agent replacements try exact text first, then the existing line-ending fallback.
A unique whole-line match that differs only in trailing spaces or tabs is offered
as a diff and requires explicit confirmation, including in Auto. Ambiguous matches
are refused. Leading indentation is never normalized for a replacement.

When only indentation differs in a unique block, the tool returns its exact current
text (up to 40 lines and 4 KiB) so the next step can retry without a separate read.
This hint makes no edit. Combined trailing-whitespace and line-ending drift still
requires the model to retry with exact text.

## Preview context and activation

After installing an update, run **Developer: Reload Window** to activate it. The
installed package version and the currently running extension host can differ
until reload. Version 0.10.4 checks fresh account tokens and the complete escaped
request before reservation, omitting optional automatic context when it cannot
fit. Explicit selections and attachments are never silently shortened. If they
exceed the allowance, the draft remains available for a new conversation or a
smaller selected excerpt. Screenshots provide extracted text, not visual image
understanding.

## Interrupted runs and drafts

Chat, Agent/Plan and Quick Edit save your prompt locally before dispatch. Agent
events are retained in a bounded journal: the newest 60 events and at most 64 KiB
per run. Recovery records are available for seven days and separated by account,
thread and workspace. Composer drafts are also saved locally after a one-second
pause in typing.

After a restart, **Settings → Interrupted runs** offers **Restore transcript** and, when a task
identifier is known, **Fetch result**. Fetch reads the existing task's available
result or status. Restoration keeps the transcript in local history; it does not
resume tools or submit another model task. Recovered logs are excluded from later
automatic model context. **Dismiss** hides the card without cancelling its task.

## Actions and context captures

Use **+** for Attach file, Mention file, Problems,
Terminal output, Clear conversation, Rewind, Export conversation as Markdown and
Switch model. The menu is keyboard accessible and localized in English and Russian.
Type `@src/file.js` or `@"path with spaces.js"` to resolve a workspace file before
sending; ambiguous names require a picker. File references are attached as clearly
labelled, untrusted context. Nothing is sent until you submit the message.

Problems includes only current Error and Warning diagnostics with safe workspace
paths. Terminal output uses observed shell integration output for the active workspace
terminal, or the most recent extension command output in that workspace. It keeps a bounded in-memory tail, strips
terminal control sequences, and is never persisted. Both captures are labelled
untrusted and previewable/removable before sending. Agent and Plan runs include the
explicit attachments selected when the run starts.

After a successful Agent write or replacement, the next Agent step receives the changed
file's current Error and Warning diagnostics, limited to 20 per file and 8 KiB serialized.
Feedback includes the actual document version and whether a diagnostics update was observed
after the edit. It is untrusted tool data; an empty snapshot does not mean compilation passed.
Agent edits remain unsaved buffers.

Markdown export includes conversation display text only and redacts known auth
tokens and common credential patterns. Credential detection is best effort; review
the exported document before sharing it.

## Rewind (local checkpoints)

Open the header **… → Rewind…**, run **Tvijo: Rewind**, or type `/rewind`.
Choose a recent run, then a step: its time, files and requested model are shown.
**Rewind to before step N** undoes that step and every later edit in the same run.
Files changed by later runs are treated as conflicts; those runs are not silently undone.

Tvijo saves the previous disk bytes (or “did not exist”) before Agent `write_file`,
`replace_in_file`, Quick Edit buffer Apply, and reviewed coding proposal Apply.
Open editor buffers are captured separately, including unsaved Quick Edit input.
Rewind restores the original disk bytes and buffer state; disk restoration is checked
with SHA256, preserving BOM, CRLF and arbitrary bytes. It does not automatically save
unsaved buffer changes. Close binary editors before restoring binary files.

If a file or buffer has changed since the agent edit, choose **Overwrite file** or
**Skip file**. Files that did not exist at the selected point always require
**Delete file** confirmation; **Skip file** preserves them. Dismissing a prompt skips
that file. Changes during confirmation abort that restore rather than replace newer data.
A short local chat note reports restored and skipped counts.

Checkpoints stay in this extension host’s `globalStorageUri/rewind-v1`, outside the
workspace, for up to seven days and 50 MiB total (including metadata). Expired records
and then oldest records are pruned on activation, hourly, and before capture/list/restore.
A checkpoint larger than the limit or unavailable storage blocks the edit.
Symlinks, hard links, excluded/secret paths and files outside the workspace are refused.
Local snapshot bytes, hashes and storage paths never enter service requests, conversation
exports or usage logs. Rewind works locally without signing in; its note is display-only.

This is file-edit recovery, not a full filesystem transaction: shell-command side effects,
external tool writes and files outside Tvijo’s Apply paths are not checkpointed. The
first workspace folder is used, as in the existing Agent flow. No new settings are added.

## Markdown answers

Assistant replies support headings, bold/italic, inline code, fenced code (language label
and **Copy**), lists, blockquotes, tables, horizontal rules and highlighted links. User
messages stay plain; task receipt footers remain visible. Raw HTML tags are dropped,
model images never load, and HTTP/HTTPS/mailto links open through VS Code after a click.
Rendering is bounded at 120,000 characters, 4,000 lines and 8,000 DOM nodes; open the
answer in an editor to read longer replies. The strict content security policy is retained.

## Agent map

Click **⑂ Agent map** (**Карта агентов**) in the header. The current request is on the
left; executed tasks, Agent model steps/tools and available council or coding
review/swarm execution records extend right. Select a node for task ID, route, receipt
fields and a short last message. Arrow keys move between nodes; Enter/Space select;
Escape returns to chat. The canvas scrolls horizontally and vertically, with visible scrollbars; the details pane stays independently scrollable.

While open, the map refreshes every two seconds using existing task reads. Data stays
scoped to the signed-in account, project and thread. Reopened conversations use server
history only where task IDs or thread IDs establish that relationship. Quotes alone do
not create execution branches. Missing aliases, timestamps, token counts and spending
show **—**; known service credits (TT) and USD keep separate units. No new server API is
required. Some servers expose branch receipts only after completion; those branches
appear when supplied. Local execution trees are kept in host memory for the session.

## Skill packs

Choose a skill pack from the compact chat-header button or the Tvijo status bar.
Packs come from your signed-in service and stay in memory for the session. If the
service has no packs or cannot be reached, these controls stay hidden.

`tvijo.pack` is the only new setting: empty means automatic. Automatic checks literal
marker files in the first workspace root, then uses the served `engineer` pack when
available. The picker shows `auto: <title>`; choose a pack to override it for the workspace.
Choose **No pack** (**Без набора**) to store `none` and disable pack guidance and automatic suggestions.
Guidance is added once per Chat or Agent/Plan request, never to stored local history.
Your explicit `model` or `agentModel` choice wins; otherwise the pack recommends the model.
Shared-project Chat keeps its server-quoted service routing.

The status bar shows the pack and today's remaining USD allowance from
`budget.daily_remaining_usd` (for example, **$0.95 left today**), or **—** when unknown.
No pack contents are bundled with the extension.

## What 0.5.5 changed

- **Review and swarm accept real-sized changes.** Proposals grow from 2 KiB/1 KiB to
  24 KiB (review) and 8 KiB per proposer (swarm); the selected snapshot grows from 16 KiB
  to 56 KiB (review) and 40 KiB (swarm). The plan declares its own limits version, so an
  installed 0.5.4 client keeps quoting the old tiers and is not broken by the change.
- **The agent remembers the conversation.** Recent turns are sent with the question, in a
  bounded block, so "what did I ask before" has an answer instead of "no history".
- **The shared thread is used by default** when you sign in with a project key, and the
  chat states that the same conversation is visible at dsh.tvijo.com with a link to it.
- Agent still ends every run with an answer: at the step limit one extra call without
  tools writes the reply, and a raw `TOOL_RESULT` is never shown as the answer.
- Large files are read from the start up to 64 KiB with an explicit truncation note;
  step limit is 12 by default (`tvijo.agentMaxSteps`, up to 30).
- A project is chosen before a payer, settings are searchable in EN/RU, sign-in state is
  consistent, and money never renders as nine decimals.

## Start

1. Install the `.vsix`, then **Developer: Reload Window**.
2. **Tvijo: Sign in** — the panel shows an eight-character code; approve it in the browser
   where you are already signed in. The token is stored in VS Code SecretStorage and is
   valid only for the service URL it was issued for.
3. Create a project and API key in [Connections](https://platform.tvijo.com/connections),
   then **Tvijo: Sign in with project key** and **Tvijo: Open shared server thread**.
4. Ask a question, or select code and press `Ctrl+Alt+T` (`Cmd+Alt+T` on macOS).

Browser and editor share the same project, thread, task history and receipts. Chat
questions stay in the sidebar; questions about a selection open beside your code.

## Modes

| Mode | Defaults | What it does |
|---|---|---|
| Chat | — | One question, one metered task. Answers cite the files you attached or added to your knowledge base. |
| Manual | `agentAutoApply = false`, `agentAutoRun = false` | Ask before edits and commands. |
| Edit automatically | `agentAutoApply = true`, `agentAutoRun = false` | Apply edits automatically; ask before commands. |
| Plan | `agentAutoApply = false`, `agentAutoRun = false` | Read-only Agent run with commands disabled. `planMode` is selected for that run. |
| Auto | `agentAutoApply = true`, `agentAutoRun = true` | Apply new files and exact unique replacements automatically; existing-file whole-file replacements still ask. Auto-run only the existing exact test command vectors. |

Choose Chat or one of the four Agent presets from the composer. The picker changes the two
existing approval settings; it does not change ordinary-chat routing (`tvijo.agentMode`).
External `false/true` values are shown as Custom. Presets cannot change while a task is
running. Provider keys are removed from the command environment and destructive patterns
are refused before a shell starts. `tvijo.autoApply` remains the separate Quick Edit setting.

## Coding tasks: single, review and swarm

Create an isolated task, select the source files and the immutable test files, and enter
atomic acceptance requirements. The service quotes the whole workflow once; every call
shares that quote and the task ceiling.

| Workflow | Calls | Proposal limit | Selected snapshot |
|---|---|---|---|
| single | 1 | the whole answer, `max_tokens` 2048 | up to 16 KiB of source |
| review | 2 (proposer, reviewer) | 24 KiB (12 KiB with documented requirements) | up to 56 KiB |
| swarm | 3 (two proposers, reviewer) | 8 KiB each | up to 40 KiB |

The proposal limit is a transport budget, not a quality judgement: for a larger change use
`single`. Review and swarm request the wider limits version; a quote without it keeps the
previous 2 KiB/1 KiB tiers, so older clients and stored tasks stay valid. Python `unittest` and Node built-in tests run offline in a restricted sandbox;
reported test counts and output are an untrusted report, not proof of runtime correctness.
Apply requires a settled task, an accepted proposal and unchanged files and buffers — an
unknown cost, a dirty buffer or a changed identity blocks it.

## Models and routing

The model list comes from the service; an unavailable route is refused, not substituted.
For GLM (`glm53f`) the service uses OpenRouter as the primary route and DeepInfra as the
paired route: a confirmed provider refusal (429 or 5xx) is retried at most twice on the
same route, then once on the paired route under the same task id and USD ceiling. A
timeout, an unknown outcome or a 402 is never retried, because it could spend twice.

**BYOK** is explicit and never silently falls back to Managed. It is available for
Standard and single coding tasks; review and swarm are Managed-only. The provider cap and
the separate fixed 0.001 TT service fee are shown before the task starts.

## Money

Receipts use Tvijo Tokens (TT), an internal service unit; actual model tokens are shown
separately. Credit is reserved before a call and unused reservation is released. An
uncertain charge stays held and visible and blocks the next step until it is reconciled —
it is never shown as zero. Provider expense (BYOK) is separate from TT and is not an
invoice.

New accounts receive a sponsored preview bounded by an account cap and a token allowance;
preview reservations that were provably never granted are released automatically. When the
preview ends, the panel says which limit was reached and offers a credit action.

## Attachments, OCR, knowledge base, context

- Up to four attachments, 2 MiB each and 4 MiB combined; text files 64 KiB each; attached
  and extracted text together limited to 80 KiB.
- Images use local Tesseract OCR only (`tvijo.ocrLanguages`, default `eng+rus`, one
  thread, 20-second bound). Colours, charts, object identity and layout are not analysed.
  PDF is not converted.
- Credential-like files, detected secrets, binaries and paths outside an open workspace
  folder are refused; symlinks are refused.
- `tvijo.workspaceContext` (default `ask`, 48000 bytes) offers a bounded project block on
  the first question; `/context` previews the exact bytes that will be sent.
- The knowledge base is explicit: right-click a file → **Tvijo: Add file to my knowledge
  base**. Nothing is uploaded until you confirm.

## When it is not the right tool

- Nothing runs or applies without confirmation, and nothing acts in the background.
- One question is one task; a long conversation hits the per-task context bound, so start
  a new conversation.
- If a previous task may still hold credit, the next question is refused until it finishes
  or you cancel it (**Tvijo: Cancel pending task**).
- Local OCR is not visual reasoning: use it for text, not for screenshots of charts.
- Unknown provider cost is not invented; the task stays frozen until reconciliation.

## Install and requirements

VS Code 1.90+ or a compatible editor that installs `.vsix` packages. The extension host
runs the local terminal, OCR and the Telegram connector, so it must stay running for those
features. A local service can be reached with `tvijo.apiBase`.

## Privacy and license

Read [PRIVACY.md](PRIVACY.md) before submitting private code. The extension is
`UNLICENSED`: no license grant is made here, and a public licensing decision is pending.
Installation does not issue credit.

## Release history

0.6.0 adds server skill packs; 0.5.5 widened review/swarm limits. 0.5.4 fixed the agent's final answer and large reads; 0.5.3
added the searchable settings guide; 0.5.2 fixed the sponsored-preview dead end and
hardened the agent. Full history is in [CHANGELOG.md](CHANGELOG.md).

---

## Historical release notes (0.4.x and earlier — superseded)

The sections below are kept as a record. They describe behaviour that no longer matches
the current release; where they disagree with the sections above, the sections above and
`CHANGELOG.md` win.


## 0.4.8 — shared projects and bounded coding review

1. Create a project and API key in [Connections](https://platform.tvijo.com/connections). Enable coding execution for code tasks; enable agent reviews for the review and swarm workflows. Existing keys keep their scopes.
2. Run **Tvijo: Sign in with project key**, then **Tvijo: Open shared server thread**. Browser and editor share the same project, task history, service balance and receipts.
3. Run **Tvijo: Create isolated coding task**. Choose a workflow, explicitly select source and immutable test files, and enter atomic acceptance requirements. Documented-contract requirements need a selected Markdown or text document.
4. Inspect the saved process evidence, requirement decisions and diffs. Run **Tvijo: Apply reviewed coding proposal** and confirm the exact edits. Changes enter editor buffers; review and save explicitly.

Single uses one proposal call. Review uses a proposer and reviewer; swarm uses two proposers and one reviewer. Calls run sequentially, with depth1 and one attempt per node. All calls share one quote and task ceiling. Whole-workflow token allocations must fit before any call; there are no automatic retries or fallback routes. Multi-mode proposal responses are limited to at most2048bytes for review (1024bytes when documented requirements are included) or1024bytes for swarm; use single for larger changes. Multi snapshots are bounded to16KiB. Only selected existing editable files may change; test inputs stay immutable.

Python standard-library unittest and Node built-in tests run in a restricted offline environment with file, network, process, memory, CPU, time and output limits. Test-process output and counts are untrusted reports. AI review assesses the supplied source and requirement evidence; it does not prove general runtime correctness. Multi-mode Apply additionally requires a calibrated, accepted server-selected proposal and completed financial settlement. Missing evidence, changed files, dirty buffers, changed identity/project, unknown cost or stale decisions block Apply.

Customer receipts use Tvijo Tokens (TT), an internal service unit. Actual model tokens are shown separately. Your TVIJO_API_KEY is a separate access secret stored in VSCode SecretStorage. Unused service reservation is released; uncertain charges remain held and visible. Managed mode uses the Tvijo service. BYOK is still an explicit pilot preference until its separate connection and service terms are activated.

The sections below retain earlier release behavior as history.

## 0.4.2 — one Tvijo workspace, visible usage

Tvijo AI is the workspace brand. Centavra is the simple browser entry, DSHREM is the technical/editor entry. Use the **Usage** tab for your private receipts, provider/model, token counts, task limits and spend. `/usage`, `/connections`, `/guide` are available from chat or the command palette.

Connection modes: managed Tvijo is active. OpenRouter and direct-provider BYOK currently save an explicit pilot preference only; no provider API key is collected and your route does not switch. Provider billing and any future Tvijo BYOK service plan must be agreed separately.

[Workspace guide](https://dsh.tvijo.com/workspace-guide) · [Connections and cost illustration](https://dsh.tvijo.com/connections) · [Private usage](https://dsh.tvijo.com/usage). Unknown provider costs, subscription quotas and cache savings are not replaced with fictional zeros or percentages.


## 0.4.0 — compact workspace and sponsored preview

Open **Tvijo → Chat**, or run **Tvijo: Open chat** from `Ctrl+Shift+P`. Use `+` for context, the model control for routing, and **Terminal** for your own project shell. EN/RU and light/dark/system preferences are available in the panel. Image upload is not promoted in the initial composer.

**Sign in:** the clipboard contains only the eight-character code. **Open browser** opens a prefilled approval link; after Google/password sign-in you return to the approval form. Approval is still explicit.

**Try first:** self-service accounts receive a sponsored preview of 50 tasks, 50,000 model tokens and USD0.05 total, whichever ends first. The shared preview pool is USD1 per UTC day. Preview supports the cheap Flash/Devstral routes; it is not a payment or revenue, and premium models require paid credit. No card, automatic debit or per-question operator approval. Failed attempts and unknown token usage may retain quota; the API never automatically retries.

The terminal opens on your VS Code extension host in the first open workspace folder. It does not start a model or run generated commands. Codex uses your own separate login/subscription. Read [terminal setup](https://dsh.tvijo.com/connect), [manual](https://dsh.tvijo.com/learn), [API](https://dsh.tvijo.com/dev), [feedback](https://dsh.tvijo.com/feedback), [privacy](https://dsh.tvijo.com/privacy). Source mirror: https://github.com/nikbibamon/dshcode.


Ask questions about your code from the editor. Answers cite the files you added to your
private knowledge base, and every question runs as one task with a hard 1 USD cap.

## What you get

- **A Tvijo chat in the VS Code sidebar.** Click the Tvijo icon in the Activity Bar,
  sign in, and ask from the chat field. The panel shows answers, source evidence,
  and the task's spent and held amounts. `Ctrl+Shift+P` → `Tvijo: Sign in` also works.
- **Sign in with your account, not an API key.** `Tvijo: Sign in` shows a short code; you
  approve it in the browser where you are already signed in. The token is kept in VS Code
  secret storage and works only with the service URL it was issued for.
- **Ask about a selection.** Select code, press `Ctrl+Alt+T` (`Cmd+Alt+T` on macOS) or use
  the context menu. These commands open the answer beside your code. Questions typed
  in the sidebar stay in the sidebar. A rejected question remains in the input for retry.
- **Your own knowledge base.** Right-click a file → `Tvijo: Add file to my knowledge base`.
  Upload is explicit and confirmed; credential files, binary files and files that look
  like they contain secrets are refused.
- **Account and credit.** Click the status bar item.

## Attach images and files

Use **Attach** for files on your computer, or paste/drop a PNG/JPG screenshot into
the chat. Use **Workspace** for files on the extension host (including a remote SSH host),
**Path** or `/attach path/to/file` for a workspace path, and **Selection** for selected
code. Workspace files also have **Tvijo: Attach workspace file** in their context menu.
Sending a standalone absolute/relative file path, `file://` link or Markdown file link
also attaches that workspace file without creating a model task. HTTP links are not fetched.
Attachments are shown before sending and can be removed individually. Click **Ask**
or use **Preview text** first to inspect the exact file/OCR text.
Ask sends them with your question; with no question text, Ask explains the attachment.

Images use **local OCR text extraction**, not visual reasoning. The preview shows the
original, but the model receives extracted text only. Colours, charts, object identity
and visual layout are not analysed. Tesseract must be installed on the extension host.
`tvijo.ocrLanguages` defaults to `eng+rus`; use `eng`
on hosts with only English OCR data. OCR uses one thread with a 20-second bound.

Attach up to four files, at most 2 MiB each and 4 MiB combined. Text files are limited
to 64 KiB each; extracted and attached text together is limited to 80 KiB. Images are
limited to 8 megapixels and 8192 pixels per side. Credential files and detected secrets
are refused. Workspace paths must remain inside an open workspace folder; symlinks
are refused. Unsupported binary formats such as PDF are not silently converted.

Attachments are context for the next question, separate from your knowledge base.
Nothing is sent to the model until Ask. The draft and attachments remain after a failed
question. Successfully sent attachments are removed from the composer. Original files
and image previews are not stored in conversation history. Draft text survives hiding
or restoring the view; unsubmitted attachments are kept only in extension-host memory.

## Project context and quick edit

On the first **Ask**, Tvijo offers to include a bounded project block: a file tree,
README, manifests (`package.json`, `pyproject.toml`, `go.mod`, …) and the active
file. Secrets, dot-directories, binaries and large files are excluded locally, the
block has a hard byte limit, and it is never written to conversation history. Use
**Preview context** (`/context`) to inspect the exact bytes before sending. Change
the mode later in **Model & method → Project context**.

**Quick edit** (`/edit`) sends the active file and your instruction to the selected
model, expects the complete revised file, opens a side-by-side diff and applies it
to the editor buffer only after confirmation. The file is not saved automatically;
the optional `tvijo.autoApply` setting removes the confirmation but still leaves the
save to you.

## Agent mode

`/agent` or an Agent preset runs a bounded loop against the open workspace. The composer
picker offers Manual, Edit automatically, Plan and Auto. Manual asks before edits and
commands. Edit automatically applies edits and asks before commands. Plan reads only and
cannot run commands. Auto applies new files and unique exact replacements, asks before
existing-file whole-file replacements, and skips command approval only for the existing
exact test command vectors. Blocked commands never start. Provider keys are removed from
the command environment; secret-like files, excluded directories and paths outside the
workspace are unavailable. Ordinary-chat routing in `tvijo.agentMode` is unchanged, and
Quick Edit continues to use the separate `tvijo.autoApply` setting.

Settings: `tvijo.agentModel` (default `ds41f`), `tvijo.agentMaxSteps`
(default 6), `tvijo.agentBudgetUsd` (default 2), `tvijo.agentAutoRun` and
`tvijo.agentAutoApply` (both off by default). The step limit returns a partial
report instead of an error, and one malformed model turn is retried once.

**Start your first task** (`/start`) opens a folder when none is open, signs you in,
and pre-fills a read-only plan request you can edit before sending.

**Local usage metrics** (`/metrics`) shows a summary of the extension's own metadata
log: event counts, outcomes, spend and duration. It stores no prompts, file contents,
command output or credentials. Writes follow VS Code's live telemetry setting; when
telemetry is disabled, new rows are not recorded and existing rows are preserved.

## Data, privacy and resources

Local metrics require the current VS Code telemetry capability and extension storage.
Only validated metadata fields are appended; prompts, arbitrary extra fields and
caller-supplied timestamp/version overrides are omitted. Existing logs remain intact.

Локальный журнал требует разрешённой телеметрии VS Code и хранилища расширения.
Записываются только проверенные поля метаданных; запросы, произвольные поля и
подмена времени или версии не сохраняются. Прежние записи остаются на месте.

Use **Tvijo: Data & privacy** for a read-only view of preferences returned by the
authenticated service. It reads `GET /data-preferences`; until that endpoint and its
response contract are available, states remain **Unknown**. This extension does not
grant or change consent. Use **Tvijo: Resources** for the verified Learn, Knowledge
base, Axes skills, privacy, terms and changelog pages. These commands are also in
**Settings and how it works** and **All commands**.

Version 0.10.0 is a prepared candidate. Backend integration, full test-suite and native
host acceptance are pending; this note does not claim a published or installable release.

## Commands

Click **Commands** in the panel, or use `Ctrl+Shift+P` → `Tvijo: All commands`.
Open the panel directly with `Ctrl+Alt+Shift+T` (`Cmd+Alt+Shift+T` on macOS).

| Chat command | Action |
| --- | --- |
| `/attach path/to/file` | Attach a workspace file; quoted paths with spaces work |
| `/attach` | Choose a workspace file |
| `/selection` | Attach selected code |
| `/context` | Preview the bounded project context that will be sent |
| `/edit` | Quick edit the active file with a diff before applying |
| `/agent` | Run the bounded workspace agent with confirmed edits and commands |
| `/plan` | Run the agent read-only, with writes and commands disabled |
| `/start` | Guided first task: open a folder, sign in and pre-fill a plan |
| `/metrics` | Local usage metrics: events, outcomes, spend and duration |
| `/model` | Open model, workflow, context and apply settings |
| `/clear` | Remove unsent attachments |
| `/new` | Start a new conversation |
| `/signin`, `/signout` | Manage sign-in |
| `/account`, `/tasks` | Inspect credit or recent tasks |
| `/cancel` | Request cancellation of the pending task |
| `/status` | Check service connectivity without a model request |
| `/settings`, `/help` | Open settings or command help |
| `/export` | Open a Markdown copy of the conversation to save yourself |

Slash commands do not create paid model tasks. Unknown commands are refused. Each
assistant reply has **Copy** and **Open in editor** controls. Enter submits a question;
Shift+Enter adds a line. Agent mode can edit editor buffers and run commands, but only
after explicit confirmation; nothing is saved or executed silently.

## When it is not the right tool

- It never runs a command or applies an edit without confirmation, and it does not act
  on its own in the background. Review every diff and command before accepting it.
- One question is one task. A long conversation hits the per-task context bound; start a
  new conversation.
- If a previous task may still hold credit, the next question is refused until you cancel
  it (`Tvijo: Cancel pending task`) or it finishes. Nothing is retried automatically.

## Works in

VS Code 1.90+ and compatible editors that install `.vsix` packages.

## Development

```sh
npm test                      # protocol tests, no VS Code needed
npx @vscode/vsce package      # builds tvijo-dshrem-0.2.1.vsix
code --install-extension tvijo-dshrem-0.2.1.vsix
```

For a local service set `tvijo.apiBase` to `http://localhost:PORT/api/dshrem/v1`.

Read [PRIVACY.md](https://github.com/nikbibamon/dshrempub/blob/main/PRIVACY.md) before submitting private code. This is an
operator-provisioned preview; installation does not issue a credit grant.

## License

`UNLICENSED`. No license grant is made here; a public licensing decision is pending.

## Tvijo service, models and your Telegram bot (0.3.0)

The service is https://dsh.tvijo.com. Create an account there, then run
**Tvijo: Sign in** and approve the displayed code on the same domain. New accounts
start with zero credit. Installation itself is free; no permissive source license
is granted. **Tvijo: Request $10 service credit** creates an unpaid order.
Payment processing is not yet configured; creating an order never adds credit.

Run **Tvijo: Choose model and workflow** for single, automatic or council mode.
The council uses DeepSeek + GLM under one shared $1 task ceiling. Availability
comes from the server; unavailable routes are refused. Automatic routing is a
simple rule, not a proven quality optimization. Methods are structured prompts;
no measured savings or autonomous server changes are promised.

Create a bot with the official [@BotFather](https://t.me/BotFather) `/newbot`.
Run **Tvijo: Configure Telegram bot** and enter your numeric Telegram user ID
and BotFather token. The token goes into SecretStorage, never settings.json.
Run **Tvijo: Start Telegram bot**. Only your private chat is accepted.
`/help`, `/status`, `/account`, `/models`, `/model ds41f`, `/mode council`,
`/ask QUESTION` and `/cancel` are supported. `/ask` uses your funded Tvijo account.
The connector runs on this extension host, so the editor/SSH host must remain on.
Start only one connector per bot token; run **Tvijo: Stop Telegram bot** before
using the standalone connector. See [setup and CLI downloads](https://dsh.tvijo.com/bot).

Settings: `tvijo.model`, `tvijo.agentMode`, `tvijo.reasoningMethod`,
`tvijo.telegram.enabled`, `tvijo.telegram.ownerId`, `tvijo.apiBase`.
No arbitrary shell execution or Telegram payment collection is implemented.

### Explicit service control (0.3.1)

The default service allowlist is empty. To authorize specific units on this host,
set `tvijo.telegram.allowedServices` to exact names such as `["my-worker.service"]`
in VS Code machine settings. Restart the bot after changing this list.
For the standalone connector, set `DSHREM_BOT_SERVICES=my-worker.service` in its
private environment file. `/services` shows only those units.
`/restart my-worker.service` requests a one-time code; `/confirm CODE` within
60 seconds performs that exact restart. It consumes the confirmation before
running, never retries a restart, and still requires OS-level service permissions.
It cannot run arbitrary shell commands or restart units outside your allowlist.

Rewind publishes each new checkpoint before pruning old recovery points. Published records
are capped at 50 MiB; atomic staging can temporarily require another 50 MiB. A failed
capture blocks the edit and preserves previous recovery points. Other processes can still
change files during recovery; detected conflicts stop recovery and are reported.

The run header uses host session timestamps and observed agent identities. Unknown observations show —; the agent-count button opens Agent Map with separate bounded command lifecycle rows. Stop requests are shown until a child exit is observed; descendant process status remains unknown after cancellation/timeout.


## Scoped project rules and literal commands

Optional `.tvijo/rules.md` contributes untrusted project context under the existing
context consent, Off and Preview controls. The entire file is limited to 16 KiB.
An optional first line `<!-- tvijo-globs: ["src/**/*.js"] -->` scopes it to known
workspace paths. The context summary shows included, unmatched, rejected or omitted
rules. Rules cannot change tool permissions, budgets, service endpoints or credentials.

Commands accept one executable and literal arguments with quotes and escapes.
Pipelines, redirects, substitutions, environment assignments and shell wrappers are
refused before approval. The five existing automatic test commands remain unchanged.
Confirmed programs still execute project code; this parser is not an operating-system
sandbox. Cancellation reports observed child exits and leaves descendant status unknown.

Replacement first requires a unique exact match. A unique whole-line LF/CRLF match
can be proposed for a multiline block, with explicit diff confirmation in every mode.
Indentation differences produce a reread hint; the extension does not normalize them.

Edit proposals also bind the original disk identity and editor version. Binary, invalid UTF-8, oversized and hard-linked write targets are refused. A concurrent change invalidates the proposal. Explicit local commands appear in the same observed session and command map without creating a model task.


### Review project rules before sharing

Global context consent does not approve `.tvijo/rules.md`. Run **Tvijo: Review and trust folder
rules** to review one local folder and confirm its exact rules snapshot in a native dialog.
**Preview bounded project context** also offers review/trust and revoke actions. Changes to the
file require new approval; Restricted Mode denies inclusion. Use **Tvijo: Revoke folder rules
trust** to stop current use. Already sent conversation messages remain available. Rules are
quoted project data and do not grant command, write or budget permissions.


### Automatic syntax checks (Linux extension hosts)

Run **Tvijo: Approve automatic syntax checks** (`/syntax`). Choose the folder, Python or Node
mode and an installed interpreter outside the workspace, then review the native confirmation.
Python checks `.py`; Node supports `.cjs`/`.mjs` and the explicitly chosen mode for `.js`.
The tool must pass a valid/invalid input probe before the profile is enabled.

Checks parse the current unsaved buffer after Tvijo edits. Errors appear in Problems and the
next Agent tool result. User edits clear outdated Tvijo markers; other diagnostic providers
are untouched. **Disable automatic syntax checks** (`/syntax-off`) revokes the folder profile.
Checks have a two-second process limit, bounded output and four checks per run. They do not
run project configuration, plugins, tests or automatic fixes. They are syntax checks, not
full project lint. Mac/Windows automatic checks await executable and process-tree support.

Folder rule approvals now also bind to a host-local identity. Review earlier approved rules
again after upgrading; global context consent continues to be separate.


## Plan inspection (0.8.3)

Plan can request `plan_inspect` with `pwd`, `buffer_status` or `buffer_diff_stat`.
The selected workspace is shown as `.`. Status lists only safe open dirty-buffer
paths and versions without reading their source. Diff stats compare those buffers
with their disk files, return approximate changed-line spans, and omit raw source.
These summaries are not Git status, staged changes or a minimal diff. Inspection
is bounded to 20 buffers, 128 KiB per file, 1 MiB of input and 7.5 KiB of results;
partial results include skipped reasons.

Plan file search is literal, including regex punctuation. It reads disk, which
may differ from unsaved buffers. Hidden, excluded, secret-like and symlink paths
are skipped, with file, depth, input and output limits. Act search keeps its
existing behavior. Plan does not start shell commands, Git or search processes;
write and replace tools remain disabled. No new setting or model call is added.
