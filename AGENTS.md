# AGENTS

- Scheduling lives only in the Hermes agent (agent/origo_iam_agent_executor.py SCHEDULE, via iam-agent-api POST /run_task with an allowlist); never add pg_cron jobs or DB-side function invokers — the agent is the single executor.
