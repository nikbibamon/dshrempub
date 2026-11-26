## 0.10.40 — 2026-11-26 UTC (prepared VSIX preview)

- **Set up company access in Ukrainian, English or Russian.** Choose your language, approve sign-in in the browser, select your organization and project, then check the connection to DSHREM.
- **Verify access again before reporting a connection.** The setup uses a device session and checks the selected project on the gateway. An expired or revoked membership cannot pass the check.
- **Availability.** The candidate is for a gateway that supports Tvijo organizations. The read-only connection check sends no model request. Existing editor settings and personal projects need no migration.

## 0.10.39 — 2026-11-25 (prepared VSIX preview)

- **Save Auto settings during an Agent task.** Agent Auto Run and Agent Auto Apply save in Settings. A saved change takes effect at the next eligible operation of the current task. A successful refresh of the same session preserves an in-flight save. Incomplete project rules still require confirmation for Auto commands. Full access still requires separate consent.
- **Reconnect after a transport interruption.** Reconnect retries verification with the saved valid session and restores access to history, attachments and sending. Expired or rejected sessions require sign-in. The deployed gateway issues 24-hour device sessions.
- **Optional image analysis through your ChatGPT subscription.** Attach one PNG or JPEG and explicitly choose **Send pixels to Codex for analysis**. The Linux x64 extension host needs FFmpeg, Codex CLI 0.171.0, Bubblewrap and ChatGPT sign-in. One bounded color frame goes to Codex. Local OCR and the grayscale text thumbnail remain available. Choose **Include observation in next DS41F request** to add the returned description to a local Chat, Agent or Plan turn. The ordinary model selection, tool permissions and budget rules still apply. A native Windows extension host has no supported analyzer in this preview.
- **Update the extension.** Install the verified VSIX when its channel publishes it and reload the editor. Existing settings, history and grants carry over. Published editor installers and the standalone CLI have separate releases.

## 0.10.38 — 2026-11-23 (unreleased local VSIX candidate)

- **Auto applies to the current Agent task.** A saved Manual, Edit or Auto change takes effect at the next eligible operation. Full access still requires separate consent.
- **Scan rules in larger workspaces.** The bounded scan covers up to 16,384 directories and 300,000 entries. An incomplete scan still requires confirmation for Auto commands. Rules changed outside an approved direct edit remain subject to quarantine.
- **Reconnect a saved session.** Choose **Reconnect** after a temporary account verification failure. History, attachments and sending become available after verification. An expired or rejected session requires sign-in.
- **Auto saves survive a same-session refresh.** A successful check of the same saved session keeps a pending Auto save. A changed, expired, rejected or unverifiable session still blocks that save.
- **Image context uses text.** Screenshots contribute OCR text and can include a grayscale text thumbnail when FFmpeg is available.
- **Gateway session lifetime.** The deployed gateway still issues 24-hour device sessions. The server-side lifetime change is tracked separately.
- **Candidate history.** This build supersedes local candidates 0.10.36 and 0.10.37.

## 0.10.37 — 2026-11-23 (unreleased local VSIX candidate)

- **Auto saves survive a same-session refresh.** A successful account check for the same saved session no longer rolls back a pending Auto setting. A changed, expired, rejected or unverifiable session still blocks that save.
- **Auto applies to the current Agent task.** A saved Manual, Edit or Auto change takes effect at the next eligible operation. Incomplete project rules still require confirmation for Auto commands, and Full access still requires separate consent.
- **Reconnect a saved session.** If account verification fails temporarily, choose **Reconnect** to retry with the saved session. History, attachments and sending become available after verification. An expired or rejected session requires sign-in.
- **Image context uses text.** Screenshots contribute OCR text and can include a grayscale text thumbnail when FFmpeg is available.
- **Gateway session lifetime.** The deployed gateway still issues 24-hour device sessions. The server-side lifetime change is tracked separately.
- **Candidate history.** This build supersedes local candidate 0.10.36, which could roll back an Auto save during a successful background check of the same account.

## 0.10.36 — 2026-11-23 (unreleased local VSIX candidate)

