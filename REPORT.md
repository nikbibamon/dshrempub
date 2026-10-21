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

### Corrected0.7.0 release verification

Corrected VSIX SHA256:7ddf404a6d62cab08b7f7b16f25b1c136cf7f1d64363232cbc791105d7cc93bc.
All30archive entries match source and receipt; GalleryFlags Public, private absent,
zero pack instruction/host-path/secret-pattern matches. Original archive preserved.
Native official VSCode1.142.0(commit6d62b1d) with an isolated user profile and installed
VSIX executed real sign-in, Agent read/replace/finish, explicit document save and
Rewind via the real webview. Editor+disk SHA256 returned to original. This test used
a synthetic loopback service, not live inference. Native host exited0; screenshot
and JSON receipt are retained privately. The corrected archive was separately
installed on the operator VSCodeServer; listed version0.7.0 confirmed.331extension
tests plus9root tests passed independently; EN/RU280/640px browser checks passed.

## 0.7.1

SPEC215slice2 adds an explicit Chat/Manual/Edit automatically/Plan/Auto picker,
with EN/RU names, keyboard navigation and normal Shift+Tab focus. Two existing
approval settings plus the existing Agent/Plan control implement the presets;
ordinary-chat routing and QuickEdit stay unchanged. Custom approval combinations
remain visible. No new settings.

Permission changes are scoped and idle-only, verify fresh effective settings,
restore only their unchanged writes on failure, preserve concurrent values and
block submission while pending. Custom false/true never auto-applies files.
Auto retains the exact command allowlist and asks before wholesale replacement.
Plan rejects shell/write slash bypasses. A second idle check closes an auth-await
race between Agent startup and a permission update.

Independent validation:348extension tests and9root tests passed; EN/RU280/640px
Playwright mode, keyboard, delayed-ack/draft, Custom and overflow checks passed
without remote requests or console errors. Official nativeVSCode1.142.0 installed
the VSIX in an isolated profile, exercised all four real mode choices and verified
actual approval values plus unchanged council/QuickEdit settings, then performed
Agent/edit/save/Rewind and original SHA256 recovery. The service was synthetic;
no live-provider claim. OperatorVSCodeServer installation and version0.7.1 verified.

VSIX SHA256:551182554a095f7ac03f188540bb3a7fd4e97bce32a82ca6e22b8655c027c48b.
31entries match source/receipt, GalleryFlags Public, private absent, zero pack
text/host-path/key-pattern hits. All baseline artifacts remain preserved.

## 0.7.2 — independent acceptance, 2026-10-21
Source3d04ff7. Root reran full9 CLI+371extension tests, all pass; four EN/RU280/640px menu/keyboard/mode checks passed. Archive8c8a9c592f69ce162052dbd38a60a39ae2feafe80ff2d78bc713f846d7659037: Public, settings unchanged, pack instructions/host paths/key hits0. Installed operator VSCodeServer0.7.2 and copied root VSIX/receipt.
Actual official VSCode1.142.0 installed VSIX test with synthetic loopback backend passed: allfour mode presets; actual Error/Warning vs Info/outside/secret/symlink diagnostic filtering; observed shell integration; standalone references cause no model task; inline contexts reach actual Agent HTTP; export removes visible fake token and hidden attachment content; Agent dirty buffer/manual save/Rewind originalSHA256. Provider calls0; no live-provider claim. Evidence: volume codex-orchestration-20261021/worker-native-qa/runs/2026-10-21T01-57-26-001Z-2399140/evidence.json, actions-browser-BFTnNq. Earlier failed harness setup attempts retained.

## 0.7.3 — independent acceptance, 2026-10-21
Source71c6e61;9CLI+377extension tests pass independently. Root corrected diagnostics event namespace per officialVSCodeAPI, bounded tracker memory, complete-row serialized8KiB fitting, post-Apply marker and stale-document/provider-unavailable honesty. Newfile andreplace feedback reach next actual model request; no autosave or compilation-success inference. EN/RU280/640browserchecks pass (actions-browser-lf5twH).
VSIXc7736d9da9e7b7d2d774dda5af46e6f8d39437fc7ef5a89eea6b1c7efd0846a0 verifies Public, no packs/path/key hits or newsettings. NativeVSCode1.142 installedVSIX context/edit/save/Rewind/export test passed, plus real post-edit Error reaches nextAgentHTTP, unrelated-file Error and edited-fileInfo absent. Evidence: codex-orchestration-20261021/worker-native-qa/runs/2026-10-21T02-05-45-680Z-2407676/evidence.json. Synthetic loopback service,providercalls0; liveprovider notclaimed. OperatorVSCodeServer install/copy performed afterthisnativepass.
Luna's opaque sandbox file-level failures retained; root stopped repeated retries and obtained one finite Sol failure consultation. Independent normal-tool rerun revealed actual mock/API/serialization issues and passed after targeted corrections.
