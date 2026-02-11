#!/bin/bash
# Fix remaining compilation errors in RDA
# AlertScheduler.ts:38 and RDAScheduler.ts:271 call .close() on classes
# that now use the shared pool (no individual close needed)

cd /opt/PROMETHEUS/production/rda-production

# Fix AlertScheduler.ts — replace alerts.close() with closePool()
if [ -f src/scheduler/AlertScheduler.ts ]; then
  # Add import for closePool if not present
  if ! grep -q 'closePool' src/scheduler/AlertScheduler.ts; then
    sed -i "1s|^|import { closePool } from '../database/pool.js';\n|" src/scheduler/AlertScheduler.ts
  fi
  # Replace this.alerts.close() with closePool()
  sed -i 's/await this\.alerts\.close()/await closePool()/g' src/scheduler/AlertScheduler.ts
  echo "✅ Fixed AlertScheduler.ts"
fi

# Fix RDAScheduler.ts — replace this.rda.close() with closePool()
if [ -f src/scheduler/RDAScheduler.ts ]; then
  # Add import for closePool if not present
  if ! grep -q 'closePool' src/scheduler/RDAScheduler.ts; then
    sed -i "1s|^|import { closePool } from '../database/pool.js';\n|" src/scheduler/RDAScheduler.ts
  fi
  # Replace this.rda.close() with closePool()
  sed -i 's/await this\.rda\.close()/await closePool()/g' src/scheduler/RDAScheduler.ts
  echo "✅ Fixed RDAScheduler.ts"
fi

echo ""
echo "Now run: npm run build"
