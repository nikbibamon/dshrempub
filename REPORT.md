Implemented Tvijo 0.6.0 / SPEC-214 on `claude/tvijo-ext-0.6`. Implementation commit: `ee3bea0`. No merge, push, publish, release, API keys or provider calls.

Changed files: `vscode/{extension.js,package.json,README.md,CHANGELOG.md}`, `vscode/lib/{packs.js,chat-view.js,settings-guide.js}`, `vscode/test/{packs,extension,chat-view,settings-guide,service-ledger-extension}.test.js`, and `REPORT.md`.

Server packs use the existing authenticated client and an in-memory session cache. Missing/unavailable packs hide the header control, status shortcut and palette entry. The only new setting is `tvijo.pack`. Root-file suggestion follows server order, then the served engineer pack. Chat and Agent/Plan send exactly one leading system message; Agent tool/finalization rules share that message. Local history contains no pack instructions. Explicit model settings win.

Design: a small theme-aware header button opens native Quick Pick, also reachable from the status bar. EN/RU labels, keyboard activation, focus outlines, ellipsis and narrow-header wrapping keep it accessible and compact. Unknown daily USD spend is **—**; only `account.budget.daily_spent_usd` supplies a known amount.

```text
Header: [DSHREM] [auto: <title> v] [EN/RU] ...
Status: Tvijo · auto: <title> · $0.01234
        Tvijo · auto: <title> · —
```

Validation: baseline **248/248**, final `nice -n 12 npm test` **266/266**; 18 added tests. `git diff --check` passed. Using the frontend-testing-debugging skill, Playwright checked a synthetic VS Code bridge at localhost, EN/RU, 280/320/640 px. Page identity/content, console health, screenshots, keyboard action, hidden states and overflow checks passed. Browser plugin not available; Playwright was the fallback.

Built with existing `scripts/package_vsix.py`:

- VSIX: `/tmp/claude-tvijo-ext-0.6/tvijo-dshrem-0.6.0.vsix`
- SHA256: `93130a95d3d9f029321fc3875bbeebdeb10710fdded0208677bbc14709fdf66d`
- Receipt: same path plus `.sha256.json`; 25 entries, 410,698 bytes. Archive/source hashes and relative dependencies verified; tests and local dependencies excluded.

Deviations/risks: shared-project Chat retains existing quoted service routing. No live installed-host/model-answer smoke under the provider-call prohibition. Native Quick Pick/status behavior is host-mocked; Chromium validates the webview. Missing daily-spend data stays unknown. Endpoint failures stay hidden until sign-in/session reset. Baseline untracked files and local QA `vscode/node_modules/` are preserved and uncommitted. Browser plugin installation would improve future frontend QA.

## Follow-up

Corrected the status bar to use only `budget.daily_remaining_usd`: EN `$0.95 left today`, RU `осталось $0.95 сегодня`; missing/invalid values remain **—**. This supersedes the daily-spend field and examples above. Added **No pack / Без набора**, stored as `tvijo.pack = "none"`, with explicit labels, no automatic suggestions and no pack guidance in Chat or Agent/Plan. Documented `none`; `tvijo.pack` remains the only new setting.

Validation: focused pack/extension tests **84/84**; full `nice -n 12 npm test` **269/269** (three additional tests), no failures or skips. `git diff --check` passed. All calls used local test doubles; no provider calls, push or publish.

Rebuilt with `scripts/package_vsix.py --output /tmp/claude-tvijo-ext-0.6/tvijo-dshrem-0.6.0-follow-up.vsix`; receipt: `tvijo-dshrem-0.6.0-follow-up.vsix.sha256.json`. SHA256: `348ba9bf2ff1018dd411fb83f9806956e73a679da8787d570aa213d3ff888e74`. Verified all 25 archive entries, receipt hashes and packaged source bytes; 411,525 bytes. New VSIX/receipt remain local artifacts; original VSIX/receipt and all baseline untracked work are preserved.

## 0.6.1

Implemented on `claude/tvijo-ext-0.6`; implementation commit `d0c64b6`.

Changed: `vscode/{extension.js,workspace.js,package.json,README.md,CHANGELOG.md}`;
`vscode/lib/{chat-view,client,markdown,agent-map,chat-presentation}.js`;
renderer/map tests, DOM helper and synthetic receipt fixture; root `README.md` and this report.
Public repository metadata now points to `nikbibamon/dshrempub`.

Assistant answers render headings, emphasis, inline/fenced code, language labels and Copy,
lists, blockquotes, tables, rules and highlighted links. Parsing creates allowlisted DOM;
raw HTML tags are dropped, model images never load, and only HTTP/HTTPS/mailto links open
through `vscode.env.openExternal` after a click. Strict CSP remains. Rendering is bounded;
the plain task receipt footer remains visible beyond the body limit.

Design: compact **Agent map / Карта агентов** header button, horizontal scrollable tree,
independently scrollable details, keyboard arrows/Enter/Space/Escape, preserved focus and
scroll during updates. Only observed tasks, Agent turns/tools, council calls and coding
execution branches appear; quotes never create executed nodes. Unknown metrics remain
**—**; USD and TT stay distinct.

