## 0.10.4 — 2026-10-23

- Compact chat by default: project/history/new at the top, controls beside the composer.
- Technical panels, interrupted runs and usage moved into Settings; optional Engineering view.
- Select bounded local project context and preview its size before sending.
- Agent preview preflight and actionable inline errors preserve drafts without duplicate popups.
- Clear separation of TokenTvijo service credit, model tokens and planned Pro capabilities.

## 0.10.3 — 2026-10-22

- Check fresh preview tokens and the complete escaped request before creating a task. Omit optional automatic context when necessary; preserve explicit questions, selections, history and attachments.
- Keep local validation failures out of interrupted-run recovery. Retain unresolved dispatch journals until canonical task settlement is known.
- Collapse preserved interrupted runs by default so the current chat remains usable.
- New conversation clears the composer and its buffered draft while preserving archived history and recovery evidence.
- Reload the VS Code window after installation to activate the updated extension host.

## 0.10.2 — 2026-10-22

- Keep the same device sign-in code and browser action available after Copy code; cancellation does not continue authorization.
- Show Sign in before account verification and Ready after login, with account limits separate from authentication.
- Bound automatically collected preview project context to 4 KiB or omit it when the collector minimum cannot fit. Explicit questions, selections and attachments remain intact.
- Explain recognized context and unresolved-charge errors without exposing raw service responses or retrying requests.
- Companion gateway fix returns a terminal context refusal only when its in-process dispatch marker proves no native call started.

## 0.10.1 — 2026-10-22

- Bind release verification to the Tvijo extension identity, matching manifest and package versions and VS Code engine requirements.
- Reject ambiguous or unsafe archive entries and require the expected runtime entrypoint.
- Add adversarial release-checker tests to CI. User-facing behavior from the 0.10.0 candidate is retained.
- Preview candidate; new native-host and production verification remain separate.

Русский:
- Проверка релиза сверяет имя и издателя Tvijo, версии манифеста и пакета, требования к VS Code и наличие точки входа.
- Неоднозначные и небезопасные пути архива отклоняются; проверки включены в CI.
- Подготовленный preview; новая проверка в редакторе и публикация в прод остаются отдельными шагами.

## 0.10.0 — 2026-10-21

- Add read-only Data & privacy view using authenticated server preferences; unavailable, malformed and changed-account responses stay unknown.
- Add bilingual Resources picker with the verified public Learn, Knowledge base, Policies and Changelog links.
- Respect VS Code telemetry capability for every local metadata log write; existing log contents remain intact.
- Require an explicit telemetry capability and extension storage; validate metadata fields and use verified localized resource URLs.
- Candidate prepared for independent backend, test and native-host acceptance. No package build or release verification is claimed.

Русский:
- «Данные и конфиденциальность» показывает только ответ сервера; ошибки, неполные данные и смена аккаунта оставляют состояние неизвестным.
- «Материалы» открывает проверенные ссылки на обучение, базу знаний, правила и журнал изменений на выбранном языке.
- Журнал метаданных требует разрешённой телеметрии VS Code и хранилища расширения; сохраняются только проверенные поля, прежние записи не удаляются.
- Версия остаётся кандидатом до независимой приёмки; публикация не заявляется.

## 0.9.3 — 2026-10-21

- Add per-folder Full access through native consent bound to host-local identity; refuse it in untrusted workspaces.
- Show a persistent warning with one-click revert; keep ordinary preset settings unchanged.
- Automatically approve edits and commands under Full access while retaining hard command/path/secret/budget guards and mandatory Rewind checkpoints.
- Harden force-push tokens and recursive removal outside the workspace before command approval.
- Prepared for review; the website release catalog remains unchanged.

## 0.9.2 — 2026-10-21

- Capture Error/Warning diagnostics before each Agent write and send new/resolved items plus the count of unchanged pre-existing items.
- Bound the delta to 20 items and 8 KiB; retain truncation, freshness and stale-buffer markers. An empty delta never claims compilation or tests passed.
- Observe diagnostics emitted during apply and omit deltas when the buffer changes again.
- Prepared for review; the website release catalog remains unchanged.

