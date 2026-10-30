import unittest
from agent.sharepoint_ownership import build_snapshot


class SharePointOwnershipTest(unittest.TestCase):
    def test_classifies_every_site_and_new_group_site(self):
        sites = [{'id': 'db-a', 'site_id': 'site-a', 'nome': 'A', 'url': 'https://example/sites/a'},
                 {'id': 'db-b', 'site_id': 'site-b', 'nome': 'B', 'url': 'https://example/sites/b'}]
        groups = [{'group_id': 'group-a', 'site_id': 'site-a', 'site_url': 'https://example/sites/a',
                   'site_name': 'A', 'owners': [{'id': 'owner-a', 'type': '#microsoft.graph.user', 'display_name': 'Owner'}],
                   'site_http': 200, 'owners_complete': True},
                  {'group_id': 'group-c', 'site_id': 'site-c', 'site_url': 'https://example/sites/c',
                   'site_name': 'C', 'owners': [], 'site_http': 200, 'owners_complete': True}]
        result = build_snapshot(sites, groups)
        self.assertEqual(result['counts'], {'sites': 3, 'group_owners': 1, 'group_without_owner': 1,
                                            'group_not_discovered': 1, 'new_sites': 1, 'owners': 1})
        self.assertEqual([x['site_id'] for x in result['sites']], ['site-a', 'site-b', 'site-c'])

    def test_incomplete_snapshot_never_reconciles(self):
        with self.assertRaises(ValueError):
            build_snapshot([], [{'group_id': 'g', 'site_http': 200, 'site_id': 's',
                                  'owners_complete': False, 'owners': []}])
        with self.assertRaises(ValueError):
            build_snapshot([], [{'group_id': 'g', 'site_http': 403}])

    def test_duplicate_site_and_owner_are_rejected(self):
        row = {'group_id': 'g', 'site_http': 200, 'site_id': 's', 'owners_complete': True,
               'owners': [{'id': 'u'}, {'id': 'u'}]}
        with self.assertRaises(ValueError):
            build_snapshot([], [row])
        row['owners'] = []
        with self.assertRaises(ValueError):
            build_snapshot([], [row, dict(row, group_id='h')])


if __name__ == '__main__':
    unittest.main()
