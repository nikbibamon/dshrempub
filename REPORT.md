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

## 0.7.4 — independent acceptance, 2026-10-21
Source37216ab. Root independent9CLI+386extension tests pass (slice5-final-fMvTm9/full-tests.log); fourEN/RU280/640browser cases verify ticking/frozen/unknown/scope-clear chips, map navigation and separate command records (chips-browser-fMBXxC). Counter excludes queued/planned/task-wrapper nodes and deduplicates actual identities; missing live observations stay unknown. Stop requested is separate from observed child exit; descendants after abort/timeout remain explicitlyunknown.
VSIX3680d7267ca4e8da630842bc8c4431ce96d2e166b7df1a7243dfbbb74d429355: Public; pack/path/keyhits0; no newsettings. NativeVSCode1.142 installedVSIX real elapsed ticks, observedAgent1/map opens, plus diagnostics/context/export/edit/manualsave/Rewind passed (worker-native-qa/runs/2026-10-21T02-16-45-565Z-2417786/evidence.json); synthetic backend/provider0. OperatorVSCodeServer installation/copy follows nativepass; active user window not forciblyreloaded.
Scope audit preserved a worker's six-line root README addition and retained its test artifacts; root reconciled ownership and added the exact path before commit. No foreign work reverted.

## 0.8.0 — final independent acceptance, 2026-10-21
Source5658f5d/161d735/4cd474c. Independent9CLI+414extension tests pass (fit-release-final-xY0onm/full-tests.log). Tests include exact/overlapping/EOL matches, explicit refusal, same-byte inode replacement, checkpoint-time edits, no-op replacement, command preflight/lifecycle, untrusted frozen rules, partial reads, same-size rewrites, unsafe links, credential canaries, scopes/limits/Off and actual outbound Agent policy boundaries.
Four EN/RU280/640 browser cases pass, including640px vertical-pressure header hit targets and rule inclusion states (fit-pressure-FmE2RS). Earlier native test runner could not show modal dialogs; failed fixtures retained. Ordinary nativeVSCode1.142 with isolated profile and actual custom approval dialogs passed installedVSIX: explicit EOL-diff confirmation, rules+AGENTS only in user data, actual diagnostics/terminal/context, tickingAgent1/map, export, dirtybuffer/manualsave/Rewind originalSHA256. Final evidence: worker-native-qa/runs/2026-10-21T02-47-46-242Z-2443390/evidence.json. This uses synthetic loopback model replies/provider0, not liveprovider authentication. Root stopped only its owned GUI fixture after passed assertions.
Accepted archive is candidate3, SHA256980a629bb45eba8768bef183ddfab44f3c78d908fc283505b1a9c00274eb7b98. Public; archive/source hashesmatch; packinstructions/hostpaths/keyhits0; settingkeysunchanged. Earliercandidatearchives preserved and not accepted. FinalVSIX copied to operator maincheckout as tvijo-dshrem-0.8.0.vsix; operatorVSCodeServer installation verified separately. No production site deployment.

Final provenance receipt,2026-10-21: the accepted candidate3 was rerun successfully with launch.json recording the actual spawned argv and driver SHA at worker-native-qa/runs/2026-10-21T02-53-18-926Z-2447076/. This confirms normalGUI without extensionTestsPath and real custom approval dialogs. A legacy commandLine description in earlier normalGUI receipts was inaccurate; originals are preserved and superseded for launch provenance. Final-release-receipt.json points to the new run. Accepted VSIX hash and runtime source are unchanged.


## 0.8.1 — explicit folder rules trust, accepted2026-10-21
Source22979a5 plus native notification-completion correction. Independent9CLI+436extension tests pass (pi-aider-20261021T030208Z/phase1-test4/tests.log); canon960passes. Read-only Luna found a final-dispatch race; synchronous beforeChat validation now runs after asynchronous reservation callbacks in ordinary, Agent, Quick Edit and shared-service paths, with regression checks and retained reservation journals.
NativeVSCode1.142 normalGUI passed actual trust modal, forged-argument denial, one-byte rule change/reapproval, revoke/no-provider-task preview, user-data placement, dirty buffers, diagnostics and Rewind (worker-native-qa/runs/2026-10-21T03-26-56-916Z-2490629). Same-name same-content multi-root isolation passed (root-native-boundaries/runs/multi-1792553841754); the Trusted fixture explicitly disables VSCode trust only in its isolated profile. Separate Restricted Mode without that flag passed: VSCode blocks product activation/command dispatch (restricted-1792553529706). Actual process restart reused that profile and workspace and preserved approval for first root only without another approval command (persist-1792553906956). No live provider test or production deployment claimed.
Accepted candidate2 SHA256de210efbf2d738e0379a7d3186c8985e42607186cbbd5a5206c39e6c1cb4ccfc. Public, no private field, pack instruction/hostpath/key hits0, setting keys unchanged. Exact VSIX copied to operator checkout and installed as0.8.1. Current operator window not forcibly reloaded. Failed GUI fixtures and worker artifact-path exceptions preserved; no foreign work removed.