## 0.9.1 — 2026-10-21

- Offer unique whole-line trailing-space/tab replacement matches as a diff with explicit confirmation, including in Auto; refuse ambiguity.
- Return the exact current block for a unique indentation mismatch, capped at 40 lines and 4 KiB, without normalizing indentation or writing.
- Preserve exact-match priority, existing EOL fallback, checkpoints and file-change guards.
- Prepared for review; the website release catalog remains unchanged.

## 0.9.0 — 2026-10-21

- Save prompts before dispatch and atomically journal Agent/Plan events locally, bounded to 60 events and 64 KiB per run with a seven-day recovery window.
- Restore interrupted transcripts into local history, fetch an existing task's result/status, and retain scoped composer drafts after a one-second pause.
- Keep recovered logs out of later automatic model context; restoration does not replay tools or create a task.
- Re-check Quick Edit's idle lock immediately before marking the host busy.
- Prepared for review; the website release catalog remains unchanged.

## 0.8.4 — 2026-10-21

- Fix a remaining test fixture path for clean CI hosts and check tracked files for private host markers outside changelog history.
- Use generic extension-host guidance for OCR and a configurable download-directory placeholder in release instructions.
- Make root and extension `npm test` create isolated artifact and temporary directories automatically.
- Run suites sequentially with a 60-second test timeout and a nine-minute overall deadline; retain fixtures for inspection.
- Add dependency-free CI checks on Node 22 and 24 using synthetic replies and local fixtures, with read-only repository permission.
- Prepared for review; extension behavior and the website release catalog are unchanged.

## 0.8.3 — 2026-10-21

- Add fixed Plan operations for the selected workspace and open dirty-buffer status or approximate changed-line spans.
- Keep buffer status metadata-only; cap diff inspection and omit raw source from its results.
- Use bounded built-in literal file search in Plan, with partial/truncation markers and no search subprocess.
- Keep Plan writes and shell commands disabled. Buffer summaries describe unsaved editor state, not Git or staged changes; search reads disk.

## 0.8.2 — 2026-10-21

- Add separately approved fixed Python AST / Node syntax checks for unsaved Tvijo edits on Linux extension hosts.
- Show bounded generic errors in Problems and in the next Agent tool result; clear stale owned markers on edits or disable.
- Keep checks off by default, use one process at a time and four checks per run, without automatic saving or fixing.
- Validate the selected native interpreter, probe valid/invalid input and execute its held file through a Linux FD.
- Bind folder approvals to host-local storage identity. Earlier folder approvals need review again after this update.
- Other extension features remain available on their supported platforms; these automatic checks currently require Linux.

## 0.8.1 — 2026-10-21

- Require separate native approval for the exact raw bytes of one local folder's rules.
- Offer review/trust/revoke from project context preview and the command palette; no new setting.
- Deny unapproved rules in automatic context, active selections, file attachments and agent file tools.
- Recheck prepared rules before model dispatch; changed rules, revocation and Restricted Mode deny inclusion.
- Preserve local history while excluding hidden project context from subsequent history requests.

## 0.8.0 — 2026-10-21

- Add uniquely anchored LF/CRLF replacement proposals with explicit confirmation.
- Parse local commands as literal argv, apply token denials before approval and execute with shell:false.
- Add bounded scoped .tvijo/rules.md project context, consent/preview status and untrusted user-data placement.
- Preserve settings, budget reservations, provider credential custody, diagnostics, run chips and Rewind.

## 0.7.4 — 2026-10-21

- Show anchored elapsed time and observed active-agent counts, with unknown state displayed as —.
- Open Agent Map from the count and list bounded command lifecycle records separately.
- Pass cancellation to owned command processes; distinguish stop requests from observed exits.
- Preserve context, diagnostics, checkpoints, settings and service routes.

## 0.7.3 — 2026-10-21

