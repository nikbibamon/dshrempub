# dshrempub

`dshrempub` is a Node.js command-line client for remote DSHREM research and chat. It uses Node 22 or newer and the built-in `fetch`; it has no runtime dependencies.

The client sends prompts to `https://finedg.com/api/dshrem/v1`. Each prompt obtains a separately budgeted remote task using the server's `coding` alias and a maximum budget of USD 1. The service remains responsible for enforcing the account's actual limits. Conversations are saved locally with owner-only file permissions.

This is a remote research/chat client. It does not execute generated code, modify local files, or run autonomous local tools. Suggested tool calls in a response are displayed but never executed.

## Install and use

```sh
npm install -g .
dsh --help
dsh login
dsh status
dsh models
dsh tasks
dsh task TASK_ID
dsh stop TASK_ID
dsh chat
dsh run "Explain this error message: ..." --json
dsh sessions
dsh resume SESSION_ID
dsh reconcile SESSION_ID --cancel
dsh kb add docs/notes.md
dsh kb search "deployment settings"
dsh kb map
dsh logout
```

The command is also available as `dshrem`. Run `dsh doctor` for a read-only service health check. Use `dsh reconcile SESSION_ID` to inspect an uncertain task or grant; append `--cancel` to request cancellation. This recovers grants with their saved idempotency key and never resends inference. For command details and local session behavior, see [docs/HELP.md](docs/HELP.md).

To point at a development endpoint, set `DSHREM_API_BASE`. HTTPS is required. Plain HTTP is accepted only for an explicit loopback URL such as `http://localhost:8080/api/dshrem/v1`, which must also be enabled with `DSHREM_ALLOW_LOCALHOST=1` in the current shell.

## VS Code

Extension 0.10.7 adds **Work in Tvijo** to the Explorer folder menu and a visual
folder browser in chat. New sessions use Agent tools with confirmations; Full
access activates only after explicit approval. The account row shows the running
version and a reload action. See [folder selection and modes](vscode/README.md#choose-the-execution-folder).

Preview data flow is documented in [vscode/PRIVACY.md](vscode/PRIVACY.md).
For graph orchestration, see the two-node [LangGraph/LangChain adapter](integrations/LANGGRAPH.md).

The `vscode/` folder holds the editor client: device sign-in, questions about a selection,
explicit knowledge-base upload and account credit, over the same service and the same rules
(no API keys in the editor, one capped task per question, no automatic paid retries).
See [vscode/README.md](vscode/README.md).

## Local data and security

Login data and transcripts are stored below `~/.config/dshrempub/`; credential and transcript files are written atomically with mode `0600`, and containing directories with mode `0700`. Credentials are bound to the service URL used at login. Do not share session files if they contain sensitive prompts. The client never prints access tokens or raw HTTP error bodies. It does not make automatic paid retries. Uncertain tasks remain saved and block further paid turns until the service reports a terminal state with no held budget.

Knowledge base upload is explicit: `dsh kb add FILE` accepts one UTF-8 regular file inside the current working directory, up to 512 KiB. It rejects symlinks, common credential file names, binary content, and likely inline credentials. It does not scan or upload files automatically.

## License

The package metadata is `UNLICENSED`. A public licensing decision is pending. No license grant is made here. A possible future 1–2 year/$1M threshold and all other licensing terms remain undecided.

## VS Code extension 0.6.1

Assistant replies now render safe Markdown with code-copy controls and highlighted
links. The EN/RU Agent map shows the current request and actual task/agent/workflow
execution receipts in a live, keyboard-accessible horizontal tree. Missing metrics stay
**—**. See [the extension README](vscode/README.md) for controls and data limits.

## VS Code 0.7.0: Rewind

Use **… → Rewind…**, **Tvijo: Rewind**, or `/rewind` to choose a run and restore
its files to before a selected step. Checkpoints cover Agent write/replace, Quick Edit
and reviewed proposal Apply; disk bytes are restored exactly and changed files prompt
for Overwrite or Skip. Newly created files always ask before deletion. Local recovery
data stays in extension global storage (seven days, 50 MiB) and is excluded from
requests, exports and logs. Agent Map scrolls on both axes while keeping file details.
See [Rewind behavior and limits](vscode/README.md#rewind-local-checkpoints).

## VS Code extension 0.7.4: observed run chips

The chat header shows elapsed time from the host run timestamps and an observed
running-agent count. The count opens Agent Map; local commands appear in a separate
background-work list with bounded lifecycle evidence and no command output.


TVIJO extension0.8.1 adds separate native approval and revocation for exact folder rules.
Global context consent does not approve `.tvijo/rules.md`; changed rules need another review.
Rewind, command policy, provider credential custody and service budget limits are preserved.

TVIJO extension0.8.2 optionally checks unsaved Python/Node buffers with explicitly approved
Linux-host interpreters. Generic errors appear in Problems and Agent feedback. This is bounded
syntax checking; project linter configurations/plugins are not loaded. Use `/syntax` to configure.


TVIJO extension 0.8.3 adds bounded Plan inspection of open dirty buffers and
approximate line spans. Plan search is literal and reads disk without starting a
search process. Plan shell and writes stay disabled; buffer summaries are not Git
status. Existing reservation, context consent and Rewind controls are preserved.


Release data for the extension is maintained in [releases/tvijo-extension.json](releases/tvijo-extension.json).
The current validated source preview is 0.8.3; website download publication is prepared separately.
[Changelog](CHANGELOG.md) describes the accepted changes. Windows/macOS editor bundles have
their own versions and do not update when the standalone extension changes.


The VS Code extension's optional DSH Harness host integration is documented in
[vscode/README.md](vscode/README.md#optional-dsh-harness-orchestration). It is an
explicit host-local mode; the remote research CLI described above is unchanged.


## Self-hosted Telegram pilot

A [self-hosted read-only bot preview](bot/README_EN.md) is available for local status checks. You can also prepare your own BotFather bot for a private Tvijo pilot. Customer bot tokens are **not** accepted by this repository or by a public form. Read the [English setup guide](docs/BOTFATHER_CONNECT_EN.md) or [русскую инструкцию](docs/BOTFATHER_CONNECT_RU.md). The current operator bot is not a shared customer service.