## 0.8.2 — approved Linux buffer syntax checks, accepted2026-10-21
Source5cf8ab8107c684cc557631f457b0a7574e953e14. Independent9CLI+464extension tests pass, phaseB-final-tests/tests.log. Sol resolved launch/lifecycle review: Linux FD-pinned approved inode, final synchronous authority check, group absence confirmation and quarantine; other platforms refuse before approval. Interpreter and libraries remain trusted components, without immutable-byte or OS-sandbox claims. Native malformed/correct stdin, actual unchanged disk, source-execution sentinel, invalid-tool probe, scopes, stale/cancel/timeout/overflow/concurrency/EPERM-equivalent unknown group and FD-path replacement checks pass. Own Problems markers clear on edits/disable.
NativeVSCode1.142 normalGUI: actual command palette, Python profile, real file picker and native approval; actual dirty invalid Python buffer produces generic failed feedback in the third synthetic model payload. Three separately created step tasks, no extra model turn; source disk SHA/mtime unchanged, measured native saves0. Own Problems observed and cleared on disable. Evidence worker-syntax-native/runs/2026-10-21T04-35-46-869Z-2537814. Failed GUI fixtures preserved; their palette prefix/input timing defects were corrected without product changes. Synthetic loopback model/device auth, no live provider test claimed.
Candidate1 SHA2565744077afd40b3debe7c05c69868c4a96428f2e8eb78955f41d32c14b4acb86c. Public; pack instruction/hostpath/key hits0; setting keys unchanged. EN/RU280/640 pressure checks pass (fit-pressure-e1oEQB). Exact archive installed as0.8.2; active operator window not reloaded. New host-local scope marker requires prior folder-rule approvals to be reviewed again; earlier records retained, not deleted. Arbitrary project linters/plugins remain separate work.


## 0.8.3 — process-free Plan inspection, accepted 2026-10-21

Source 406479a plus 4a13d53. Root independently ran 9 CLI and 483 extension tests,
all passed (pi-aider-20261021T030208Z/phaseC-full2/tests.log). Plan exposes only
fixed pwd, buffer_status and buffer_diff_stat operations. Status is metadata-only;
line spans are approximate and omit raw source. Secret, hidden, excluded,
symlink and outside buffers are skipped. Bounded literal Plan search reads disk
without rg or shell; Act search keeps its existing behavior. Plan writes and
commands remain refused before approval even if automatic permissions are on.

Native VS Code 1.142 normal GUI with candidate2 passed real command-palette Plan
input and six separately created synthetic step tasks: command/write refusals,
normal-buffer metadata and approximate spans, secret-buffer exclusion, literal
search of disk versus unsaved editor content, unchanged dirty-buffer text/version,
unchanged disk SHA/mtime and zero observed saves. Launch argv, driver SHA and VSIX
SHA are recorded. Evidence: root-plan-native/runs/2026-10-21T04-54-35-397Z-2550597.
Device auth and model replies were synthetic loopback fixtures; this is not a live
provider or billing test. Candidate1 and its failed native receipt are preserved:
that run revealed that real offsetAt requires a VS Code Position. The targeted fix
and a strict Position regression test passed before rebuilding candidate2.

Accepted candidate2 SHA256:
b5a03cf7e5033e2968ff2e5b64f8cf3cdbc3a43244b46e20d4fce9f88cdb0e86.
All 45 entries match source and receipt; Public, no private field, pack instructions,
host paths or key-pattern hits; setting keys unchanged. EN/RU 280/640 pressure
checks passed (fit-pressure-qi4qf7). Exact archive copied to the operator checkout,
installed and listed as 0.8.3. The active user window was not forcibly reloaded.

This completes the bounded Pi/Aider follow-up: explicit folder-rule consent,
approved Linux syntax checks and process-free Plan inspection. Arbitrary project
linters/plugins, a Plan shell/Git interface, full whitespace-fuzzy replacement and
inline completion remain separate work. No pi-ai dependency or new upstream
source download. Production and the earlier rejected/deferred benchmark are
unchanged; no paid API task was started in this follow-up.
