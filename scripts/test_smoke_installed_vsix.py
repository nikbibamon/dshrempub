"""Exercise the native smoke helper's private paths without launching the editor."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from smoke_installed_vsix import editor_flags, isolated_paths


class IsolationTest(unittest.TestCase):
    def test_state_uses_fresh_profile_and_short_volume_alias(self):
        with (tempfile.TemporaryDirectory() as temporary,
              tempfile.TemporaryDirectory(prefix='ti-', dir='/tmp') as ipc):
            root = Path(temporary)
            run = root / ('long-' * 24)
            run.mkdir()
            short = Path(ipc) / 'r'
            env = isolated_paths(run, short, {
                'HOME': '/real-home',
                'PATH': '/usr/bin',
                'XDG_RUNTIME_DIR': '/other/runtime',
                'OPENAI_API_KEY': 'fixture',
            })
            self.assertEqual(env['HOME'], '/real-home')
            self.assertNotIn('OPENAI_API_KEY', env)
            self.assertLess(len(os.fsencode(env['XDG_RUNTIME_DIR'])) + 65, 107)
            for key, target in {
                'XDG_CONFIG_HOME': 'xdg-config',
                'XDG_DATA_HOME': 'xdg-data',
                'XDG_CACHE_HOME': 'xdg-cache',
                'XDG_STATE_HOME': 'xdg-state',
                'XDG_RUNTIME_DIR': 'runtime',
                'TMPDIR': 'tmp',
            }.items():
                self.assertEqual(Path(env[key]).resolve(), run / target)
                self.assertEqual((run / target).stat().st_mode & 0o777, 0o700)
            flags = editor_flags(short)
            paths = {flags[i]: Path(flags[i + 1]).resolve() for i in range(0, 6, 2)}
            self.assertEqual(paths, {
                '--user-data-dir': run / 'profile',
                '--extensions-dir': run / 'extensions',
                '--shared-data-dir': run / 'shared-data',
            })
            self.assertTrue(all(path.is_dir() for path in paths.values()))

    def test_root_only_sandbox_flag(self):
        with mock.patch('smoke_installed_vsix.os.geteuid', return_value=1000):
            self.assertNotIn('--no-sandbox', editor_flags(Path('/private')))
        with mock.patch('smoke_installed_vsix.os.geteuid', return_value=0):
            self.assertIn('--no-sandbox', editor_flags(Path('/private')))
