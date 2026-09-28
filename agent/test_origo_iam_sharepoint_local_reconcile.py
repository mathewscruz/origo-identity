#!/usr/bin/env python3
import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path('/root/.hermes/scripts/origo_iam_sharepoint_local_reconcile.py')
spec = importlib.util.spec_from_file_location('local_reconcile', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class LocalReconcileTests(unittest.TestCase):
    def test_snake_case_headers_are_canonicalized(self):
        raw = (
            'display_name,employ_id,mail,company,title,status,data_admissao,'
            'cadastro_pessoa_fisica,base_local,department_number,data_rescisao,sam_account_name\n'
            'Pessoa Teste,123,pessoa@origoenergia.com.br,Origo,Analista,Ativo,01/01/2026,'
            '12345678900,BH,Tecnologia,,pessoa.teste\n'
        ).encode()
        rows, invalid, meta = module.parse_rows(raw)
        self.assertEqual([], invalid)
        self.assertEqual('Pessoa Teste', rows[0]['displayName'])
        self.assertEqual('123', rows[0]['employID'])
        self.assertEqual('Tecnologia', rows[0]['departmentNumber'])
        self.assertEqual('pessoa.teste', rows[0]['sAMAccountName'])
        self.assertEqual('displayName', meta['canonical_headers']['display_name'])

    def test_dedupe_prefers_active_record(self):
        rows = [
            {'__linha': '2', 'employID': 'old', 'Cadastro_Pessoa_Fisica': '111', 'mail': 'x@x', 'status': 'Demitido', 'Data_Admissao': '01/01/2020'},
            {'__linha': '3', 'employID': 'new', 'Cadastro_Pessoa_Fisica': '111', 'mail': 'x@x', 'status': 'Ativo', 'Data_Admissao': '01/01/2026'},
        ]
        canonical, removed = module.dedupe(rows)
        self.assertEqual('new', canonical[0]['employID'])
        self.assertEqual(1, len(removed))

    def test_absence_policy_is_not_a_leaver_rule(self):
        source = SCRIPT.read_text()
        self.assertIn("'absence_causes_mutation': False", source)
        self.assertIn("'absent_in_source_informational_only'", source)
        self.assertIn('apply_blocked_until_schema_migrations_and_backup_are_verified', source)

    def test_legacy_fingerprint_ignores_previously_unmapped_fields(self):
        base = {
            'displayName': 'Pessoa', 'mail': 'p@origoenergia.com.br', 'status': 'Ativo',
            'company': 'Origo', 'description': 'Analista', 'Base_Local': 'BH',
            'Cadastro_Pessoa_Fisica': '111', 'Data_Admissao': '01/01/2026',
        }
        changed = dict(base, departmentNumber='TI', Data_Rescisao='02/02/2026', sAMAccountName='pessoa')
        self.assertEqual(module.legacy_import_hash(base), module.legacy_import_hash(changed))


if __name__ == '__main__':
    unittest.main()
