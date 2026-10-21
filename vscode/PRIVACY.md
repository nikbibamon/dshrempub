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
image bytes are not. The composer draft is kept in VS Code webview state. A separate
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

The optional root-local .tvijo/rules.md file is read only under project context consent or explicit local Preview. It is at most16KiB, scope-filtered against known workspace paths and refused for unsafe links, invalid encoding or detected credential content. Included project context is quoted user data; its snapshot is frozen for the run and cannot modify host permissions, model, endpoint, payer or budgets. Off excludes it. Rejected content is not echoed in the summary. Export uses visible conversation fields and excludes hidden project data. Credential detection is conservative, not a guarantee that arbitrary project text is secret-free.
