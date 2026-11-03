# Publishing the prepared extension

The installed package is tvijo.tvijo-dshrem 0.5.1. Download the exact VSIX and checksums from https://dsh.tvijo.com/download. To publish this same package, use an account authorized for the `tvijo` Marketplace publisher. Configure its VSCE_PAT in your own secure environment (never in chat, settings.json or GitHub source), then run:

```sh
npx @vscode/vsce publish --packagePath tvijo-dshrem-0.5.1.vsix
```

The build host currently has no stored publisher credential. Local installation and website downloads work independently of Marketplace publishing. Keep `UNLICENSED` until the operator makes a licensing decision.

## Release checks used for 0.5.1

```sh
cd vscode
npm test                                   # node --test
npx @vscode/vsce package --no-dependencies --allow-missing-repository
cp tvijo-dshrem-0.5.1.vsix '<downloads-dir>/'
sha256sum tvijo-dshrem-0.5.1.vsix          # must match SHA256SUMS-0.5.1.json
curl -sS https://dsh.tvijo.com/api/dshrem/v1/health
curl -sS -o /dev/null -w '%{http_code}\n' https://dsh.tvijo.com/downloads/tvijo-dshrem-0.5.1.vsix
```

Copying a VSIX into `<downloads-dir>/` is not a deployment by itself. Configure
the download service to serve the exact versioned filenames and apply that
deployment separately.


## Rule: the published changelog is the single source of "what's new"

The Marketplace Overview tab is `vscode/README.md`, frozen into each published version, and the
Changelog tab is `vscode/CHANGELOG.md`. Write the release notes once, in `CHANGELOG.md`, then run

```sh
node vscode/scripts/sync-readme.cjs        # regenerates the README block and version line
```

`vscode/test/readme-changelog.test.js` and `scripts/package_vsix.py` refuse a README that does not
announce the package version. After publishing, the same CHANGELOG entry goes to every surface:
the git tag and GitHub release notes, the Marketplace version, and the site metadata
(`releases/tvijo-extension.json`: `latest_version`, `publication`, `features`). A surface that
shows an older version than Marketplace is a defect, not a "later" task.


## Rule: GitHub releases follow the catalog, no jumps

Every version in `releases/tvijo-extension.json` was handed to someone, operator-test builds
included. Before `gh release create tvijo-vX` run

```sh
python3 scripts/check_release_sequence.py --version X
```

It refuses while any catalog version between the newest GitHub release below X and X is missing
(2026-10-31: GitHub went 0.10.25 -> 0.10.28, users on 0.10.26 could not find their version).
Publish the missing ones first, in order, from their own source commit and verified bytes. A
version that must never ship gets `"status": "withdrawn"` in the catalog; an unexplained gap is a
defect. The tag workflow runs the same check and goes red on a jump.
