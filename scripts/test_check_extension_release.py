"""Adversarial release checks; fixtures are retained under the test temp directory."""
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import stat
import tempfile
import unittest
import warnings
import xml.etree.ElementTree as ET
import zipfile

from check_extension_release import CATALOG, VSIX_NAMESPACE, check


class ReleaseCheckTests(unittest.TestCase):
    def setUp(self):
        self.directory = Path(tempfile.mkdtemp(prefix='tvijo-release-check-'))
        self.vsix = self.directory / 'candidate.vsix'
        self.catalog = self.directory / 'catalog.json'
        self.data = json.loads(CATALOG.read_bytes())
        # Archive fixtures exercise preparation, independently of the current
        # public catalog's already-published lifecycle state.
        self.data['publication'].update(status='prepared',published_at=None)
        self.version = self.data['latest_version']
        self.engine = self.data['package']['editor_requirement']
        self.meta = {'name': 'tvijo-dshrem', 'publisher': 'tvijo', 'version': self.version,
                     'engines': {'vscode': self.engine}, 'main': './extension.js'}
        self.manifest = ET.Element('PackageManifest', {'xmlns': VSIX_NAMESPACE})
        metadata = ET.SubElement(self.manifest, 'Metadata')
        ET.SubElement(metadata, 'Identity', {'Id': 'tvijo-dshrem', 'Publisher': 'tvijo', 'Version': self.version})
        ET.SubElement(metadata, 'GalleryFlags').text = 'Public'
        properties = ET.SubElement(metadata, 'Properties')
        ET.SubElement(properties, 'Property', {'Id': 'Microsoft.VisualStudio.Code.Engine', 'Value': self.engine})
        assets = ET.SubElement(self.manifest, 'Assets')
        ET.SubElement(assets, 'Asset', {'Type': 'Microsoft.VisualStudio.Code.Manifest', 'Path': 'extension/package.json'})

    def write_catalog(self):
        payload = self.vsix.read_bytes()
        self.data['package']['sha256'] = hashlib.sha256(payload).hexdigest()
        self.data['package']['bytes'] = len(payload)
        self.catalog.write_text(json.dumps(self.data))

    def prepare(self, extras=(), omit=(), runtime=b"'use strict';\n", replacements=None):
        files = {'extension/package.json': json.dumps(self.meta).encode(),
                 'extension.vsixmanifest': ET.tostring(self.manifest),
                 'extension/extension.js': runtime}
        files.update(replacements or {})
        # Every call owns a new archive; no previous test fixture is overwritten.
        self.vsix = self.directory / ('candidate-' + str(len(list(self.directory.iterdir()))) + '.vsix')
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)  # Deliberately repeated ZIP entries.
            with zipfile.ZipFile(self.vsix, 'x') as archive:
                for name, contents in files.items():
                    if name not in omit:
                        archive.writestr(name, contents)
                for name, contents in extras:
                    archive.writestr(name, contents)
        self.catalog = self.vsix.with_suffix('.json')
        self.write_catalog()

    def assert_rejected(self, message=None):
        with self.assertRaises(ValueError) as result:
            check(self.catalog, self.vsix)
        if message:
            self.assertIn(message, str(result.exception))

    def test_valid_candidate_copies_and_prepared_assets(self):
        self.prepare()
        copy = self.directory / 'copy.json'
        copy.write_bytes(self.catalog.read_bytes())
        assets = self.directory / 'assets'
        assets.mkdir()
        filename = self.data['package']['filename']
        (assets / filename).write_bytes(self.vsix.read_bytes())
        (assets / ('SHA256SUMS-' + self.version + '.json')).write_text(json.dumps({filename: {
            'sha256': self.data['package']['sha256'], 'bytes': self.data['package']['bytes']}}))
        result = check(self.catalog, self.vsix, copies=[copy], asset_dir=assets)
        self.assertEqual(result['version'], self.version)
        self.assertEqual(result['catalog_copies'], 1)
        self.assertTrue(result['prepared_assets_checked'])

    def test_current_repository_packager_remains_accepted(self):
        script = Path(__file__).with_name('package_vsix.py')
        spec = importlib.util.spec_from_file_location('release_test_packager', script)
        packager = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(packager)
        self.vsix = self.directory / 'real-packager.vsix'
        packager.build(CATALOG.parents[1], self.vsix)
        self.write_catalog()
        self.assertEqual(check(self.catalog, self.vsix)['version'], self.version)

    def test_wrong_package_identity_is_rejected_even_if_manifest_agrees(self):
        for field, value, attribute in [('name', 'other-extension', 'Id'), ('publisher', 'other-publisher', 'Publisher')]:
            with self.subTest(field=field):
                self.meta[field] = value
                self.manifest.find('Metadata/Identity').set(attribute, value)
                self.prepare()
                self.assert_rejected('identity')
                self.meta[field] = 'tvijo-dshrem' if field == 'name' else 'tvijo'
                self.manifest.find('Metadata/Identity').set(attribute, self.meta[field])

    def test_manifest_identity_and_version_must_match(self):
        identity = self.manifest.find('Metadata/Identity')
        original = deepcopy(identity.attrib)
        for attribute, value in [('Id', 'other'), ('Publisher', 'other'), ('Version', '99.0.0')]:
            with self.subTest(attribute=attribute):
                identity.attrib = {**original, attribute: value}
                self.prepare()
                self.assert_rejected('identity/version')

    def test_package_version_and_engine_must_match_catalog(self):
        for field, value in [('version', '99.0.0'), ('engines', {'vscode': '^99.0.0'}), ('engines', None)]:
            with self.subTest(field=field, value=value):
                original = self.meta[field]
                self.meta[field] = value
                self.prepare()
                self.assert_rejected('version/editor')
                self.meta[field] = original

    def test_manifest_engine_must_exist_once_and_match(self):
        properties = self.manifest.find('Metadata/Properties')
        engine = properties.find('Property')
        engine.set('Value', '^99.0.0')
        self.prepare()
        self.assert_rejected('editor requirement')
        engine.set('Value', self.engine)
        properties.append(deepcopy(engine))
        self.prepare()
        self.assert_rejected('editor requirement')
        properties.clear()
        self.prepare()
        self.assert_rejected('editor requirement')

    def test_runtime_entrypoint_cannot_be_missing_empty_or_redirected(self):
        self.prepare(omit=['extension/extension.js'])
        self.assert_rejected('extension.js')
        self.prepare(runtime=b'')
        self.assert_rejected('extension.js')
        for main in ['./other.js', '../outside.js', 'extension.js', None]:
            with self.subTest(main=main):
                self.meta['main'] = main
                self.prepare(extras=[('extension/other.js', b'other')])
                self.assert_rejected('entrypoint')

    def test_required_metadata_files_cannot_be_missing_or_case_aliases(self):
        for name in ['extension/package.json', 'extension.vsixmanifest']:
            with self.subTest(name=name):
                self.prepare(omit=[name])
                self.assert_rejected('Missing')
        self.prepare(omit=['extension/extension.js'], extras=[('extension/EXTENSION.js', b'other')])
        self.assert_rejected('Missing')

    def test_duplicate_and_case_colliding_archive_entries_are_rejected(self):
        for name in ['extension/package.json', 'extension/PACKAGE.json', 'extension', 'extension/']:
            with self.subTest(name=name):
                extras = [(name, b'other')]
                if name in ('extension', 'extension/'):
                    extras = [('extension', b'file'), ('extension/', b'')]
                self.prepare(extras=extras)
                self.assert_rejected('Duplicate or ambiguous')

    def test_archive_paths_cannot_escape_or_change_under_normalization(self):
        for name in ['../outside', '/absolute', 'extension/../outside', 'extension/./other',
                     'extension//other', 'C:/outside', 'extension/alternate:stream',
                     'extension\\other', 'extension/control\nname', 'extension//',
                     'extension/name.', 'extension/name ', 'extension/CON', 'extension/NUL.txt']:
            with self.subTest(name=name):
                self.prepare(extras=[(name, b'other')])
                self.assert_rejected('Unsafe')

    def test_file_and_directory_conflict_is_rejected(self):
        self.prepare(extras=[('extension/lib', b'file'), ('extension/lib/tools.js', b'code')])
        self.assert_rejected('conflicts with a directory')

    def test_symlink_and_special_entries_are_rejected(self):
        for file_type in [stat.S_IFLNK, stat.S_IFIFO, stat.S_IFSOCK]:
            with self.subTest(file_type=file_type):
                info = zipfile.ZipInfo('extension/link')
                info.create_system = 3
                info.external_attr = (file_type | 0o777) << 16
                self.prepare(extras=[(info, b'target')])
                self.assert_rejected('non-regular')

    def test_manifest_package_asset_cannot_redirect_or_duplicate(self):
        assets = self.manifest.find('Assets')
        asset = assets.find('Asset')
        asset.set('Path', 'extension/other.json')
        self.prepare()
        self.assert_rejected('package asset')
        asset.set('Path', 'extension/package.json')
        assets.append(deepcopy(asset))
        self.prepare()
        self.assert_rejected('package asset')

    def test_manifest_identity_and_public_flag_cannot_be_ambiguous(self):
        metadata = self.manifest.find('Metadata')
        for tag in ['Identity', 'GalleryFlags']:
            with self.subTest(tag=tag):
                duplicate = deepcopy(metadata.find(tag))
                metadata.append(duplicate)
                self.prepare()
                self.assert_rejected()
                metadata.remove(duplicate)
        metadata.find('GalleryFlags').text = 'Private'
        self.prepare()
        self.assert_rejected('not Public')

    def test_wrong_manifest_schema_is_rejected(self):
        self.manifest.set('xmlns', 'https://example.invalid/schema')
        self.prepare()
        self.assert_rejected('schema')

    def test_digest_check_still_precedes_archive_validation(self):
        self.prepare()
        self.data['package']['sha256'] = '0' * 64
        self.catalog.write_text(json.dumps(self.data))
        self.assert_rejected('digest or size')

    def test_published_catalog_cannot_bypass_preparation_check(self):
        self.prepare()
        self.data['publication'].update(status='published',published_at='2026-10-23')
        self.write_catalog()
        self.assert_rejected('separately verified promotion')


if __name__ == '__main__':
    unittest.main()
