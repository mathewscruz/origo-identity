"""Pure, fail-closed classification of SharePoint ownership observations.

A group owner is NOT a site collection administrator or a permission grant.
"""
from collections import Counter


def build_snapshot(sites: list[dict], groups: list[dict]) -> dict:
    if not groups:
        raise ValueError('Empty or incomplete Graph group inventory')
    existing = {s['site_id']: s for s in sites}
    if len(existing) != len(sites):
        raise ValueError('Duplicate IAM site IDs')
    matched: dict[str, dict] = {}
    group_ids = set()
    for group in groups:
        if group.get('site_http') != 200 or not group.get('site_id') or group.get('owners_complete') is not True:
            raise ValueError('Incomplete Graph site or owner response')
        site_id, group_id = group['site_id'], group['group_id']
        if site_id in matched or group_id in group_ids:
            raise ValueError('Duplicate Graph site or group ID')
        if len({o.get('id') for o in group['owners']}) != len(group['owners']) or any(not o.get('id') for o in group['owners']):
            raise ValueError('Duplicate or unidentified owner')
        matched[site_id] = group
        group_ids.add(group_id)
    rows = []
    for site_id in sorted(existing.keys() | matched.keys()):
        site, group = existing.get(site_id), matched.get(site_id)
        owners = group['owners'] if group else []
        rows.append({
            'site_id': site_id,
            'nome': (site or {}).get('nome') or (group.get('site_name') if group else None) or site_id,
            'url': (site or {}).get('url') or (group.get('site_url') if group else None),
            'status': ('group_owners' if owners else 'group_without_owner') if group else 'group_not_discovered',
            'group_id': group['group_id'] if group else None,
            'owners': owners,
        })
    count = Counter(row['status'] for row in rows)
    return {'sites': rows, 'counts': {
        'sites': len(rows), 'group_owners': count['group_owners'],
        'group_without_owner': count['group_without_owner'],
        'group_not_discovered': count['group_not_discovered'],
        'new_sites': len(matched.keys() - existing.keys()),
        'owners': sum(len(r['owners']) for r in rows),
    }}
