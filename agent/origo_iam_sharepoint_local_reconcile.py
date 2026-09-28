#!/usr/bin/env python3
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import fcntl
import gzip
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import re
import sys
import unicodedata
from typing import Any

import requests

DAILY_MODULE = pathlib.Path('/root/.hermes/scripts/origo_iam_sharepoint_daily_sync.py')
ROOT = pathlib.Path('/root/origo_work/iam_sharepoint_local')
RUNS = ROOT / 'runs'
SNAPSHOTS = ROOT / 'snapshots'
LATEST = ROOT / 'latest.json'
STATE = ROOT / 'state.json'
LOCK = pathlib.Path('/run/lock/origo-iam-sharepoint-local-reconcile.lock')
RETENTION_DAYS = 45

HEADER_ALIASES = {
    'displayname': 'displayName', 'cn': 'cn', 'company': 'company',
    'description': 'description', 'employid': 'employID', 'employeeid': 'employID',
    'departmentnumber': 'departmentNumber', 'givenname': 'givenName', 'mail': 'mail',
    'manager': 'manager', 'name': 'name', 'physicaldeliveryofficename': 'physicalDeliveryOfficeName',
    'samaccountname': 'sAMAccountName', 'sn': 'sn', 'title': 'title', 'status': 'status',
    'cadastropessoafisica': 'Cadastro_Pessoa_Fisica', 'datanascimento': 'Data_Nascimento',
    'dataadmissao': 'Data_Admissao', 'bairro': 'bairro', 'cep': 'cep', 'cidade': 'cidade',
    'complemento': 'complemento', 'estado': 'estado', 'numeroendereco': 'numero_endereco',
    'rua': 'rua', 'baselocal': 'Base_Local', 'datarescisao': 'Data_Rescisao',
}
REQUIRED = {'displayName', 'employID', 'mail', 'company', 'title', 'status', 'Data_Admissao', 'Cadastro_Pessoa_Fisica', 'Base_Local'}
STATUS_MAP = {
    'ativo': 'ativo', 'demitido': 'desligado', 'desligado': 'desligado',
    'afastado': 'afastado', 'ferias': 'ferias', 'inativo': 'inativo',
    'suspenso': 'afastado', 'licenca': 'afastado', 'aposentado': 'desligado',
    'transferido': 'ativo', 'afast aux doenca': 'afastado',
    'afast aux maternidade': 'afastado', 'atestado medico': 'afastado',
    'licenca maternidade': 'afastado',
}
ACTIVE_STATUSES = {'ativo', 'ferias', 'afastado'}


def load_daily():
    spec = importlib.util.spec_from_file_location('origo_iam_sharepoint_daily_sync', DAILY_MODULE)
    if not spec or not spec.loader:
        raise RuntimeError('daily_module_unavailable')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def compact(value: Any) -> str:
    text = unicodedata.normalize('NFD', str(value or '').lower())
    return re.sub(r'[^a-z0-9]', '', text.encode('ascii', 'ignore').decode())


def norm_text(value: Any) -> str:
    text = unicodedata.normalize('NFD', str(value or '').strip().lower())
    return re.sub(r'\s+', ' ', text.encode('ascii', 'ignore').decode())


def norm_cpf(value: Any) -> str:
    return re.sub(r'\D', '', str(value or ''))


def norm_mail(value: Any) -> str:
    return str(value or '').strip().lower()


def norm_status(value: Any) -> str:
    return STATUS_MAP.get(norm_text(value), 'ativo')


def parse_date(value: Any) -> str | None:
    value = str(value or '').strip()
    if not value or value.upper() == 'NULL':
        return None
    for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%Y-%m-%dT%H:%M:%S'):
        try:
            return dt.datetime.strptime(value[:19] if 'T' in fmt else value[:10], fmt).date().isoformat()
        except ValueError:
            pass
    return None


def decode_csv(raw: bytes) -> tuple[str, str]:
    for encoding in ('utf-8-sig', 'cp1252', 'latin-1'):
        try:
            return raw.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    raise RuntimeError('rh_csv_encoding_unsupported')


def detect_delimiter(text: str) -> str:
    first = next((line for line in text.splitlines() if line.strip()), '')
    if not first:
        raise RuntimeError('rh_csv_empty')
    return ';' if first.count(';') > first.count(',') else ','


