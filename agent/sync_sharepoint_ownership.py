#!/usr/bin/env python3
"""Read-only Graph collection; atomic IAM ownership-metadata reconciliation."""
import argparse
import asyncio
import datetime as dt
import json
import os
import pathlib
import subprocess
import sys
import uuid

sys.path.insert(0, '/usr/local/lib/hermes-agent')
from hermes_cli.config import load_config
from hermes_cli.mcp_config import _resolve_mcp_server_config
from tools.mcp_tool_discovery import _connect_server
from agent.sharepoint_group_graph import collect
from agent.sharepoint_ownership import build_snapshot

LOCK = '/root/origo_work/origo_operation_lock.py'
TOKEN_PATH = pathlib.Path('/root/.hermes/cache/scratch/sharepoint_ownership_runner.token')
ENV_PATH = pathlib.Path('/root/origo_work/origo-identity/.env')

def load_graph_environment():
    """Use the same Graph identity as the established RH SharePoint collector."""
    if not ENV_PATH.is_file():
        raise RuntimeError('Graph environment file missing')
    for line in ENV_PATH.read_text().splitlines():
        entry = line.strip()
        if entry and not entry.startswith('#') and '=' in entry:
            key, value = entry.split('=', 1)
            if key in ('AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'):
                os.environ.setdefault(key, value.strip().strip('"').strip("'"))
    if not all(os.environ.get(key) for key in ('AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET')):
        raise RuntimeError('Graph identity unavailable')

def lock(verb, token=None):
    args = [sys.executable, LOCK, verb, '--domain', 'iam', '--object', 'sharepoint-ownership-catalog']
    if verb == 'acquire': args += ['--profile', 'default', '--ttl', '3600']
    if token: args += ['--token=' + token]
    r = subprocess.run(args, text=True, capture_output=True, timeout=20)
    if r.returncode: raise RuntimeError('ownership lease operation failed')
    return json.loads(r.stdout)

def quote(value):
    return "'" + str(value).replace("'", "''") + "'"

async def query(srv, name, payload):
    r = await srv.session.call_tool(name, payload)
    if r.is_error: raise RuntimeError(f'{name} failed: {str(r.content)[:500]}')
    if name == 'run_admin_sql':
        return json.loads(r.content[0].text)
    return str(r.content[0].text)[:300]

async def run(dry_run=False):
    load_graph_environment()
    graph = collect()  # fails closed on any incomplete Graph page or site/owner response
    srv = await _connect_server('origo-iam-lovable', _resolve_mcp_server_config(load_config()['mcp_servers']['origo-iam-lovable']))
    try:
        sites = await query(srv, 'run_admin_sql', {'sql': 'SELECT site_id,nome,url FROM public.sharepoint_sites ORDER BY site_id'})
        if len(sites) < 900: raise RuntimeError('IAM site inventory unexpectedly small')
        snap = build_snapshot(sites, graph['rows'])
        rows = snap['sites']; counts = snap['counts']
        links = counts['group_owners'] + counts['group_without_owner']
        print(json.dumps({'collected_at':graph['collected_at_utc'],'group_count':graph['group_count'], **counts}, ensure_ascii=False), flush=True)
        if dry_run: return
        run_id = str(uuid.uuid4())
        for no, start in enumerate(range(0, len(rows), 50)):
            payload = quote(json.dumps(rows[start:start+50], ensure_ascii=False))
            sql = f"INSERT INTO public.sharepoint_ownership_batches(run_id,batch_no,payload) VALUES ('{run_id}'::uuid,{no},{payload}::jsonb)"
            await query(srv, 'apply_migration', {'sql':sql,'description':f'Stage SharePoint ownership metadata run {run_id} batch {no}; no access changes'})
        sql = (f"SELECT public.apply_sharepoint_ownership_snapshot('{run_id}'::uuid,{graph['group_count']},"
               f"{len(rows)},{links},{counts['owners']},{quote(graph['collected_at_utc'])}::timestamptz) result")
        applied = await query(srv, 'run_admin_sql', {'sql':sql})
        # Admin SELECT endpoint may reject non-SELECT write function; do not retry blindly.
        if applied != [{'result': {'sites':len(rows),'links':links,'owners':counts['owners']}}]:
            raise RuntimeError('snapshot response mismatch; inspect run id before retry')
        check = await query(srv,'run_admin_sql',{'sql':f"SELECT id,site_count,link_count,owner_count FROM public.sharepoint_ownership_sync_runs WHERE id='{run_id}'::uuid"})
        if check != [{'id':run_id,'site_count':len(rows),'link_count':links,'owner_count':counts['owners']}]:
            raise RuntimeError('sync run read-back mismatch')
        integrity = await query(srv, 'run_admin_sql', {'sql': (
            "SELECT (SELECT count(*) FROM public.sharepoint_site_ownership_coverage) AS sites, "
            "(SELECT count(*) FROM public.sharepoint_site_group_links WHERE active) AS links, "
            "(SELECT count(*) FROM public.sharepoint_site_group_owners WHERE active) AS owners, "
            "(SELECT count(*) FROM public.sharepoint_ownership_batches WHERE run_id='" + run_id + "'::uuid) AS pending_batches, "
            "(SELECT count(*) FROM public.sharepoint_site_group_links l WHERE active AND owner_count <> "
            "(SELECT count(*) FROM public.sharepoint_site_group_owners o WHERE o.site_db_id=l.site_db_id AND o.active)) AS mismatches"
        )})
        if integrity != [{'sites':len(rows),'links':links,'owners':counts['owners'],
                          'pending_batches':0,'mismatches':0}]:
            raise RuntimeError('metadata integrity read-back mismatch; inspect run before retry')
        print(json.dumps({'applied_run':run_id,'readback':check[0]},ensure_ascii=False),flush=True)
    finally:
        await srv.shutdown()

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--dry-run',action='store_true')
    parser.add_argument('--lease-held-by-operator',action='store_true',help='Only for an operator already holding the exact IAM lease')
    args=parser.parse_args()
    token=None
    if not args.lease_held_by_operator:
        if TOKEN_PATH.exists(): raise SystemExit('Existing lease token; inspect before retry')
        acquired=lock('acquire')
        if not acquired.get('ok') or not acquired.get('lease',{}).get('token'): raise SystemExit('Ownership lease busy')
        token=acquired['lease']['token']
        fd=os.open(TOKEN_PATH,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(fd,'w') as f: f.write(token)
    try:
        asyncio.run(run(args.dry_run))
    finally:
        if token:
            released=lock('release',token)
            if released.get('ok'): TOKEN_PATH.unlink()
            else: raise RuntimeError('Lease release failed; token retained')
