#!/usr/bin/env python3
"""Refuse a GitHub release while an earlier catalog version is still unreleased.

The catalog lists every version users may have received (operator-test builds
included). 2026-10-31 GitHub jumped 0.10.25 -> 0.10.28 while 0.10.26 had already
been handed to users: they could not find the version they were running.
A version that will never ship needs an explicit `"status": "withdrawn"`
catalog entry; silence is not a skip.

Example: python3 scripts/check_release_sequence.py --version 0.10.29
Offline: python3 scripts/check_release_sequence.py --version 0.10.29 --published 0.10.27,0.10.28
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys

CATALOG = Path(__file__).resolve().parents[1] / 'releases/tvijo-extension.json'
REPO = 'nikbibamon/dshrempub'
TAG_PREFIX = 'tvijo-v'


def parse(version):
    return tuple(int(part) for part in version.split('.'))


def missing_predecessors(catalog_versions, published, version):
    """Catalog versions between the newest published predecessor and `version`.

    `catalog_versions` maps version -> status; `withdrawn` entries are skipped
    on purpose. Versions below the newest published predecessor are history
    and do not block.
    """
    target = parse(version)
    below = sorted((v for v in catalog_versions if parse(v) < target), key=parse)
    floor = max((parse(v) for v in published if parse(v) < target), default=None)
    return [v for v in below
            if (floor is None or parse(v) > floor)
            and v not in published
            and catalog_versions[v] != 'withdrawn']


def catalog_versions(path):
    data = json.loads(Path(path).read_bytes())
    return {entry['version']: entry.get('status', '') for entry in data['releases']}


def github_published(repo):
    """Non-draft GitHub releases; a draft is invisible to users, so it does not count."""
    out = subprocess.check_output(
        ['gh', 'release', 'list', '-R', repo, '-L', '1000', '--json', 'tagName,isDraft'], text=True)
    return {r['tagName'][len(TAG_PREFIX):] for r in json.loads(out)
            if r['tagName'].startswith(TAG_PREFIX) and not r['isDraft']}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--version', required=True)
    parser.add_argument('--catalog', type=Path, default=CATALOG)
    parser.add_argument('--repo', default=REPO)
    parser.add_argument('--published', help='comma-separated versions instead of asking GitHub')
    args = parser.parse_args()
    published = set(filter(None, args.published.split(','))) if args.published is not None else github_published(args.repo)
    published.discard(args.version)  # re-running on an existing tag is not a gap
    missing = missing_predecessors(catalog_versions(args.catalog), published, args.version)
    print(json.dumps({'version': args.version, 'missing_on_github': missing}))
    if missing:
        print('Publish ' + ', '.join(missing) + ' first (in order), or mark them '
              '"status": "withdrawn" in releases/tvijo-extension.json.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
