#!/usr/bin/env python3
"""Check public release facts and identical site catalog copies without modifying files.

Example: python3 scripts/check_extension_release.py --vsix build.vsix --copy site.json
Use --asset-dir to verify a prepared download directory before publication.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

CATALOG = Path(__file__).resolve().parents[1] / 'releases/tvijo-extension.json'
PUBLIC_FIELDS = {'schema', 'as_of', 'product', 'latest_version', 'channel', 'publication', 'package', 'links', 'features', 'releases', 'limits', 'verification'}


def check(catalog, vsix, copies=(), asset_dir=None):
    raw = Path(catalog).read_bytes()
    if len(raw) > 65536:
        raise ValueError('Catalog too large')
    data = json.loads(raw)
    if set(data) != PUBLIC_FIELDS or data['schema'] != 'tvijo.extension-release/v1':
        raise ValueError('Unexpected public catalog fields')
    if re.search(rb'/(?:root|mnt)(?:/|\b)|(?:sk-[A-Za-z0-9]{20,}|tvijo_pk_[A-Za-z0-9]{12,}|ghp_[A-Za-z0-9]{20,})', raw):
        raise ValueError('Private path or key pattern in public catalog')
    version = data['latest_version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Invalid version')
    if data['releases'][0]['version'] != version or len({r['version'] for r in data['releases']}) != len(data['releases']):
        raise ValueError('Release history does not identify a unique latest version')
    if data['publication']['status'] != 'prepared' or data['publication']['published_at'] is not None:
        raise ValueError('Publication needs a separately verified promotion; this checker accepts prepared previews only')
    if data['channel'] != 'preview':
        raise ValueError('Unexpected release channel')
    expected = data['package']
    if expected['filename'] != f'tvijo-dshrem-{version}.vsix':
        raise ValueError('Artifact filename/version mismatch')
    for name, url in data['links'].items():
        if not isinstance(url, str) or not url.startswith(('https://github.com/nikbibamon/dshrempub/', 'https://dsh.tvijo.com/download#vscode')) or '/..' in url:
            raise ValueError('Unexpected public link: ' + name)
    archive = Path(vsix).read_bytes()
    if len(archive) != expected['bytes'] or hashlib.sha256(archive).hexdigest() != expected['sha256']:
        raise ValueError('VSIX digest or size mismatch')
    with zipfile.ZipFile(vsix) as z:
        meta = json.loads(z.read('extension/package.json'))
        manifest = ET.fromstring(z.read('extension.vsixmanifest'))
        flags = manifest.find('.//{*}GalleryFlags')
        if meta['version'] != version or meta['engines']['vscode'] != expected['editor_requirement']:
            raise ValueError('VSIX version/editor requirement mismatch')
        if flags is None or flags.text != 'Public':
            raise ValueError('VSIX is not Public')
    for copy in copies:
        if Path(copy).read_bytes() != raw:
            raise ValueError('Catalog drift: ' + str(copy))
    if asset_dir:
        directory = Path(asset_dir)
        payload = (directory / expected['filename']).read_bytes()
        sums = json.loads((directory / f'SHA256SUMS-{version}.json').read_bytes())
        if payload != archive or sums != {expected['filename']: {'sha256': expected['sha256'], 'bytes': expected['bytes']}}:
            raise ValueError('Prepared download asset/checksum mismatch')
    return {'version': version, 'status': data['publication']['status'], 'sha256': expected['sha256'], 'bytes': expected['bytes'], 'catalog_copies': len(copies), 'prepared_assets_checked': bool(asset_dir)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', type=Path, default=CATALOG)
    parser.add_argument('--vsix', type=Path, required=True)
    parser.add_argument('--copy', type=Path, action='append', default=[])
    parser.add_argument('--asset-dir', type=Path)
    args = parser.parse_args()
    print(json.dumps(check(args.catalog, args.vsix, args.copy, args.asset_dir), sort_keys=True))


if __name__ == '__main__':
    main()
