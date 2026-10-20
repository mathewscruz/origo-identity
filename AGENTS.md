# AGENTS

- Scheduling lives only in the Hermes agent (agent/origo_iam_agent_executor.py SCHEDULE, via iam-agent-api POST /run_task with an allowlist); never add pg_cron jobs or DB-side function invokers — the agent is the single executor.
- Screen-triggered runs go to public.agent_tasks (RPC agent_task_solicitar); the Hermes claims them in GET /pending and reports via POST /task_result. Emergency stop is parametro agent_paused, honored server-side in /pending.
- No manual sync buttons in the UI: pages request refreshes via RPC `agent_refresh_request` (throttled, writes `agent_tasks`) through `useAutoRefresh`/`AutoUpdatedHint`; the Hermes executes them. Keeps the panel automatic without browser-side execution.
- Notifications to people: the panel writes `alertas`; the Hermes pulls them via iam-agent-api GET /notifications, sends through its own Telegram (HERMES_NOTIFY_CMD) and acks via POST /ack (`alertas.notificado_em`). No Telegram connector in the app.
- Activity feed copy lives in `src/lib/activityLabels.ts` (business sentences + noise filter), covered by `src/test/activity-labels.test.ts`.
- System connections: `aplicacoes.modo_acesso` (sso|grupo|api|manual) drives `iam_resource_template` for perfil apps; manual mode creates `manual_access_task`/`manual_revoke_task` queue items that the agent never claims (not in AGENT_ACTION_TYPES) and humans close via `iam_manual_task_concluir`. The "Conectar sistema" chat (`app-connect-assistant`) only fills the ficha via tools; credentials are entered only in the protected connector form, never through the AI.
