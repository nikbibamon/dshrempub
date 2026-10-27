<!-- changelog-latest:start (generated from CHANGELOG.md by scripts/sync-readme.cjs; edit CHANGELOG.md) -->
## What's new in 0.10.22 — 2026-10-27

- **The bridge reports back.** Every bridged message has an id, and its progress is written to `outbox/<id>.json` in the extension storage: accepted, running, then completed with Tvijo's answer, failed with the reason, or cancelled when it is removed from the queue. Senders such as Claude Code and Codex no longer have to read the run journal.
- **Nothing is lost on reload.** A claimed message stays on disk until its task starts; after a window reload or a recreated chat view it is queued again. A message whose task was running when its window died is marked `failed: interrupted_by_reload` and is not re-run, because a second run would be a second paid task. A second open window keeps its own claims.
- **Copilot Chat sees Tvijo.** Type `@tvijo <task>` in Copilot Chat to send the task to Tvijo and get its answer back there. In Copilot agent mode, any model (including DeepSeek through a provider extension) can call the `tvijo_ask` tool; VS Code asks for confirmation first, and the tool works only while `tvijo.bridge.enabled` is on. Both need a VS Code version with the chat and language-model tool APIs and are skipped on older editors.
- **Review fixes (independent review of the first bridge build).**
  - Two windows can no longer both run one message: a claim another window has just made is left alone until its status exists (10 s grace), and a hand-over the chat view never confirmed is repeated instead of being assumed.
  - If the `running` status cannot be written (for example a full disk) the task is not started, so a reload cannot run it a second time.
  - `completed` now carries only the answer of that run. A command with no answer (`/help`) completes with an empty answer and `note: no_new_answer`; stopping the agent ends as `cancelled: stopped_by_user`; an answer over 20 000 characters is marked `answer_truncated`.
  - A message that arrives before the chat view has its first state is no longer cancelled as `scope_changed`; it waits and runs.
  - A file the bridge refuses (over 32 768 bytes of JSON, invalid JSON, empty or too long text) ends as `failed` with the reason instead of vanishing. The send script checks bytes, not characters.
  - `@tvijo` in Copilot Chat now respects `tvijo.bridge.enabled` like the `tvijo_ask` tool.

Earlier versions: the **Changelog** tab.
<!-- changelog-latest:end -->

## Native code navigation and learning guide (since 0.10.14)

Plan and Agent can ask installed editor language extensions for document symbols,
definitions and references before reading larger source files. The `code_intelligence`
tool returns bounded workspace-relative metadata with 1-based line/column positions.
It requires Workspace Trust and an available provider for the selected language;
empty, unavailable, partial and stale results are distinguished. Queries do not call
an LLM, while model turns using their results retain normal route accounting.
Cancellation discards late results; the editor provider itself may finish later.

Use the Command Palette → **Tvijo: Open learning guide** for the bundled offline
Russian handbook: installation, choosing a local or SSH project, economical settings,
project rules, selected context, practical tasks, review and measuring actual results.
It works without an external documentation server. All existing user settings remain
unchanged. On a shared dirty checkout, prefer explicit owned paths and turn automatic
commits off until you have reviewed the changes.

This editor integration is separate from the experimental Python DSHREM host LSP and
context-dedup pilots. It does not install a language server or create an OS sandbox.
Published releases include exact checksums; native Windows activation and provider
checks are recorded in the corresponding TvijoCode release receipt. They do not prove
an interactive account sign-in or paid model coding session.

## Settings and limits (introduced in 0.10.11)

Open **Tvijo → Settings → Extension settings** to edit values on the current local or Remote SSH host. The panel shows English or Russian using the editor language and offers an explicit language switch. User settings that you already chose take precedence over new defaults. Workspace overrides are reported and can be opened with **Advanced · VS Code**.

Settings save automatically and display the host's confirmed value. Background updates preserve a field you are editing. Technical paths live under **Advanced**; leave them empty to use the selected host's installed runtime. Local VS Code uses your computer; Remote SSH uses the remote machine. Private state permissions `0700` mean only that operating-system user can access the task directory. A disconnected laptop cannot keep a local task running while powered off; tasks on an available remote host can continue and be inspected or resumed there.

