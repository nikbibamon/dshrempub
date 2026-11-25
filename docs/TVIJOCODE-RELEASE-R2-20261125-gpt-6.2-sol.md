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
