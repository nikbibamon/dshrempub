# Data sent by Tvijo DSHREM

## Commercial and BYOK custody (0.4.11)

Managed tasks are billed in Tvijo Tokens; customer BYOK provider expense is a
separate payer journal, never the operator provider ledger. BYOK single attempts
have a separately quoted fixed0.001TT service fee; unknown provider charges remain
unresolved and never trigger Managed fallback. Provider estimated cost is labelled
as an estimate, not a provider invoice. Review and swarm remain Managed-only.

The account owner can submit a supported provider key once over authenticated TLS
in the browser Connections page, with explicit task/day provider USD limits for that connection. Other connections
and uses of the provider account have separate limits.
Encrypted server custody binds tenant/project/connection/version; a private
service-held master key permits decryption for authorized requests. This is
server encryption at rest, not zero knowledge or end-to-end encryption. The key
is not placed in ordinary task messages, exports, SQLite plaintext or user-code
sandboxes. A sealed process-memory descriptor supplies only the isolated approved
AIOS customer transport. Metadata, encrypted vault and separate usage records are
stored on the runtime volume. Encryption does not make a secret safe to paste
into chat or source files. Privileged server administrators can access custody.

Storing a key does not validate or activate inference. A private source-bound,
dated customer receipt and custody approval are required. Revoking a connection
blocks new dispatch and preserves historical receipts; already submitted requests
can still be billed by the provider. Separately revoke the key at the provider
when needed. Browser and editor share connection references, not plaintext keys.
Actual merchant and BYOK provider availability require external configured and
verified accounts; synthetic test receipts are not live payment/provider proof.

Optional Stripe-hosted Checkout receives payment details directly; Tvijo does not
collect card numbers. Immutable offers, order/period/payment receipts, service
grants and reversal observations are kept for reconciliation. Paid subscription
wallet grants roll over without expiry; subscription entitlement ends at its UTC
paid boundary. Cancellation requests stop renewal at the provider; no local
charge loop is implemented. Refund/dispute review can suspend new paid work while
preserving financial holds/history. A checkout redirect is not payment proof.
Missing merchant activation keeps payments unavailable. Financial retention and
backup deletion are stated separately by the data lifecycle; key revocation does
not promise physical erasure of existing encrypted backups.


The extension sends a question, conversation history, selected code and explicitly
attached text to the configured service when you press **Ask**. It does not scan your
workspace automatically. A file chosen, pasted or dropped from your computer is first
transferred to the VS Code extension host (the SSH server in a Remote SSH window).
Image text is extracted there with Tesseract, without an upstream model call. Images
are not sent to a vision model. Only extracted text is submitted with the question.
Avoid selecting credentials or private data you are not authorized to send.

Unsubmitted attachments and image previews remain in extension-host memory until sent,
removed, or the host reloads. They are not written to temporary files by this extension.
After submission, file contents and OCR text are part of conversation history; original
image bytes are not. The composer draft is kept in VS Code webview state and in a
scoped local draft file after a one-second typing pause. A separate
**Add file to my knowledge base** command requires confirmation and stores the file's
text in the service knowledge base. Attaching a file to a question does not add it there.

**Quick edit** sends the active file (up to 128 KiB) and your instruction to the
service and asks the selected model for the complete revised file. The answer is
shown as a diff in the editor; nothing is written until you confirm, and the file
is never saved automatically. The optional `tvijo.autoApply` setting removes the
confirmation dialog but still does not save the buffer.

**Agent mode** sends your goal and the project tree, selected project file
contents, search results and command output to the service as model context.
Files are read only inside the opened workspace; secret-like names, excluded
directories and paths outside the workspace are refused. Every proposed edit is
shown as a diff and written to the editor buffer only after you confirm; the file
is not saved automatically. Shell commands run on the VS Code extension host only
after a separate confirmation, with provider API-key variables removed from the
environment, and known destructive patterns are refused before execution.
Read-only plan mode (`/plan`) disables both writes and commands. Command output
sent back to the model can contain project data; do not run commands that print
credentials.

An operator test allowance (for the named product-testing account) is a daily
spending limit recorded as `operator_test_allowance`; it is not a payment, does
not increase paid credit and is not reported as revenue. Payment collection is
not configured in this preview.

The extension keeps a local metadata log in its global storage (`events.jsonl`,
mode 0600): event name, version, outcome, model alias, step count, task id, cost,
duration and error code. It stores no prompts, file contents, command text, command
output, attachments or credentials. `/metrics` shows an aggregate summary; deleting
the file removes the local history.

