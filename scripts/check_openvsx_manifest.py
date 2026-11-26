#!/usr/bin/env python3
"""Offline Open VSX required-field validation; no publication or token needed."""
import argparse
import json
from pathlib import Path
import re
from urllib.parse import urlparse

REQUIRED = ('publisher', 'name', 'version', 'engines', 'repository', 'license', 'icon', 'displayName', 'description')

def validate(meta, root):
    errors = []
    if not isinstance(meta, dict):
        return ['manifest must be an object']
    for key in REQUIRED:
        if key not in meta or not meta[key]:
            errors.append(key + ': required')
    for key in ('publisher', 'name'):
        if not isinstance(meta.get(key), str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]*', meta[key]):
            errors.append(key + ': invalid identifier')
    if not isinstance(meta.get('version'), str) or not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?', meta['version']):
        errors.append('version: expected semantic version')
    engines = meta.get('engines')
    if not isinstance(engines, dict) or not isinstance(engines.get('vscode'), str) or not re.fullmatch(r'[~^>=]*[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?', engines['vscode']):
        errors.append('engines: expected vscode version range')
    repository = meta.get('repository')
    url = repository.get('url') if isinstance(repository, dict) else repository
    if not isinstance(url, str) or urlparse(url).scheme not in ('https', 'git+https') or not urlparse(url).netloc:
        errors.append('repository: expected HTTPS repository URL')
    for key in ('license', 'displayName', 'description'):
        value = meta.get(key)
        if not isinstance(value, str) or not value.strip():
            errors.append(key + ': expected nonempty text')
        elif value.startswith('%') and value.endswith('%'):
            try:
                localized = json.loads((root / 'package.nls.json').read_text())[value[1:-1]]
                if not isinstance(localized, str) or not localized.strip():
                    raise ValueError('empty localization')
            except (OSError, ValueError, KeyError, TypeError):
                errors.append(key + ': unresolved localization')
    icon = meta.get('icon')
    if not isinstance(icon, str) or not icon or Path(icon).is_absolute() or '..' in Path(icon).parts or '\\' in icon:
        errors.append('icon: expected safe relative PNG path')
    else:
        target = root / icon
        try:
            if not target.resolve().is_relative_to(root.resolve()) or target.suffix.lower() != '.png' or not target.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'):
                raise ValueError('invalid icon')
        except (OSError, ValueError):
            errors.append('icon: missing or invalid PNG')
    return errors

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    args = parser.parse_args()
    try:
        errors = validate(json.loads(args.manifest.read_text()), args.manifest.parent)
    except (OSError, ValueError) as error:
        errors = [str(error)]
    print(json.dumps({'status': 'fail' if errors else 'pass', 'required_fields': REQUIRED, 'errors': errors}))
    return 1 if errors else 0

if __name__ == '__main__':
    raise SystemExit(main())
