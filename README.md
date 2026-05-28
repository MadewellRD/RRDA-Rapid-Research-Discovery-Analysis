```
                                          /$$$$$$   /$$$$$$   /$$$$$$$   /$$$$$$
                                         /$$__  $$ /$$__  $$ | $$__  $$ /$$__  $$
                                        | $$  \__/| $$  \__/ | $$  \ $$| $$  \ $$
                                        | $$      |  $$$$$$  | $$$$$$$/| $$  | $$
                                        | $$       \____  $$ | $$____/ | $$  | $$
                                        | $$    $$ /$$  \ $$ | $$      | $$  | $$
                                        |  $$$$$$/|  $$$$$$/ | $$      |  $$$$$$/
                                         \______/  \______/  |__/       \______/


 /$$$$$$$$                      /$$       /$$                                                                   /$$
| $$_____/                     |__/      | $$                                                                  | $$
| $$       /$$$$$$   /$$$$$$  /$$  /$$$$$$$      /$$$$$$   /$$$$$$   /$$$$$$$  /$$$$$$   /$$$$$$   /$$$$$$   /$$$$$$    /$$$$$$
| $$$$$   |____  $$ /$$__  $$| $$ /$$__  $$     /$$__  $$ /$$__  $$ /$$_____/ /$$__  $$ |____  $$ /$$__  $$ |_  $$_/   /$$__  $$
| $$__/    /$$$$$$$| $$  \__/| $$| $$  | $$    | $$  \__/| $$$$$$$$|  $$$$$$ | $$$$$$$$  /$$$$$$$| $$  \__/   | $$    | $$$$$$$$
| $$      /$$__  $$| $$      | $$| $$  | $$    | $$      | $$_____/ \____  $$| $$_____/ /$$__  $$| $$         | $$ /$$| $$_____/
| $$$$$$$$|  $$$$$$$| $$      | $$|  $$$$$$$    | $$      |  $$$$$$$ /$$$$$$$/|  $$$$$$$|  $$$$$$$| $$         |  $$$$/|  $$$$$$$
|________/ \_______/|__/      |__/ \_______/    |__/       \_______/|_______/  \_______/ \_______/|__/          \___/   \_______/


 /$$$$$$                                /$$                        /$$
/$$__  $$                              | $$                       |__/
| $$  \ $$  /$$$$$$  /$$$$$$$ /$$   /$$| $$ /$$   /$$  /$$$$$$$ /$$  /$$$$$$$
| $$$$$$$$ |____  $$| $$__  $$| $$  | $$| $$| $$  | $$ /$$_____/| $$ /$$_____/
| $$__  $$  /$$$$$$$| $$  \ $$| $$  | $$| $$| $$  | $$|  $$$$$$ | $$|  $$$$$$
| $$  | $$ /$$__  $$| $$  | $$| $$  | $$| $$| $$  | $$ \____  $$| $$ \____  $$
| $$  | $$|  $$$$$$$| $$  | $$|  $$$$$$$| $$|  $$$$$$$ /$$$$$$$/ | $$ /$$$$$$$/
|__/  |__/ \_______/|__/  |__/ \____  $$|__/ \____  $$|_______/  |__/|_______/
                                /$$  | $$     /$$  | $$
                               |  $$$$$$/    |  $$$$$$/
                                \______/      \______/
```

<div align="center">

