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
cp tvijo-dshrem-0.5.1.vsix /mnt/HC_Volume_107088246/aios-runtime/tvijo-dshrem/downloads/
sha256sum tvijo-dshrem-0.5.1.vsix          # must match SHA256SUMS-0.5.1.json
curl -sS https://dsh.tvijo.com/api/dshrem/v1/health
curl -sS -o /dev/null -w '%{http_code}\n' https://dsh.tvijo.com/downloads/tvijo-dshrem-0.5.1.vsix
```

Copying a VSIX into `downloads/` is not a deployment by itself: the gateway
allowlist in `ai_os/dshrem_gateway/app.py` must list the exact filenames, and the
service must be restarted before `/download` serves them.