The login token is stored in VS Code SecretStorage. Conversation history is kept
in the extension workspace state. Signing out removes the local login token;
starting a new conversation clears local conversation state. Neither action
claims to delete records already stored by the service.

The service processes submitted content to answer the request and may retain
uploaded knowledge, account records, task identifiers, usage, cost and error
records. Requests may be processed by upstream model services. Server retention,
deletion and upstream data terms must be agreed for a production deployment;
this preview makes no zero-retention, training-exclusion or certification claim.

This extension adds no independent advertising or analytics SDK. The service
accounts for tasks and usage. The extension selects provider connection references;
provider keys are submitted separately through the authenticated browser custody flow.
Never paste a provider key into a chat, project access-key dialog or settings.

Customers can create a service account with zero initial credit. Free trials, when offered, are
finite service credits, not unlimited tokens or access to the operator's account.

The optional Telegram connector sends and receives bot messages through Telegram.
Your BotFather token stays in SecretStorage in the editor; the standalone connector
reads it from your process environment. Only the configured owner's private chat is
accepted. `/status` discloses this host's name and resource counters to that owner.
Requests and pending-task metadata are retained locally for recovery. `/ask` sends
the question to the configured Tvijo service and selected upstream model services.
No proactive Telegram notifications or arbitrary shell commands are implemented.

The service stores a salted password hash for web accounts and records unpaid credit
orders and verified settlement events. Exact answer caching is private to your account,
lasts up to one hour and keeps at most 32 entries per account. Signing out does not
delete the service's ledger, uploaded knowledge or this cache. Payment collection
requires an independently configured merchant integration; orders are not payments.

If you explicitly allow named systemd services, the bot can return their state and
restart one after a fresh owner confirmation valid for 60 seconds. The allowlist is
empty by default. Service names, requests and outcomes remain in local bot state;
no arbitrary shell text is executed.


## Sponsored preview and product feedback (0.4.0, 2026-10-18)
Self-service accounts receive an idempotent sponsored preview, capped at five tasks, 50,000 model tokens and USD0.05 per account, with a shared USD1 daily pool. This is not a payment or revenue. Task reservations and usage persist across restarts. Browser questions, explicit context and answers are stored in the tenant-private task history; do not submit secrets. The operator can read submitted feedback and account/credit requests. Optional feedback contact details and verified Google email on subsequent sign-in are stored privately for account support; email never merges accounts automatically. No unsolicited email/Telegram notification is sent. The web UI stores theme/language preferences locally. Own-project terminals run on the user's VS Code extension host and use separate local authentication.


## Historical connection preferences and private receipts (0.4.2)
Connection pilot preferences store only the selected mode and timestamp under your service account and create one private operator-inbox entry. No provider API key or custom endpoint is accepted. Selecting a pilot preference does not switch inference routes or activate a charge. Private usage exposes only your own service budget, recent tasks, indexed-source counts and native provider receipt metadata; the browser/extension does not receive transport credentials. A usage JSON export is an explicit local download. Browser and editor sign-ins are separate; use the same service account to see the same ledger.


## Account projects, files and data controls (0.4.11)

Projects and their conversations are private to one service account. Organization membership and project sharing are not available. Account-level removal of a saved knowledge fragment, cached answer, submitted feedback item or outcome review is available in the web data controls; it does not remove task history, financial/security records or upstream provider records. Individual message deletion is not available. An account erasure request is only a request: it remains pending until the service verifies a shared writer fence and an operator processes it. No deletion completion is promised by submitting the request.

The server JSON export includes task transcripts, project/thread messages, coding snapshots and workflow artifacts, knowledge fragments, feedback/reviews, accounting summaries and non-secret project-key metadata. Authentication credentials, provider secrets, other accounts, local editor history and third-party provider records are excluded. Large exports use bounded pages; if collection counts change during export, the service stops and asks you to restart. The pages are a live read, not a point-in-time backup.

For the service file-extraction endpoint, the original selected binary is processed in a private request-scoped scratch directory and removed when extraction finishes. It accepts bounded text/DOCX/PDF inputs and PNG/JPG/JPEG for OCR where dependencies are available; images are not sent to a vision model by that endpoint. Extracted text is returned to the client and may persist in a task or project conversation only when explicitly submitted. Removing an unsent attachment clears local pending state; it does not delete previously submitted conversation history.

Real merchant payment and customer-provider activation remain unavailable until their respective accounts and dated verification receipts exist. Synthetic tests are not external acceptance. These lifecycle controls describe the current implementation; they do not establish external merchant, provider, OAuth, or human data-term acceptance.

