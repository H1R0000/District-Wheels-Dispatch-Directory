# Security and privacy

District Wheels Dispatch Directory stores buyer names, phone numbers, and delivery or pickup details. This document records the safeguards visible in the repository and the checks needed before using the app with real buyer information. The [owner and demo rollout guide](demo-owner-rollout.md) has the hosted setup and release procedure.

## Repository and configuration

- `.gitignore` excludes `.env`, `.env.*`, local development data, backups, and build output. `client/.env.example` contains placeholders for the public browser configuration.
- A check of currently tracked filenames found no `.env`, `.pem`, `id_rsa`, or `student.json` file. This filename check does not inspect past commits or prove that every file is free of sensitive content.
- The browser receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Service-role credentials, the demo password, and the assistant API key belong in Supabase Edge Function secrets, never in `VITE_` variables or screenshots.
- If a credential is exposed, rotate it at the provider and redeploy the affected function. Removing a file from the latest commit does not revoke the credential or erase Git history.

## Application access

- Supabase Auth identifies users. Database row-level security policies protect buyers, addresses, pickup locations, profiles, and audit logs. The owner and demo profiles have separate data; the demo uses fictional shared records.
- The public demo-session function checks allowed origins and claims a rate-limited sign-in slot before returning a demo session. The assistant checks the caller's Supabase user and approved profile. The deployed demo sign-in and assistant response worked on October 4, 2026; owner-only access and hosted policy configuration remain to be verified separately.
- Buyer changes use database functions that save or delete records and their audit entries together. The assistant prepares add and edit forms for review; deleting through chat requires a separate confirmation code.
- The optional Express buyer API has no Supabase user context. It is disabled unless `ENABLE_LEGACY_API=true`; do not expose it publicly in that mode. Its PostgreSQL data queries use parameters, its request body has a size limit, and its error response omits stack traces. It does not implement every control suggested by the example checklist, such as authenticated buyer routes or length limits on every input field.

## Personal information and the assistant

- Buyer records contain contact and shipping details. Use the owner area only for information needed to prepare dispatches, and keep exports and backups outside the public repository.
- The demo and README screenshots use fictional example buyers. Do not enter real buyer details in the shared demo or include them in screenshots, seeds, reports, or a demo recording.
- Dispatch Assistant messages and drafts are stored in the current browser tab's session storage. The assistant Edge Function sends conversation content to Groq for a response. Avoid including buyer information that is unnecessary for the task, and review drafts before saving. The repository does not establish Groq's retention terms or a consent process for real buyers.
- The assistant's public branch-search link should contain branch and location clues only, not buyer names or phone numbers. A previous mistake and its correction are recorded in [AI-USAGE.md](../AI-USAGE.md).

## Checks before using real data or submitting

- [ ] Confirm the hosted owner allowlist, Supabase Auth redirect URLs, Edge Function origins, and row-level policies match the intended deployment. Test owner, demo, unapproved, and anonymous access as described in the [rollout guide](demo-owner-rollout.md).
- [ ] Inspect the full Git history and screenshots for secrets and real personal information. Rotate any exposed secret before cleaning up history.
- [x] Run a dependency audit. On October 4, 2026, `npm audit` reported zero vulnerabilities across all dependencies, including development tools. `npm audit --omit=dev` also reported zero for production dependencies.
- [ ] Verify the live assistant's third-party data handling and decide what notice or consent is needed before entering real buyer details.
- [x] Check repository backup exclusions: `.gitignore` excludes `backups/`, and the current tracked-file list contains no backup file.
- [ ] Verify a private backup can be restored by the approved owner in the hosted app without changing existing records.

The main remaining privacy risk is sending real buyer details to the assistant's external model. Until that handling has been reviewed, use fictional demo data and minimize what is entered into chat.
# Security maintenance — October 29, 2026

Compatible lockfile updates remediate npm advisories affecting body-parser,
concurrently, qs, shell-quote, source-map-js, and Vite. The audit went from six
affected packages (two critical, three high, one moderate) to zero.

The Express buyer API now requires explicit `enableLegacyApi: true` even when
created outside the normal entry point. The entry point binds it to loopback
when enabled. Invalid input shapes receive validation errors, and malformed or
oversized JSON receives sanitized problem responses. The server has explicit
request and header timeouts. PostgreSQL TLS now verifies certificates; a private
CA can be supplied through `DATABASE_CA_CERT` when `DATABASE_SSL=true`.

The assistant accepts at most 100 KiB of JSON with a 15-second body deadline,
validates conversation roles and field lengths, and rejects client-supplied
system/tool messages. Its Supabase SDK import is pinned. A database quota permits
20 requests per account per minute across workers, using the same owner OAuth
and demo allowlist as buyer RLS. Failures to check that quota fail closed.
Vercel configuration adds CSP, clickjacking protection, HSTS, and other browser
security headers.

Deployment order: apply `20261029060000_assistant_request_limits.sql` to Supabase,
then deploy `dispatch-assistant`, then deploy the updated frontend/Vercel
configuration. Deploying the function before the migration makes assistant
requests return 503 until the migration exists.

Deployed October 29, 2026: the migration was applied and recorded in one
transaction without replaying older migrations; `dispatch-assistant` was then
deployed, followed by a successful Vercel preview and production build.
Production deployment `dpl_AhSmq2vvnymKJoS9UWgmQcchDQ1v` is aliased to
https://district-wheels-dispatch-directory.vercel.app. Deployment uploads now
exclude environment files, private local data, temporary files, and unrelated
presentation material through `.vercelignore`.

A verified private backup was saved outside the repository before migration.
Counts and row fingerprints stayed unchanged for buyers (57), addresses (8),
pickup locations (49), and audit logs (71). Live checks passed for demo sign-in,
demo-only buyer visibility, assistant lookup, rate-limit headers, rejection of
system-role messages (400), oversized input (413), and unapproved origins (403).
The live quota allowed 20 calls and denied the next inside a transaction that
was rolled back, preserving real quota usage. Anonymous RPC execution and direct
authenticated quota-table writes were verified denied. Chrome checks passed for
production security headers, demo directory access, and direct buyer-form
navigation with zero runtime errors or CSP violations. Interactive owner GitHub
OAuth sign-in was not exercised during this release.

Validation: 132 Node tests passed and the production build passed. An isolated
PostgreSQL-compatible PGlite runtime executed the new migration and checked the
allowlist denial, quota exhaustion, account isolation, expiry, and grants. This
does not alone validate the hosted Supabase configuration or Edge runtime; live
release checks are recorded above. The security
skill's hygiene scanner reported no findings in client or Edge source; its two
server SQL warnings were reviewed as false positives because both INSERTs use
static SQL and separate parameter arrays. An unrestricted root scan also included
ignored temporary Chrome extension code, which is not shipped with the app.