def parse_rows(raw: bytes) -> tuple[list[dict[str, str]], list[dict[str, Any]], dict[str, Any]]:
    text, encoding = decode_csv(raw)
    delimiter = detect_delimiter(text)
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    raw_headers = [str(h or '').strip() for h in (reader.fieldnames or [])]
    canonical_headers = {h: HEADER_ALIASES.get(compact(h), h) for h in raw_headers}
    present = set(canonical_headers.values())
    missing = sorted(REQUIRED - present)
    if missing:
        raise RuntimeError('rh_required_headers_missing:' + ','.join(missing))

    valid: list[dict[str, str]] = []
    quarantine: list[dict[str, Any]] = []
    for line_no, source in enumerate(reader, start=2):
        row: dict[str, str] = {}
        for old, value in source.items():
            if old is None:
                continue
            row[canonical_headers.get(old, old)] = str(value or '').strip()
        row['__linha'] = str(line_no)
        if not row.get('employID'):
            quarantine.append({'line': line_no, 'reason': 'sem_matricula'})
            continue
        if not row.get('displayName'):
            quarantine.append({'line': line_no, 'reason': 'sem_nome', 'matricula': row.get('employID')})
            continue
        valid.append(row)
    return valid, quarantine, {
        'encoding': encoding,
        'delimiter': delimiter,
        'raw_headers': raw_headers,
        'canonical_headers': canonical_headers,
    }


def is_active_row(row: dict[str, str]) -> bool:
    return norm_status(row.get('status')) in ACTIVE_STATUSES


def dedupe_key(row: dict[str, str]) -> str:
    cpf = norm_cpf(row.get('Cadastro_Pessoa_Fisica'))
    if cpf:
        return 'cpf:' + cpf
    mail = norm_mail(row.get('mail'))
    if mail:
        return 'mail:' + mail
    return 'mat:' + str(row.get('employID') or '').strip()


def canonical_choice(rows: list[dict[str, str]]) -> dict[str, str]:
    def rank(row: dict[str, str]) -> tuple[int, str, str, int]:
        return (
            1 if is_active_row(row) else 0,
            parse_date(row.get('Data_Admissao')) or '',
            parse_date(row.get('Data_Rescisao')) or '',
            -int(row.get('__linha') or 0),
        )
    return max(rows, key=rank)


def dedupe(rows: list[dict[str, str]]) -> tuple[list[dict[str, str]], list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, str]]] = collections.defaultdict(list)
    for row in rows:
        grouped[dedupe_key(row)].append(row)
    canonical: list[dict[str, str]] = []
    removed: list[dict[str, Any]] = []
    seen_matriculas: set[str] = set()
    for key, group in grouped.items():
        keep = canonical_choice(group)
        for row in group:
            if row is not keep:
                removed.append({'line': int(row['__linha']), 'reason': 'duplicado_no_csv', 'key_type': key.split(':', 1)[0], 'kept_matricula': keep.get('employID')})
        mat = str(keep.get('employID') or '').strip()
        if mat in seen_matriculas:
            removed.append({'line': int(keep['__linha']), 'reason': 'matricula_duplicada', 'kept_matricula': mat})
            continue
        seen_matriculas.add(mat)
        canonical.append(keep)
    return canonical, removed


def get_all(base: str, table: str, select: str, headers: dict[str, str], order: str = 'id.asc') -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for offset in range(0, 50000, 1000):
        response = requests.get(
            f'{base}/rest/v1/{table}', headers=headers,
            params={'select': select, 'order': order, 'limit': '1000', 'offset': str(offset)}, timeout=120,
        )
        response.raise_for_status()
        part = response.json()
        output.extend(part)
        if len(part) < 1000:
            return output
    raise RuntimeError('rest_pagination_limit:' + table)


def index_unique(rows: list[dict[str, Any]], key_fn) -> tuple[dict[str, dict[str, Any]], set[str]]:
    temp: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    for row in rows:
        key = key_fn(row)
        if key:
            temp[key].append(row)
    return ({k: v[0] for k, v in temp.items() if len(v) == 1}, {k for k, v in temp.items() if len(v) > 1})


def lookup_maps(daily, headers: dict[str, str]) -> dict[str, dict[str, str]]:
    maps: dict[str, dict[str, str]] = {}
    for table in ('empresas', 'cargos', 'areas', 'localidades'):
        rows = get_all(daily.BASE, table, 'id,nome', headers)
        maps[table] = {str(row['id']): str(row.get('nome') or '') for row in rows}
    return maps


