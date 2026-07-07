#!/usr/bin/env python3
"""
Órigo IAM Agent Executor (esqueleto inicial).

Consome iam-agent-api /pending, executa ações suportadas e devolve
resultado via /update. Roda em dry-run por padrão; use --execute
para mutações reais.

Suportado nesta versão:
  - disable_entra, enable_entra, update_entra
  - assign_license, remove_license
  - assign_group, remove_group

Bloqueado explicitamente:
  - assign_app / remove_app / *_user_app  → aguardando handler dedicado
  - enable_entra sem prova de fluxo aprovado (joiner/rehire)
  - remove_group em grupo marcado como on_premises_sync=true (Graph)

Uso:
  export IAM_AGENT_API_URL="https://<ref>.supabase.co/functions/v1/iam-agent-api"
  export IAM_AGENT_TOKEN="..."
  export AZURE_TENANT_ID=...
  export AZURE_CLIENT_ID=...
  export AZURE_CLIENT_SECRET=...
  python agent/origo_iam_agent_executor.py          # dry-run
  python agent/origo_iam_agent_executor.py --execute
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

try:
    import requests
except ImportError:
    print("Instale: python -m pip install requests", file=sys.stderr)
    raise

SUPPORTED_ACTIONS = {
    "disable_entra",
    "enable_entra",
    "update_entra",
    "assign_license",
    "remove_license",
    "assign_group",
    "remove_group",
    "assign_app",
    "remove_app",
    # AD (via ponte externa configurável — AD_BRIDGE_URL)
    "create",
    "update",
    "disable",
    "reset_password",
}

# Ações ainda não suportadas nativamente por este executor.
BLOCKED_ACTIONS = {
    "create_user_app",
    "update_user_app",
    "disable_user_app",
    "delete_user_app",
}


def env(name: str, required: bool = True) -> str:
    v = os.environ.get(name, "")
    if required and not v:
        raise SystemExit(f"Variável de ambiente obrigatória ausente: {name}")
    return v


def get_azure_token() -> str:
    tenant = env("AZURE_TENANT_ID")
    client_id = env("AZURE_CLIENT_ID")
    client_secret = env("AZURE_CLIENT_SECRET")
    r = requests.post(
        f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
            "grant_type": "client_credentials",
        },
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def fetch_pending(api_url: str, token: str) -> Dict[str, Any]:
    r = requests.get(f"{api_url}/pending", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    r.raise_for_status()
    return r.json()


def post_update(api_url: str, token: str, body: Dict[str, Any]) -> None:
    r = requests.post(
        f"{api_url}/update",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=body,
        timeout=30,
    )
    r.raise_for_status()


def resolve_user_id(graph_token: str, email: Optional[str], sam: Optional[str]) -> Optional[str]:
    headers = {"Authorization": f"Bearer {graph_token}"}
    if email:
        safe = email.replace("'", "''")
        r = requests.get(
            "https://graph.microsoft.com/v1.0/users",
            params={
                "$filter": f"mail eq '{safe}' or userPrincipalName eq '{safe}'",
                "$select": "id,accountEnabled",
            },
            headers=headers,
            timeout=30,
        )
        if r.ok:
            vals = r.json().get("value", [])
            if vals:
                return vals[0]["id"]
    if sam:
        safe = sam.replace("'", "''")
        r = requests.get(
            "https://graph.microsoft.com/v1.0/users",
            params={
                "$filter": f"onPremisesSamAccountName eq '{safe}'",
                "$select": "id,accountEnabled",
            },
            headers=headers,
            timeout=30,
        )
        if r.ok:
            vals = r.json().get("value", [])
            if vals:
                return vals[0]["id"]
    return None


def has_approval(item: Dict[str, Any]) -> bool:
    """Guardrail joiner/rehire para enable_entra.

    Regra mínima: exigir payload_json.approved_by ou payload_json.evento_jml_id.
    Substituir por consulta real ao workflow em produção.
    """
    payload = item.get("payload_json") or {}
    return bool(payload.get("approved_by") or payload.get("evento_jml_id"))


AD_ACTIONS = {"create", "update", "disable", "reset_password"}


def call_ad_bridge(action: str, payload: Dict[str, Any], execute: bool) -> Dict[str, Any]:
    """Encaminha ações AD (create/update/disable/reset_password) para uma ponte
    HTTP externa configurável via env (AD_BRIDGE_URL / AD_BRIDGE_TOKEN).

    A ponte pode ser um endpoint PowerShell/HTTP responsável por executar o
    comando ActiveDirectory correspondente. Se AD_BRIDGE_URL não estiver
    configurado, a ação é reportada como não suportada localmente.
    """
    url = os.environ.get("AD_BRIDGE_URL", "").strip()
    if not url:
        return {"status": "failed", "error_code": "ad_bridge_missing",
                "result_message": f"AD action {action} requer AD_BRIDGE_URL configurado."}
    if not execute:
        return {"status": "pending", "error_code": "dry_run",
                "result_message": f"[dry-run] AD {action} → {payload.get('samAccountName')}"}
    token = os.environ.get("AD_BRIDGE_TOKEN", "")
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        r = requests.post(url.rstrip("/") + f"/{action}", headers=headers,
                          json=payload, timeout=60)
        if r.status_code >= 400:
            return {"status": "failed", "error_code": "ad_bridge_http",
                    "result_message": f"{r.status_code}: {r.text[:300]}"}
        try:
            data = r.json()
        except ValueError:
            data = {"message": r.text[:200]}
        return {"status": "success",
                "result_message": data.get("message") or f"AD {action} executado."}
    except Exception as e:  # noqa: BLE001
        return {"status": "failed", "error_code": "ad_bridge_exception",
                "result_message": str(e)[:300]}


def execute_item(graph_token: str, item: Dict[str, Any], execute: bool) -> Dict[str, Any]:
    action = item["action_type"]
    payload = item.get("payload_json") or {}

    if action in BLOCKED_ACTIONS:
        return {"status": "failed", "error_code": "handler_not_implemented",
                "result_message": f"Ação {action} bloqueada: aguardando handler dedicado."}

    if action not in SUPPORTED_ACTIONS:
        return {"status": "failed", "error_code": "unsupported_action",
                "result_message": f"Ação {action} não suportada por este executor."}

    # AD: delega para a ponte externa.
    if action in AD_ACTIONS:
        return call_ad_bridge(action, payload, execute)

    if action == "enable_entra" and not has_approval(item):
        return {"status": "failed", "error_code": "missing_approval",
                "result_message": "enable_entra requer joiner/rehire aprovado (payload sem approved_by/evento_jml_id)."}

    if action == "remove_group" and payload.get("onPremisesSync"):
        return {"status": "failed", "error_code": "on_premises_managed",
                "result_message": "Grupo on-premises não pode ser removido via Graph."}

    email = payload.get("mail") or payload.get("email")
    sam = payload.get("samAccountName") or payload.get("sAMAccountName")
    user_id = resolve_user_id(graph_token, email, sam)
    if not user_id:
        return {"status": "failed", "error_code": "user_not_found",
                "result_message": f"Usuário não encontrado no Entra (email={email}, sam={sam})."}

    if not execute:
        return {"status": "pending", "result_message": f"[dry-run] {action} → {user_id}",
                "error_code": "dry_run"}


    headers = {"Authorization": f"Bearer {graph_token}", "Content-Type": "application/json"}
    graph = "https://graph.microsoft.com/v1.0"

    try:
        if action == "disable_entra":
            r = requests.patch(f"{graph}/users/{user_id}", headers=headers,
                               json={"accountEnabled": False}, timeout=30)
            r.raise_for_status()
            return {"status": "success", "result_message": "Conta desabilitada no Entra ID."}

        if action == "enable_entra":
            r = requests.patch(f"{graph}/users/{user_id}", headers=headers,
                               json={"accountEnabled": True}, timeout=30)
            r.raise_for_status()
            return {"status": "success", "result_message": "Conta reabilitada no Entra ID."}

        if action == "update_entra":
            body = {k: payload[k] for k in ("department", "jobTitle", "companyName", "displayName")
                    if payload.get(k)}
            if not body:
                return {"status": "success", "result_message": "Nada a atualizar."}
            r = requests.patch(f"{graph}/users/{user_id}", headers=headers, json=body, timeout=30)
            r.raise_for_status()
            return {"status": "success", "result_message": f"Atributos: {', '.join(body)}"}

        if action == "assign_license":
            sku = payload.get("skuId")
            if not sku:
                return {"status": "failed", "error_code": "invalid_payload", "result_message": "skuId ausente"}
            r = requests.post(f"{graph}/users/{user_id}/assignLicense", headers=headers,
                              json={"addLicenses": [{"skuId": sku, "disabledPlans": []}],
                                    "removeLicenses": []}, timeout=30)
            r.raise_for_status()
            return {"status": "success", "result_message": f"Licença {payload.get('licenseName') or sku} atribuída."}

        if action == "remove_license":
            sku = payload.get("skuId")
            if not sku:
                return {"status": "failed", "error_code": "invalid_payload", "result_message": "skuId ausente"}
            r = requests.post(f"{graph}/users/{user_id}/assignLicense", headers=headers,
                              json={"addLicenses": [], "removeLicenses": [sku]}, timeout=30)
            r.raise_for_status()
            return {"status": "success", "result_message": "Licença removida."}

        if action == "assign_group":
            gid = payload.get("groupId")
            if not gid:
                return {"status": "failed", "error_code": "invalid_payload", "result_message": "groupId ausente"}
            r = requests.post(f"{graph}/groups/{gid}/members/$ref", headers=headers,
                              json={"@odata.id": f"{graph}/directoryObjects/{user_id}"}, timeout=30)
            if r.status_code in (200, 204):
                return {"status": "success", "result_message": f"Adicionado ao grupo {payload.get('groupName') or gid}."}
            if r.status_code == 400 and "already exist" in r.text:
                return {"status": "success", "result_message": "Já era membro do grupo."}
            r.raise_for_status()

        if action == "remove_group":
            gid = payload.get("groupId")
            if not gid:
                return {"status": "failed", "error_code": "invalid_payload", "result_message": "groupId ausente"}
            r = requests.delete(f"{graph}/groups/{gid}/members/{user_id}/$ref", headers=headers, timeout=30)
            if r.status_code in (200, 204, 404):
                return {"status": "success", "result_message": "Removido do grupo (ou já não era membro)."}
            r.raise_for_status()

    except requests.HTTPError as e:
        return {"status": "failed", "error_code": "graph_http_error",
                "result_message": f"{e.response.status_code}: {e.response.text[:300]}"}
    except Exception as e:  # noqa: BLE001
        return {"status": "failed", "error_code": "exception", "result_message": str(e)[:300]}

    return {"status": "failed", "error_code": "unreachable", "result_message": "Fluxo inesperado."}


def main() -> int:
    parser = argparse.ArgumentParser(description="Órigo IAM Agent Executor")
    parser.add_argument("--execute", action="store_true", help="Aplicar mutações reais (default: dry-run)")
    parser.add_argument("--once", action="store_true", help="Rodar uma vez e sair")
    parser.add_argument("--interval", type=int, default=30, help="Intervalo entre polls (s)")
    args = parser.parse_args()

    api_url = env("IAM_AGENT_API_URL").rstrip("/")
    api_token = env("IAM_AGENT_TOKEN")
    graph_token = get_azure_token()
    graph_token_at = time.time()

    mode = "EXECUTE" if args.execute else "DRY-RUN"
    print(f"[origo-agent] iniciando modo={mode} url={api_url}")

    while True:
        try:
            if time.time() - graph_token_at > 45 * 60:
                graph_token = get_azure_token()
                graph_token_at = time.time()

            body = fetch_pending(api_url, api_token)
            items = body.get("data", []) or []
            exec_mode = body.get("execution_mode", "?")
            print(f"[origo-agent] {datetime.now(timezone.utc).isoformat()} exec_mode={exec_mode} pending={len(items)}")

            for item in items:
                result = execute_item(graph_token, item, execute=args.execute)
                update = {
                    "id": item["id"],
                    "status": result["status"],
                    "result_message": result.get("result_message"),
                    "error_code": result.get("error_code"),
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                    "processed_by": "origo-agent" + ("" if args.execute else "-dryrun"),
                }
                # Em dry-run não marcamos como success/failed final: apenas registramos e devolvemos pending.
                if not args.execute:
                    update["status"] = "pending"
                print(f"  · {item['action_type']} {item['id']}: {result['status']} — {result.get('result_message','')[:120]}")
                try:
                    post_update(api_url, api_token, update)
                except Exception as e:  # noqa: BLE001
                    print(f"    ! falha ao dar update: {e}")

        except Exception as e:  # noqa: BLE001
            print(f"[origo-agent] erro no loop: {e}", file=sys.stderr)

        if args.once:
            return 0
        time.sleep(args.interval)


if __name__ == "__main__":
    sys.exit(main())
