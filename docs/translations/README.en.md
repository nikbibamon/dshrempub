# Tvijo DSHREM — from a task to a checked result

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo brings a browser workspace, a VS Code extension and terminal tools around a shared development workflow. Describe the task, choose its execution host and permissions, inspect the changes, and keep the evidence used to accept the result. This guide introduces the product; the repository's technical README and command reference remain authoritative for the CLI.

## Start with your preferred workspace

Open [DSHREM](https://dsh.tvijo.com/), get the [VS Code extension and terminal instructions](https://dsh.tvijo.com/download), or read [settings explained](https://dsh.tvijo.com/knowledge/settings-explained). Sign in through the service's supported account flow. Never paste provider API keys into a shared prompt, public issue or repository.

The Node.js CLI requires Node 22 or newer. From a local checkout:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

The command is also available as `dshrem`. This remote chat CLI displays suggested tools without executing them. Local editing and command execution belong to the VS Code Agent or an explicitly configured host runtime; they have separate permissions. See [CLI help](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Understand the choices

**Evidence first** separates supported facts from assumptions. **Plan and check** asks for a short plan and checks the result against the request. **Review the answer** challenges a draft; it is self-review unless a separate reviewer is explicitly assigned. None of these methods guarantees correctness or lower token use.

Task presets add reusable instructions and checklists. They do not create additional model memory. A larger context collection still has to fit the service and model request limits. Advanced controller, Python and state paths refer to the selected extension host; in Remote SSH that is the remote server.

## Work with a team when it helps

An AGENTROY team assigns a coordinator, implementers and reviewers distinct responsibilities. Host policies may request DSHREM ds41f and account-based Codex or Claude tools, with optional architectural review. Availability depends on the installed runtime, account access and the chosen policy. A missing subscription must not silently become a paid API call.

Three to six roles are organization choices, not a quality formula. Reviewers need the exact artifact version and test evidence. A serious failed check blocks acceptance even when models agree. Read [agent teams and visible costs](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs).

## Resume without hiding uncertainty

A detached server-side tmux session can continue after a laptop or phone disconnects. Work on a powered-off local computer cannot. Server failure, memory pressure and storage loss still require recovery. Reconnect to the saved task ID and inspect its last confirmed event before starting more work. Do not blindly repeat a billable request whose outcome is unknown. See [disconnects and recovery](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Keep costs and data visible

Review the accepted quote, task cap, reserved amount and usage receipt. An 8% service markup would turn USD1.00 of provider usage into USD1.08 before separately disclosed charges; this is an example, not a price offer. Subscription quotas, provider charges and server resources are different limits. Extra budget requires an explicit choice.

Local CLI credential files use owner-only permissions. These permissions are not encryption or a backup. Knowledge upload is explicit; private files should never enter a public handoff link. [Prompt handoffs](https://dsh.tvijo.com/knowledge/prompt-handoffs) explain copying a reviewed task into another tool.

This repository's package is currently marked `UNLICENSED`; publication does not grant reuse rights. Consult the current package metadata and licensing notice before redistribution. Translations are introductory guides, generated with DSHREM and checked for structural consistency; English is the reference for technical discrepancies.
