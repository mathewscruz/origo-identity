# Coleta local diária do SharePoint pelo Órigo Agente

Data do corte inicial: 2026-09-28.

## Responsabilidades

O host do Órigo Agente passa a ser o proprietário da agenda de coleta do RH:

1. localiza no SharePoint o `base_colab_*.csv` original mais recente;
2. ignora cópias `_iam_normalized.csv`;
3. guarda snapshot bruto e snapshot IAM com retenção de 45 dias;
4. normaliza cabeçalhos camelCase/snake_case;
5. deduplica por CPF, e-mail e matrícula;
6. calcula um manifesto determinístico contra o IAM;
7. trata ausência no arquivo apenas como informação — nunca como desligamento;
8. preserva exceções `manter_ativo` e `status_manual`;
9. não escreve no banco, AD ou Entra enquanto o modo for `shadow`.

O Supabase/Lovable permanece como plano de controle, banco, auditoria, frontend e fila. A Edge Function `sync-sharepoint-csv` não deve manter agenda automática concorrente após o corte.

## Arquivos

- `agent/origo_iam_sharepoint_local_reconcile.py`
- `agent/test_origo_iam_sharepoint_local_reconcile.py`
- `deploy/systemd/origo-iam-sharepoint-local-reconcile.service`
- `deploy/systemd/origo-iam-sharepoint-local-reconcile.timer`

## Instalação no host

```bash
install -m 700 agent/origo_iam_sharepoint_local_reconcile.py \
  /root/.hermes/scripts/origo_iam_sharepoint_local_reconcile.py
install -m 644 deploy/systemd/origo-iam-sharepoint-local-reconcile.service \
  /root/.config/systemd/user/origo-iam-sharepoint-local-reconcile.service
install -m 644 deploy/systemd/origo-iam-sharepoint-local-reconcile.timer \
  /root/.config/systemd/user/origo-iam-sharepoint-local-reconcile.timer
systemctl --user daemon-reload
systemctl --user enable --now origo-iam-sharepoint-local-reconcile.timer
```

O script reutiliza somente os helpers de autenticação/conectividade já instalados em `origo_iam_sharepoint_daily_sync.py`. Segredos continuam fora do repositório.

## Validação shadow

```bash
python3 agent/test_origo_iam_sharepoint_local_reconcile.py -v
python3 agent/origo_iam_sharepoint_local_reconcile.py --mode shadow --force
python3 agent/origo_iam_sharepoint_local_reconcile.py --mode shadow
```

A segunda execução sem `--force` deve retornar `action=already_validated` para o mesmo SHA-256 de origem.

Evidências privadas no host:

- `/root/origo_work/iam_sharepoint_local/latest.json`
- `/root/origo_work/iam_sharepoint_local/state.json`
- `/root/origo_work/iam_sharepoint_local/runs/`
- `/root/origo_work/iam_sharepoint_local/snapshots/`

## Bloqueio de produção

`--mode apply` permanece bloqueado por código até que **ambos** sejam comprovados:

1. backup/export de produção identificado com data e hora;
2. migrations pendentes aplicadas e RPCs JML presentes no schema de produção.

O bloqueio evita atualizações parciais no schema antigo. Não remover o gate para contornar RPC ausente.

## Corte e rollback

No corte, desative o sidecar legado que publicava cópias normalizadas a cada cinco minutos:

```bash
systemctl --user disable --now origo-iam-sharepoint-normalized-sidecar.timer
```

Rollback do agendamento local:

```bash
systemctl --user disable --now origo-iam-sharepoint-local-reconcile.timer
systemctl --user enable --now origo-iam-sharepoint-normalized-sidecar.timer
```

O rollback reativa apenas a preparação do arquivo; não autoriza importação, reconciliação ampla ou mutação em AD/Entra.
