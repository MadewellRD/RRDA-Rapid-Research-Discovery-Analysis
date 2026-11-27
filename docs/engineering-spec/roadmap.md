# RRDA Go-Live Roadmap

**Sprints:** 8 | **Timeline:** 3-4 days continuous  
**Branch convention:** `gl/{id}-{slug}` (e.g. `gl/gl-02-test-framework`)  
**PR rule:** one PR per GL id; no direct commits to main  
**Gate:** Phase 3 SDLC audit must pass before any GL task merges to main  

---

## Sprint 1 -- Foundation and CI integrity (day 1 morning)

### GL-01: Push local main to origin

**Gaps:** git state -- local is ahead of origin/main  
**Acceptance:**
- `git push origin main` succeeds with no conflicts
- GitHub Actions CI run triggers and completes (even if jobs fail -- we need the pipeline running)
- Local HEAD matches origin/main

**Dependencies:** none  
**Branch:** direct push of existing main (no feature branch needed -- this is a sync, not a change)  
**Sprint:** 1

---

### GL-02: Install test framework and add baseline test suite

**Gaps:** 1 (no tests)  
**Acceptance:**
- `vitest` (or `jest` with ts-jest) added as devDependency
- `package.json` has `"test": "vitest run"` script
- Minimum 1 test file per module: pool.ts, RDACore.ts (assessIntelligence mock), LLM client factory
- `npm test` exits 0
- CI `ci.yml` backend job runs `npm test` as an explicit step (not `--if-present`)
- Coverage threshold set at 60% (minimum acceptable for go-live)

**Dependencies:** GL-01  
**Branch:** `gl/gl-02-test-framework`  
**Sprint:** 1

---

### GL-03: Add ESLint + Prettier

**Gaps:** 2 (no linter)  
**Acceptance:**
- `eslint` + `@typescript-eslint/eslint-plugin` + `prettier` added as devDependencies
- `.eslintrc.json` and `.prettierrc` present at repo root
- `package.json` has `"lint": "eslint src --ext .ts"` and `"format": "prettier --write src dashboard/src"`
- `npm run lint` exits 0 on the existing codebase (warnings allowed, errors not)
- CI `ci.yml` runs `npm run lint` as a step in the backend job

**Dependencies:** GL-01  
**Branch:** `gl/gl-03-lint`  
**Sprint:** 1

---

### GL-26: Replace fake CI badge with real Shields.io endpoint

**Gaps:** 34 (static ci-status.json hardcoded "passing")  
**Acceptance:**
- `.github/ci.yml` has a job step that generates `.github/ci-status.json` from actual job result (use a workflow status badge approach or update the JSON to reflect the real run outcome)
- README CI badge reflects real pipeline status, not a static file
- Alternative acceptable: replace the custom endpoint badge with the standard GitHub Actions badge URL pointing to this repo's CI workflow

**Dependencies:** GL-01, GL-02  
**Branch:** `gl/gl-26-ci-badge`  
**Sprint:** 1

---

## Sprint 2 -- Database and infrastructure correctness (day 1 afternoon)

### GL-05: Automate pgvector setup

**Gaps:** 4, 12 (pgvector not automated, vector index commented out)  
**Acceptance:**
- `src/database/schema.sql` includes `CREATE EXTENSION IF NOT EXISTS vector;` as the first DDL statement
- `innovation_proposals` vector index (`USING ivfflat`) is uncommented and active
- `docker-compose.yml` postgres service uses `ankane/pgvector` image (or equivalent pgvector-enabled image) instead of plain `postgres`
- README documents the pgvector requirement and the Docker image change
- `npm run seed-demo` completes without error against a fresh schema

**Dependencies:** GL-01  
**Branch:** `gl/gl-05-pgvector`  
**Sprint:** 2

---

### GL-06: Fix docker-compose startup race

