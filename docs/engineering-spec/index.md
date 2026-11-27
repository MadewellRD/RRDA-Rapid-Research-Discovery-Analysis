# RRDA Engineering Spec

**Project:** RRDA (Rapid Research Discovery Analysis)  
**Repo:** https://github.com/MadewellRD/RRDA-Rapid-Research-Discovery-Analysis  
**Branch:** main  
**HEAD at spec time:** a680687  
**Remote ahead by:** local is ahead of origin/main (660f855); unpushed commits exist  
**Spec date:** 2026-11-26  
**Sprints:** 8  
**Timeline:** 3-4 days continuous  

## Spec directory

| File | Contents |
|---|---|
| index.md | This file. Overview, variable registry, file map. |
| gaps.md | Full gap inventory (37 items), severity, assigned GL id. |
| roadmap.md | GL-01..GL-nn backlog with acceptance gates, dependencies, sprint assignment. |
| tracker.json | Machine-readable tracker per tracker-contract schema. |

## Variable registry

| Variable | Value |
|---|---|
| PROJECT | RRDA |
| REPO | D:\projects\RRDA-Rapid-Research-Discovery-Analysis |
| GITHUB_REMOTE | https://github.com/MadewellRD/RRDA-Rapid-Research-Discovery-Analysis |
| SPRINTS | 8 |
| TIMELINE | 3-4 days continuous |
| SPEC_DIR | docs/engineering-spec |
| TRACKER | RRDA-golive-tracker |

## Phase 0 git state

- Branch: main (tracking origin/main)
- Working tree: clean, zero uncommitted changes
- Local commits not yet pushed: a680687, bad5650, 27654ab, 522669a, c8cdada, 660f855, 1b51dea, 259b655, 38fed6d, 61f0fd7 (all 10 known commits; origin/main is at 660f855, local is ahead)
- Open PRs: none
- Action required before new branches: push main to origin first (GL-01)

## Architecture summary (from recon)

TypeScript/Node.js ESM monorepo, v2.0.0.

**Backend (src/):** Express v5 REST API + pg singleton pool + OpenAI SDK + node-cron scheduler. Four scanners (GitHub, HN, Reddit, ArXiv). InnovationAgent with pgvector clustering. DeepAnalysis pipeline (clone, LOC, arch extract, AI report). Slack + Email notifiers via AlertOrchestrator. LLM client factory (OpenAI/BitNet).

**Frontend (dashboard/):** React 19 / Vite 8 SPA. Hash router. sessionStorage auth. 6 views. Separate build target.

**Infra:** docker-compose (3 services), Dockerfile (single-stage, root user), deploy.sh (systemd, bare-metal).

**DB:** PostgreSQL + pgvector. 10 tables. 28 config seeds. No migration tooling.

## SDLC audit gate (Phase 3)

Phase 3 must complete with zero ship-blocking failures before any GL task may merge to main. The audit runs against sdlc-command-desk covering all 18 core suites + 14 web suites (32 total). Results are recorded in docs/engineering-spec/audit-results.md.