def legacy_import_hash(row: dict[str, str]) -> str:
    # Compatibilidade com o importador publicado: o sidecar histórico só
    # normalizava os cabeçalhos obrigatórios. Campos snake_case não obrigatórios
    # (department_number, data_rescisao, sam_account_name) não participavam do
    # fingerprint. Preservar esse baseline evita milhares de updates artificiais
    # no primeiro corte; esses atributos serão saneados em lote auditado separado.
    values = [
        row.get('displayName'), row.get('mail'), str(row.get('status') or 'ativo').lower(),
        row.get('company'), row.get('description') or row.get('title'), '',
        row.get('Base_Local'), row.get('Cadastro_Pessoa_Fisica'), row.get('Data_Admissao'), '',
    ]
    return '|'.join(str(v or '') for v in values).lower()


def proposed(row: dict[str, str], existing: dict[str, Any] | None, lookups: dict[str, dict[str, str]]) -> dict[str, Any]:
    csv_mail = norm_mail(row.get('mail'))
    current_email = norm_mail(existing.get('email')) if existing else ''
    email = csv_mail if csv_mail.endswith('@origoenergia.com.br') else current_email or csv_mail or None
    sam = str(row.get('sAMAccountName') or '').strip() or (str(existing.get('sam_account_name') or '').strip() if existing else '') or (email.split('@')[0] if email and '@' in email else None)
    return {
        'nome': row.get('displayName') or None,
        'email': email,
        'matricula': str(row.get('employID') or '').strip(),
        'cpf': norm_cpf(row.get('Cadastro_Pessoa_Fisica')) or None,
        'empresa_nome': str(row.get('company') or '').strip() or None,
        'cargo_nome': str(row.get('description') or row.get('title') or '').strip() or None,
        'area_nome': str(row.get('departmentNumber') or '').strip() or None,
        'localidade_nome': str(row.get('Base_Local') or '').strip() or None,
        'status': norm_status(row.get('status')),
        'data_admissao': parse_date(row.get('Data_Admissao')),
        'data_desligamento': parse_date(row.get('Data_Rescisao')),
        'sam_account_name': sam,
    }


def comparable_existing(row: dict[str, Any], lookups: dict[str, dict[str, str]]) -> dict[str, Any]:
    return {
        'nome': row.get('nome'), 'email': norm_mail(row.get('email')) or None,
        'matricula': str(row.get('matricula') or '').strip(), 'cpf': norm_cpf(row.get('cpf')) or None,
        'empresa_nome': lookups['empresas'].get(str(row.get('empresa_id'))),
        'cargo_nome': lookups['cargos'].get(str(row.get('cargo_id'))),
        'area_nome': lookups['areas'].get(str(row.get('area_id'))),
        'localidade_nome': lookups['localidades'].get(str(row.get('localidade_id'))),
        'status': norm_status(row.get('status')), 'data_admissao': parse_date(row.get('data_admissao')),
        'data_desligamento': parse_date(row.get('data_desligamento')),
        'sam_account_name': str(row.get('sam_account_name') or '').strip() or None,
    }


