# Security checklist — reviewed November 3, 2026

This is a completed review record, not a claim that every possible risk is closed.
PASS means supported by the evidence below; OPEN identifies work that was not
verified. Local synthetic OAuth tests are not a live GitHub sign-in test.

## Application controls

- [x] **PASS — Authentication:** Express verifies every bearer token with Supabase
  getUser. Anonymous and expired sessions receive 401. Evidence: auth unit tests
  and real local integration tests.
- [x] **PASS — Authorization:** database allowlist requires the approved owner
  identity and OAuth method. Valid unapproved sessions and owner password
  sessions are denied. Evidence: real local Auth/RLS integration tests.
- [x] **PASS — Object access:** caller-scoped repository queries and RLS isolate
  demo/owner records. Cross-account reads, updates, and deletes fail through
  Express and direct Data API requests. Evidence: integration tests.
- [x] **PASS — Privileged keys:** production buyer routes use a public project key
  and caller token. No buyer repository uses service_role. Local administrator
  bootstrap/test tools reject non-loopback targets and store credentials only
  in ignored local files.
- [x] **PASS — Validation:** form and Express share field checks and normalization;
  PostgreSQL independently checks buyer data. Unknown ownership fields are not
  forwarded. Malformed objects, bounded strings/arrays, phone formats, courier
  requirements, and duplicate phones are tested.
- [x] **PASS — Injection defenses:** Data API queries use quoted filter values and
  structured parameters; RPC SQL uses values, not dynamic SQL. CLI helpers use
  argument arrays without a shell. Search punctuation has regression coverage.
- [x] **PASS — Atomic writes:** failed child-row validation rolls back parent and
  audit writes. Save/delete RPCs retain transaction boundaries. Evidence: local
  PostgreSQL integration tests.
- [x] **PASS — Backup authorization:** only an approved OAuth owner can export,
  inspect, or restore. Restore is additive and atomic; existing records are not
  overwritten. Null/missing owner fields are rejected. Evidence: local
  disposable owner fixtures and API body-limit tests.
- [x] **PASS — Resource limits:** default JSON limit 100 KiB; owner-only backup
  limit 2,000,000 bytes after authentication/authorization. API quota is atomic
  and database-backed at 120/account/minute; assistant quota remains 20/minute.
  Quota exhaustion, retry headers, and reset are tested. Local server reception
  and upstream fetch deadlines are configured; Vercel also applies platform limits.
- [x] **PASS — Safe errors:** RFC 7807 problem JSON includes correlation IDs and
  safe messages. Known input, authorization, conflict, missing-record, and
  infrastructure errors have distinct statuses. Internal detail and tokens are
  not returned or logged by the Express error handler. Evidence: API failure tests.
- [x] **PASS — Assistant boundaries:** user-supplied system/tool roles and excessive
  payloads are rejected. Drafts require evidence; changes require human review;
  chat deletion requires a separate confirmation. Existing regressions plus
  extracted-module tests cover these boundaries.
- [x] **PASS — Browser rendering:** React text rendering is preserved; no new raw
  HTML injection is introduced. Local Chrome tests verify sign-in, direct
  navigation, assistant response, create/edit/delete via Express, and no runtime
  errors. Deployment headers retain CSP, nosniff, framing denial, HSTS, and
  referrer/permission policies.
- [x] **PASS — Session design:** Supabase manages tokens and refresh rotation; no
  new password store or application auth cookies are introduced. Browser SDK
  token storage remains susceptible to successful same-origin script compromise,
  so CSP and secret discipline remain important.
- [x] **N/A — Local direct PostgreSQL TLS toggle:** the parallel PostgreSQL runtime
  store was removed. Hosted application access uses HTTPS to Supabase; the local
  PostgreSQL driver is a development-only integration-test dependency.

## Repository, setup, and verification

