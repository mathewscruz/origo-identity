# People lifecycle chart contract

`dashboard_people_series(p_days)` is additive, SECURITY INVOKER, authenticated/service_role only. The legacy `dashboard_series` and `dashboard_activity` are unchanged by this migration. The frontend uses the new RPC exclusively for the provisioning activity chart; JML registration has its separate existing chart.

- Exactly **Entradas** and **Saídas**.
- Unit: distinct stable person IDs per day and direction, America/Sao_Paulo. Period totals are sums of daily people counts, not distinct people across the whole period. A genuine later lifecycle on another day can count again.
- Correlation + typed stable person ID + direction deduplicates RH/queue/retries across dates; daily distinct person further collapses repeated observations without correlation on the same day. Names, email addresses and timestamps of cadastro edits are not identity keys.
- Entradas: proven account creation from a closed allowlist of executed queue creation results, third-party audit with `ad_action=created`, or fully gated canonical RH onboarding. `already_exists`, inventory imports and registration alone do not count. Historical unknown creation messages deliberately remain uncounted, not guessed as success.
- Saídas: latest canonical RH lifecycle evidence has success + readback_verified + gates_complete + empty pending list. Queue AD disable/Entra disable are substeps, not independent completed exits. Historical isolated disable rows are deliberately **not** reconstructed as completed leavers. A latest correlated RH partial/pending/failure suppresses its queue creation candidate.
- AD/IAM disabled with cloud pending remains partial in the feed, excluded from the chart. No implication of account/mailbox/OneDrive deletion.
- Licenses, groups, apps, sync, cadastro and JML pending/registration never contribute.
- API failures, missing keys and incompatible old responses display unavailable, never fabricated zero or a fallback to action counts.

## Verification performed

15 read-only PostgreSQL fixtures exercised the actual deployed SQL body: repeated sync, resource fanout, identity/correlation dedupe, missing identity, pending/already-existing creation, canonical complete joiner/leaver, partial/failed/pending and false-success incomplete gates. No fake production events inserted.
Authenticated RPC readback 7/30/90 days and clamp bounds returned HTTP 200; anonymous returned 401. Queue fingerprint and existing feed/series/RH/claim/completion definitions and ACLs unchanged. Counts at verification: 7 days 1/0; 30 days 18/0; 90 days 72/0 entradas/saidas. Counts evolve with actual canonical lifecycle events.

Backend evidence and 45-day backup: `/root/iam_rh_observability/people_verification.json`, `people_backup45d.json`, `test_people_series.py`. Preserve backup until 2026-11-02. Backend already applied; do not replay old RH data backfills. The committed RH snapshot/projection prerequisites and sync/people RPCs are ordered at 20260918145900–20260918150200, after the repository's existing dashboard definitions; the previously untracked sync migration was preserved byte-for-byte under its correctly ordered name. No person-specific backfill is committed. Rollback frontend to previous commit and drop only the new RPC if necessary (see rollback file).

## Delivery

GitHub default branch was read back as `main`. Lovable publication is a separate manual step owned by the user. Do not click Publish or claim the public bundle changed just because local build/backend succeeded.