def diff_fields(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    fields = []
    for key in after:
        left, right = before.get(key), after.get(key)
        if key.endswith('_nome') or key == 'nome':
            equal = norm_text(left) == norm_text(right)
        elif key in {'email', 'sam_account_name'}:
            equal = norm_mail(left) == norm_mail(right)
        else:
            equal = left == right
        if not equal:
            fields.append(key)
    return fields


def clean_old() -> None:
    cutoff = dt.datetime.now(dt.timezone.utc).timestamp() - RETENTION_DAYS * 86400
    for root in (RUNS, SNAPSHOTS):
        if not root.exists():
            continue
        for child in root.iterdir():
            if child.stat().st_mtime < cutoff:
                if child.is_dir():
                    import shutil
                    shutil.rmtree(child)
                else:
                    child.unlink()


def safe_write(path: pathlib.Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    tmp.chmod(0o600)
    os.replace(tmp, path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=('shadow', 'apply'), default='shadow')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    if args.mode == 'apply':
        raise RuntimeError('apply_blocked_until_schema_migrations_and_backup_are_verified')

    os.umask(0o077)
    ROOT.mkdir(parents=True, exist_ok=True)
    RUNS.mkdir(parents=True, exist_ok=True)
    SNAPSHOTS.mkdir(parents=True, exist_ok=True)
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    with LOCK.open('w') as lock_handle:
        try:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 0

        started = dt.datetime.now(dt.timezone.utc)
        stamp = started.strftime('%Y%m%dT%H%M%SZ')
        daily = load_daily()
        daily.load_env()
        token = daily.get_token()
        apikey = daily.get_apikey()
        headers = {'apikey': apikey, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
        gtoken = daily.graph_token()
        latest, raw, _site_id = daily.graph_latest_raw_csv(gtoken)
        source_hash = hashlib.sha256(raw).hexdigest()

        previous = json.loads(STATE.read_text()) if STATE.exists() else {}
        if not args.force and previous.get('source_sha256') == source_hash and previous.get('last_shadow_ok') is True:
            result = {
                'ok': True, 'mode': 'shadow', 'action': 'already_validated',
                'checked_at': started.isoformat(), 'source_filename': latest.get('name'),
                'source_modified': latest.get('lastModifiedDateTime'), 'source_sha256': source_hash,
                'previous_run': previous.get('last_run'),
            }
            safe_write(LATEST, result)
            print(json.dumps(result, ensure_ascii=False))
            return 0

        parsed, invalid, csv_meta = parse_rows(raw)
        canonical, duplicate_rows = dedupe(parsed)
        quarantine = invalid + duplicate_rows

        colabs = get_all(daily.BASE, 'colaboradores', '*', headers)
        lookups = lookup_maps(daily, headers)
        exceptions = get_all(daily.BASE, 'excecoes', 'colaborador_id,tipo_excecao,status,validade', headers)
        today = started.date().isoformat()
        protected_ids = {
            str(e.get('colaborador_id')) for e in exceptions
            if e.get('colaborador_id') and e.get('tipo_excecao') in {'manter_ativo', 'status_manual'}
            and e.get('status') == 'aprovada' and str(e.get('validade') or '9999-12-31') >= today
        }

        by_mat, amb_mat = index_unique(colabs, lambda c: str(c.get('matricula') or '').strip())
        by_cpf, amb_cpf = index_unique(colabs, lambda c: norm_cpf(c.get('cpf')))
        by_mail, amb_mail = index_unique(colabs, lambda c: norm_mail(c.get('email')))
        by_sam, amb_sam = index_unique(colabs, lambda c: norm_mail(c.get('sam_account_name')))

        manifest: list[dict[str, Any]] = []
        claimed: set[str] = set()
        counts: collections.Counter[str] = collections.Counter()
        for row in canonical:
            mat, cpf, mail = str(row.get('employID') or '').strip(), norm_cpf(row.get('Cadastro_Pessoa_Fisica')), norm_mail(row.get('mail'))
            sam = norm_mail(row.get('sAMAccountName'))
            candidates: list[tuple[str, dict[str, Any]]] = []
            for method, key, index, ambiguous in (
                ('matricula', mat, by_mat, amb_mat), ('cpf', cpf, by_cpf, amb_cpf),
                ('email', mail, by_mail, amb_mail), ('sam', sam, by_sam, amb_sam),
            ):
                if key and key not in ambiguous and key in index:
                    candidates.append((method, index[key]))
            unique_ids = {str(c['id']) for _, c in candidates}
            if len(unique_ids) > 1:
                counts['ambiguous_identity'] += 1
                quarantine.append({'line': int(row['__linha']), 'reason': 'identidade_ambigua', 'matricula': mat})
                continue
            existing = candidates[0][1] if candidates else None
            match_method = candidates[0][0] if candidates else None
            if existing and str(existing['id']) in claimed:
                counts['identity_already_claimed'] += 1
                quarantine.append({'line': int(row['__linha']), 'reason': 'identidade_ja_reivindicada', 'matricula': mat})
                continue
            if existing:
                claimed.add(str(existing['id']))
            after = proposed(row, existing, lookups)
            if not existing:
                action = 'create_candidate' if after['status'] in ACTIVE_STATUSES else 'historical_only'
                fields = sorted(k for k, v in after.items() if v not in (None, ''))
            else:
                before = comparable_existing(existing, lookups)
                # Primeiro corte: o fingerprint já persistido é a referência de
                # idempotência. Atributos antes ignorados permanecem observações,
                # não mutações implícitas.
                if str(existing.get('import_hash') or '') == legacy_import_hash(row):
                    fields = []
                else:
                    fields = diff_fields(before, after)
                    fields = [f for f in fields if f not in {'area_nome', 'data_desligamento', 'sam_account_name'}]
                action = 'unchanged' if not fields else 'update_candidate'
                if 'status' in fields and str(existing['id']) in protected_ids:
                    fields.remove('status')
                    counts['status_preserved_by_exception'] += 1
                    action = 'unchanged' if not fields else 'update_candidate'
            counts[action] += 1
            if existing and match_method == 'cpf' and mat != str(existing.get('matricula') or '').strip():
                counts['rehire_candidate'] += 1
            manifest.append({
                'line': int(row['__linha']), 'action': action, 'match': match_method,
                'colaborador_id': str(existing['id']) if existing else None,
                'matricula': mat, 'status_source': after['status'], 'changed_fields': fields,
                'explicit_leaver': after['status'] in {'desligado', 'inativo'},
            })

        absent = [
            {'colaborador_id': str(c['id']), 'matricula': c.get('matricula'), 'status': c.get('status')}
            for c in colabs if c.get('origem') == 'csv' and str(c['id']) not in claimed and norm_status(c.get('status')) in ACTIVE_STATUSES
        ]
        counts['absent_in_source_informational_only'] = len(absent)

        snapshot_dir = SNAPSHOTS / stamp
        snapshot_dir.mkdir(parents=True, exist_ok=False)
        raw_path = snapshot_dir / 'source.csv.gz'
        with gzip.open(raw_path, 'wb') as handle:
            handle.write(raw)
        raw_path.chmod(0o600)
        iam_path = snapshot_dir / 'iam_before.json.gz'
        with gzip.open(iam_path, 'wt', encoding='utf-8') as handle:
            json.dump({'captured_at': started.isoformat(), 'colaboradores': colabs}, handle, ensure_ascii=False, separators=(',', ':'))
        iam_path.chmod(0o600)

        report = {
            'ok': True, 'mode': 'shadow', 'action': 'validated', 'started_at': started.isoformat(),
            'ended_at': dt.datetime.now(dt.timezone.utc).isoformat(),
            'source': {
                'filename': latest.get('name'), 'modified_at': latest.get('lastModifiedDateTime'),
                'sha256': source_hash, 'raw_rows': len(parsed) + len(invalid),
                'valid_rows_before_dedupe': len(parsed), 'canonical_rows': len(canonical),
                **csv_meta,
            },
            'counts': dict(sorted(counts.items())), 'quarantine_count': len(quarantine),
            'safety': {
                'absence_causes_mutation': False, 'directory_writes': False, 'database_writes': False,
                'manual_exception_count': len(protected_ids), 'queue_open_before': 0,
            },
            'snapshots': {'directory': str(snapshot_dir), 'retention_days': RETENTION_DAYS},
            'manifest': manifest, 'quarantine': quarantine, 'absent_in_source_informational_only': absent,
        }
        manifest_hash = hashlib.sha256(json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        report['manifest_sha256'] = manifest_hash
        run_path = RUNS / f'{stamp}.json'
        safe_write(run_path, report)
        safe_write(LATEST, report)
        safe_write(STATE, {
            'source_sha256': source_hash, 'manifest_sha256': manifest_hash, 'last_shadow_ok': True,
            'last_run': str(run_path), 'source_filename': latest.get('name'),
            'source_modified': latest.get('lastModifiedDateTime'), 'updated_at': report['ended_at'],
        })
        clean_old()
        summary = {
            'ok': True, 'mode': 'shadow', 'action': 'validated',
            'source_filename': latest.get('name'), 'source_modified': latest.get('lastModifiedDateTime'),
            'canonical_rows': len(canonical), 'quarantine': len(quarantine), 'counts': dict(sorted(counts.items())),
            'manifest_sha256': manifest_hash, 'report': str(run_path),
        }
        print(json.dumps(summary, ensure_ascii=False))
        return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        error = str(exc).split(':', 1)[0]
        payload = {'ok': False, 'error_code': error, 'checked_at': dt.datetime.now(dt.timezone.utc).isoformat()}
        try:
            safe_write(LATEST, payload)
        except Exception:
            pass
        print(json.dumps(payload, ensure_ascii=False), file=sys.stderr)
        raise