- **Auto applies to the current Agent task.** A saved Manual, Edit or Auto change takes effect at the next eligible operation. Incomplete project rules still require confirmation for Auto commands, and Full access still requires separate consent.
- **Reconnect a saved session.** If account verification fails temporarily, choose **Reconnect** to retry with the saved session. History, attachments and sending become available after verification. An expired or rejected session requires sign-in.
- **Image context uses text.** Screenshots contribute OCR text and can include a grayscale text thumbnail when FFmpeg is available.
- **Gateway session lifetime.** The deployed gateway still issues 24-hour device sessions. The server-side lifetime change is tracked separately.

## 0.10.35 — 2026-11-23

- Enable and save Full access for a trusted folder from a command confirmation. The current Agent run continues with the new permission.
- Save the Auto checkboxes in Settings while an Agent task is active. The next run reads the saved values.
- Editor device login requests a seven-day session from a compatible gateway.
- Image context includes a local grayscale text thumbnail when FFmpeg is available. Preview text shows both the thumbnail and OCR.

## 0.10.34 — 2026-11-18 (menu help and reply language candidate)

- **Help no longer covers the menu.** Help for a menu choice opens above the open menu, so every choice stays visible while you read it. On a short panel long help scrolls in the free space above the menu. Help for other controls keeps its position next to the control.
- **Russian requests get Russian progress notes and answers.** When a request is written in Russian, the agent is told to write its step notes and its final answer in Russian, the protocol example is in Russian, and every step repeats the rule. Code, paths and commands stay as they are.
- **Search works where ripgrep is not installed.** The agent search uses the ripgrep that ships with VS Code when `rg` is missing on the host, so regular-expression queries find their matches on such a Remote SSH server. Without any ripgrep, a search inside one file now finds its matches, and the result tells the agent that the query was matched as literal text.
- **Answers are no longer lost.** An answer with line breaks inside the action JSON, or a turn with two actions, is read instead of being sent back to the model; the first action runs and every tool keeps its permission checks. At the step limit a final answer sent as a finish action is shown instead of the step-limit notice. An answer that explains how tool results are handled is no longer refused as an echoed tool result.
- **Includes 0.10.33.** Settings navigation, help in both languages and the access explanations from the preceding candidate are included.

## 0.10.33 — 2026-11-18 (settings navigation and help candidate)

- **Settings keep their navigation.** Chat, Context, Usage and Terminal share a fixed header. The arrow returns to the settings overview. Close or Escape returns to the conversation and preserves the draft and attachments. A late usage response updates the stored measurements after the panel closes.
- **Help before granting access.** Hover over controls or focus them with the keyboard for detailed English/Russian explanations. Permission-disabled modes stay focusable so their prerequisites can be read. Escape dismisses the help first.
- **Account reviews explained.** The permission menu describes the installed coding-assistant CLI login, separate subscriptions, review limits and the Tvijo coordinator's service credits before opening the project approval.
- **ExtraFullAccess prerequisites.** Help explains Workspace Trust, a non-root extension host account, explicit project approval and Remote SSH host permissions. The access and billing entry opens connection guidance.
- **Includes 0.10.32.** The visible work log, collapsed receipts, reply language and bounded tool history from the preceding candidate are included.

## 0.10.32 — 2026-11-18 (visible agent progress)

- **Work log in the chat.** While the agent runs, the transcript shows each step as it happens: a short note from the model about what the last result showed and why it takes the next step, then the action in plain words (read a file with its line range, search, run a command, edit a file) and its result (exit code, lines, matches). Command and search output opens on click. The log is shown in both chat views and stays above the answer, collapsed, after the run.
- **Replies in the language of the request.** Step descriptions, receipts and error notices follow the language you write in, unless you chose the panel language explicitly. A Russian request on an English remote editor no longer gets an English receipt.
- **Receipt collapsed under the answer.** Task ids, cost and observed commands stay in the full record (Open answer, export) and appear in a collapsed **Task receipt** block, not in the answer text or in the error notice.
- **Large tool output no longer stops the agent.** Tool results are bounded by UTF-8 bytes and remain valid JSON. When a request would exceed the service limit, older tool outputs are shortened first; the newest keeps its head and tail. Project rules, the goal and the protocol are never shortened. In 0.10.31 a few reads of long-line files ended the task with a request-size error.
- **Unchanged:** permissions, budgets, money paths, auto-commit and the history format. Older conversation entries render as before.

