# TvijoCode Image V1 · gpt-6.2-sol · 2026-11-25 UTC

- author_agent: codex
- requested_model: gpt-6.2-sol
- served_model: gpt-6.2-sol
- served_model_evidence: operator-volume worker receipt `model-receipt-gpt-6.2-sol.jsonl`, Codex TUI `turn_context.model`
- decided_at: 2026-11-25 UTC
- task_id: TVIJOCODE-IMAGE-V1-20261125
- session_id: 01a21245-254d-7372-8657-e7253a1751a9
- base: accepted Tvijo 0.10.38 source `8b41bb8f8161d843b840d5424e3e6312c92c6e37`

The composer offers **Send pixels to Codex for analysis** for a single decoded
PNG or JPEG. The attachment keeps its existing local OCR and grayscale layout.
FFmpeg re-encodes one RGB PNG without source metadata. The request contains the
normalized pixels, a generic path inside the process namespace and a fixed
observation prompt. The composer shows the requested model and its machine
provenance. With a local DS41F Chat selected, **Include observation in next
DS41F Chat message** includes the result as quoted text in that one ordinary
request.

The admitted CLI is the Linux x64 Codex 0.171.0 binary with SHA-256
`b76a027d6b210f9a8da7aaf321dd235c700f0ef7a794d4a5314b9af6c134f0f0`.
The invocation fingerprint is
`3a6d91c425d22ff4ccdc4d201d64f765d49a1f6fdb20614eb339f075e482a2e04`.
Bubblewrap exposes the verified binary, network trust files, a read-only
personal ChatGPT login file and disposable process state. The private
requirement pins the official ChatGPT origin. The shell, hooks, MCP, apps,
goal management and other tool surfaces are disabled. Model provenance comes
from the CLI's server report or the matching private CLI turn record, which
binds the response to the exact thread, completed turn and model.

| Verification, 2026-11-25 UTC | Result |
|---|---|
| Actual pinned CLI using an isolated loopback fixture and invented auth | PASS. One generating request and a separate non-generating prewarm. Both advertised zero tools. The generating request contained one image. |
| Abort, output cap, disconnect and conflicting account route | PASS on the loopback fixture. Cancellation and disconnect stopped after one generating request. The conflicting route stopped before inference. |
| Server model metadata missing | PASS on the final loopback fixture with a private `turn_context` matching the completed response. Without a matching record, the result was rejected. |
| Single authorized ChatGPT subscription attempt on a synthetic image | FAIL. The earlier ephemeral invocation completed without a usable model receipt. The adapter discarded the observation. Actual served model is unknown. |
| Real account on the final private-rollout profile | NOT_RUN. The phase's single live attempt was consumed by the ephemeral profile. |

The synthetic test image has a red square on the left and a blue triangle lower
on the right. Tesseract returned empty text. These are the fixture's predefined
facts. The failed live receipt does not establish that Codex identified either
fact. The final profile is a source candidate awaiting real-account acceptance.
No release, install, or paid API request was made in this phase. The raw
admission, transport and result receipts are in the operator's private task
evidence directory.