## Project rules (0.8.0)

Project rules load automatically in trusted workspaces, nearest first up to the repository or owning workspace root. Supported files include AGENTS.md, CLAUDE.md, .clinerules, .cursorrules, .windsurfrules, .github/copilot-instructions.md and .tvijo/rules.md. A separate 32 KiB aggregate limit applies. Each file is read safely up to 256 KiB and checked for unsafe links, invalid UTF-8 and credential content before truncation. Rules are quoted project advice, snapshotted once per task and cannot grant permissions or change endpoints, payer or budgets. Context Off disables them. Settings lists files, size, truncation and per-file switches. Old hash approvals no longer authorize inclusion. Rejected content is not echoed; secret detection remains conservative.


## Workspace Trust and project advice (0.10.8)

VS Code Workspace Trust authorizes automatic rules. Per-hash approval commands and
records no longer grant permission. Rule changes affect the next task and do not
invalidate the current snapshot. A loss of workspace trust still blocks use.
Previously sent messages remain in the conversation; later requests use visible
user messages rather than replaying hidden generated rules.

Rules cannot authorize tools, change budgets or alter provider key custody. Every
Agent file-tool write to a rules file requires confirmation in every preset,
including normalized path aliases. Other private `.tvijo` files remain excluded.
Explicit pasted text and approved programs remain the user’s responsibility;
local command execution is not an operating-system sandbox.


## Approved syntax tools (0.8.2)

Syntax checks are off until a native approval selects one local folder and an installed native
Python/Node executable. The host stores its path, SHA-256 and file identity locally. Before each
Linux check it validates the selected file and executes an open file descriptor, preserving the
approved inode across pathname replacement. The interpreter and its libraries remain trusted
host components; the inode's bytes can still be modified in place by fully authorized host code.
This feature is not an OS sandbox. Other platforms refuse these checks before approval.

The checked buffer goes through stdin to fixed parser arguments in a private empty host-storage
folder. Provider credentials, project environment variables and startup options are excluded.
Output is bounded and reduced to generic error positions, buffer version and content hash. Raw
parser output is not sent to the model. A failed syntax check does not undo or save the edit.
Unconfirmed process-group termination quarantines the checker until extension-host restart.

Rule approvals also use a small host-local identity marker outside the project, without Settings
Sync, to prevent identical file URIs on different extension hosts sharing an approval. The marker
and interpreter approval data are not conversation context or exports. Old rule approvals are
retained locally but do not authorize the new host-bound scope.


## Local interrupted-run recovery (0.9.0)

Before dispatch, the extension saves the user's prompt in extension-host global
storage, separated by account, thread and workspace. Agent step events, including
tool results and command output, are kept locally in the newest 60-event window,
with a 64 KiB serialized limit per run and private file permissions. Oversized
events are visibly marked as truncated. Prompts that cannot fit are refused
before dispatch. Run records and drafts have a seven-day recovery window;
expired, corrupt or incomplete records are not restored.

Restoring a transcript writes local conversation history and does not replay
tools or send a new model request. Recovered log entries are excluded from later
automatic model context. Fetch result reads the existing task detail through the
normal task-resolution path; its available result or status is shown locally.
This journal is separate from the metadata-only usage log described above.

## Plan buffer summaries (0.8.3)

When the model requests a Plan inspection, the next normal Agent step may receive
safe relative paths, document versions and approximate line counts for open dirty
buffers in the selected workspace. The summary omits raw source. Plan search may
send bounded matching snippets from disk as untrusted tool results; disk and
unsaved buffers can differ. Plan does not launch a search subprocess or shell.
The existing file reads, context consent, task reservations and provider custody
continue to apply. No additional automatic model request is introduced.

Full access consent is stored locally per workspace folder in extension global
state, bound to a host-local identity marker. It is not a model instruction or
workspace setting and is not sent with requests. The mode menu provides a one-click
revert. Commands still run with local host permissions; file-tool boundaries and
hard command/budget checks remain in force.


## Local Agent commits (0.10.8)

Successful saved Agent edits can be committed locally on the current branch. Git
identity, hooks and signing remain under the user’s configuration. Messages include
the editor version, served models, local task identifier, saved paths and checks.
The temporary index and message are stored in extension-host global storage; they
are not model context. User-staged and mixed-authorship files are excluded. Command
side effects are not tracked. Tvijo never pushes these commits. Disable this in
Settings using autoCommit Off. Undo uses a soft reset only for the current commit
without a containing remote-tracking branch; otherwise it attempts a revert.
