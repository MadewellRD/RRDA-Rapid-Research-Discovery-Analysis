# RRDA

RRDA, short for Rapid Research Development Analysis, is an open-source intelligence workspace for engineering teams tracking developer tools, AI software systems, and market-moving technical signals.

It continuously collects public discoveries, scores them for relevance, stores deep analyses, and synthesizes proposal candidates from emerging trends. The repo now ships with:

- a TypeScript API server
- a React web interface
- PostgreSQL-backed storage
- source scanners for GitHub, Hacker News, Reddit, and ArXiv
- deep-analysis and proposal-generation workflows

## Quickstart

### Docker

```bash
cp .env.example .env
docker compose up --build
```

API: `http://localhost:4000`

Web: `http://localhost:4173`

### Native

```bash
cp .env.example .env
npm ci
cd dashboard && npm ci && cd ..
npm run build
```

Run the API:

```bash
npm run dev:api
```

Run the scheduler:

```bash
npm run dev:scheduler
```

Run the web app:

```bash
cd dashboard
npm run dev
```

## Demo Data

To populate the UI quickly in a fresh database:

```bash
npm run seed:demo
```

## Environment

Key variables:

- `DATABASE_URL`
- `RDA_API_PORT`
- `CORS_ORIGIN`
- `LLM_PROVIDER`
- `OPENAI_API_KEY`
- `BITNET_BASE_URL`
- `BITNET_MODEL`
- `GITHUB_TOKEN_1`
- `SLACK_WEBHOOK_URL`

The full list lives in [.env.example](/opt/repos/RRDA-Rapid-Research-Development-Analysis/.env.example).

## API

Important endpoints:

- `GET /health`
- `GET /api/v1/stats`
- `GET /api/v1/discoveries`
- `GET /api/v1/discoveries/:id`
- `GET /api/v1/reports/deep-analyses`
- `GET /api/v1/proposals`
- `GET /api/v1/sources`
- `GET /api/v1/jobs`
- `POST /api/v1/admin/scans`

## Development Notes

- The root package owns the API, scheduler, scanners, and analysis pipeline.
- The [`dashboard`](/opt/repos/RRDA-Rapid-Research-Development-Analysis/dashboard) app is a separate Vite/React frontend.
- The checked-in schema is in [`src/database/schema.sql`](/opt/repos/RRDA-Rapid-Research-Development-Analysis/src/database/schema.sql).

## Open Source

RRDA is released under Apache-2.0. See [LICENSE](/opt/repos/RRDA-Rapid-Research-Development-Analysis/LICENSE).