**Gaps:** 5 (depends_on without health condition)  
**Acceptance:**
- `docker-compose.yml` api service `depends_on` postgres entry includes `condition: service_healthy`
- postgres service has a `healthcheck` block: `test: ["CMD-SHELL", "pg_isready -U $POSTGRES_USER"]`, `interval: 5s`, `timeout: 5s`, `retries: 10`
- `docker-compose up` on a cold start does not produce "connection refused" errors in the api container logs

**Dependencies:** GL-05  
**Branch:** `gl/gl-06-compose-health`  
**Sprint:** 2

---

### GL-07: Reconcile docker-compose LLM_PROVIDER and CORS_ORIGIN

**Gaps:** 6, 15  
**Acceptance:**
- `docker-compose.yml` removes the hardcoded `LLM_PROVIDER=bitnet` override (or comments it with a note that BitNet is opt-in)
- `docker-compose.yml` changes `CORS_ORIGIN` to reference a compose variable with `.env` fallback rather than hardcoding `localhost:4173`
- `.env.example` and docker-compose are consistent on defaults

**Dependencies:** GL-01  
**Branch:** `gl/gl-07-compose-env`  
**Sprint:** 2

---

### GL-12: Add DB migration tooling

**Gaps:** 13 (no migration versioning)  
**Acceptance:**
- `node-pg-migrate` or `db-migrate` added as devDependency
- Initial migration file created from current schema.sql
- `package.json` has `"db:migrate": "node-pg-migrate up"` script
- README documents the migration workflow
- schema.sql retained as reference but migration files are the authority

**Dependencies:** GL-05  
**Branch:** `gl/gl-12-migrations`  
**Sprint:** 2

---

### GL-13: Remove duplicated InnovationAgent DDL

**Gaps:** 14 (DDL duplicated in scheduler/index.ts)  
**Acceptance:**
- `src/scheduler/index.ts` does not contain inline `CREATE TABLE IF NOT EXISTS innovation_proposals` DDL
- InnovationAgent initializes by running schema via the migration or by calling `pool.query` from a single shared DDL file
- `npm run build` succeeds after the change

**Dependencies:** GL-12  
**Branch:** `gl/gl-13-ddl-dedup`  
**Sprint:** 2

---

## Sprint 3 -- Docker and deploy hardening (day 1 evening)

### GL-14: Harden Dockerfile

**Gaps:** 16, 17, 18 (single-stage, root user, scheduler not started)  
**Acceptance:**
- Dockerfile uses multi-stage build: `builder` stage installs all deps and compiles; `runtime` stage copies only `dist/` and `node_modules` (production only)
- Runtime stage includes `USER node` (or equivalent non-root user)
- Dockerfile exposes a `CMD` that starts both API and scheduler (use a process supervisor like `tini` with a shell script, or document that the scheduler runs as a separate container with its own CMD override)
- Image built with `docker build .` completes successfully
- `docker-compose up` with the new image starts API and scheduler without error

**Dependencies:** GL-06  
**Branch:** `gl/gl-14-dockerfile`  
**Sprint:** 3

---

### GL-15: Fix RepoCloner

**Gaps:** 19, 20, 21 (stale path, execSync blocking, Linux-only du)  
**Acceptance:**
- RepoCloner default `CLONES_DIRECTORY` is `./clones` (matches README and .env.example)
- `execSync` replaced with `execAsync` (using `child_process.exec` promisified or `execa`)
- `getDirSizeMB` uses a cross-platform approach (recursive stat sum or `du` with Windows fallback)
- `src/scripts/run-deep-analysis.ts` runs successfully against a known small public repo end-to-end

**Dependencies:** GL-01  
**Branch:** `gl/gl-15-repocloner`  
**Sprint:** 3

---

### GL-23: Fix deploy.sh build step

