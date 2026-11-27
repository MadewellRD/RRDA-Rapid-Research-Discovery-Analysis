# RRDA Gap Inventory

Generated from Phase 0 total repo reconnaissance. 37 gaps. Each assigned a GL id in roadmap.md.

Severity codes: **SHIP** = blocks go-live; **HIGH** = must fix before stable release; **MED** = quality/correctness gap; **LOW** = polish/cleanup.

| # | Gap | File(s) | Severity | GL id |
|---|---|---|---|---|
| 1 | No test suite -- no framework, no test files, no test CI step | package.json, .github/ci.yml | SHIP | GL-02 |
| 2 | No linter configured -- no eslint, no prettier | package.json | HIGH | GL-03 |
| 3 | npm_registry seeded in DB config but no scanner implemented | src/database/schema.sql | MED | GL-04 |
| 4 | pgvector extension not automated -- InnovationAgent crashes without manual install | src/agents/InnovationAgent.ts, schema.sql | SHIP | GL-05 |
| 5 | docker-compose api depends_on postgres with no health condition -- startup race | docker-compose.yml | SHIP | GL-06 |
| 6 | docker-compose sets LLM_PROVIDER=bitnet but .env.example defaults openai -- mismatch | docker-compose.yml, .env.example | HIGH | GL-07 |
| 7 | GitHub scanner throws hard if no tokens -- no graceful degradation | src/scanners/GitHubScanner.ts | HIGH | GL-08 |
| 8 | Reddit scanner uses unauthenticated public JSON API -- fragile, rate-limited | src/scanners/RedditScanner.ts | HIGH | GL-09 |
| 9 | ArXiv scanner uses HTTP not HTTPS | src/scanners/ArxivScanner.ts | HIGH | GL-10 |
| 10 | ArXiv XML parsing is regex-based, not a proper XML parser | src/scanners/ArxivScanner.ts | MED | GL-10 |
| 11 | Admin endpoints have no rate limiting | src/server/app.ts | HIGH | GL-11 |
| 12 | innovation_proposals vector index commented out -- requires manual pgvector setup | src/database/schema.sql | SHIP | GL-05 |
| 13 | No DB migration tooling -- schema.sql is create-if-not-exists only, no versioning | src/database/schema.sql | HIGH | GL-12 |
| 14 | InnovationAgent DDL duplicated in scheduler/index.ts AND schema.sql | src/scheduler/index.ts, schema.sql | MED | GL-13 |
| 15 | CORS_ORIGIN=localhost:4173 hardcoded in docker-compose | docker-compose.yml | MED | GL-07 |
| 16 | Dockerfile is single-stage -- devDeps included in production image | Dockerfile | HIGH | GL-14 |
| 17 | Dockerfile has no USER directive -- runs as root | Dockerfile | HIGH | GL-14 |
| 18 | Dockerfile only starts API -- scheduler needs separate process or entry | Dockerfile | SHIP | GL-14 |
| 19 | RepoCloner default CLONES_DIRECTORY is /opt/PROMETHEUS/rda/clones -- stale PROMETHEUS path | src/analyzers/RepoCloner.ts | SHIP | GL-15 |
| 20 | RepoCloner uses execSync() -- blocks event loop during git clone | src/analyzers/RepoCloner.ts | HIGH | GL-15 |
| 21 | RepoCloner getDirSizeMB uses Linux `du -sm` -- not cross-platform | src/analyzers/RepoCloner.ts | MED | GL-15 |
| 22 | EMAIL_FROM_NAME env var in EmailNotifier code but missing from .env.example | src/notifiers/EmailNotifier.ts, .env.example | HIGH | GL-16 |
| 23 | EmailNotifier: secure: false hardcoded, no explicit STARTTLS flag | src/notifiers/EmailNotifier.ts | HIGH | GL-16 |
| 24 | README says "27 config keys" but schema.sql seeds 28 rows | README.md, schema.sql | LOW | GL-17 |
| 25 | Discovery TypeScript interface has both discoveredAt and discovered_at (camelCase/snake_case) | src/types/index.ts | HIGH | GL-18 |
| 26 | SlackNotifier uses legacy attachments API (deprecated by Slack) | src/notifiers/SlackNotifier.ts | HIGH | GL-19 |
| 27 | CompetitiveReport uses getDefaultModel() for synthesis -- should use creative model | src/analyzers/CompetitiveReport.ts | LOW | GL-20 |
| 28 | AlertOrchestrator.processDiscovery() takes `assessment: any` -- untyped | src/notifiers/AlertOrchestrator.ts | MED | GL-21 |
| 29 | ReportGenerator.calculateCostSavings() uses hardcoded fake dollar multipliers | src/notifiers/ReportGenerator.ts | HIGH | GL-22 |
| 30 | ReportGenerator.getCriticalDiscoveries() filters on status='analyzed' but default status is 'new' -- likely returns empty | src/notifiers/ReportGenerator.ts | HIGH | GL-22 |
| 31 | deploy.sh runs `npm ci --production` then `npm run build` -- tsc is a devDep, build will fail | scripts/deploy.sh | SHIP | GL-23 |
| 32 | Tabler Icons (ti-* CSS classes) referenced in App.tsx but no CDN import confirmed in HTML or CSS | dashboard/index.html, dashboard/src/styles.css | SHIP | GL-24 |
| 33 | tsconfig.json uses moduleResolution: "node" with module: ES2022 -- should be node16 or bundler | tsconfig.json | HIGH | GL-25 |
| 34 | .github/ci-status.json is static hardcoded "passing" -- CI badge is fake | .github/ci-status.json | SHIP | GL-26 |
| 35 | seed-demo.ts passes discovery.url as source_id ($2) -- parameter mismatch | src/scripts/seed-demo.ts | MED | GL-27 |
| 36 | vite.config.ts hardcodes /tmp/rrda-vite-cache -- breaks Windows development | dashboard/vite.config.ts | MED | GL-28 |
| 37 | No base or server.proxy in vite.config -- local dev requires undocumented VITE_RRDA_API_URL env | dashboard/vite.config.ts | MED | GL-28 |

## Ship-blocking summary (must fix before go-live)

SHIP gaps: 1, 4, 5, 12, 18, 19, 31, 32, 34 and the depends_on health condition (gap 5).

In GL ids: GL-02 (tests), GL-05 (pgvector), GL-06 (docker health), GL-14 (scheduler in Docker), GL-15 (RepoCloner path), GL-23 (deploy.sh build), GL-24 (Tabler Icons), GL-26 (fake CI badge).