- [x] **PASS — One schema:** Supabase migrations are the only application schema.
  The independent JSON store, runtime PostgreSQL store, and legacy API switch
  were removed. Test-only doubles are isolated under test/helpers/.
- [x] **PASS — Fresh local setup:** Docker-backed setup applied the full migration
  chain, created fictional demo data, and succeeded again without resetting it.
  Missing owner identity leaves an empty fresh install closed; existing unknown
  ownership still fails migration.
- [x] **PASS — Backup/secret exclusions:** Git and Vercel uploads exclude private
  environments, temporary files, local data, and backups. Public configuration
  examples contain placeholders only.
- [x] **PASS — Dependency audit:** npm audit reported zero known vulnerabilities
  during this review. Re-run at submission; advisory results change over time.
- [x] **PASS — Repeatable checks:** npm test, npm run test:integration,
  npm run test:browser, and npm run build succeeded locally. Browser checks need
  the app/functions running and Chromium installed (or BROWSER_CHANNEL=chrome).
- [x] **PASS — Local database advisors:** Supabase CLI security advisors reported
  no issues for the local schema after migrations.
- [x] **PASS — CI authored:** GitHub Actions runs unit/API tests, audit, build,
  fresh Docker database integration, and browser smoke checks. Remote workflow
  results must be inspected on the PR; writing CI does not prove a hosted run passed.

## Explicitly open release and privacy items

- [x] **PASS — Hosted preview acceptance:** deployment
  dpl_5wStSs6zSqPn8ehw5qQsMRuWx881 at
  https://district-wheels-dispatch-directory-js8c7q5fe.vercel.app passed health,
  real demo sign-in, buyer create/edit/delete through Express, direct navigation,
  assistant response, and zero browser runtime/CSP errors. Migration
  20261102172828 was applied transactionally after an explicitly approved private
  backup outside Git. All four data fingerprints were unchanged immediately
  afterward; owner buyer/location/audit fingerprints still matched after smoke
  tests. The fictional demo test record was removed; its audit trail remains.
- [x] **REVIEWED — Hosted assistant quota advisory:** the existing public
  claim_assistant_request_slot security-definer function is intentionally
  executable by authenticated callers, with UID/allowlist checks and no arbitrary
  target-user argument. The hosted advisor flags this exposure for review. The
  new API quota uses an invoker wrapper and a private definer helper instead.
- [ ] **OPEN — Hosted leaked-password protection:** the hosted advisor reports
  this setting disabled. Arbitrary signups remain disabled and the owner requires
  GitHub OAuth, but this provider setting has not been enabled or validated here.
- [ ] **OPEN — Live owner GitHub OAuth:** requires the approved human account.
  Synthetic local OAuth tests do not verify the provider's hosted redirect/login.
- [ ] **OPEN — Full-history secret/privacy scan:** current-file exclusions and
  source inspection do not prove all past commits, reports, or screenshots are
  free of credentials or real buyer information. Rotate any discovered secret.
- [ ] **OPEN — Third-party assistant privacy:** messages may be sent to Groq and
  kept in tab session storage. Retention/consent requirements for real buyer data
  have not been established. Use fictional demo data and minimize submitted PII.
- [ ] **OPEN — Production promotion:** separate release step after verified
  preview; this change must not be described as promoted merely because its
  additive database migration is installed.

## Reproduction

```bash
npm ci
npm run local:setup
npm test
npm run test:integration
npm run build
npm audit
npx --no-install supabase db advisors --local --type security
```

Recorded results: 146 unit/API tests, six real database/Auth integration tests,
local and protected-preview Chrome smoke checks, successful production build,
and zero npm audit vulnerabilities. Local security advisors reported no issues;
hosted advisors reported the two reviewed/open warnings above.

Run npm run local:functions and npm run dev in separate terminals, install
Chromium with npx --no-install playwright install chromium, then run
npm run test:browser. See [the API/release guide](docs/application-api.md) for
contracts, hosted migration sequencing, and recovery.
