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
  - assign_app, remove_app
  - assign_sharepoint, remove_sharepoint

Bloqueado explicitamente:
  - *_user_app  → aguardando handler dedicado
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
from urllib.parse import quote
from datetime import datetime, timezone
from typing import Any, Dict, Optional

try:
    import requests
except ImportError:
    print("Instale: python -m pip install requests", file=sys.stderr)
    raise

try:
    from ldap3 import Server, Connection, NTLM, SUBTREE, MODIFY_REPLACE
except ImportError:  # pragma: no cover
    Server = Connection = NTLM = SUBTREE = MODIFY_REPLACE = None

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
    "assign_sharepoint",
    "remove_sharepoint",
    # AD (via ponte externa configurável — AD_BRIDGE_URL)
    "create",
    "create_if_not_exists",
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


AD_ACTIONS = {"create", "create_if_not_exists", "update", "disable", "reset_password"}


def _ldap_filter_value(value: str) -> str:
    return str(value).replace("\\", r"\5c").replace("*", r"\2a").replace("(", r"\28").replace(")", r"\29").replace("\x00", r"\00")


def _ad_safe_cn(value: str) -> str:
    return str(value or "").replace("\\", " ").replace(",", " ").replace("+", " ").replace('"', " ").replace("<", " ").replace(">", " ").replace(";", " ").strip()[:64] or "Novo Usuario"


def _ad_ldap_connect():
    if Server is None or Connection is None:
        raise RuntimeError("ldap3 não instalado")
    user = os.environ.get("ORIGO_AD_LDAP_USER") or os.environ.get("AD_LDAP_USER") or "EBESSOLAR\\svc_origo_iam_agent"
    password = os.environ.get("ORIGO_AD_LDAP_PASSWORD") or os.environ.get("AD_LDAP_PASSWORD")
    if not password:
        raise RuntimeError("ORIGO_AD_LDAP_PASSWORD/AD_LDAP_PASSWORD ausente")
    host = os.environ.get("AD_LDAP_HOST", "127.0.0.1")
    port = int(os.environ.get("AD_LDAP_PORT", "10389"))
    base_dn = os.environ.get("AD_BASE_DN") or os.environ.get("ORIGO_AD_LDAP_BASE_DN") or "DC=ebessolar,DC=local"
    server = Server(host, port=port, connect_timeout=10)
    conn = Connection(server, user=user, password=password, authentication=NTLM, auto_bind=True)
    return conn, base_dn


def _ad_find_user(conn, base_dn: str, sam: str) -> Optional[str]:
    conn.search(base_dn, f"(&(objectCategory=person)(objectClass=user)(sAMAccountName={_ldap_filter_value(sam)}))", SUBTREE, attributes=["distinguishedName", "userAccountControl"])
    if len(conn.entries) == 1:
        return str(conn.entries[0].entry_dn)
    if len(conn.entries) > 1:
        raise RuntimeError(f"sAMAccountName ambíguo no AD: {sam}")
    return None


