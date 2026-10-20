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
