<div align="center">

![](.github/rrda-banner-2.png)

</div>

<div align="center">

[![CI](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/MadewellRD/RRDA-Rapid-Research-Discovery-Analysis/main/.github/ci-status.json)](https://github.com/MadewellRD/RRDA-Rapid-Research-Discovery-Analysis)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-20%2B-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org)
[![Docker](https://img.shields.io/badge/docker-compose-2496ed.svg)](docker-compose.yml)
[![LLM](https://img.shields.io/badge/LLM-OpenAI%20%7C%20BitNet-orange.svg)](#llm-configuration)
[![Sources](https://img.shields.io/badge/sources-GitHub%20%7C%20HN%20%7C%20Reddit%20%7C%20ArXiv-red.svg)](#scanners)

**Rapid Research Discovery Analysis** — autonomous competitive intelligence for engineering teams.

*Scan. Score. Synthesize. Ship.*

</div>

---

RRDA is a self-running intelligence pipeline that continuously collects public engineering signals from GitHub, Hacker News, Reddit, and ArXiv, scores each signal with an LLM, deep-analyzes high-value repositories, and synthesizes emerging trends into novel product proposals every 20 minutes — all without human intervention.

It is not a news aggregator. It is an autonomous product manager that reads the internet so your team doesn't have to.

---

## Table of contents

- [How it works](#how-it-works)
- [Architecture](#architecture)
- [Quickstart](#quickstart)
- [Dashboard](#dashboard)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [CLI reference](#cli-reference)
- [Scheduler internals](#scheduler-internals)
- [Security model](#security-model)
- [Project layout](#project-layout)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## How it works

RRDA runs three concurrent loops:

**1. Scan loop** — four scanners run on configurable cron schedules and pull raw signals from public sources. Each signal passes through a domain relevance filter (checking against ~60 keywords covering AI, devtools, infrastructure, enterprise) before any LLM call is made. This keeps token costs near zero for off-topic noise.

**2. Assessment loop** — signals that pass the domain filter are sent to the LLM for scoring. Each discovery receives a threat score (0–10), an opportunity score (0–10), and an intelligence classification: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, or `NOISE`. HIGH and CRITICAL GitHub repositories are queued for deep analysis — the system clones the repo, counts lines of code by language, identifies architecture patterns and framework dependencies, and generates a competitive summary.

**3. Innovation loop** — every 20 minutes the Innovation Agent pulls recent high-value discoveries, clusters them by theme using a cheap model, then runs a high-temperature creative synthesis pass using a more capable model. The agent is explicitly instructed to find **gaps** — things that don't exist yet but should — rather than copying what it sees. Proposals are deduplicated using pgvector cosine similarity before storage. Accepted proposals flow into Slack and email alerts.

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                    InnovationScheduler                 │
│                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │  GitHub  │  │    HN    │  │  Reddit  │  │ ArXiv  │  │
│  │  15 min  │  │   1 hr   │  │   6 hr   │  │ daily  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘  │
│       │             │             │            │       │
│       └─────────────┴─────────────┴────────────┘       │
│                         │                              │
│              Domain keyword filter                     │
│                         │                              │
│                  RDACore.assess()                      │
│          (threat score · opportunity score             │
│          intelligence level classification)            │
│                         │                              │
│              ┌──────────┴──────────┐                   │
│              │                     │                   │
│    discoveries table     DeepAnalysisPipeline          │
│                       (clone → LOC → arch → AI)        │
│                                    │                   │
│                          deep_analyses table           │
│                                                        │
│  ┌──────────────────────────────────────────────┐      │
│  │  InnovationAgent  (every 20 min)             │      │
│  │  1. Pull HIGH/CRITICAL discoveries           │      │
│  │  2. Cluster by theme (cheap model)           │      │
│  │  3. Synthesize novel proposal (high-temp)    │      │
│  │  4. Deduplicate via pgvector cosine sim      │      │
│  │  5. Store → Slack/email alert                │      │
│  └──────────────────────────────────────────────┘      │
└────────────────────────────────────────────────────────┘
                          │
              ┌───────────┴──────────┐
              │                      │
         REST API (4000)      React Dashboard (4173)
         Express + PG          Vite + React SPA
                                6-view sidebar nav
                                DB-backed config UI
```

**Key design decisions:**

- The domain filter runs before every LLM call. GitHub trending alone can surface hundreds of repositories per scan; without filtering, the LLM cost scales linearly with source volume. With filtering, 80–90% of off-topic results are dropped for free.
- The LLM abstraction layer supports both OpenAI and any local OpenAI-compatible server (BitNet, Ollama, etc.). High-volume clustering tasks can run on a free local model; creative synthesis uses a paid, more capable model. The mix is configurable per-model in the config table.
- Job state is persisted in Postgres (`scan_jobs` table), not in memory. The API can be scaled horizontally without losing job history.
- The Innovation Agent's duplicate check uses pgvector cosine similarity on `text-embedding-3-small` embeddings. This replaces an earlier approach that appended all recent proposals into a context string — a pattern that would eventually blow the context window and cost significant tokens at scale.
- All runtime configuration is stored in a `config` Postgres table and is editable live via the dashboard. No restart is required for scheduler interval or scanner toggle changes.

---

## Quickstart

### Docker (recommended)

```bash
git clone https://github.com/MadewellRD/RRDA-Rapid-Research-Discovery-Analysis.git
cd RRDA-Rapid-Research-Discovery-Analysis

cp .env.example .env
# Edit .env — minimum required: OPENAI_API_KEY, GITHUB_TOKEN_1, API_KEY
docker compose up --build
```

| Service | URL |
|---|---|
| REST API | http://localhost:4000 |
| Dashboard | http://localhost:4173 |
| PostgreSQL | localhost:5432 |

The compose file defaults to `LLM_PROVIDER=bitnet` pointing at `host.docker.internal:8080`. Change it to `openai` in `docker-compose.yml` or override in `.env` if you're not running a local inference server.

### Native

Requires **Node 20+** and **PostgreSQL 16**.

```bash
cp .env.example .env
# Edit .env

npm ci
cd dashboard && npm ci && cd ..
npm run build

# Apply the database schema
psql $DATABASE_URL -f src/database/schema.sql
```

Start each process in a separate terminal (or use a process manager):

```bash
npm run dev:api         # REST API — http://localhost:4000
npm run dev:scheduler   # Background scanner + innovation agent
cd dashboard && npm run dev  # Vite dev server — http://localhost:4173
```

### Seed demo data

Populate the database with synthetic discoveries, proposals, and analyses without running live scans:

```bash
npm run seed:demo
```

---

## Dashboard

The dashboard is a React SPA served from port 4173. It connects directly to the REST API and stores your admin session key in `sessionStorage` — it never leaves your browser.

### Views

| View | What it shows |
|---|---|
| **Overview** | Live stat counters, recent critical signals, source coverage health |
| **Intelligence** | Full paginated discovery feed with search, level filter, and source filter |
| **Deep reports** | Competitive analysis reports from cloned repository scans |
| **Proposals** | Innovation Agent proposals with expandable detail cards |
| **Operations** | Manual scan triggers, real-time job status, source health table |
| **Configuration** | All 27 RRDA settings grouped by category — editable live |

### Authenticating

Admin features (triggering scans, reading and writing configuration) require the `API_KEY` you set in `.env`. The dashboard will show a connect banner on load. Enter your key once — it persists for the browser session. You can also navigate directly to **Configuration** to enter it there.

The key is never stored in `localStorage` or transmitted anywhere except the `x-api-key` header on admin API calls.

### Configuration view

Every setting in the system is exposed here, grouped into seven sections:

| Section | Settings |
|---|---|
| API & auth | CORS origin |
| LLM provider | Provider (openai/bitnet), API key, default model, creative model, BitNet URL |
| Scanners | Enable/disable toggle and scan frequency for each of the 4 sources |
| Scheduler | Master on/off, auto deep-analysis, Innovation Agent on/off and cycle interval |
| Notifications | Slack webhook URL, alert email, SMTP host/port/user/password |
| GitHub tokens | Primary and secondary GitHub API tokens |
| Storage | Max clone size, clone retention period |

Changes are written to the `config` Postgres table via `PATCH /api/v1/admin/config` and take effect on the next scheduler cycle. Secret values (keys, tokens, passwords) are masked in the response — submitting the masked placeholder `••••••••` leaves the stored value unchanged.

---

## Configuration

### Environment variables

Copy `.env.example` to `.env`. The minimum viable set to get running:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **yes** | PostgreSQL connection string |
| `API_KEY` | **yes** | Secret key for all `/api/v1/admin/*` endpoints. Without this, admin routes return 503. |
| `OPENAI_API_KEY` | yes* | Used for discovery scoring, synthesis, and embeddings |
| `GITHUB_TOKEN_1` | recommended | GitHub PAT — unauthenticated API rate limits are extremely low (60 req/hr) |
| `GITHUB_TOKEN_2` | optional | Second token for round-robin rotation |
| `CORS_ORIGIN` | optional | Allowed origin for the dashboard (default: `http://localhost:4173`) |
| `LLM_PROVIDER` | optional | `openai` (default) or `bitnet` |
| `BITNET_BASE_URL` | if bitnet | Base URL for a local OpenAI-compatible inference server |
| `SLACK_WEBHOOK_URL` | optional | Incoming webhook for CRITICAL alerts and proposal notifications |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` | optional | Email alert delivery |
| `ALERT_EMAIL` | optional | Recipient for email digests |

Full variable reference with defaults is in [`.env.example`](.env.example).

### LLM configuration

RRDA uses two model slots:

- **Default model** (`LLM_DEFAULT_MODEL`, default `gpt-4o-mini`) — used for domain scoring, classification, and thematic clustering. High-volume, cost-sensitive.
- **Creative model** (`LLM_CREATIVE_MODEL`, default `gpt-4o`) — used for the Innovation Agent's synthesis pass. Low-volume, quality-sensitive.

To use a local inference server instead of OpenAI, set `LLM_PROVIDER=bitnet` and point `BITNET_BASE_URL` at any OpenAI-compatible endpoint (BitNet, Ollama, LM Studio, etc.). The embeddings API (`text-embedding-3-small`) still falls back to OpenAI for pgvector duplicate detection if no local embedding endpoint is available — the system degrades gracefully to a capped LLM string comparison if embeddings fail.

### DB-backed runtime config

After first run, all scheduler and scanner settings can be updated live via the dashboard or directly via the config API without restarting any process. The `config` table is seeded on first `schema.sql` apply. Environment variables in `.env` are used for bootstrap only; runtime behavior is controlled by the database values.

---

## API reference

All endpoints return JSON. Admin endpoints require `x-api-key: <API_KEY>` or `Authorization: Bearer <API_KEY>`.

### Public endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Service health — database and LLM status |
| `GET` | `/api/v1/stats` | Counts by intelligence level, active jobs, last discovery timestamp |
| `GET` | `/api/v1/discoveries` | Paginated discovery list. Query params: `page`, `limit` (max 100), `level`, `source`, `query` (title/description search) |
| `GET` | `/api/v1/discoveries/:id` | Single discovery with attached deep analysis if available |
| `GET` | `/api/v1/reports/deep-analyses` | Most recent 20 deep analysis reports |
| `GET` | `/api/v1/proposals` | Most recent 20 Innovation Agent proposals |
| `GET` | `/api/v1/sources` | Source health: scan frequency, last scan, total and recent (7-day) discovery counts |
| `GET` | `/api/v1/jobs` | Most recent 20 manual scan jobs |

### Admin endpoints

Require `x-api-key` header. Return `401` if the key is wrong, `503` if `API_KEY` env var is not set.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/admin/scans` | Trigger a manual scan. Body: `{ "source": "github" \| "hackernews" \| "reddit" \| "arxiv" }`. Returns a job ID immediately; scan runs asynchronously. |
| `GET` | `/api/v1/admin/config` | Read all 27 config keys. Secret values are masked as `••••••••`. Add `?reveal=1` to return plain values (use with care). |
| `PATCH` | `/api/v1/admin/config` | Update one or more config keys. Body: flat key/value object. Values equal to `••••••••` are skipped. Returns `{ ok, updated[], skipped[] }`. |

### Example: trigger a GitHub scan

```bash
curl -X POST http://localhost:4000/api/v1/admin/scans \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{"source": "github"}'
```

### Example: update scanner settings

```bash
curl -X PATCH http://localhost:4000/api/v1/admin/config \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{
    "SCAN_REDDIT": "false",
    "GITHUB_SCAN_FREQUENCY": "30min",
    "INNOVATION_CYCLE_MINUTES": "30"
  }'
```

---

## CLI reference

All commands require `.env` to be present and `DATABASE_URL` to be set.

### Scanners

```bash
npm run scan:github    # GitHub trending + search
npm run scan:hn        # Hacker News front page + Show HN
npm run scan:reddit    # Configured subreddits
npm run scan:arxiv     # cs.AI, cs.LG, cs.SE, cs.CL
npm run scan:all       # All four sources sequentially
```

### Deep analysis

```bash
npm run deep-analysis           # Analyze up to 10 unprocessed HIGH+ discoveries
npm run deep-analysis 25        # Analyze up to 25
npm run deep-analysis:id -- 42  # Analyze a specific discovery by database ID
```

Clones are written to `CLONES_DIRECTORY` (default `./clones`) and deleted after `CLONE_RETENTION_HOURS` (default 4).

### Alerts

```bash
npm run alerts:test      # Verify Slack and SMTP connectivity
npm run alerts:digest    # Send the daily digest immediately
npm run alerts:weekly    # Send the weekly report immediately
```

### Demo data

```bash
npm run seed:demo    # Seed the database with synthetic data for UI exploration
```

---

## Scheduler internals

The `InnovationScheduler` (`src/scheduler/index.ts`) owns all background cron jobs. It runs as a separate process from the API and uses a `Set` to prevent overlapping runs — if a GitHub scan is still in progress when the next GitHub cron fires, the new run is skipped rather than queued.

| Job | Schedule | Timezone |
|---|---|---|
| GitHub scan | Every 15 minutes | PT |
| HackerNews scan | Every hour | PT |
| Reddit scan | Every 6 hours | PT |
| ArXiv scan | Daily at midnight | PT |
| Innovation Agent | Every 20 minutes | PT |
| Daily digest | 8 AM daily | PT |
| Weekly report | 9 AM every Monday | PT |

All scan frequencies are seeded into the `config` table and can be changed live from the dashboard without restarting the scheduler.

**Domain filter** — before any LLM call, each discovery's title and description are checked against ~60 domain keywords across five categories: AI/ML, devtools, cloud infrastructure, enterprise software, and the development ecosystem. Discoveries that don't match any keyword are stored as `NOISE` and skipped. This is the primary cost control mechanism.

---

## Security model

### Admin API key

All `/api/v1/admin/*` endpoints require an `x-api-key` header matching the `API_KEY` environment variable. If `API_KEY` is not set, these endpoints return `503 Service Unavailable` rather than open access. Set a strong random value — 32+ hex characters is recommended.

```bash
# Generate a key
openssl rand -hex 32
```

### CORS

The API's CORS policy defaults to `http://localhost:4173`. Override with the `CORS_ORIGIN` environment variable. The previous wildcard fallback (`true`) that reflected any origin has been replaced — the server will reject cross-origin requests from unlisted origins.

### SQL injection

All database queries use parameterized `$1, $2, ...` placeholders throughout. No string interpolation is used in query construction.

### Secret masking

Config values marked `secret: true` in the `config` table (API keys, tokens, SMTP passwords, webhooks) are returned as `••••••••` by `GET /api/v1/admin/config`. The plain value is only returned when `?reveal=1` is explicitly passed — still behind the admin auth gate.

### pgvector duplicate detection

The Innovation Agent generates an embedding for each proposal before storing it and checks cosine similarity against all previous proposals. This prevents the earlier approach of appending an unbounded list of proposals into the LLM context — a pattern that would eventually expose all past proposal data to the model in a single call.

### Session key handling

The dashboard stores the admin API key in `sessionStorage` — not `localStorage`. It is cleared when the browser tab is closed and is never written to any server-side storage or included in URLs.

---

## Project layout

```
src/
  agents/
    InnovationAgent.ts       Trend clustering, creative synthesis, pgvector dedup
  analyzers/
    DeepAnalysisPipeline.ts  Clone → LOC count → architecture extract → AI summary
    ArchitectureExtractor.ts File-tree pattern recognition
    CodeAnalyzer.ts          Language and dependency analysis
    CompetitiveReport.ts     AI-generated competitive summary
    RepoCloner.ts            Git clone with size guard and retention cleanup
  core/
    RDACore.ts               LLM assessment, scoring, discovery persistence
  database/
    pool.ts                  Shared PG connection pool
    schema.sql               All table definitions, indexes, and config seeds
  llm/
    client.ts                LLM client factory — OpenAI or local BitNet
  notifiers/
    AlertOrchestrator.ts     CRITICAL alert routing, digest and weekly report logic
    SlackNotifier.ts         Slack incoming webhook
    EmailNotifier.ts         Nodemailer SMTP
    ReportGenerator.ts       Markdown report builder
  scanners/
    GitHubScanner.ts         Trending repos + keyword search via Octokit
    HackerNewsScanner.ts     Front page + Show HN via Algolia API
    RedditScanner.ts         Subreddit hot posts via Reddit JSON API
    ArxivScanner.ts          Category feeds via ArXiv Atom API
    run.ts                   CLI runner for manual scans
  scheduler/
    index.ts                 InnovationScheduler — all cron jobs and domain filter
  scripts/
    seed-demo.ts             Demo data seeder
    run-deep-analysis.ts     CLI for on-demand deep analysis
  server/
    app.ts                   Express app — all routes, admin middleware, config endpoints
    index.ts                 HTTP server entrypoint
  types/
    index.ts                 Shared TypeScript interfaces

dashboard/
  src/
    App.tsx                  Full SPA — 6 views, hash router, session key management
    styles.css               Sidebar layout, responsive breakpoints, component styles
    main.tsx                 React entrypoint
  index.html
  vite.config.ts
  package.json

scripts/
  deploy.sh                  Reference systemd deploy script
  test-alerts.ts             Slack + email connectivity tester

.env.example                 All environment variables with defaults and descriptions
docker-compose.yml           Three-service stack: postgres, api, web
Dockerfile                   Multi-stage build for the API
```

---

## Deployment

### Docker

The compose stack is self-contained. For production:

1. Set all required environment variables in `.env` or your secrets manager.
2. Set `CORS_ORIGIN` to your actual dashboard domain.
3. Set `NODE_ENV=production`.
4. Replace the default Postgres credentials in `docker-compose.yml` with strong values.
5. Mount a volume for `CLONES_DIRECTORY` if you want clone storage to survive container restarts.

```bash
docker compose up -d
```

### Systemd (native)

A reference deploy script is at [`scripts/deploy.sh`](scripts/deploy.sh). It expects a Node 20 system install and a running PostgreSQL instance. Set `DEPLOY_DIR` to your checkout path before running.

Two systemd services are expected: one for the API process and one for the scheduler. The deploy script builds TypeScript and restarts both.

### Schema migrations

The schema uses `CREATE TABLE IF NOT EXISTS` and `INSERT ... ON CONFLICT DO NOTHING` throughout — it is safe to re-apply against an existing database. When upgrading an existing installation, run:

```bash
psql $DATABASE_URL -f src/database/schema.sql
```

New tables and config keys will be added; existing data is not touched.

### pgvector (optional)

To activate the vector-based duplicate detection in the Innovation Agent, enable the pgvector extension in your Postgres instance:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

The `concept_embedding vector(1536)` column is already present in the schema. The IVFFlat index definition is included in the schema file as a comment — uncomment it after enabling the extension and populating a meaningful number of rows (100+):

```sql
CREATE INDEX idx_innovation_proposals_embedding
  ON innovation_proposals USING ivfflat (concept_embedding vector_cosine_ops) WITH (lists = 100);
```

Without pgvector, the system falls back to an LLM-based duplicate check against the 10 most recent proposals. The behavior is functionally equivalent at low proposal volumes.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and pull requests are welcome.

Before opening a PR, run:

```bash
npm run build        # TypeScript compile check
npx tsc --noEmit     # Type check without output
cd dashboard && npm run build  # Dashboard build check
```

CI runs both checks on every push to `main` and `develop`.

---

## License

Apache-2.0 — see [LICENSE](LICENSE).
