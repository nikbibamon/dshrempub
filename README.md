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

## Local data and security

Login data and transcripts are stored below `~/.config/dshrempub/`; credential and transcript files are written atomically with mode `0600`, and containing directories with mode `0700`. Credentials are bound to the service URL used at login. Do not share session files if they contain sensitive prompts. The client never prints access tokens or raw HTTP error bodies. It does not make automatic paid retries. Uncertain tasks remain saved and block further paid turns until the service reports a terminal state with no held budget.

Knowledge base upload is explicit: `dsh kb add FILE` accepts one UTF-8 regular file inside the current working directory, up to 512 KiB. It rejects symlinks, common credential file names, binary content, and likely inline credentials. It does not scan or upload files automatically.

## License

The package metadata is `UNLICENSED`. A public licensing decision is pending. No license grant is made here. A possible future 1–2 year/$1M threshold and all other licensing terms remain undecided.
