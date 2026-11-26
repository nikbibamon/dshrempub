import copy
import json
from pathlib import Path
import tempfile
import unittest
from check_openvsx_manifest import validate, REQUIRED

class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'icon.png').write_bytes(b'\x89PNG\r\n\x1a\n')
        self.meta = dict(publisher='tvijo', name='tvijo-dshrem', version='0.10.29', engines={'vscode': '^1.90.0'}, repository={'type':'git', 'url':'https://github.com/nikbibamon/dshrempub'}, license='UNLICENSED', icon='icon.png', displayName='Tvijo', description='Coding tools')

    def test_valid_and_each_required_field_missing(self):
        self.assertEqual(validate(self.meta, self.root), [])
        for key in REQUIRED:
            with self.subTest(key=key):
                value = copy.deepcopy(self.meta)
                del value[key]
                self.assertTrue(any(e.startswith(key + ':') for e in validate(value, self.root)))

    def test_invalid_types_and_values(self):
        for key, value in [('publisher','bad id'), ('name',3), ('version','latest'), ('engines',{'node':'>=22'}), ('repository','file:///tmp/repo'), ('license',[]), ('displayName',' '), ('description',3), ('icon','../outside.png'), ('icon','/tmp/icon.png'), ('icon','missing.png')]:
            with self.subTest(key=key, value=value):
                self.assertTrue(any(e.startswith(key + ':') for e in validate({**self.meta,key:value}, self.root)))
        self.assertTrue(validate([],self.root))

    def test_actual_icon_and_localization_are_required(self):
        (self.root / 'icon.png').write_bytes(b'not a PNG')
        self.assertTrue(any(e.startswith('icon:') for e in validate(self.meta,self.root)))
        self.meta['displayName']='%name%'
        self.assertTrue(any(e.startswith('displayName:') for e in validate(self.meta,self.root)))
        (self.root / 'package.nls.json').write_text(json.dumps({'name':'Tvijo'}))
        self.assertFalse(any(e.startswith('displayName:') for e in validate(self.meta,self.root)))

    def test_repository_manifest_passes(self):
        root = Path(__file__).resolve().parents[1] / 'vscode'
        self.assertEqual(validate(json.loads((root / 'package.json').read_text()),root), [])

if __name__ == '__main__':
    unittest.main()
