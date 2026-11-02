# District Wheels Dispatch Directory

District Wheels helps a fulfillment manager find repeat buyers and copy shipping details into LBC and J&T Express forms.

**Application request path: React → authenticated Express API → Supabase PostgreSQL with RLS.** Express is the buyer and owner-backup API in development and on Vercel. Supabase Auth handles sign-in. Specialized Edge Functions handle demo sessions, demo reset, and the dispatch assistant; they use the same database and access rules.

[Completed security review and evidence](SECURITY-CHECKLIST.md) · [API contract](docs/application-api.md) · [AI usage and authorship](AI-USAGE.md)

## Requirements

- Node.js 24.x and npm.
- Docker Desktop (running) for the reproducible local Supabase environment. First setup downloads container images and may take several minutes.
- No hosted Supabase account or AI API key is required for local buyer CRUD or the fictional demo.

## Fresh local setup

```bash
npm ci
npm run local:setup
```

The setup applies `supabase/migrations/` to local containers, creates an approved demo Auth account, and seeds three fictional buyers. It writes ignored server/browser/function configurations. Existing configurations are preserved once in `backups/local-config/`; existing local demo buyers are not reset on subsequent runs. This command rejects non-loopback Supabase targets.

Start these commands in separate terminals:

```bash
npm run local:functions
```

```bash
npm run dev
```

Open **http://localhost:5173** and select **Enter Demo**. Vite proxies `/api` to Express at `127.0.0.1:3000`. Sign-in calls the local demo Edge Function; buyer operations then call Express with the current Supabase bearer token.

The assistant can collect buyer details and use deterministic/cached lookups without an AI key. General AI conversation requires an optional `GROQ_API_KEY` in the ignored `supabase/functions/.env.local`; official carrier/postal lookups also need internet access. Missing external services must not prevent normal buyer CRUD.

The local demo has no owner privileges. Owner backup integration tests provision disposable local owner fixtures and remove them afterward. A real owner must sign in through GitHub and be provisioned by an administrator; the application never grants owner access from user-editable metadata or from an email/password login.

To stop local services:

```bash
npx --no-install supabase stop
```

To deliberately recreate the local database, stop application processes, run `npx --no-install supabase db reset --local`, and rerun `npm run local:setup`. Reset deletes local data; it is not part of normal startup.

## Environment configuration

The bootstrap generates all required local values. For a hosted environment, use `.env.example` for Express and `client/.env.example` for Vite:

