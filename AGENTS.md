# AGENTS

- Scheduling lives only in the Hermes agent (agent/origo_iam_agent_executor.py SCHEDULE, via iam-agent-api POST /run_task with an allowlist); never add pg_cron jobs or DB-side function invokers — the agent is the single executor.
- Screen-triggered runs go to public.agent_tasks (RPC agent_task_solicitar); the Hermes claims them in GET /pending and reports via POST /task_result. Emergency stop is parametro agent_paused, honored server-side in /pending.
- No manual sync buttons in the UI: pages request refreshes via RPC `agent_refresh_request` (throttled, writes `agent_tasks`) through `useAutoRefresh`/`AutoUpdatedHint`; the Hermes executes them. Keeps the panel automatic without browser-side execution.
- Hermes notifications to people go through `_shared/telegram.ts` (no-op until the Telegram connector and parametro `telegram_chat_id` exist).
- Activity feed copy lives in `src/lib/activityLabels.ts` (business sentences + noise filter), covered by `src/test/activity-labels.test.ts`.