- SPEC-215 slice 4: after each successful Agent write or replacement, attach Error/Warning
  diagnostics for that changed file to the next agent step. Feedback records the actual
  document version, freshness and truncation, with a 20-diagnostic per-file cap and an
  8 KiB serialized limit. Empty snapshots do not claim tests or compilation passed.
- Diagnostics are untrusted tool data; no buffer is saved and no new setting is added.
- Version 0.7.3. No provider or server route changes.

## 0.7.2 — 2026-10-21

- Add the shared `+` and slash action registry for workspace file attachment/mentions,
  safe Problems and observed Terminal captures, conversation actions, Rewind, export
  and model switching. The compact EN/RU action menu supports keyboard navigation.
- Resolve inline workspace file mentions before sending, with a bounded ambiguity
  picker and workspace, symlink and secret-path checks. Captures are labelled untrusted,
  previewable and removable; explicit attachments are snapshotted into Agent/Plan runs.
- Add optional VS Code shell-integration tail capture (4 terminals, 100 lines and 8 KiB),
  resetting on account/workspace changes. Add bounded allowlisted Markdown export with
  known-token and common-credential redaction.
- Version 0.7.2. No service route or setting changes.

## 0.7.1 — 2026-10-21

- Add a compact English/Russian Chat and Agent preset picker: Manual, Edit automatically,
  Plan and Auto. The host validates scope and idle state, updates both existing approval
  settings, then verifies their effective values before reporting success.
- Preserve ordinary-chat `agentMode` routing and Quick Edit `autoApply`. Show externally
  configured false/true approval flags as Custom. Snapshot the selected approval flags at
  each Agent run start.
- Auto keeps the existing exact command vectors, clean command environment and blocklist.
  It can apply new files and unique exact replacements; replacing an existing file wholesale
  still asks. Plan rejects shell bang commands and write-capable slash actions in its composer.
- Restore normal Shift+Tab focus navigation and add keyboard operation for the mode menu.

## 0.7.0 — 2026-10-21

- Acceptance correction: commit each new snapshot before pruning older recovery points;
  failed storage writes preserve existing points. Restore validates opened file identity
  and bytes before writing, and recreates a deleted original only after approval.
- SPEC-215 slice 1: local Rewind checkpoints before Agent write/replace, Quick Edit,
  and reviewed coding proposal Apply. Disk bytes and editor input are preserved under
  global storage, with SHA256 verification, a seven-day TTL and a 50 MiB total cap.
- Header **… → Rewind…**, **Tvijo: Rewind** and `/rewind`: recent runs → step time,
  files and model → restore before that step and undo later steps in the same run.
- Changed files/buffers require Overwrite or Skip; deleting newly created files always
  requires confirmation. Recovery data never joins service requests, exports or logs.
  A local chat note reports restored/skipped counts. No new settings or server endpoint.
- Agent Map now shows both scrollbars, starts at the top, and keeps its details pane.

## 0.6.1 — 2026-10-21

- Assistant Markdown: headings, emphasis, inline/fenced code with language labels and Copy,
  lists, quotes, tables, rules and highlighted links. Raw HTML is dropped; model images
  never load. Only HTTP/HTTPS/mailto links open, after a click through the extension host.
  Strict CSP remains; rendering has finite input, node and nesting limits. Receipt footers
  remain visible even when the Markdown body is truncated.
- Compact EN/RU **Agent map / Карта агентов** header button: scrollable horizontal tree,
  receipt details, keyboard navigation and live polling through existing read endpoints.
  Shows executed tasks, local Agent steps/tools, council calls and coding review/swarm
  execution records when supplied. Unknown metrics stay **—**; TT and USD remain distinct.
- Version 0.6.1; public-repository links point to nikbibamon/dshrempub.

## 0.6.0 — 2026-10-20

- Server skill packs, cached in host memory after sign-in; unavailable services hide pack controls.
- Compact EN/RU chat-header picker and native status-bar shortcut with today's known USD spend (— when unknown).
- One new setting, `tvijo.pack`: automatic root-marker selection, then the served engineer pack, or an explicit choice.
- Chat and Agent/Plan add pack guidance to one leading system message per request without storing it in local history. Explicit model choices take priority; shared-project Chat keeps quoted service routing.
- No pack instructions are bundled in this public extension.
- Tests: 266 passing (`npm test`).