- Server: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`; optional `PORT` (default 3000).
- Browser: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Edge Functions: `APP_ORIGINS`, `DEMO_EMAIL`, `DEMO_PASSWORD`, `DEMO_USER_ID`, `DEMO_RATE_SALT`; optional `GROQ_API_KEY`. Supabase supplies its platform keys to Edge Functions.

Only public project configuration belongs in `VITE_` variables. Express uses the public key plus each caller's verified bearer token, not a service-role key. Local bootstrap and integration tests use local administrator credentials stored only in ignored files. Git and deployment uploads exclude environment files, private backups, temporary data, and unrelated presentation material.

## API and database

`GET /api/health` is public. All buyer and backup routes require a verified Supabase session and the database allowlist. The owner must have the approved GitHub identity and an OAuth session; demo access is limited to fictional demo rows.

- `GET /api/buyers?q=...` — alphabetical name/phone search (`200`).
- `GET /api/buyers/:buyerId` — record detail (`200`, or `404` for missing/inaccessible records).
- `POST /api/buyers` — validated create (`201`, with a Location header).
- `PUT /api/buyers/:buyerId` — validated replacement (`200`).
- `DELETE /api/buyers/:buyerId` — atomic deletion (`204`).
- `GET /api/owner/backup` — owner-only JSON export.
- `POST /api/owner/backup/inspect` — owner-only dry run.
- `POST /api/owner/backup/restore` — additive, atomic owner-only restore; existing records are never overwritten.

Buyer JSON uses `name`, `phone`, `preferredCourier`, `addresses`, and `pickups`. The form and Express share normalization and field validation. PostgreSQL independently enforces constraints, ownership, and atomic saves/deletes with audit records. There is no JSON-store fallback or second PostgreSQL schema.

Errors use `application/problem+json`, a safe `message`, field `errors` when applicable, and a correlation ID. Invalid input is `400`; unauthenticated access `401`; forbidden access `403`; missing records `404`; conflicts `409`; oversized input `413`; wrong content type `415`; throttling `429`; unavailability `503`; timeouts `504`; unexpected internal failures `500`.

The canonical schema and changes live in `supabase/migrations/`. One historical migration now permits an empty fresh install to remain unprovisioned and closed. Existing production migrations must never be blindly replayed: older hosted timestamps differ from local history. Use the [release guide](docs/application-api.md#release-and-recovery) for forward-only deployment.

## Verification

```bash
npm test
npm run test:integration
npm run build
npm audit
```

With the local app and functions running, run `npx --no-install playwright install chromium`
once, then `npm run test:browser`. On a machine with Chrome already installed,
set `BROWSER_CHANNEL=chrome` instead of downloading Chromium.

Integration tests require `npm run local:setup` first and refuse hosted databases. They exercise real local Auth, RLS, REST requests, atomic rollback, backup restore, typed errors, and quota enforcement. OAuth claims in these tests are signed using only the local test JWT secret; this is not a production authentication shortcut or a live GitHub OAuth test.

GitHub Actions runs unit/API checks and a production build, and separately provisions fresh Docker-backed Supabase for integration checks. See the security checklist for dated results and explicit unverified items.

## Deployment

The production site is [District Wheels](https://district-wheels-dispatch-directory.vercel.app). The consolidated Express API and refactored assistant were released on November 3, 2026, from main revision `4e177ec`. Production browser verification passed and owner-data fingerprints were unchanged. The [release receipt](docs/application-api.md#november-3-2026-production-receipt) records deployment and rollback details.

`main` requires pull requests and passing `unit-and-build` and `database-integration` checks from GitHub Actions. Branches must be up to date and conversations resolved; administrator enforcement is enabled and force pushes/deletion are blocked. There is no mandatory reviewer count so the sole maintainer can merge their own passing PRs. Vercel releases remain explicit CLI deployments; merging a PR does not itself perform a production release.

Vercel serves the Vite build and `api/index.js` as an Express Node function. `/api/*` is routed before the React SPA fallback. Configure both server and browser Supabase variables in the appropriate Vercel environment, apply the additive API migration first, and allow the exact preview origin for Edge Functions before testing demo sign-in. Health, authenticated CRUD, owner isolation, direct page navigation, security headers, and assistant behavior must pass before promotion.

The [release guide](docs/application-api.md#release-and-recovery) covers backup/fingerprint verification and rollback. Existing owner/demo records and backup formats must be preserved.

## Code map

- `client/`: interface, Supabase sign-in, authenticated Express client.
- `server/`: Express routes, verified request context, Supabase repository, safe error mapping.
- `shared/`: form/API validation and name normalization.
- `supabase/`: the single schema/migration chain and specialized Edge Functions.
- `test/`: isolated unit/API tests and test-only doubles.
- `integration/`: real local database/Auth/RLS tests.
- `scripts/`: guarded local bootstrap.

The assistant separates request authentication, conversation orchestration, lookup access, tool execution, and model interaction. Existing buyer-draft evidence checks, privacy safeguards, and separate deletion confirmation remain in place.

## Features and authorship

The product includes buyer search, courier-specific forms, copy fields, owner backups, fictional demo data, and assistant drafts that require human review before saving. Do not enter real buyer details into the shared demo.

I designed and directed the project and built the first working website. Codex implemented much of the later code and helped debug and verify it. [AI-USAGE.md](AI-USAGE.md) records authorship and corrections. Original course reports and wireframes remain in [docs/README.md](docs/README.md).
