# Step 1: RDA → FORGE Autonomous Integration

## What This Does

Wires the autonomous innovation loop: when RDA discovers a HIGH+ competitive 
threat (threat_score ≥ 7.5), it automatically calls the FORGE API to generate 
a counter-capability. ~30 seconds, ~$0.02 per response.

## What Changed

| File | Change |
|------|--------|
| `src/database/pool.ts` | NEW — shared database pool (may exist from punchlist) |
| `src/integrations/FORGEClient.ts` | REPLACED — Bearer auth, idempotency, retry, health check |
| `src/integrations/AutonomousResponseOrchestrator.ts` | REPLACED — shared pool, non-crashing failures, proper logging |
| `src/scheduler/index.ts` | REPLACED — fixed assess→store→trigger flow, PT timezone, clean shutdown |
| `scripts/trigger-forge.ts` | NEW — CLI tool for manual testing |
| `scripts/migrate-response-actions.sql` | NEW — idempotent DB migration |

## Key Fixes

1. **Auth**: FORGEClient now sends `Authorization: Bearer <token>` on all API calls
2. **Flow bug**: Old scheduler checked `intelligence_level` on raw scanner output (before assessment). Now: scan → assess → store → trigger
3. **Idempotency**: Won't re-trigger FORGE for a discovery that already has an active response_action
4. **Retry**: 3 attempts with exponential backoff on FORGE API failures
5. **Non-crashing**: FORGE failures don't crash the scanner — logged, tracked, Slack-notified
6. **Shared pool**: Single database pool instead of per-class Pool() instances

## Deploy

```bash
cd /opt/PROMETHEUS/production/rda-production
unzip -o RDA_FORGE_INTEGRATION.zip
bash deploy.sh
# Edit .env — set FORGE_API_TOKEN
sudo systemctl restart rda
```

## Validate

```bash
# 1. Health check
npx ts-node scripts/trigger-forge.ts --health

# 2. Show HIGH+ discoveries
npx ts-node scripts/trigger-forge.ts

# 3. Test with synthetic threat
npx ts-node scripts/trigger-forge.ts --test

# 4. Trigger specific discovery
npx ts-node scripts/trigger-forge.ts --discovery-id 42

# 5. Dry run (no FORGE call)
npx ts-node scripts/trigger-forge.ts --test --dry-run
```

## Environment Variables

Add to `/opt/PROMETHEUS/production/rda-production/.env`:

```
FORGE_API_URL=https://forge-api.madewellrd.com
FORGE_API_TOKEN=<must-match-FORGE_BEARER_TOKEN-in-forge-.env>
FORGE_TRIGGER_THRESHOLD=7.5
FORGE_MAX_RETRIES=3
AUTONOMOUS_RESPONSE_ENABLED=true
```