**Gaps:** 31 (npm ci --production then npm run build -- tsc missing)  
**Acceptance:**
- `deploy.sh` runs `npm ci` (all deps) before `npm run build`, then prunes devDeps with `npm prune --production` after build
- OR deploy.sh builds in a separate stage and copies the `dist/` artifact (matching the multi-stage Docker approach)
- Rollback step verifies both `rrda` and `rrda-dashboard` systemd services after rollback
- `deploy.sh --dry-run` (or manual trace) shows the correct install/build/prune sequence

**Dependencies:** GL-14  
**Branch:** `gl/gl-23-deploy-sh`  
**Sprint:** 3

---

## Sprint 4 -- Security and API hardening (day 2 morning)

### GL-11: Add rate limiting to admin endpoints

**Gaps:** 11  
**Acceptance:**
- `express-rate-limit` added as dependency
- Admin routes (`/api/v1/admin/*`) have a rate limiter: max 20 req/min per IP
- Non-admin routes have a looser limiter: max 100 req/min per IP
- Rate limit headers present in responses (`RateLimit-*`)
- 429 response returned and tested when limit exceeded

**Dependencies:** GL-02  
**Branch:** `gl/gl-11-rate-limit`  
**Sprint:** 4

---

### GL-16: Fix EmailNotifier security and env

**Gaps:** 22, 23  
**Acceptance:**
- `EMAIL_FROM_NAME` added to `.env.example` with a placeholder value
- `EmailNotifier` reads `secure` from env (`SMTP_SECURE=true|false`) rather than hardcoding `false`
- When `SMTP_SECURE=false` and port is 587, `requireTLS: true` is set (STARTTLS)
- README documents SMTP configuration options

**Dependencies:** GL-01  
**Branch:** `gl/gl-16-email-notifier`  
**Sprint:** 4

---

### GL-19: Update SlackNotifier to Block Kit

**Gaps:** 26 (legacy attachments API)  
**Acceptance:**
- `SlackNotifier` sends `blocks` array (Block Kit) instead of `attachments`
- Color-coded severity still communicated via block context or section header
- Slack webhook test (`npm run test-alerts`) completes without Slack API deprecation warnings
- Existing functionality (CRITICAL alert, HIGH alert, daily digest) preserved

**Dependencies:** GL-01  
**Branch:** `gl/gl-19-slack-block-kit`  
**Sprint:** 4

---

### GL-08: GitHub scanner graceful degradation

**Gaps:** 7  
**Acceptance:**
- `GitHubScanner` logs a warning and returns `[]` when no tokens are configured, rather than throwing
- Scheduler does not crash when GitHub scanner returns empty due to missing tokens
- Warning message directs user to configure `GITHUB_TOKEN_1` in .env

**Dependencies:** GL-02  
**Branch:** `gl/gl-08-github-graceful`  
**Sprint:** 4

---

## Sprint 5 -- Data quality and type safety (day 2 afternoon)

### GL-18: Resolve Discovery interface camelCase/snake_case

**Gaps:** 25  
**Acceptance:**
- `src/types/index.ts` Discovery interface uses a single consistent naming convention (choose snake_case to match DB columns)
- All references to `discoveredAt` updated to `discovered_at` (or vice versa) throughout codebase
- `npm run build` exits 0
- `npm test` exits 0 after the rename

**Dependencies:** GL-02  
**Branch:** `gl/gl-18-discovery-type`  
**Sprint:** 5

---

### GL-21: Type AlertOrchestrator assessment parameter

**Gaps:** 28  
**Acceptance:**
- An `Assessment` interface (or type) is defined in `src/types/index.ts` with at minimum: `level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NOISE'`, `summary: string`, `reasoning: string`
- `AlertOrchestrator.processDiscovery` parameter typed as `Assessment` instead of `any`
- `RDACore.ts` and all callers updated to pass a typed assessment object
- `npm run build` exits 0

**Dependencies:** GL-18  
**Branch:** `gl/gl-21-assessment-type`  
**Sprint:** 5

---

### GL-22: Fix ReportGenerator logic