def call_ad_ldap(action: str, payload: Dict[str, Any], execute: bool, target_identity: Optional[str] = None) -> Dict[str, Any]:
    if action not in {"create", "create_if_not_exists", "disable"}:
        return {"status": "failed", "error_code": "unsupported_ad_action", "result_message": f"AD LDAP só suporta create/create_if_not_exists/disable; recebido {action}."}
    sam = payload.get("samAccountName") or payload.get("sAMAccountName") or target_identity
    if not sam:
        return {"status": "failed", "error_code": "invalid_payload", "result_message": "samAccountName/target_identity ausente para ação AD."}
    try:
        conn, base_dn = _ad_ldap_connect()
    except Exception as e:
        return {"status": "failed", "error_code": "ad_ldap_not_configured", "result_message": f"Conexão LDAP AD indisponível: {str(e)[:220]}"}
    try:
        existing_dn = _ad_find_user(conn, base_dn, str(sam))
        if action == "disable":
            if not existing_dn:
                return {"status": "cancelled", "error_code": "ad_user_not_found", "result_message": f"Usuário AD não encontrado para desabilitar: {sam}; no-op seguro."}
            conn.search(existing_dn, "(objectClass=*)", attributes=["userAccountControl"])
            current = int(conn.entries[0].userAccountControl.value or 512)
            disabled = current | 2
            if current == disabled:
                return {"status": "success", "result_message": "Conta AD já estava desabilitada."}
            if not execute:
                return {"status": "pending", "error_code": "dry_run", "result_message": f"[dry-run] AD disable {sam}: userAccountControl {current}->{disabled}"}
            ok = conn.modify(existing_dn, {"userAccountControl": [(MODIFY_REPLACE, [disabled])]})
            if not ok:
                return {"status": "failed", "error_code": "ad_disable_failed", "result_message": f"Falha ao desabilitar AD: {conn.result}"[:300]}
            conn.search(existing_dn, "(objectClass=*)", attributes=["userAccountControl"])
            after = int(conn.entries[0].userAccountControl.value or 0)
            if not (after & 2):
                return {"status": "failed", "error_code": "ad_disable_postcheck_failed", "result_message": "Pós-checagem AD: conta não ficou desabilitada."}
            return {"status": "success", "result_message": "Conta AD desabilitada e validada via LDAP."}

        if existing_dn:
            return {"status": "success", "result_message": f"Usuário AD já existe: {sam}."}
        target_ou = payload.get("targetOu") or payload.get("target_ou") or os.environ.get("AD_DEFAULT_USER_OU") or f"CN=Users,{base_dn}"
        display = payload.get("displayName") or payload.get("nome") or str(sam)
        parts = str(display).split()
        given = payload.get("givenName") or (parts[0] if parts else str(sam))
        sn = payload.get("surname") or payload.get("sn") or (" ".join(parts[1:]) if len(parts) > 1 else str(sam))
        upn = payload.get("userPrincipalName") or f"{sam}@ebessolar.local"
        cn = _ad_safe_cn(display)
        dn = f"CN={cn},{target_ou}"
        attrs = {
            "objectClass": ["top", "person", "organizationalPerson", "user"],
            "cn": cn,
            "sAMAccountName": str(sam),
            "userPrincipalName": str(upn),
            "displayName": str(display),
            "givenName": str(given),
            "sn": str(sn),
            "userAccountControl": 514,
        }
        for src, dest in [("mail", "mail"), ("email", "mail"), ("employeeID", "employeeID"), ("matricula", "employeeID"), ("department", "department"), ("area", "department"), ("title", "title"), ("cargo", "title"), ("company", "company")]:
            if payload.get(src) and dest not in attrs:
                attrs[dest] = str(payload[src])
        if not execute:
            return {"status": "pending", "error_code": "dry_run", "result_message": f"[dry-run] criaria usuário AD desabilitado {sam} em {target_ou}"}
        ok = conn.add(dn, attributes=attrs)
        if not ok:
            return {"status": "failed", "error_code": "ad_create_failed", "result_message": f"Falha ao criar usuário AD: {conn.result}"[:300]}
        created_dn = _ad_find_user(conn, base_dn, str(sam))
        if not created_dn:
            return {"status": "failed", "error_code": "ad_create_postcheck_failed", "result_message": "Pós-checagem AD: usuário criado não encontrado."}

        initial_password = payload.get("initialPassword") or os.environ.get("AD_INITIAL_PASSWORD") or os.environ.get("ORIGO_AD_INITIAL_PASSWORD")
        if initial_password:
            # AD requires unicodePwd quoted and UTF-16-LE; most domains require LDAPS/secure channel.
            encoded_password = ('"' + str(initial_password) + '"').encode('utf-16-le')
            pwd_ok = conn.modify(created_dn, {"unicodePwd": [(MODIFY_REPLACE, [encoded_password])]})
            if not pwd_ok:
                return {"status": "failed", "error_code": "ad_password_set_failed", "result_message": f"Usuário AD criado, mas falha ao definir senha inicial; ação manual/LDAPS necessária: {conn.result}"[:300]}
            enable_ok = conn.modify(created_dn, {"userAccountControl": [(MODIFY_REPLACE, [512])]})
            if not enable_ok:
                return {"status": "failed", "error_code": "ad_enable_after_password_failed", "result_message": f"Senha inicial definida, mas falha ao habilitar usuário AD: {conn.result}"[:300]}
            conn.search(created_dn, "(objectClass=*)", attributes=["userAccountControl"])
            after_uac = int(conn.entries[0].userAccountControl.value or 0) if conn.entries else 0
            if after_uac & 2:
                return {"status": "failed", "error_code": "ad_enable_postcheck_failed", "result_message": "Pós-checagem AD: usuário ainda está desabilitado após senha inicial."}
            return {"status": "success", "result_message": "Usuário AD criado, senha inicial definida e conta habilitada via LDAP."}

        return {"status": "success", "result_message": "Usuário AD criado desabilitado e validado via LDAP; senha inicial não configurada no agente."}
    finally:
        try:
            conn.unbind()
        except Exception:
            pass