## 0.10.31 — 2026-11-18 (Remote SSH install candidate)

- In a Remote SSH window, VS Code installs Tvijo on the workspace host. Hover over the Tvijo status bar item to see the running version.
- **Tvijo: Check service connection** shows the loaded version, build commit, remote connection and host platform even if the gateway is offline. When VS Code has marked this copy obsolete, the command offers to reload the current window. The bridge's `/status` reports the same obsolete marker.
- To upgrade from a server-side VSIX, open that SSH workspace and install the new file there. After saving your work, run **Developer: Reload Window** in that window. Use **Tvijo: Check service connection** to verify version 0.10.31.

## 0.10.30 — 2026-11-17 (local candidate)

- The editor reports individual attachment errors and renders the Tvijo icon in both light and dark themes. See the [extension changelog](vscode/CHANGELOG.md) for the candidate history.

## 0.10.29 — 2026-11-14 (prepared preview)

- **Smaller Agent requests.** Stable instructions and read-only Ask tools for short project questions; source bodies enter only after a task read. Long rules use a deterministic digest with source paths; safety, permissions and money restrictions remain. Ask removes repeated quoting and prose whitespace while retaining policy words and fenced code. Older read results become named receipts while local history stays intact.
- **One confirmed retry.** A failed step may create one new task after a final, known-cost receipt, within the remaining budget and normal server limits. Both task costs and retry links are recorded. Unknown charges stop the agent and disable retry. Saved edits remain.
- **Build and diagnostics.** `/status` includes extension and gateway versions plus the build commit. Release packages require a clean tagged source and carry a file hash inventory. Missing provider cache fields remain unknown.
- **Download and channels.** Installation links use https://dsh.tvijo.com/download#vscode. Editor downloads remain separate. Reload after installing; existing grants and settings remain. Registry packaging includes an offline required-field manifest check; actual registry publication requires operator tokens. Paid live validation is a separate operator step.

## 0.10.28 — 2026-10-31 (prepared candidate)

- **Readable agent progress.** Resize or collapse the agent log, and expand individual steps. The preferred height and collapsed state survive webview reloads; the visible height and keyboard controls respect the current viewport. Reloading a destroyed view does not restore the prior run's log.
- **Public project knowledge in Agent and Plan.** Four authenticated read tools search the Tvijo wiki, retrieve a pinned article revision, and search or inspect the connector catalog. They use the current account or project token, refuse arbitrary sources, bound responses and treat retrieved content as untrusted data. Availability requires an activated gateway route. The separate DSH Harness and external MCP client are not integrated by this change.
- **Bridge recovery included.** The 0.10.27 host-side `/status` and one-time view focus fixes are included; diagnostics do not reserve tasks, invoke models or clear unresolved charges.
- **Migration and channels.** Reload the editor after installing. Existing permissions, settings and task receipts are preserved. Native editor installers, Marketplace and public download promotion retain separate verification and publication receipts.

## 0.10.27 — 2026-10-31 (prepared operator-test build)

- **Bridge diagnostics without a chat panel.** The exact `/status` command is handled in the extension host and returns the loaded extension version, bridge/view state and a bounded service health result through the durable outbox. It does not require sign-in, reserve a task, call a model or clear an unresolved task.
- **Open the view once.** An ordinary bridge message requests the Tvijo panel when it is absent. The focus attempt is recorded once per message; paid messages continue through the existing account, pending-task and execution guards.
- **Preserve recovery evidence.** Failed outbox writes retain the diagnostic result for publication; reload recovery keeps existing interrupted-run semantics. Responses contain fixed diagnostic fields rather than server payloads, credentials or another task's text.
- **Migration and channel scope.** This separate operator-test VSIX requires an editor reload after installation. Existing settings and permissions remain. Native editors, Marketplace and public latest downloads are separate channels; this preparation does not publish them. Linux host/VSIX checks and their limits are recorded with the artifact; Windows and an authenticated model/tool run remain unverified.

