## 0.10.7 — 2026-10-24

- Add Explorer **Work in Tvijo**: select the clicked folder canonically and focus chat without a picker, path input, sign-in prerequisite or implicit permission grant.
- Add an English/Russian folder browser directly in chat. Expand open roots and subdirectories lazily; select a row to use that exact folder. Bound each listing, skip generated/cache folders and refuse forged paths and symlink escapes using host workspace ownership checks.
- Default new simple sessions to Agent with confirmations. Persist explicit Chat/Agent/Plan intent per account and canonical folder, separate from legacy fallback drafts. Successful Full access approval activates Agent dispatch; failed or cancelled presets keep the prior mode.
- Display the running extension version with a reload action beside account status and in help/service status. Keep the selected canonical path in the folder tooltip.
- Preserve 0.10.6 scope, rules, Full access boundaries, model synchronization, history/draft isolation, native tools and request byte limits. No model routes or spending caps changed.

Validation: production webview-to-extension dispatch harness with synthetic service responses and real filesystem/shell tools; bounded folder and mode regressions; EN/RU desktop/mobile rendered Chromium checks. Native Windows and live paid models are not exercised. Source only; packaging and installation are separate.

## 0.10.5 — 2026-10-23

- Keep a verified account identity and sign-in/loading/error state visible in simple chat.
- Persist an explicit active local/SSH host folder. Editor focus no longer changes tool or automatic-context scope. Containing multi-project roots require choosing a child project for tools and Full access.
- Open local history without a shared-project prerequisite. Project rules remain optional and separately trusted.
- Compact request-only older history while preserving drafts and full local history; distinguish trial quota from context limits.
- Reconcile terminal pending tasks on reconnect without replaying paid dispatch. Unknown costs require an explicit settlement receipt; stale authentication responses cannot replace another account.
- Compatible gateway enforces an explicitly granted USD20 total nonrenewing allowance for the verified existing operator, with the existing daily USD5 guard.

Validation: deterministic extension-host regressions and synthetic Chromium webview checks. User Windows desktop and a real paid model execution were not tested. Install from VSIX and Reload Window; no Marketplace publication claim.

# Changelog

Extension release notes. The detailed history is in [vscode/CHANGELOG.md](vscode/CHANGELOG.md).

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


## 0.7.4

- Add run elapsed time anchored to host start and end timestamps, with an observed running agent count that opens Agent Map.
- Show scoped local command lifecycle rows separately from agent execution records; command output and arguments are not shown in the map.
- Pass cancellation to owned command processes and report timeout, errors, and observed exits.

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