def call_ad_bridge(action: str, payload: Dict[str, Any], execute: bool) -> Dict[str, Any]:
    """Encaminha ações AD (create/update/disable/reset_password) para uma ponte
    HTTP externa configurável via env (AD_BRIDGE_URL / AD_BRIDGE_TOKEN).

    A ponte pode ser um endpoint PowerShell/HTTP responsável por executar o
    comando ActiveDirectory correspondente. Se AD_BRIDGE_URL não estiver
    configurado, a ação é reportada como não suportada localmente.
    """
    if os.environ.get("ORIGO_AD_LDAP_PASSWORD") or os.environ.get("AD_LDAP_PASSWORD"):
        return call_ad_ldap(action, payload, execute, payload.get("samAccountName") or payload.get("sAMAccountName"))
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
    if action == "remove_group" and payload.get("dynamicMembership"):
        return {"status": "failed", "error_code": "dynamic_group_managed",
                "result_message": "Grupo dinâmico do Entra não permite remoção manual de membro; ajuste a regra/atributos do grupo."}
    if action == "remove_group" and payload.get("isAssignableToRole"):
        return {"status": "failed", "error_code": "role_assignable_group",
                "result_message": "Grupo role-assignable/privilegiado exige governança administrativa específica para alteração de membros."}

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
            if r.ok:
                return {"status": "success", "result_message": "Licença removida."}
            if r.status_code == 400 and "inherited from a group membership" in r.text:
                groups = []
                url = f"{graph}/users/{user_id}/memberOf/microsoft.graph.group?$select=id,displayName,onPremisesSyncEnabled,groupTypes,membershipRule,assignedLicenses&$top=999"
                while url:
                    gr = requests.get(url, headers=headers, timeout=60)
                    gr.raise_for_status()
                    data = gr.json()
                    groups.extend(data.get("value", []))
                    url = data.get("@odata.nextLink")
                assigners = [
                    g for g in groups
                    if any(str(l.get("skuId", "")).lower() == str(sku).lower() for l in (g.get("assignedLicenses") or []))
                ]
                if not assigners:
                    return {"status": "failed", "error_code": "license_inherited_assigner_not_found",
                            "result_message": "Licença herdada por grupo, mas nenhum grupo atribuidor direto foi encontrado."}
                blocked = [g.get("displayName") or g.get("id") for g in assigners if g.get("onPremisesSyncEnabled") or "DynamicMembership" in (g.get("groupTypes") or [])]
                removable = [g for g in assigners if not g.get("onPremisesSyncEnabled") and "DynamicMembership" not in (g.get("groupTypes") or [])]
                if not removable:
                    return {"status": "failed", "error_code": "license_inherited_from_unmanaged_group",
                            "result_message": "Licença herdada apenas de grupos não gerenciáveis pelo Graph: " + ", ".join(blocked[:10])}
                removed = []
                errors = []
                for g in removable:
                    gid = g.get("id")
                    dr = requests.delete(f"{graph}/groups/{gid}/members/{user_id}/$ref", headers=headers, timeout=30)
                    if dr.status_code in (200, 204, 404):
                        removed.append(g.get("displayName") or gid)
                    else:
                        errors.append(f"{g.get('displayName') or gid}: {dr.status_code} {dr.text[:180]}")
                if errors and not removed:
                    return {"status": "failed", "error_code": "license_group_removal_failed",
                            "result_message": "; ".join(errors)[:500]}
                msg = f"Licença herdada; usuário removido de {len(removed)} grupo(s) atribuidor(es): {', '.join(removed[:10])}."
                if blocked:
                    msg += f" Grupos bloqueados: {', '.join(blocked[:10])}."
                if errors:
                    msg += f" Falhas parciais: {'; '.join(errors)[:200]}"
                return {"status": "success", "result_message": msg}
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

        if action == "assign_app" and payload.get("resourceType") != "sharepoint":
            app_id = payload.get("appId")  # Application (client) ID do enterprise app
            resource_id = payload.get("resourceId") or payload.get("servicePrincipalId")
            role_id = payload.get("appRoleId") or "00000000-0000-0000-0000-000000000000"
            if not (app_id or resource_id):
                return {"status": "failed", "error_code": "invalid_payload",
                        "result_message": "appId ou resourceId ausente"}
            # Resolve servicePrincipal.id se veio só appId
            if not resource_id:
                sp = requests.get(f"{graph}/servicePrincipals",
                                  params={"$filter": f"appId eq '{app_id}'", "$select": "id"},
                                  headers=headers, timeout=30)
                sp.raise_for_status()
                vals = sp.json().get("value", [])
                if not vals:
                    return {"status": "failed", "error_code": "sp_not_found",
                            "result_message": f"ServicePrincipal não encontrado para appId={app_id}"}
                resource_id = vals[0]["id"]
            r = requests.post(f"{graph}/users/{user_id}/appRoleAssignments", headers=headers,
                              json={"principalId": user_id, "resourceId": resource_id, "appRoleId": role_id},
                              timeout=30)
            if r.status_code in (200, 201):
                return {"status": "success",
                        "result_message": f"App {payload.get('appName') or app_id} atribuído."}
            if r.status_code == 400 and "already exists" in r.text.lower():
                return {"status": "success", "result_message": "AppRoleAssignment já existia."}
            r.raise_for_status()

        if action == "remove_app" and payload.get("resourceType") != "sharepoint":
            app_id = payload.get("appId")
            resource_id = payload.get("resourceId") or payload.get("servicePrincipalId")
            assignment_id = payload.get("appRoleAssignmentId")
            if not assignment_id:
                # Localiza assignment do usuário para o SP alvo
                if not resource_id and app_id:
                    sp = requests.get(f"{graph}/servicePrincipals",
                                      params={"$filter": f"appId eq '{app_id}'", "$select": "id"},
                                      headers=headers, timeout=30)
                    sp.raise_for_status()
                    vals = sp.json().get("value", [])
                    if vals:
                        resource_id = vals[0]["id"]
                if not resource_id:
                    return {"status": "failed", "error_code": "invalid_payload",
                            "result_message": "appId/resourceId ausente para remove_app"}
                lst = requests.get(f"{graph}/users/{user_id}/appRoleAssignments",
                                   headers=headers, timeout=30)
                lst.raise_for_status()
                match = next((a for a in lst.json().get("value", []) if a.get("resourceId") == resource_id), None)
                if not match:
                    return {"status": "success", "result_message": "Nenhum assignment ativo para este app."}
                assignment_id = match["id"]
            r = requests.delete(f"{graph}/users/{user_id}/appRoleAssignments/{assignment_id}",
                                headers=headers, timeout=30)
            if r.status_code in (200, 204, 404):
                return {"status": "success",
                        "result_message": f"App {payload.get('appName') or app_id} removido."}
            r.raise_for_status()

        if action in {"assign_sharepoint", "remove_sharepoint"} or (action in {"assign_app", "remove_app"} and payload.get("resourceType") == "sharepoint"):
            site_id = payload.get("siteId")
            drive_item_id = payload.get("driveItemId")
            recipient = email or payload.get("mail") or payload.get("email")
            if not site_id:
                return {"status": "failed", "error_code": "invalid_payload", "result_message": "siteId ausente para SharePoint"}
            if not recipient:
                return {"status": "failed", "error_code": "invalid_payload", "result_message": "e-mail do usuário ausente para SharePoint"}

            base_target = f"{graph}/sites/{site_id}/drive"
            if drive_item_id:
                item_path = f"items/{quote(str(drive_item_id), safe='')}"
            else:
                item_path = "root"
            item_url = f"{base_target}/{item_path}"
            label = payload.get("folderPath") or payload.get("folderName") or payload.get("siteName") or site_id

            if action in {"assign_sharepoint", "assign_app"}:
                permission = str(payload.get("permission") or "leitura").lower()
                roles = ["write"] if permission in {"edicao", "edição", "write", "editar"} else ["read"]
                r = requests.post(
                    f"{item_url}/invite",
                    headers=headers,
                    json={
                        "recipients": [{"email": recipient}],
                        "message": "Acesso concedido pelo Órigo IAM.",
                        "requireSignIn": True,
                        "sendInvitation": False,
                        "roles": roles,
                    },
                    timeout=60,
                )
                if r.status_code in (200, 201):
                    return {"status": "success", "result_message": f"SharePoint {label} liberado para {recipient} ({'/'.join(roles)})."}
                r.raise_for_status()

            perms = requests.get(f"{item_url}/permissions", headers=headers, timeout=60)
            perms.raise_for_status()
            matches = []
            for perm in perms.json().get("value", []):
                candidates = []
                for key in ("grantedToV2", "grantedTo"):
                    user = (perm.get(key) or {}).get("user") or {}
                    candidates.extend([user.get("email"), user.get("userPrincipalName")])
                for entry in perm.get("grantedToIdentitiesV2") or perm.get("grantedToIdentities") or []:
                    user = (entry.get("user") or {})
                    candidates.extend([user.get("email"), user.get("userPrincipalName")])
                invitation = perm.get("invitation") or {}
                candidates.append(invitation.get("email"))
                if any(str(c or "").lower() == str(recipient).lower() for c in candidates):
                    matches.append(perm)
            if not matches:
                return {"status": "success", "result_message": f"Nenhuma permissão direta SharePoint encontrada para {recipient} em {label}."}
            removed = 0
            for perm in matches:
                perm_id = perm.get("id")
                if not perm_id:
                    continue
                dr = requests.delete(f"{item_url}/permissions/{quote(str(perm_id), safe='')}", headers=headers, timeout=60)
                if dr.status_code in (200, 204, 404) or dr.ok:
                    removed += 1
                else:
                    dr.raise_for_status()
            return {"status": "success", "result_message": f"SharePoint {label}: {removed} permissão(ões) direta(s) removida(s) para {recipient}."}

    except requests.HTTPError as e:
        status = getattr(e.response, "status_code", None)
        text = getattr(e.response, "text", "") or ""
        if status == 409 and "Directory_ConcurrencyViolation" in text:
            return {"status": "pending", "error_code": "graph_concurrency_violation",
                    "result_message": "Graph retornou Directory_ConcurrencyViolation; retry automático no próximo ciclo."}
        if status == 400 and ("on-premises mastered" in text or "Directory Sync objects" in text):
            return {"status": "failed", "error_code": "on_premises_managed",
                    "result_message": "Grupo/objeto é sincronizado do AD local; alteração precisa ser feita na origem on-premises."}
        if status == 403 and "Authorization_RequestDenied" in text:
            return {"status": "failed", "error_code": "graph_insufficient_privileges",
                    "result_message": "Graph negou a operação por privilégio insuficiente para este objeto/grupo. Verifique se é grupo privilegiado/role-assignable ou se exige permissão administrativa adicional."}
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
