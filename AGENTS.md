# AGENTS

- Scheduling lives only in the Hermes agent (agent/origo_iam_agent_executor.py SCHEDULE, via iam-agent-api POST /run_task with an allowlist); never add pg_cron jobs or DB-side function invokers — the agent is the single executor.
- Screen-triggered runs go to public.agent_tasks (RPC agent_task_solicitar); the Hermes claims them in GET /pending and reports via POST /task_result. Emergency stop is parametro agent_paused, honored server-side in /pending.
