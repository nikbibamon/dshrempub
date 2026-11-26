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
provenance. **Include observation in next DS41F request** adds quoted evidence to
the next local Chat, Agent, or Plan request. Chat uses the selected chat model.
Agent and Plan use the selected agent model. Shared, BYOK, Harness and alternate
models cannot include the observation.

The admitted CLI is the Linux x64 Codex 0.171.0 binary with SHA-256
`b76a027d6b210f9a8da7aaf321dd235c700f0ef7a794d4a5314b9af6c134f0f0`.
The invocation fingerprint is
`3a6d91c425d22ff4ccdc4d201d64f765d49a1f6fdb20614eb339f075e482a2e04`.
Bubblewrap exposes the verified binary, network trust files, a read-only
personal ChatGPT login file and disposable process state. The private
requirement pins the official ChatGPT origin. The shell, hooks, MCP, apps,
goal management and other tool surfaces are disabled. Model provenance comes
from the private CLI turn record, which binds the response to the exact thread,
completed turn, model and usage. The CLI's server model report, when present,
provides corroboration.

| Verification, 2026-11-25 UTC | Result |
|---|---|
| Actual pinned CLI using an isolated loopback fixture and invented auth | PASS. One generating request and a separate non-generating prewarm. Both advertised zero tools. The generating request contained one image. |
| Abort, output cap, disconnect and conflicting account route | PASS on the loopback fixture. Cancellation and disconnect stopped after one generating request. The conflicting route stopped before inference. |
| Server model metadata missing | PASS on the final loopback fixture with a private `turn_context` matching the completed response. Without a matching record, the result was rejected. |
| Composer at 300 CSS px | PASS in an isolated Chromium page via Playwright. The pixels action, explicit observation opt-in and normal Chat submission fit without horizontal overflow or console errors. |
| Outbound Chat, Agent and Plan requests | PASS with mock transport. Opted-in image text reaches the ordinary DS41F request. Forged or stale receipts, changed workspace and incompatible routes are refused. |
| Account attempt 1 with the ephemeral profile | FAIL, `model_receipt_missing`. The adapter discarded the observation. Actual served model is unknown. |
| Authorized account attempt 2 with the final private-rollout profile and identical synthetic frame | PASS. The actual response identified a red square in the upper left and a blue upward-pointing triangle farther right and lower. Pixel measurement verified both facts. |

The final attempt used a 256 × 160 RGB fixture with empty OCR. Exact Codex CLI
`turn_context` reported `gpt-6.2-sol` in thread
`01a2125f-6117-71e0-b299-fc78aa3593a6`, turn
`01a2125f-6127-7833-8f97-e0c0b267636d`, source `codex_exec`, provider
`openai`. Usage was 206 input and 49 output tokens. The separate first attempt
remains failed. Both requests ran on the ChatGPT subscription.

Admission, wire, model and pixel receipts are in the operator's private task
evidence directory. The source candidate awaits review before release packaging.
No paid API request, release, or installation was made in this phase.