**Gaps:** 29, 30  
**Acceptance:**
- `calculateCostSavings()` removed or replaced with a documented placeholder that returns 0 and logs a warning that cost modeling is not implemented
- `getCriticalDiscoveries()` filter changed from `status = 'analyzed'` to include the actual statuses that CRITICAL assessments can have (verify against RDACore storeDiscovery flow -- likely 'new' or add a 'critical' status value)
- `identifyTrends()` adds a row limit to prevent unbounded memory on large data sets (e.g. `LIMIT 1000`)
- Weekly report generation tested against seed data

**Dependencies:** GL-21  
**Branch:** `gl/gl-22-report-generator`  
**Sprint:** 5

---

### GL-27: Fix seed-demo source_id bug

**Gaps:** 35  
**Acceptance:**
- `src/scripts/seed-demo.ts` passes a proper unique source ID string as `$2` (e.g. `github-${discovery.id}` or a generated UUID)
- `npm run seed-demo` inserts 3 clean rows with no constraint violations
- Seeded data visible in dashboard discoveries view

**Dependencies:** GL-05  
**Branch:** `gl/gl-27-seed-demo`  
**Sprint:** 5

---

## Sprint 6 -- Frontend correctness (day 2 evening)

### GL-24: Confirm and fix Tabler Icons loading

**Gaps:** 32  
**Acceptance:**
- Verify whether `styles.css` imports Tabler Icons via CDN `@import` or whether icons are truly missing
- If missing: add `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css">` to `dashboard/index.html`
- OR install `@tabler/icons-react` as a package and replace CSS class usage with React components
- Dashboard renders icon glyphs correctly in browser (no missing icon squares)

**Dependencies:** GL-01  
**Branch:** `gl/gl-24-tabler-icons`  
**Sprint:** 6

---

### GL-25: Fix tsconfig moduleResolution

**Gaps:** 33  
**Acceptance:**
- `tsconfig.json` `moduleResolution` changed from `"node"` to `"node16"` (or `"bundler"` if targeting a bundler)
- `npm run build` exits 0 with the new setting
- No new import path errors introduced (all imports use `.js` extensions as required by ESM)

**Dependencies:** GL-02  
**Branch:** `gl/gl-25-tsconfig`  
**Sprint:** 6

---

### GL-28: Fix vite.config cacheDir and add proxy

**Gaps:** 36, 37  
**Acceptance:**
- `vite.config.ts` removes the hardcoded `/tmp/rrda-vite-cache` cacheDir (or replaces with a relative path like `node_modules/.vite`)
- `vite.config.ts` adds a `server.proxy` entry routing `/api` to `http://localhost:4000` for local dev
- `dashboard/.env.example` documents `VITE_RRDA_API_URL` and its default
- `npm run dev` (in dashboard/) connects to the backend without manual env configuration

**Dependencies:** GL-01  
**Branch:** `gl/gl-28-vite-config`  
**Sprint:** 6

---

## Sprint 7 -- Remaining quality gaps (day 3)

### GL-09: Reddit scanner resilience

**Gaps:** 8  
**Acceptance:**
- `RedditScanner` has explicit error handling for HTTP 429 (rate limit) with exponential backoff and a max retry of 3
- On non-recoverable failure, scanner logs the error and returns `[]` rather than throwing
- Unit test verifies graceful handling of a 429 response (mock fetch)

**Dependencies:** GL-02  
**Branch:** `gl/gl-09-reddit-resilience`  
**Sprint:** 7

---

### GL-10: ArXiv HTTPS and XML parsing

**Gaps:** 9, 10  
**Acceptance:**
- `ArxivScanner` uses `https://export.arxiv.org/api/query` (not http)
- XML parsing replaced with `fast-xml-parser` or `xml2js` (add as dependency)
- Regex parsing removed
- Unit test parses a sample ArXiv response fixture

**Dependencies:** GL-02  
**Branch:** `gl/gl-10-arxiv`  
**Sprint:** 7

