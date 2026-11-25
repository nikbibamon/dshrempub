#!/usr/bin/env python3
"""Exercise the installed extension in native Tvijo Code on Linux (Python 3.11+, Playwright, X display).

Example: xvfb-run -a python3 scripts/smoke_installed_vsix.py --editor /path/to/code
         --vsix /path/to/package.vsix --sha256 <expected-digest> --evidence-dir /volume/qa
The run needs public gateway health access. It does not need a Tvijo account.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time
import zipfile

def isolated_paths(run, short, source_env):
    """Create owned storage. Use a short alias for paths used by Unix sockets."""
    for name in (
        'extensions', 'shared-data', 'workspace', 'tmp', 'runtime', 'xdg-config',
        'xdg-data', 'xdg-cache', 'xdg-state', 'profile/User',
    ):
        (run / name).mkdir(mode=0o700, parents=True)
    short.symlink_to(run, target_is_directory=True)
    env = {key: source_env[key] for key in (
        'HOME', 'PATH', 'DISPLAY', 'XAUTHORITY', 'LANG',
    ) if key in source_env}
    env.update(
        SHELL='/bin/sh',
        XDG_CONFIG_HOME=str(run / 'xdg-config'),
        XDG_DATA_HOME=str(run / 'xdg-data'),
        XDG_CACHE_HOME=str(run / 'xdg-cache'),
        XDG_STATE_HOME=str(run / 'xdg-state'),
        XDG_RUNTIME_DIR=str(short / 'runtime'),
        TMPDIR=str(short / 'tmp'),
    )
    return env


def editor_flags(short):
    flags = [
        '--user-data-dir', str(short / 'profile'),
        '--extensions-dir', str(short / 'extensions'),
        '--shared-data-dir', str(short / 'shared-data'),
    ]
    if os.geteuid() == 0:
        flags.append('--no-sandbox')
    return flags


def palette(page, title):
    from playwright.sync_api import expect

    page.keyboard.press('Control+Shift+p')
    widget = page.locator('.quick-input-widget:visible')
    widget.locator('input').fill('>' + title)
    first = widget.locator('.monaco-list-row').first
    expect(first).to_contain_text(title)
    page.keyboard.press('Enter')


def visible_in_webview(page, selector):
    from playwright.sync_api import Error as PlaywrightError

    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        for frame in page.frames:
            if frame == page.main_frame or frame.is_detached():
                continue
            control = frame.locator(selector).first
            try:
                if control.is_visible():
                    return control
            except PlaywrightError:
                if not frame.is_detached():
                    raise
        page.wait_for_timeout(150)
    raise RuntimeError(f'Editor webview did not display {selector}')


def exercise(page, run, version, commit):
    from playwright.sync_api import expect

    page.set_default_timeout(15000)
    page.locator('.monaco-workbench').wait_for()
    # Only this run's empty, locally created workspace is trusted via the normal UI.
    page.get_by_text('Manage', exact=True).click()
    page.get_by_role('button', name='Trust', exact=True).click()
    expect(page.get_by_text('You trust this folder', exact=True)).to_be_visible()

    palette(page, 'Tvijo: Check service connection')
    lines = page.locator('.monaco-editor .view-lines').filter(has_text='runtime_version').first
    expect(lines).to_contain_text(commit, timeout=25000)
    text = lines.inner_text().replace('\xa0', ' ')
    observed = dict(re.findall(r'"(runtime_version|gateway_version|build_commit)"\s*:\s*"([^"]+)"', text))
    if (observed.get('runtime_version'), observed.get('build_commit')) != (version, commit):
        raise RuntimeError(f'Editor loaded another package: {observed}')
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:[-+].+)?', observed.get('gateway_version', '')):
        raise RuntimeError('No gateway version in the service connection result')
    page.screenshot(path=run / 'connection.png')

    palette(page, 'Tvijo: Open learning guide')
    visible_in_webview(page, 'h1#title-start')
    palette(page, 'Tvijo: Open chat')
    composer = visible_in_webview(page, 'textarea#question')
    composer.fill('Tvijo local acceptance')
    expect(composer).to_have_value('Tvijo local acceptance')
    composer.fill('')
    page.screenshot(path=run / 'chat.png')
    return observed


def exercise_editor(editor, run, flags, env, version, commit):
    from playwright.sync_api import sync_playwright

    profile = run / 'profile'
    with (run / 'editor.log').open('x') as log:
        process = subprocess.Popen([
            editor, *flags, '--disable-layout-restore', '--use-inmemory-secretstorage',
            '--locale=en', '--disable-gpu', '--skip-welcome', '--skip-release-notes',
            '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', run / 'workspace',
        ], cwd=run, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            deadline = time.monotonic() + 35
            port_file = profile / 'DevToolsActivePort'
            while not port_file.is_file():
                if process.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError(f'Editor did not start; see {run / "editor.log"}')
                time.sleep(0.1)
            port = int(port_file.read_text().splitlines()[0])
            with sync_playwright() as playwright:
                browser = playwright.chromium.connect_over_cdp(f'http://127.0.0.1:{port}', timeout=20000)
                context = browser.contexts[0]
                page = next((p for p in context.pages if 'workbench' in p.url), None)
                if page is None:
                    page = context.pages[0] if context.pages else context.wait_for_event('page', timeout=20000)
                return exercise(page, run, version, commit)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--editor', type=Path, required=True, help='Linux desktop executable')
    parser.add_argument('--cli', type=Path, help='Matching editor CLI (default: bin/<editor name>)')
    parser.add_argument('--vsix', type=Path, required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--evidence-dir', type=Path, required=True, help='Parent for a new private run')
    args = parser.parse_args()

    archive = args.vsix.resolve(strict=True)
    with archive.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    if digest != args.sha256.lower():
        parser.error('VSIX SHA-256 differs from the supplied digest')
    with zipfile.ZipFile(archive) as package:
        meta = json.loads(package.read('extension/package.json'))
        build = json.loads(package.read('extension/BUILD_INFO.json'))
    version, commit = build['version'], build['commit']
    if (meta['publisher'], meta['name'], meta['version']) != ('tvijo', 'tvijo-dshrem', version):
        parser.error('VSIX identity or BUILD_INFO version mismatch')
    editor = args.editor.resolve(strict=True)
    cli = (args.cli or editor.parent / 'bin' / editor.name).resolve(strict=True)
    if cli != editor.parent / 'bin' / editor.name:
        parser.error('Use the CLI bundled with the native editor')
    # Fail before either entry point can fall back to product-wide shared storage.
    cli_bundle = editor.parent / 'resources/app/out/cli.js'
    if not cli_bundle.is_file() or b'--shared-data-dir' not in cli_bundle.read_bytes():
        parser.error('The native editor must support --shared-data-dir')
    run = Path(tempfile.mkdtemp(prefix='tvijo-native-', dir=args.evidence_dir.resolve(strict=True)))
    print(f'Evidence: {run}', flush=True)
    with tempfile.TemporaryDirectory(prefix='tvijo-ipc-', dir='/tmp') as ipc:
        short = Path(ipc) / 'run'
        env = isolated_paths(run, short, os.environ)
        flags = editor_flags(short)
        (run / 'profile/User/settings.json').write_text(json.dumps({
            'extensions.autoCheckUpdates': False, 'extensions.autoUpdate': False,
            'update.mode': 'none', 'telemetry.telemetryLevel': 'off',
        }))
        (run / 'isolation.json').write_text(json.dumps({
            'home_preserved': env.get('HOME') == os.environ.get('HOME'),
            'profile_flags': flags,
            'shared_data_dir': str(run / 'shared-data'),
            'scratch_dirs': {key: value for key, value in env.items()
                             if key.startswith('XDG_') or key == 'TMPDIR'},
        }, indent=2) + '\n')
        with (run / 'install.log').open('x') as log:
            subprocess.run([cli, *flags, '--install-extension', archive], cwd=run, env=env, stdout=log,
                           stderr=subprocess.STDOUT, check=True, timeout=90)
        observed = exercise_editor(editor, run, flags, env, version, commit)
    receipt = dict(observed_at=datetime.now(timezone.utc).isoformat(), sha256=digest, **observed,
                   guide_rendered=True, chat_composer_edited=True, chat_submitted=False)
    (run / 'activation.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
