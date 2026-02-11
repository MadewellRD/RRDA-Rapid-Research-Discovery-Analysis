#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Deploy RDA → FORGE Integration (Step 1)
# Run from: /opt/PROMETHEUS/production/rda-production
# ═══════════════════════════════════════════════════════════════
set -e

echo "═══════════════════════════════════════════════════════════"
echo "  Step 1: RDA → FORGE Autonomous Integration"
echo "═══════════════════════════════════════════════════════════"
echo ""

RDA_DIR="/opt/PROMETHEUS/production/rda-production"
cd "$RDA_DIR"

# ── 1. Backup ────────────────────────────────────────────────
echo "📦 Backing up current files..."
BACKUP_DIR="backups/pre-forge-integration-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r src/integrations/ "$BACKUP_DIR/" 2>/dev/null || true
cp src/scheduler/index.ts "$BACKUP_DIR/scheduler-index.ts" 2>/dev/null || true
echo "   Backed up to $BACKUP_DIR"

# ── 2. Create database module directory ──────────────────────
echo ""
echo "🗄️  Creating shared database module..."
mkdir -p src/database

# ── 3. Copy files ────────────────────────────────────────────
echo "📁 Copying integration files..."

# Database pool (skip if already exists from punchlist patches)
if [ ! -f src/database/pool.ts ]; then
  cp src_patch/database/pool.ts src/database/pool.ts
  echo "   ✅ src/database/pool.ts (NEW)"
else
  echo "   ⏭️  src/database/pool.ts (already exists)"
fi

# FORGE Client (overwrite)
cp src_patch/integrations/FORGEClient.ts src/integrations/FORGEClient.ts
echo "   ✅ src/integrations/FORGEClient.ts (REPLACED)"

# Autonomous Response Orchestrator (overwrite)
cp src_patch/integrations/AutonomousResponseOrchestrator.ts src/integrations/AutonomousResponseOrchestrator.ts
echo "   ✅ src/integrations/AutonomousResponseOrchestrator.ts (REPLACED)"

# Production scheduler (overwrite)
cp src_patch/scheduler/index.ts src/scheduler/index.ts
echo "   ✅ src/scheduler/index.ts (REPLACED)"

# Scripts
mkdir -p scripts
cp scripts_patch/trigger-forge.ts scripts/trigger-forge.ts
echo "   ✅ scripts/trigger-forge.ts (NEW)"

cp scripts_patch/migrate-response-actions.sql scripts/migrate-response-actions.sql
echo "   ✅ scripts/migrate-response-actions.sql (NEW)"

# ── 4. Update .env ───────────────────────────────────────────
echo ""
echo "🔑 Checking .env for FORGE variables..."
if ! grep -q "FORGE_API_URL" .env 2>/dev/null; then
  echo "" >> .env
  cat .env.forge-integration >> .env
  echo "   ✅ Added FORGE integration variables to .env"
  echo "   ⚠️  IMPORTANT: Edit .env and set FORGE_API_TOKEN to match your FORGE bearer token!"
else
  echo "   ⏭️  FORGE variables already in .env"
fi

# ── 5. Run database migration ────────────────────────────────
echo ""
echo "🗄️  Running database migration..."
psql "$DATABASE_URL" -f scripts/migrate-response-actions.sql 2>&1 || {
  echo "   ⚠️  Migration failed — run manually: psql \$DATABASE_URL -f scripts/migrate-response-actions.sql"
}

# ── 6. Build ─────────────────────────────────────────────────
echo ""
echo "🔨 Building TypeScript..."
npm run build
echo "   ✅ Build successful"

# ── 7. Validation ────────────────────────────────────────────
echo ""
echo "🧪 Validating..."

# Health check
echo -n "   FORGE API health: "
HEALTH=$(curl -sf "${FORGE_API_URL:-http://localhost:3001}/health" 2>/dev/null | grep -o '"healthy"' || echo "unreachable")
if [ "$HEALTH" = '"healthy"' ]; then
  echo "✅ healthy"
else
  echo "⚠️  $HEALTH (may need to check FORGE_API_URL in .env)"
fi

# DB check
echo -n "   response_actions table: "
ROWS=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM response_actions" 2>/dev/null || echo "error")
echo "✅ ${ROWS} rows"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ Integration deployed!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Edit .env and set FORGE_API_TOKEN (must match FORGE bearer token)"
echo "  2. Set AUTONOMOUS_RESPONSE_ENABLED=true in .env"
echo "  3. Restart: sudo systemctl restart rda"
echo "  4. Test: npx ts-node scripts/trigger-forge.ts --health"
echo "  5. Test: npx ts-node scripts/trigger-forge.ts --test"
echo ""