```text
[Request] ─┬─ [Task / Agent step] ─ [Executed route/tool]
           └─ [Coding task] ─┬─ [Proposal]
                            └─ [Review]
Select node → task ID, route, receipt, short last message
```

Validation: baseline **269/269**; final **297/297**, 28 added tests, no failures/skips.
`git diff --check` passed. Playwright passed EN/RU at **280/640 px**: Markdown, Copy,
click-only links, safe DOM, keyboard navigation, live focus, zero page overflow,
console errors or remote requests. Screenshots/results remain in `.qa-061/`.

Built using `scripts/package_vsix.py`: `tvijo-dshrem-0.6.1.vsix`, **448,552 bytes**,
28 entries, `GalleryFlags=Public`, no `private`. Verified receipt hashes, packaged source
bytes, relative runtime dependencies and exclusion of tests, dependencies and skill text.
Checksum receipt: `tvijo-dshrem-0.6.1.vsix.sha256.json`.

SHA256: `6c8db49ef5f8bc9ad1253667d6fe0dffad3f1b8794d9f0b41c5772c7687477a5`

Limits: no new server endpoint; open maps poll existing task reads every two seconds.
Branches appear only when existing responses expose execution records, sometimes after
completion. Local trees are session-memory data; reopened history requires matching task
or thread IDs. Installed-host/provider smoke was not run. No provider calls, push or
publish. Baseline untracked work and prior VSIX artifacts are preserved.

## 0.7.0

Implemented SPEC-215 slice 1 on `claude/tvijo-ext-0.6`; implementation commit `04f4dd9`.

Rewind saves previous disk bytes/absence and editor input before Agent write/replace,
new-file Apply, Quick Edit and reviewed proposal Apply. Local global storage is capped
at seven days and 50 MiB, pruning oldest first; unavailable storage blocks edits.
Workspace, symlink, hard-link and checksum guards protect capture/restore. Recovery
bytes, hashes and storage paths stay out of requests, exports and usage logs.

EN/RU header **… → Rewind…**, **Tvijo: Rewind** and `/rewind` show recent runs,
then step time/files/requested model. Restore undoes the chosen step and later edits
in that run. Changed disk/editor content offers Overwrite or Skip; new-file deletion
always asks. Concurrent edits stop recovery; partial progress is reported. Completion
adds a local chat note. Agent Map has both visible scrollbars and retains details.

```text
[ … ] -> [ Rewind… ]
  Recent runs
  [ Fix the project       2 steps > ]
    Step 1 · time · model
    src/app.js, src/styles.css
    [ Rewind to before step 1 ]
      Changed file? [Overwrite] [Skip]
      New file?     [Delete]    [Skip]
  Chat: Rewound to step 1: 2 files restored
```

Validation: baseline **297/297**, final **327/327** extension tests (30 added), plus
**9/9** root tests; no failures/skips. Three-file SHA256 equality, BOM/CRLF/binary
bytes, all write paths, prompts, concurrent edits, TTL/size, persistence and outbound
isolation passed. `git diff --check` passed. Playwright used a synthetic VS Code bridge
at `about:blank`, EN/RU **280/640 px**; Browser plugin unavailable. Identity, meaningful
content, overlay absence, console health, screenshots, run/step/restore interaction,
empty state, map reachability and page overflow checks all passed; zero remote requests.
Evidence: `.qa-070/`.

Built with `scripts/package_vsix.py`: `tvijo-dshrem-0.7.0.vsix`, **476,304 bytes**,
30 entries; `GalleryFlags=Public`, no `private` field. Source/archive hashes, runtime
imports, unchanged settings and exclusion of tests/dependencies/QA/skill text verified.
Receipt: `tvijo-dshrem-0.7.0.vsix.sha256.json`.

SHA256: `496a18979c70a71c885e6119a702e96694357fe6131e54df1c69813b2a2a6111`

Limits: shell/external writes are not checkpointed; first workspace folder; native
host prompts are mocked. No installed-host/provider smoke, installation, push or
publication under the worktree-only constraint. Baseline untracked work and prior
artifacts remain preserved. README and CHANGELOG updated; no new settings.

### 0.7.0 independent acceptance correction (2026-10-21)

Independent injected-ENOSPC reproduction showed an old recovery point was pruned before
a new checkpoint became durable. Corrected capture stages/fsyncs/renames the new record
before pruning. Stable published storage remains50MiB; temporary staging can require100MiB
total. Open/write/fsync failure tests preserve the previous point at capacity. Restore
checks opened inode/device/content before writing; explicitly approved recreation uses
exclusive creation. Concurrent replacement/content changes refuse recovery.

Independent root+extension suite:9 root tests and331 extension tests passed. Focused
checkpoint suite26/26. EN/RU280/640px Playwright checks passed: identity, content, clean
console, Rewind interactions, map reachability, no overflow or remote requests. Native
VSCode-host validation is pending; no live-provider smoke or installation is claimed here.
Original0.7.0 artifacts remain preserved; a corrected archive will have a new checksum.
