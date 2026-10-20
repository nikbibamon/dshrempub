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