**How to choose a reasoning method:** **Start with evidence** (`evidence-first`) asks for findings based on supplied files, logs and tests; use it to investigate a failure. **Plan, then check** (`plan-check`) asks for small steps followed by verification; use it to make a change. **Review from another role** (`peer-review`) asks for another perspective on a solution, such as missed edge cases. This method alone does not start a separate agent team or guarantee another model will be called. [Read the settings guide](https://dsh.tvijo.com/knowledge/settings-explained#article-top).

**Chat collaboration and host teams are separate.** `agentMode` controls an ordinary chat response; Council does not disable Agent Auto or start a persistent development job. DSH Harness uses the selected host's configured coordinator and workers. A supported controller can run teams of 3–6 participants including the coordinator, with sequential worker invocations; several reviewers may use the same model. Sol + Astra + Claude needs at least four participants. Choose **Open completed HTML report** under Report appearance to view a generated report inside VS Code. Reports stay in the selected host’s private task directory; the preview runs no scripts and loads no external resources. Workers require their own installed subscription and available quota; failure does not silently switch to a paid API. [Teams and costs](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs#article-top).

`service` applies only inside shared projects. `standard` is a service identifier, not a quality rating. Pack choices come from the signed-in service catalog, with readable titles and summaries; **Auto** selects by project markers and **No pack** disables pack instructions. An unavailable saved choice is retained and identified instead of silently replaced.

**По-русски:** настройки сохраняются автоматически; пояснения, примеры и варианты выбора переключаются вместе с языком панели. «Сначала факты» помогает разбирать ошибки, «План и проверка» — выполнять изменения по шагам, «Проверка с другой роли» — искать слабые места решения. Режим обычного чата не запускает серверный рой и не выключает Auto. [Подробная инструкция](https://dsh.tvijo.com/knowledge/settings-explained?lang=ru#article-top).

`ds41f` is the default ordinary chat/Agent route; a chosen skill pack can suggest its declared model, and explicit user model choices win. The server verifies actual availability. DSH Harness keeps its fixed coordinator and separately enforced host/root budgets; local Agent continuation prompts do not expand a Harness budget.

The normal local Agent defaults are **$2**, **60 steps**, and automatic eligible edits/commands. At 80% observed spending, choose whether to add $2, $5 or $10 to this run; dismissing keeps the cap. At the step cap, choose whether to add 30 steps (maximum 200). Usage already spent is never reset. Unknown costs, cancellation and service/account refusals still stop the run. Quick Edit applies to an unsaved editor buffer by default; review and save it explicitly.

**Context:** 200,000 bytes is a local collection/preview default, adjustable to 1,000,000. Generated request context is limited to a 60,000-byte excerpt before the service's existing 90,000-byte message guard and account quotas. Optional context is omitted when needed to preserve the explicit task/file. A larger local preview is not a larger model window. Independent tree, file and rules limits still apply.

**Images:** install Tesseract language packs on the extension host, then select languages in Tvijo settings. English + Russian is the default. Other installed languages are listed by code and common languages have translated names. Only extracted OCR text is sent; this release does not add a visual model route or claim to compare live provider prices.

**Telegram:** configure the account-specific owner/token with the setup button, then start the bot. Status distinguishes not configured, stopped and running. The obsolete `telegram.ownerId` VS Code value does not configure the bot. Tokens are kept in SecretStorage and excluded from the example file.

**Authorship:** `git` uses Git user.name/user.email. `private` uses a random stable local account ID (not a hash of email); `tvijo` uses generic Tvijo identity. Private/generic choices replace both author and committer on new automatic commits, without editing Git configuration or rewriting existing history. There is no website registry linkage in this version. An email already present in file content, a hook or older history is not scrubbed.

Choose **Configuration file example** in the help section or run **Tvijo: Open configuration file example**. Copy selected non-secret values into User/Remote settings.json. `apiBase` is an advanced setting for an administrator-provided trusted server; it normally stays unchanged.

# Tvijo DSHREM for VS Code

Version 0.10.22. A project-scoped chat, bounded agent and coding-review client for the
Tvijo service (dsh.tvijo.com). Every task has a spending ceiling; provider credentials
stay on the service unless you explicitly connect your own provider (BYOK).

## Compact chat

The conversation fills the view. Folder, permission mode, model and Settings sit
below the input. New chat, history and Settings are available from the native
view title. Settings holds account details, allowance, runtime version and Reload,
loaded rules with per-file switches, auto-commit and sign-out.

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
roots are supported. For a child symlink beyond its open parent, use the refusal
message’s **Add as workspace folder** action; then select that exact folder.
A containing root and an open nested project may both be selected explicitly.
Tools, terminal cwd, context, local history and permissions use the same selected
canonical folder. Editor focus does not change it; switching is blocked during
active work. Selecting a folder does not grant Full access.

New sessions use **Auto** Agent mode with up to 30 steps and the existing $2
session budget. In a trusted workspace, Auto can start with bounded project
context without another confirmation; Context Off disables both context and
rules. An explicitly selected **Chat** remains questions and answers. When Chat
offers to change files in Agent mode, **Make it an agent** resends the original
request through the Agent loop.

The default folder is the nearest repository above the active file within its
owning workspace root, or the first workspace folder. It stays fixed through the
conversation, persists on first send and is guessed again on New chat. Send never
opens a folder picker. A refused guess stays visible with a recovery action.

The running version and Reload live in **Settings**. After installing an update,
reload the window to activate the new extension process.

## Permission presets

Plan is read-only. Manual, Edit automatically and Auto retain their existing
approval behavior. **Full access** approves edits, including whole-file and
whitespace fallback replacements, and supported commands without further prompts.
Enable it for the explicitly selected execution folder through the native modal. It requires a trusted workspace and a permission record
bound to this host's local folder identity; workspace settings cannot enable it.

The mode chip shows the active permission. **Revert** in its menu stops active work
using that permission and removes it. The menu remains available while running. Full access leaves normal preset
settings unchanged, so reverting restores their behavior. Explicitly choosing
another Agent preset also revokes Full access for the current folder.

Hard command denials, file-tool workspace/symlink/secret guards, task budget
ceilings and reservations remain mandatory. Edits still require Rewind checkpoints
before applying edits. In Full access and Auto, Agent edits are saved to disk
before later reads or tests. Quick Edit and review modes retain buffer review
semantics. Full access is not an operating-system sandbox. Commands run with your user's rights. Push is blocked for inherited environments; a program that rewrites its own environment is not stopped. Rules files changed by commands are quarantined, not prevented.
Git transports are disabled in inherited Agent environments; fetch and clone also
fail there. Indirect programs can still commit/reset and can bypass the transport
block by replacing their environment.

Команды выполняются с правами вашего пользователя. Push блокируется при унаследованном окружении; программа, заменяющая собственное окружение, не останавливается. Изменения файлов правил командами помещаются в карантин, а не предотвращаются.
Полный доступ не является изоляцией ОС. Программа может выполнить commit/reset
или обойти запрет транспортов, заменив окружение; fetch/clone в унаследованном
окружении также блокируются.
Restricted Mode cannot enable Full access.

## Project rules

Workspace Trust enables automatic project advice from `AGENTS.md`, `CLAUDE.md`,
`.clinerules` (a file or a directory of Markdown files), `.cursorrules`,
`.windsurfrules`, `.github/copilot-instructions.md` and `.tvijo/rules.md`.
Rules inherit nearest first, stopping at the nearest repository or owning workspace
root. A task uses one snapshot. Rules have a separate 32 KiB budget, are removed
last when a request needs compaction, and appear in Settings with file sizes,
truncation indicators and per-file switches. Context Off disables them.

Symlinks, hard links, invalid UTF-8 and files over 256 KiB are refused. Credential
scanning covers the complete read before truncation. Rules are quoted project
advice and cannot grant permissions. Agent file-tool writes to every rules file
always ask, including in Full access. Literal Git commands that change state also always
ask; hard command denials still apply. Commands whose literal arguments name a
rules file also ask. Tvijo fingerprints rules case-insensitively across the selected
subtree and the loader's permitted ancestors before the task and after every command.
It skips Git/dependency/build/cache/generated directories and never follows child
symlinks. The scan caps are 1,024 directories and 20,000 entries; a visible scan
truncation flag requires command confirmations for the rest of that task. Changes outside an approved direct file edit
quarantine the affected rules and require confirmation for subsequent commands in
that task. Quarantined rules are excluded from later requests until you explicitly
re-enable them in Settings. Quarantine uses canonical, case-folded paths scoped
to the account and survives selecting a child folder. Any change under .clinerules,
including non-Markdown or nested entries, quarantines that rules directory.
Creations and deletions are covered. An arbitrary
program can still modify files your user can modify; detection is reported rather
than hidden, and it is not a filesystem sandbox.

## Local auto-commit

`tvijo.autoCommit` defaults to `afterTask`; switch it off in Settings. After a
successful `finish` with status `done`, Auto and Full access can commit their saved
editor edits on the current local branch. A failed or stale last command check,
cancellation, blocked answer or step limit prevents the commit. Tvijo never pushes.

Only files whose original bytes match HEAD are eligible. User-staged files,
mixed-authorship files, ignored files, submodules, detached or unborn branches,
active Git operations, changed HEAD or Git refs and missing Git identity are reported and skipped.
The final answer explicitly reports command-time HEAD/ref changes.
The host uses an isolated index, runs hooks and signing, and preserves the user's
staging. After hooks run, reconciliation uses the blobs and modes actually
committed. If a hook adds any unselected path, the commit is withdrawn atomically only while
HEAD is still that commit and the branch is unchanged. The working tree and real
index remain untouched. If concurrent changes prevent withdrawal, the hash and
warning remain visible for review. Quarantined rules are excluded. Commit messages identify the editor, served models, task and checks.
Shell side effects, including removals and renames, are not tracked or committed.

The answer shows the commit hash and **Undo commit**. Undo requires the original
host proof and exactly one update in both HEAD and branch reflogs. If history
changed, it preserves the branch and index and shows the hashes for review.
With unchanged history it uses a soft reset for an unpublished tip, or a revert
when a remote-tracking branch contains it. Hooks have a 120-second limit and are interrupted before
termination. Cancel is checked live immediately before commit and interrupts a
running Git process group. If the commit already exists, the final answer shows
its hash and Undo instead of silently hiding it. A hook, signing or index reconciliation failure is reported; review
preserved files and the Git index before continuing.

## Agent saves before disk checks

Full access and Auto save only the exact document changed by an approved Agent
write. They refuse pre-existing dirty user buffers, including dirty buffers whose
text happens to match disk. Other open documents are never saved. New files are
checkpointed before creation, then edited and saved through the editor.

The host checks the selected account/folder/grant, cancellation, document version
and exact content, disk identity and path boundaries before applying and saving.
It verifies the resulting clean buffer and disk bytes, then rechecks ownership
before later model steps and tools. A failed save, save participant edit or
concurrent change stops the run with an error; it cannot proceed to disk tests
or report an Agent completion. There is no automatic save retry or rollback of
unknown edits. A save already handed to VS Code cannot be cancelled: if a user,
save participant or revocation intervenes, the host detects it afterward and
stops further work. Review the preserved buffer and disk in that case.

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
Agent edits in Full access and Auto are saved for subsequent disk checks;
Manual/Edit review and Quick Edit changes remain buffers for review.

Markdown export includes conversation display text only and redacts known auth
tokens and common credential patterns. Credential detection is best effort; review
the exported document before sharing it.

## Rewind (local checkpoints)

Open **+ → Rewind…**, run **Tvijo: Rewind**, or type `/rewind`.
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
selected execution folder is used. Rewind warns when a run has been committed;
use **Undo commit** to undo its Git commit.

## Markdown answers

Assistant replies support headings, bold/italic, inline code, fenced code (language label
and **Copy**), lists, blockquotes, tables, horizontal rules and highlighted links. User
messages stay plain; task receipt footers remain visible. Raw HTML tags are dropped,
model images never load, and HTTP/HTTPS/mailto links open through VS Code after a click.
Rendering is bounded at 120,000 characters, 4,000 lines and 8,000 DOM nodes; open the
answer in an editor to read longer replies. The strict content security policy is retained.

## Agent map

Click **⑂ Agent map** (**Карта агентов**) in Settings. The current request is on the
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

Choose a skill pack from the Settings pack button or the Tvijo status bar.
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
  step limit is 30 by default (`tvijo.agentMaxSteps`, up to 30).
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
(default 30), `tvijo.agentBudgetUsd` (default 2), `tvijo.agentAutoRun` and
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

The Settings run indicators use host session timestamps and observed agent identities. Unknown observations show —; the agent-count button opens Agent Map with separate bounded command lifecycle rows. Stop requests are shown until a child exit is observed; descendant process status remains unknown after cancellation/timeout.


## Scoped project rules and literal commands

Rules are loaded automatically using Workspace Trust, with a separate 32 KiB
budget. See **Project rules** above. The optional first line
`<!-- tvijo-globs: ["src/**/*.js"] -->` scopes advice to known workspace paths.
The complete file is scanned before its excerpt is included. Rules cannot change
tool permissions, budgets, service endpoints or credentials.

Commands accept one executable and literal arguments with quotes and escapes.
Pipelines, redirects, substitutions, environment assignments and shell wrappers are
refused before approval. The five existing automatic test commands remain unchanged.
Confirmed programs still execute project code; this parser is not an operating-system
sandbox. Cancellation reports observed child exits and leaves descendant status unknown.

Replacement first requires a unique exact match. A unique whole-line LF/CRLF match
can be proposed for a multiline block, with explicit diff confirmation in every mode.
Indentation differences produce a reread hint; the extension does not normalize them.

Edit proposals also bind the original disk identity and editor version. Binary, invalid UTF-8, oversized and hard-linked write targets are refused. A concurrent change invalidates the proposal. Explicit local commands appear in the same observed session and command map without creating a model task.


### Review loaded rules

Open Settings or `/rules` to review loaded file names, sizes, truncation and per-file
switches. Use **Preview bounded project context** for a local preview. Workspace
Trust authorizes inclusion; old per-hash approvals are ignored. Context Off disables
all automatic rules. Changes take effect for the next task.

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

Full access and interpreter approvals bind to a host-local folder identity. Project
rules follow Workspace Trust and do not grant tool access.


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


## Optional DSH Harness orchestration

This release requires Linux process-tree supervision; use a Linux local or
Remote SSH host. The ordinary engine remains portable. After explicit setup, enable **Orchestration:
Enabled** and choose Sol, Sol + Astra, or Sol + Astra + Claude in Settings.
The private host manifest is discovered automatically; no path entry is needed.
The ordinary engine remains the default. The DSH composer shows its actual
fixed ds41f coordinator and subscription worker policy.

Use **Orchestration doctor**, **Status**, **Resume**, **Stop**, **Open tmux** and
**Repair queue** from Settings or the command palette. Owned tmux jobs survive
editor disconnection. Status transport loss preserves the original task for
Resume; repair shares its original finite budget. Selected subfolders and new
non-Git projects remain exact execution scopes. The browser cannot invoke the
operator's server shell or subscription.

The observed Linux runtime verified the published native Harness Codex and
Claude providers, with subscription GPT-6.1 Sol, GPT-6 Astra/high and Claude
Opus 5.5. Other hosts must satisfy setup/login prerequisites. Native Codex uses
workspace-write with network disabled (Plan/Astra read-only); Claude advice
has only Read/Glob/Grep. No subscription-to-API fallback occurs. The ordinary
engine's command classifier is not claimed to run inside external CLIs.

A model finish is **quality pending** until deterministic checks and actual
publication receipts pass. Auto-commit includes only observed file writes with
matching bytes and preserves user staging. Hook templates are opt-in and do
not inspect another extension's conversations or rewrite global settings.
See [host setup and boundaries](https://dsh.tvijo.com/orchestration/setup).
