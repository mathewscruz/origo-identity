#!/usr/bin/env python3
"""Read-only Graph snapshot of M365-group-connected SharePoint sites and group owners."""
import concurrent.futures
import datetime
import os
import random
import time
import requests

BASE = 'https://graph.microsoft.com/v1.0'

def get(url, token):
    for attempt in range(5):
        try:
            r = requests.get(url, headers={'Authorization': 'Bearer ' + token}, timeout=35)
        except requests.RequestException as exc:
            if attempt == 4:
                return {'http': None, 'error': type(exc).__name__}
            time.sleep(min(2 ** attempt + random.random(), 16))
            continue
        if r.status_code in (429, 500, 502, 503, 504) and attempt < 4:
            try:
                delay = float(r.headers.get('Retry-After', 2 ** attempt))
            except ValueError:
                delay = 2 ** attempt
            time.sleep(min(delay, 30) + random.random())
            continue
        if not r.ok:
            try: code = r.json().get('error', {}).get('code')
            except ValueError: code = None
            return {'http': r.status_code, 'error': code or 'http_error'}
        return {'http': 200, 'data': r.json()}
    return {'http': None, 'error': 'retry_exhausted'}

def pages(url, token):
    rows = []
    while url:
        item = get(url, token)
        if item['http'] != 200:
            return rows, item
        d = item['data']
        rows.extend(d.get('value', []))
        url = d.get('@odata.nextLink')
    return rows, None

def probe(group, token):
    gid = group['id']
    site = get(f'{BASE}/groups/{gid}/sites/root?$select=id,webUrl,displayName', token)
    row = {'group_id': gid, 'group_name': group.get('displayName'), 'site_http': site['http']}
    if site['http'] != 200:
        row['site_error'] = site.get('error')
        return row
    data = site['data']
    row.update(site_id=data.get('id'), site_url=data.get('webUrl'), site_name=data.get('displayName'))
    owners, error = pages(f'{BASE}/groups/{gid}/owners?$select=id,displayName,userPrincipalName,mail&$top=100', token)
    row['owners_complete'] = error is None
    if error: row['owner_error'] = error
    row['owners'] = [dict(id=o.get('id'), type=o.get('@odata.type'), display_name=o.get('displayName'), upn=o.get('userPrincipalName'), mail=o.get('mail')) for o in owners]
    return row

def collect():
    auth = requests.post('https://login.microsoftonline.com/' + os.environ['AZURE_TENANT_ID'] + '/oauth2/v2.0/token', data={
        'client_id': os.environ['AZURE_CLIENT_ID'], 'client_secret': os.environ['AZURE_CLIENT_SECRET'],
        'grant_type': 'client_credentials', 'scope': 'https://graph.microsoft.com/.default'}, timeout=25)
    auth.raise_for_status()
    token = auth.json()['access_token']
    groups, error = pages(f'{BASE}/groups?$filter=groupTypes/any(c:c%20eq%20%27Unified%27)&$select=id,displayName,groupTypes&$top=999', token)
    if error: raise RuntimeError(f'group enumeration incomplete: {error}')
    if len(groups) < 900:
        raise RuntimeError('Graph returned implausibly few groups; refuse reconciliation')
    rows = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
        futures = [executor.submit(probe, g, token) for g in groups]
        for f in concurrent.futures.as_completed(futures): rows.append(f.result())
    rows.sort(key=lambda x: x['group_id'])
    if any(r['site_http'] != 200 or not r.get('owners_complete') for r in rows):
        from collections import Counter
        failures = Counter(str(r.get('site_http')) + ':' + str(r.get('site_error') or r.get('owner_error')) for r in rows if r['site_http'] != 200 or not r.get('owners_complete'))
        raise RuntimeError(f'Graph incomplete; do not modify IAM: {dict(failures)}')
    return {'collected_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'group_count': len(groups), 'rows': rows}
