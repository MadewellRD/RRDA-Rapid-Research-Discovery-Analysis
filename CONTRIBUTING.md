# Contributing

## Development flow

1. Install dependencies in the root package and in `dashboard/`.
2. Copy `.env.example` to `.env`.
3. Run `npm run dev:api` and `npm run dev:scheduler` in separate terminals.
4. Run `cd dashboard && npm run dev` for the web app.

## Standards

- Keep TypeScript strict and avoid `any` unless there is a strong reason.
- Prefer small composable modules over large mixed-responsibility files.
- Add tests or verification steps for behavior changes.
- Keep docs and `.env.example` in sync with runtime behavior.

## Pull requests

- Explain user-visible changes clearly.
- Include screenshots for web UI changes.
- Call out any schema or environment changes.
