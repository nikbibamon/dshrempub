# Tvijo DSHREM for VS Code

## 0.4.9 — explicit payer and commercial readiness

**Tvijo: Connections** selects Managed or a validated, scoped BYOK connection for
this project. Manage provider keys in the authenticated browser Connections page;
a stored key remains unvalidated until a real customer receipt and custody review
activate it. Creating a project key requires explicit `byok:execute` for BYOK;
existing keys keep their scopes. BYOK supports Standard and single coding tasks.
Review/swarm remain Managed-only; select Managed explicitly to use them.

Before a BYOK task, review its provider USD cap and separate fixed0.001TT service
fee. Confirm your provider account, then the extension rechecks current account,
project and connection epoch. No provider failure, revoked key, unknown cost or
restart automatically switches to Managed or retries the request. The same task,
thread and service receipt remain visible in the browser. Provider expense is
separate from TT and model tokens; an estimate is not a provider invoice.

**Tvijo: Buy credit** opens owner billing. Project API keys cannot purchase or
cancel subscriptions. Checkout and finite subscription offers stay unavailable
until a configured merchant and dated activation proof are verified. No payment
is collected by an inactive button or redirect. Purchased period wallet credit
rolls over without expiry; subscription entitlement has a finite paid boundary.
See [PRIVACY.md](PRIVACY.md) for server custody and payment-data boundaries.

Earlier release sections below describe historical behavior.


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

**Try first:** self-service accounts receive a sponsored preview of 5 tasks, 50,000 model tokens and USD0.05 total, whichever ends first. The shared preview pool is USD1 per UTC day. Preview supports the cheap Flash/Devstral routes; it is not a payment or revenue, and premium models require paid credit. No card, automatic debit or per-question operator approval. Failed attempts and unknown token usage may retain quota; the API never automatically retries.

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
the chat. Use **Workspace** for files on the extension host (including SSH: biba2),
**Path** or `/attach path/to/file` for a workspace path, and **Selection** for selected
code. Workspace files also have **Tvijo: Attach workspace file** in their context menu.
Sending a standalone absolute/relative file path, `file://` link or Markdown file link
also attaches that workspace file without creating a model task. HTTP links are not fetched.
Attachments are shown before sending and can be removed individually. Click **Ask**
or use **Preview text** first to inspect the exact file/OCR text.
Ask sends them with your question; with no question text, Ask explains the attachment.

Images use **local OCR text extraction**, not visual reasoning. The preview shows the
original, but the model receives extracted text only. Colours, charts, object identity
and visual layout are not analysed. Tesseract must be installed on the extension host;
it is installed on SSH: biba2. `tvijo.ocrLanguages` defaults to `eng+rus`; use `eng`
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

`/agent` (or the **Mode** button in the composer) runs a bounded agent loop against
the open workspace. The agent can list, read and search project files and asks for
precise text replacements and whole-file changes; every changed file is shown as a
diff and applied to the buffer only after you confirm. Commands are never run silently: each one needs an explicit
confirmation, provider keys are removed from the command environment, and blocked
destructive patterns are refused before a shell starts. Secret-like files,
excluded directories and paths outside the workspace are unavailable.

`/plan` keeps the same loop but disables writes and commands, so it is safe for a
first inspection. Settings: `tvijo.agentModel` (default `ds41f`), `tvijo.agentMaxSteps`
(default 6), `tvijo.agentBudgetUsd` (default 2), `tvijo.agentAutoRun` and
`tvijo.agentAutoApply` (both off by default). The step limit returns a partial
report instead of an error, and one malformed model turn is retried once.

**Start your first task** (`/start`) opens a folder when none is open, signs you in,
and pre-fills a read-only plan request you can edit before sending.

**Local usage metrics** (`/metrics`) shows a summary of the extension's own metadata
log: event counts, outcomes, spend and duration. It stores no prompts, file contents,
command output or credentials.

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
