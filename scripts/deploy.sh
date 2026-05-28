#!/usr/bin/env bash
set -euo pipefail

# Set DEPLOY_DIR to wherever you've cloned this repo on your server.
DEPLOY_DIR="${DEPLOY_DIR:-$(pwd)}"
HEALTH_TIMEOUT=10
MAX_RETRIES=3

cd "$DEPLOY_DIR"

echo "═══════════════════════════════════════"
echo "  RRDA Deploy — $(date -Iseconds)"
echo "═══════════════════════════════════════"

PREV_COMMIT=$(git rev-parse HEAD)
echo "📌 Current commit: ${PREV_COMMIT:0:8}"

echo "📥 Pulling latest from main..."
git pull origin main --ff-only

NEW_COMMIT=$(git rev-parse HEAD)
echo "📌 New commit: ${NEW_COMMIT:0:8}"

if [ "$PREV_COMMIT" = "$NEW_COMMIT" ]; then
  echo "ℹ️  No changes to deploy. Exiting."
  exit 0
fi

echo "📦 Installing dependencies..."
npm ci --production --ignore-scripts 2>&1 | tail -3

echo "🔨 Building TypeScript..."
npm run build 2>&1 | tail -5

echo "🔄 Restarting RRDA services..."
sudo systemctl restart rrda
sudo systemctl restart rrda-dashboard

echo "🏥 Waiting ${HEALTH_TIMEOUT}s for services to start..."
sleep "$HEALTH_TIMEOUT"

HEALTHY=false
for i in $(seq 1 $MAX_RETRIES); do
  if systemctl is-active --quiet rrda; then
    HEALTHY=true
    break
  fi
  echo "  Attempt $i/$MAX_RETRIES: rrda not active (retrying in 5s...)"
  sleep 5
done

if [ "$HEALTHY" = true ]; then
  echo "  ✅ Deploy successful — ${NEW_COMMIT:0:8}"
  exit 0
fi

echo "❌ RRDA service failed. Rolling back to ${PREV_COMMIT:0:8}..."
git checkout "$PREV_COMMIT"
npm ci --production --ignore-scripts 2>&1 | tail -3
npm run build 2>&1 | tail -5
sudo systemctl restart rrda
sudo systemctl restart rrda-dashboard
sleep "$HEALTH_TIMEOUT"

echo "  ❌ Deploy FAILED — Rolled back to ${PREV_COMMIT:0:8}"
exit 1
