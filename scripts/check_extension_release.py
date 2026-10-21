#!/usr/bin/env python3
"""Check public release facts and identical site catalog copies without modifying files.

Example: python3 scripts/check_extension_release.py --vsix build.vsix --copy site.json
Use --asset-dir to verify a prepared download directory before publication.
"""
import argparse
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
import stat
import xml.etree.ElementTree as ET
import zipfile

CATALOG = Path(__file__).resolve().parents[1] / 'releases/tvijo-extension.json'
PUBLIC_FIELDS = {'schema', 'as_of', 'product', 'latest_version', 'channel', 'publication', 'package', 'links', 'features', 'releases', 'limits', 'verification'}
VSIX_NAMESPACE = 'http://schemas.microsoft.com/developer/vsx-schema/2011'


def check_archive(archive, version, editor_requirement):
    """Bind installer metadata and runtime to the exact bytes whose digest was checked."""
    with zipfile.ZipFile(BytesIO(archive)) as z:
        entries = {}
        for info in z.infolist():
            name = info.orig_filename
            parts = name.rstrip('/').split('/')
            if (name != info.filename or not name or name.startswith('/') or '\\' in name
                    or name != '/'.join(parts) + ('/' if info.is_dir() else '')
                    or any(part in ('', '.', '..') or ':' in part or part.endswith(('.', ' '))
                           or re.fullmatch(r'(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?', part, re.I)
                           for part in parts)
                    or any(ord(char) < 32 or ord(char) == 127 for char in name)):
                raise ValueError('Unsafe VSIX archive path')
            canonical = '/'.join(parts).casefold()
            if canonical in entries:
                raise ValueError('Duplicate or ambiguous VSIX archive path')
            mode = stat.S_IFMT(info.external_attr >> 16)
            if mode not in (0, stat.S_IFREG, stat.S_IFDIR) or (mode == stat.S_IFDIR and not info.is_dir()):
                raise ValueError('VSIX archive contains a non-regular entry')
            if info.flag_bits & 1:
                raise ValueError('Encrypted VSIX entry')
            entries[canonical] = info
        for name in entries:
            parts = name.split('/')
            if any('/'.join(parts[:index]) in entries and not entries['/'.join(parts[:index])].is_dir()
                   for index in range(1, len(parts))):
                raise ValueError('VSIX file conflicts with a directory')

        def read_file(name, maximum):
            info = entries.get(name.casefold())
            if info is None or info.filename != name or info.is_dir() or not 0 < info.file_size <= maximum:
                raise ValueError('Missing, empty or oversized VSIX file: ' + name)
            return z.read(info)

        meta = json.loads(read_file('extension/package.json', 1024 * 1024))
        if not isinstance(meta, dict) or meta.get('name') != 'tvijo-dshrem' or meta.get('publisher') != 'tvijo':
            raise ValueError('Unexpected VSIX extension identity')
        if (meta.get('version') != version or not isinstance(meta.get('engines'), dict)
                or meta['engines'].get('vscode') != editor_requirement):
            raise ValueError('VSIX version/editor requirement mismatch')
        if meta.get('main') != './extension.js':
            raise ValueError('Unexpected VSIX runtime entrypoint')
        read_file('extension/extension.js', 16 * 1024 * 1024)

        manifest = ET.fromstring(read_file('extension.vsixmanifest', 1024 * 1024))
        ns = {'v': VSIX_NAMESPACE}
        if manifest.tag != '{' + VSIX_NAMESPACE + '}PackageManifest':
            raise ValueError('Unexpected VSIX manifest schema')
        metadata = manifest.findall('v:Metadata', ns)
        if len(metadata) != 1:
            raise ValueError('Missing or duplicate VSIX metadata')
        identities = metadata[0].findall('v:Identity', ns)
        if (len(identities) != 1 or identities[0].get('Id') != meta['name']
                or identities[0].get('Publisher') != meta['publisher']
                or identities[0].get('Version') != version):
            raise ValueError('VSIX manifest identity/version mismatch')
        flags = metadata[0].findall('v:GalleryFlags', ns)
        if len(flags) != 1 or flags[0].text != 'Public':
            raise ValueError('VSIX is not Public')
        engines = metadata[0].findall("v:Properties/v:Property[@Id='Microsoft.VisualStudio.Code.Engine']", ns)
        if len(engines) != 1 or engines[0].get('Value') != editor_requirement:
            raise ValueError('VSIX manifest editor requirement mismatch')
        assets = manifest.findall("v:Assets/v:Asset[@Type='Microsoft.VisualStudio.Code.Manifest']", ns)
        if len(assets) != 1 or assets[0].get('Path') != 'extension/package.json':
            raise ValueError('VSIX manifest package asset mismatch')


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
    check_archive(archive, version, expected['editor_requirement'])
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