## 0.10.26 — 2026-10-31 (prepared local test build)

- **Single-model startup.** DSH Harness remains off by default, and ds41f remains the default chat/Agent model. Invalid inactive team preferences no longer break single-model startup. Team help explains how to select ds41f alone instead of trying to set a team size of one.
- **Actionable DSH errors.** Missing controllers, unsupported host team options and unavailable workers show fixed English/Russian setup guidance instead of a misleading workspace-file error. Arbitrary controller stderr is excluded from the notice.
- **Known reserve, unknown charge.** Pending tasks display a valid reserved amount when supplied by the service, even if final provider cost is unknown. Unknown cost still blocks another paid task, including a reported terminal task with zero reserved amount; no financial guard is cleared.
- **Less repeated rule-scan work.** Ordinary file metadata is skipped while scanning rule fingerprints. Nested rules, symlink checks and the same entry/directory limits remain enforced; a truncated scan still requires the existing applicable command approvals.
- **Separate agent permissions.** Tvijo Full access controls Tvijo Agent. coding account worker keeps its own permission mode and approval policy. Installing this VSIX does not grant permissions to another extension or alter its files.
- **Migration and scope.** Reload the editor after installation; existing settings and grants are retained. This is a standalone VSIX for operator testing in VS Code and TvijoCode, with Windows tested first by the operator. Native editor builds, Marketplace and public download channels are separate. Live ds41f acceptance remains blocked by the existing service accounting freeze.

## 0.10.25 — 2026-10-29 (prepared)

- **Honest task outcomes and receipts.** Blocked and partial work stays visible; local receipts record observed commands, edits, task IDs and known or unknown usage. A model's completion claim is not independent verification.
- **Unknown cost stops the agent.** Missing cost remains unknown and stops further model steps until reconciled. A measured zero remains zero.
- **Account reviews in Full.** coding account worker and enabled review account worker account CLI reviews are advisory and bounded. Existing Full grants do not gain this permission automatically; enable it explicitly for the project. Quota failure does not fall back to an API key.
- **Extra access on root.** ExtraFullAccess is refused on privileged root extension hosts. On a non-root host, Extra still uses the OS user's rights and is not an OS sandbox. Existing Full access and inbound Copilot integration remain separate; outbound Copilot review is not implemented.
- **Migration and verification.** Reload the editor after installation. At preparation time the candidate had not been published, installed as a VSIX or smoke-tested with a live paid model. Desktop editors, CLI and Marketplace are independent channels; see their release receipts for subsequent verification.

## 0.10.23 — 2026-10-28

- **ExtraFullAccess.** A separate native approval for the selected trusted project and Tvijo account enables POSIX host-shell scripts, substitutions, normal network commands and bounded account CLI reviews. Existing Full access grants are not upgraded. Commands have the current OS user's rights and can affect files outside the project; literal accident checks are not an OS sandbox. Editor file tools retain path and dirty-buffer protections. Switching account/project or revoking the grant cancels active work. Windows hosts retain literal command execution and CLI review; POSIX shell syntax is explicitly unavailable.
- **Show actual capabilities.** Each local Agent run records the effective mode, terminal access and available reviewers, and supplies them to the model. The model must not claim a missing terminal without an actual refusal. Plan still refuses writes, commands and reviews.
- **Bounded local review.** ExtraFullAccess uses the local Agent engine and offers supplied-evidence, advisory coding account worker/review account worker subscription CLI review with finite calls, cancellation and receipts. Provider API keys are not inherited; missing account login, disabled agents or quota failure do not fall back to a paid API. Project review account worker pauses are enforced by the review adapter; the trusted host shell is not an OS boundary against arbitrary programs. The agent is instructed to use the review adapter exclusively for consultations and never load provider-key environments. review account worker review is off by default. Review does not resume or control another agent's current conversation or give it write authority.
- **Copilot direction is explicit.** The preserved 0.10.22 bridge lets Copilot call Tvijo through `@tvijo`/`#tvijo`; outbound Tvijo-to-Copilot review is not implemented. Previous bridge and saved-conversation work is included and retained.
- No automatic permission migration, OS elevation, trading activation or model-route changes. Reload the editor after installing; select ExtraFullAccess for the intended project. This extension release does not rebuild native editors, CLI or MCP.