[![CI](https://github.com/MadewellRD/RRDA-Rapid-Research-Development-Analysis/actions/workflows/ci.yml/badge.svg)](https://github.com/MadewellRD/RRDA-Rapid-Research-Development-Analysis/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-20%2B-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6.svg)](https://www.typescriptlang.org)
[![Docker](https://img.shields.io/badge/docker-compose-2496ed.svg)](docker-compose.yml)
[![LLM](https://img.shields.io/badge/LLM-OpenAI%20%7C%20BitNet-orange.svg)](#configuration)
[![Sources](https://img.shields.io/badge/sources-GitHub%20%7C%20HN%20%7C%20Reddit%20%7C%20ArXiv-red.svg)](#running-scans-manually)

**Rapid Research Development Analysis** — open-source competitive intelligence for engineering teams.

*Scan. Score. Synthesize. Ship.*

</div>

---

RRDA continuously collects public signals from GitHub, Hacker News, Reddit, and ArXiv, scores each discovery for relevance using an LLM, runs deep analysis on high-value repositories, and synthesizes emerging trends into actionable product proposals via an Innovation Agent.

## What it does

- **Scans** four public sources on configurable schedules — GitHub every 15 min, HN hourly, Reddit every 6 hours, ArXiv daily
- **Filters** discoveries against a domain keyword list before spending LLM tokens on assessment
- **Scores** each discovery with threat and opportunity scores (0–10) and classifies it as CRITICAL / HIGH / MEDIUM / LOW / NOISE
- **Deep-analyzes** HIGH+ GitHub repositories by cloning them, counting LOC by language, extracting architecture patterns, and generating a competitive summary
- **Proposes** novel product ideas every 20 minutes by clustering recent signals and running a creative synthesis pass
- **Alerts** via Slack and email — immediate for CRITICAL, batched daily digest and weekly report for everything else
- **Exposes** a REST API and React dashboard for browsing everything

## Quickstart

### Docker (recommended)

```bash
cp .env.example .env
# edit .env — at minimum set OPENAI_API_KEY and GITHUB_TOKEN_1
docker compose up --build
```

API: `http://localhost:4000`  
Dashboard: `http://localhost:4173`

### Native

Requires Node 20+ and a running PostgreSQL 16 instance.

```bash
cp .env.example .env
# edit .env
npm ci
cd dashboard && npm ci && cd ..
npm run build
```

Apply the schema:

```bash
psql $DATABASE_URL -f src/database/schema.sql
```

Start each process in a separate terminal:

```bash
npm run dev:api        # REST API on port 4000
npm run dev:scheduler  # scanner + innovation agent
cd dashboard && npm run dev  # Vite dev server on port 4173
```

### Seed demo data

To populate the UI without running live scans:

```bash
npm run seed:demo
```

## Configuration

Copy `.env.example` to `.env` and fill in the values. The minimum viable set:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `OPENAI_API_KEY` | yes* | Used for discovery scoring and analysis |
| `GITHUB_TOKEN_1` | recommended | GitHub PAT — unauthenticated rate limits are very low |
| `SLACK_WEBHOOK_URL` | optional | Incoming webhook for alerts |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` | optional | Email alerts |
| `ALERT_EMAIL` | optional | Recipient for email digests |

*Set `LLM_PROVIDER=bitnet` and configure `BITNET_BASE_URL` / `BITNET_MODEL` to use a local OpenAI-compatible inference server instead.

Full variable reference is in [.env.example](.env.example).

## Running scans manually

```bash
npm run scan:github
npm run scan:hn
npm run scan:reddit
npm run scan:arxiv
npm run scan:all
```

## Deep analysis

Clone, analyze, and AI-assess unprocessed HIGH+ discoveries:

```bash
npm run deep-analysis        # process up to 10
npm run deep-analysis 25     # process up to 25
npm run deep-analysis:id -- 42  # analyze a specific discovery by ID
```

Clones are written to `CLONES_DIRECTORY` (default `./clones`) and deleted after `CLONE_RETENTION_HOURS`.

## Alerts

```bash
npm run alerts:test     # test Slack and email connectivity
npm run alerts:digest   # send daily digest immediately
npm run alerts:weekly   # send weekly report immediately
```

## API

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Service health check |
| GET | `/api/v1/stats` | Counts by level, active jobs |
| GET | `/api/v1/discoveries` | Paginated list; filter by `level`, `source`, `query` |
| GET | `/api/v1/discoveries/:id` | Single discovery with deep analysis if available |
| GET | `/api/v1/reports/deep-analyses` | Recent deep analysis reports |
| GET | `/api/v1/proposals` | Innovation Agent proposals |
| GET | `/api/v1/sources` | Source health and scan history |
| GET | `/api/v1/jobs` | Recent manual scan jobs |
| POST | `/api/v1/admin/scans` | Trigger a scan: `{ "source": "github" }` |

## Project layout

```
src/
  agents/          InnovationAgent — trend synthesis and proposal generation
  analyzers/       Deep analysis pipeline (clone → LOC → architecture → AI report)
  core/            RDACore — LLM assessment and discovery storage
  database/        Shared connection pool and schema.sql
  llm/             LLM client factory (OpenAI or local BitNet)
  notifiers/       Slack, email, alert orchestration, report generation
  scanners/        GitHub, HackerNews, Reddit, ArXiv scanners + CLI runner
  scheduler/       InnovationScheduler — cron wiring for all loops
  scripts/         seed-demo, run-deep-analysis
  server/          Express REST API
  types/           Shared TypeScript interfaces
dashboard/         Vite + React frontend
scripts/           deploy.sh, test-alerts.ts
```

## Scheduler internals

The scheduler (`src/scheduler/index.ts`) runs a single `InnovationScheduler` process that owns all cron jobs:

- GitHub scan every 15 min
- HN scan every hour
- Reddit scan every 6 hours
- ArXiv scan daily at midnight PT
- Innovation Agent cycle every 20 min
- Daily digest at 8 AM PT
- Weekly report Monday 9 AM PT

Each scanner run passes discoveries through a domain relevance filter before hitting the LLM, keeping costs low.

## Deployment

See [`scripts/deploy.sh`](scripts/deploy.sh) for a reference systemd-based deploy script. Set `DEPLOY_DIR` to your checkout path before running.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0. See [LICENSE](LICENSE).
