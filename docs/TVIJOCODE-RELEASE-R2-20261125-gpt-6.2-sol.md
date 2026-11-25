# TvijoCode VSIX 0.10.39 release preparation · gpt-6.2-sol

- author_agent: codex
- requested_model: gpt-6.2-sol
- served_model: gpt-6.2-sol
- served_model_evidence: official Codex CLI `turn_context.model`, `ACK-gpt-6.2-sol.json` in the release evidence
- decided_at: 2026-11-25T11:59:47Z
- task_id: TVIJOCODE-RELEASE-R2-20261125
- session_id: 01a2128c-7857-78d2-b607-30e253485dff

This extension preview carries the independently accepted source from
[PR 39](https://github.com/nikbibamon/dshrempub/pull/39) at
`e51b67c92fd3027289b1d6cd3095561274f281bf`. It includes the local
0.10.38 Auto and Reconnect fixes plus opt-in image analysis. The Linux x64
extension-host prerequisites and the activation steps are in the
[extension README](../vscode/README.md).

Package only a clean source revision. The packager binds the exact Git SHA
and each member digest in `extension/BUILD_INFO.json`. The candidate catalog
row is prepared and the existing public 0.10.29 download remains selected.
The immutable package receipt is external to the package revision because
embedding a digest or Git SHA in that same revision would change both.
The paired AI OS release record pins the release candidate, native smoke, and
the separately gated publication steps.

The isolated smoke uses a fresh profile, extension store, shared-data directory
and XDG paths. It preserves the process HOME and uses the known Tvijo Code
distribution with the matching bundled CLI. It exercises the public service
health endpoint and local editor controls. The image-analysis action and
normal chat submission require their own explicit user interaction.

Public channels are tracked independently. [Marketplace](https://marketplace.visualstudio.com/items?itemName=tvijo.tvijo-dshrem)
was observed at 0.10.35 and the [GitHub preview](https://github.com/nikbibamon/dshrempub/releases/tag/tvijo-v0.10.29)
and [domain downloads](https://dsh.tvijo.com/download#vscode) at 0.10.29 on
2026-11-25 UTC. Native editor 1.140.07216 and CLI 0.4.3 are separate products.

## GitHub publication and catalog correction · gpt-6.2-sol · 2026-11-25T12:52:42.955483+00:00

GitHub pre-release 0.10.39 uses source commit `089fe1b47d2e33005448cc188d3188b2106bc99b`, 1,488,203 bytes
and SHA-256 `05329247d7631d2f384f13c45688d7a4417e8091d210a48be6a4372d001d0544`. The published tag and archive stay pinned to
that commit. This later metadata revision does not serve as package source.

The catalog keeps 0.10.29 as the active gateway snapshot. It records the
separate 0.10.39 GitHub release and current Auto, Reconnect and optional
image features. Dated historical metadata keeps every previous limit
verbatim. Both Auto settings were saved in the native Settings UI in a
private Linux x64 Tvijo Code profile. A fresh native process read the
effective and global values through the real VS Code Extension Tests API.
Interactive Google sign-in, the operator profile and live submission
were outside the run.
[GitHub pre-release](https://github.com/nikbibamon/dshrempub/releases/tag/tvijo-v0.10.39).

## Verified DSHREM mirror · gpt-6.2-sol · 2026-11-25T13:23:53.793059+00:00

Tvijo 0.10.39 is available on the DSHREM mirror. Anonymous GET and HEAD
agreed on 1,488,203 bytes. The archive matches GitHub and contains build
commit `089fe1b47d2e33005448cc188d3188b2106bc99b`. Both English and Russian changelog
journeys reached the exact archive in Chromium on desktop and mobile.
The public catalog lists the live 0.10.39 selection and retains the old
release history and native 1.140.07216 metadata.
[DSHREM download](https://dsh.tvijo.com/downloads/tvijo-dshrem-0.10.39.vsix) · [Live catalog](https://dsh.tvijo.com/api/dshrem/v1/public/extension-release).

The paired draft catalog keeps the 0.10.29 preparation snapshot for its
existing checks. The live receipt is in `verification.gateway_live_0_10_39`.
The release-05 runtime carries the separately reviewed active 0.10.39 catalog.
This metadata revision is separate from the packaged source commit.