## Remote SSH server for Windows editor 1.140.07195 — 2026-10-26

The missing Linux x64 remote extension host is now published in the existing
[Windows release](https://github.com/nikbibamon/tvijocode/releases/tag/1.140.07195).
Open Remote SSH can download its expected filename instead of receiving404.
The exact Windows runtime commit and pinned Tvijo0.10.15 VSIX are retained.
Native Linux CLI, isolated VSIX installation/listing and loopback startup passed
in [CI40397971052](https://github.com/nikbibamon/tvijocode/actions/runs/40397971052).
The71 bundled extension files match the published VSIX. Stable product policy
permits Tvijo VSIX updates while preserving existing built-in update entries.

Anonymous server download:88,165,345 bytes; SHA-256
`533f88ad1b623b13deafca0016a28090c965edd5f9b66503b3d507d12746c1c8`.
[Build pins and native test limits](https://dsh.tvijo.com/download#vscode).
Original EXE/ZIP, receipts, release tag, previous releases and failed artifacts
are preserved. Actual Windows SSH connection and remote extension activation/chat
remain unverified; unified coding account worker/review account worker/Copilot sessions are not implemented yet.

## Windows editor 1.140.07195 / extension 0.10.15 — 2026-10-26

The current Windows x64 editor bundles Tvijo DSHREM **0.10.15**, including
native symbols, definitions and references and the offline learning guide.
The previous Windows 0.1.0 package with extension 0.5.5 remains archived.
Editor and extension version numbers identify separate products.

- [Windows release, ZIP and per-user EXE](https://github.com/nikbibamon/tvijocode/releases/tag/1.140.07195)
- [Download and installation instructions](https://dsh.tvijo.com/download#windows)
- [Native Windows receipt](https://dsh.tvijo.com/download#vscode)
- [Exact sizes, SHA-256 and source commit](https://dsh.tvijo.com/download#vscode)
- [Standalone extension 0.10.15](https://github.com/nikbibamon/dshrempub/releases/tag/tvijo-v0.10.15)

Observed 2026-10-26: anonymous EXE and ZIP downloads match their published
SHA-256 files and build receipt. Native Windows CI passed CLI startup,
extension activation, the guide and code navigation; all 71 embedded files
match the published VSIX. The ZIP SHA-256 is
`d4c07e28efac0e91ec7829d9f496ae9b22b9a837127638052f8a63b86eb2512f`
(219,811,437 bytes). EXE SHA-256 is
`2cbf5dcadf6be3b8e1233bccd91d8676ac3ed145a4ed6ff0495bc17a798f6fef`
(156,594,949 bytes).

The EXE install/upgrade/uninstall flow, interactive sign-in and a complete paid
coding session remain untested. Builds are unsigned and auto-update is disabled;
keep the previous editor folder and install updates manually. Existing extension
settings are preserved; installing the standalone VSIX requires Reload Window.
macOS remains on its separate 0.1.0 preview; Marketplace remains deferred.
MCP is a separate npm product, currently `tvijo-dshrem-mcp@0.1.1`.
The preserved 0.10.14 draft and failed Windows CI40379292758 are not promoted
as working downloads. No binary, tag or previous release was replaced.

## Extension 0.10.9 — 2026-10-24

Optional durable DSH Harness orchestration on the selected local/SSH host;
automatic discovery after explicit setup, fixed ds41f + subscription workers,
status/resume/stop/repair controls and separate quality/publication state.
Includes final 0.10.8 judge fixes. See [extension changelog](vscode/CHANGELOG.md).
This source entry is not a Marketplace publication receipt.

## 0.10.7 — 2026-10-24

- Save exact Agent-owned edits in Full access and Auto before disk reads/tests. Preserve dirty and concurrent user buffers, require checkpoints, verify saved bytes and stop the run on save failure, conflict or revoked authority. Quick Edit/review buffer semantics remain separate.

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