## 0.5.5 — 2026-10-20

- Review and swarm coding tasks quote the wider limits version: proposals up to 24 KiB
  (review) and 8 KiB per proposer (swarm), selected snapshots up to 56 KiB and 40 KiB,
  `max_tokens` 8192. The plan carries its own limits version, so a 0.5.4 client keeps
  quoting the previous 2 KiB/1 KiB tiers and stored tasks stay valid.
- The Agent sends recent chat turns with the question in a bounded block, so a follow-up
  question can refer to what was asked before.
- With a project key, the shared server thread is selected by default and the chat shows
  that the same conversation exists at dsh.tvijo.com, with a link to it.
- Tests: 248 passing (`node --test test/*.test.js`).

## 0.5.4 — 2026-10-20

- The agent now ends every run with an answer: at the step limit one extra call without
  tools writes the reply from collected evidence, and the cost of that call is counted.
  A raw `TOOL_RESULT` is no longer shown as the final answer.
- Step limit is 12 by default (up to 30) instead of 6, so multi-file work and questions
  fit in one run.
- Large files are read from the start and report truncation instead of failing with
  "File is too large to read".
- A project is selected before a payer, so a BYOK connection cannot be attached to the
  wrong project.
- Settings & how it works: searchable EN/RU guide with current and default values for all
  17 settings and a direct link to the native VS Code control.
- Consistent sign-in state, expired Telegram permissions are not restored, and money is
  never rendered with nine decimals.
- Tests: 235 passing (`node --test test/*.test.js`).

## 0.5.3 — 2026-10-20

- Searchable English/Russian Settings & how it works guide for every setting, with current/default values and direct native controls.
- Explain Chat, Agent, Plan, service credit, loop budgets, local terminal and shared-project boundaries.
- Fix narrow sidebar overflow, missing usage values, stale agent resets and misleading step-limit completion.
- Display the model used by the active composer mode; keep native settings available.
- Native Windows execution remains a separate CI validation; path normalization is unchanged.

# 0.5.2

Fix the sponsored-preview dead end: a preview can now continue while money and
tokens remain instead of stopping at five steps, and the operator test account
has an explicit $5/day allowance that is not recorded as paid revenue. `/billing`
now states that payment collection is not configured and records the request
without adding credit. Error messages distinguish expired preview, exhausted
allowance and exhausted credit, and offer a credit action. Pending requests that
were provably never granted are cleared automatically. Agent hardening: symlink
and secret-file guards, filtered search, exact-command auto-run, minimal command
environment, project-context consent for quick edit, buffer-only edits with a
visible diff and version check, auth/workspace checks before every side effect,
pre-request budget checks and a transcript trim that keeps the goal.

# 0.5.1

Respect the project-context setting and consent before the agent sends a project
tree. Expose the agent model in the model/method menu, let local metrics open
without an account, classify budget exhaustion and context overflow with an
actionable message and a context-preview action, and treat a cancelled agent as a
normal stop instead of an error. README, privacy notice and release notes now
describe agent mode accurately.

# 0.5.0

Add a bounded agent mode for the open workspace. The agent reads, searches and
lists files inside the project, proposes whole-file edits with a diff and asks
before every shell command. Unsafe and secret-like paths are refused, commands
run without provider keys in the environment, and plan mode stays read-only.
The agent prefers a precise unique-text replacement for small edits and falls back
to whole-file writes. Add a guided first task, a local usage metrics log (metadata
only, no prompts or file contents) and reliability fixes: one JSON retry and a partial answer at the
step limit instead of an error.

# 0.4.13

Keep secret-like active files and symlinked manifests out of the project block, preserve the original CRLF/LF line endings in quick edit, give quick edit a compact project block, clear per-account error/context state on identity changes, and reset the one-time context consent when the operator selects Ask again.

# 0.4.12

