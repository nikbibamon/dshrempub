"""Release sequence gate: no GitHub jump over versions users already received."""
import unittest

from check_release_sequence import CATALOG, catalog_versions, missing_predecessors


class ReleaseSequenceTests(unittest.TestCase):
    catalog = {'0.10.23': '', '0.10.24': '', '0.10.25': '', '0.10.26': 'prepared',
               '0.10.27': 'prepared', '0.10.28': 'prepared'}

    def test_jump_25_to_28_is_refused(self):
        # The 2026-10-31 production defect, reproduced.
        self.assertEqual(missing_predecessors(self.catalog, {'0.10.23', '0.10.25'}, '0.10.28'),
                         ['0.10.26', '0.10.27'])

    def test_sequential_publication_passes(self):
        self.assertEqual(missing_predecessors(self.catalog, {'0.10.25', '0.10.26', '0.10.27'}, '0.10.28'), [])

    def test_withdrawn_version_is_an_explicit_skip(self):
        catalog = dict(self.catalog, **{'0.10.27': 'withdrawn'})
        self.assertEqual(missing_predecessors(catalog, {'0.10.25', '0.10.26'}, '0.10.28'), [])

    def test_history_below_newest_published_does_not_block(self):
        self.assertEqual(missing_predecessors(self.catalog, {'0.10.23', '0.10.27'}, '0.10.28'), [])

    def test_numeric_not_lexical_order(self):
        catalog = {'0.10.9': '', '0.10.10': '', '0.10.11': ''}
        self.assertEqual(missing_predecessors(catalog, {'0.10.9'}, '0.10.11'), ['0.10.10'])

    def test_real_catalog_is_readable(self):
        versions = catalog_versions(CATALOG)
        self.assertIn('0.10.28', versions)


if __name__ == '__main__':
    unittest.main()