---

### GL-17: Fix README config key count

**Gaps:** 24  
**Acceptance:**
- README updated to say "28 config keys" (or the accurate current count)
- README and schema.sql seed count match

**Dependencies:** GL-01  
**Branch:** `gl/gl-17-readme-count`  
**Sprint:** 7

---

### GL-20: CompetitiveReport model selection

**Gaps:** 27  
**Acceptance:**
- `CompetitiveReport.ts` uses `getCreativeModel()` instead of `getDefaultModel()` for synthesis
- Rationale comment added in code

**Dependencies:** GL-01  
**Branch:** `gl/gl-20-report-model`  
**Sprint:** 7

---

### GL-04: Document npm_registry gap

**Gaps:** 3 (npm_registry scanner not implemented)  
**Acceptance:**
- `src/database/schema.sql` comment on the `npm_registry` config row notes: "scanner not yet implemented"
- README lists supported sources as: GitHub, Hacker News, Reddit, ArXiv (no npm_registry claim)
- An issue is opened on GitHub tracking the npm_registry scanner as a future feature

**Dependencies:** GL-01  
**Branch:** `gl/gl-04-npm-registry-doc`  
**Sprint:** 7

---

## Sprint 8 -- Final validation and go-live (day 3-4)

### GL-29: Run Phase 3 SDLC audit (hard gate)

**Gaps:** n/a -- this is the gate itself  
**Acceptance:**
- All 32 audit suites (18 core + 14 web) run against the codebase as it stands after GL-01..GL-28
- Audit results recorded in `docs/engineering-spec/audit-results.md`
- Zero ship-blocking failures remain open
- Any HIGH findings not addressed have a documented exception with owner and resolution date

**Dependencies:** GL-01 through GL-28 complete  
**Branch:** n/a (audit is read-only; any fixes get their own GL id)  
**Sprint:** 8

---

### GL-30: End-to-end smoke test on docker-compose

**Gaps:** integration validation  
**Acceptance:**
- `docker-compose up` on a clean environment starts all 3 services without error
- `/health` returns 200
- `/api/v1/discoveries` returns valid JSON (empty array is acceptable)
- One manual scan trigger (`POST /api/v1/admin/scans` with `{"source":"hn"}`) completes and stores at least 1 discovery
- InnovationAgent runs at least one cycle without error (check logs)
- Dashboard loads in browser and displays the discovery

**Dependencies:** GL-29  
**Branch:** n/a (validation only)  
**Sprint:** 8

---

### GL-31: Push all branches and open PRs

**Gaps:** GitHub execution  
**Acceptance:**
- All GL branches pushed to origin
- One PR per GL id, description includes acceptance gate and GL id reference
- PRs merged in dependency order (CI must pass on each before merge)
- main branch on GitHub matches the final merged state

**Dependencies:** GL-30  
**Branch:** n/a  
**Sprint:** 8

---

## Dependency graph

```
GL-01 (push main)
  |-- GL-02 (tests) --> GL-11, GL-18 --> GL-21 --> GL-22
  |                 --> GL-09, GL-10
  |-- GL-03 (lint)
  |-- GL-05 (pgvector) --> GL-06 --> GL-14 --> GL-23
  |                    --> GL-12 --> GL-13
  |                    --> GL-27
  |-- GL-07 (compose env)
  |-- GL-08 (github graceful)
  |-- GL-15 (repocloner)
  |-- GL-16 (email)
  |-- GL-17 (readme)
  |-- GL-19 (slack)
  |-- GL-20 (report model)
  |-- GL-24 (tabler icons)
  |-- GL-26 (ci badge) <-- also needs GL-02
  |-- GL-28 (vite config)
  |-- GL-04 (npm registry doc)
  GL-25 (tsconfig) --> needs GL-02
GL-01..GL-28 all done --> GL-29 (audit gate) --> GL-30 (smoke test) --> GL-31 (PRs)
```