Merge the 0.4.11 BYOK payer work with the localized model/method menu. Add a bounded project-context block (tree, README, manifests, active file) with one-time consent and preview, live activity stages with a spinner, quick edit of the active file with a diff and explicit buffer apply, and localized recovery for an unresolved saved request. Prevent duplicated pending/error text and route unknown slash commands to an actionable list.

# 0.4.11

Document bounded account data export, file extraction and erasure limits; disclose that organization membership and project sharing are unavailable. P6 lifecycle controls are included in this candidate; P7 records the full rollout and end-to-end evidence.

# 0.4.10

Align the commercial/BYOK integration with its versioned gateway and privacy notice. Merchant checkout and customer-provider execution still require separate verified activation.

# 0.4.9

Add fail-closed merchant readiness and owner billing navigation. Add project-bound
BYOK selection, immutable separate payer/fee quotes, post-confirmation connection
checks and no Managed fallback. Preserve explicit unavailable states until actual
merchant/customer provider prerequisites are verified. Provider estimates remain
separate from service TT receipts; uncertain exposure blocks new work. Earlier
managed coding/review semantics remain unchanged.

# 0.4.8

Add opt-in bounded review/swarm coding workflows, immutable requirement/plan bindings, durable agent/tool evidence and strict server-selected Apply checks. Preserve single-task behavior, exact post-confirmation financial/hash checks, shared project history and explicitly untrusted test output. Earlier release notes are retained below.

# 0.4.4

Recover deterministic grant refusals without phantom pending tasks. Preserve ambiguous requests for explicit reconciliation. Bind editor conversations and pending work to the authenticated account and service; keep legacy unbound state quarantined. Make recovery visible while idle.

# 0.4.3

Correct hidden-state styling so Usage and Context replace the welcome screen in narrow editor panels. Includes all 0.4.2 usage and connection features.

# 0.4.2

Private Usage tab with actual provider receipts and knowledge coverage, connections/pilot preferences and a shared Tvijo AI guide. No BYOK key ingestion or inference route changes.

# 0.4.1

Corrected narrow-panel wrapping and refreshed localization when switching languages. Preserves 0.4.0 preview and device approval features.

# 0.4.0

Compact EN/RU chat, blue-gray themes, + context menu, own-project terminal, visible preview quotas and prefilled device approval. Sponsored usage has durable per-account and shared daily limits.

## 0.3.1

- Explicit host service allowlist with read-only status and a fresh, single-use restart confirmation. Disabled by default.

## 0.3.0

- Branded dsh.tvijo.com service and zero-credit account onboarding.
- Model/workflow settings and shared-cap DeepSeek + GLM council.
- Owner-only Telegram connector, SecretStorage setup and read-only host status.
- Unpaid $10 credit requests; no automatic debit or fabricated settlement.
- Preserve unresolved grant requests for explicit cancellation/reconciliation.

# Changes

## 0.2.1

- Fix the packaged privacy link with an explicit URL to the public root privacy policy.

## 0.2.0

- Attach local or workspace files, selected code, and PNG/JPG screenshots from the picker, clipboard, or drag and drop.
- Extract screenshot text locally with bounded, single-threaded OCR; show previews and the explicit image-text limitation.
- Add a command menu, slash commands, service/task checks, conversation export, answer copying, and draft persistence.
- Keep attachments on failed questions and send only explicit file/OCR text through the existing capped route.

## 0.1.3

- Preserve a draft question when sign-in, credit, or pending-task checks reject it.
- Block new-conversation actions during an active question and dispose old view listeners.

## 0.1.2

- Add a dedicated Tvijo DSHREM sidebar chat with sign-in, questions, answers, new conversation, and pending-task controls.
- Keep the existing $1 per-task cap, pending-task guard, and explicit knowledge-base uploads.

## 0.1.1

- Enforce the response-size limit during streaming, including responses without
  a Content-Length header.
- Keep cancellation and request timeout active until the response body is read.
- Document the preview data flow and the boundary between customer credits and
  the operator's subscription.

The preview remains a remote code-analysis client. Marketplace publication and
production enrollment require separate verified release evidence.
