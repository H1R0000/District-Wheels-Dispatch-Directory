# Application API and release guide

## Boundaries

The browser uses Supabase Auth to obtain a session and Express for buyer CRUD and
owner backups. Express validates that token with `auth.getUser`, checks the
database-backed allowlist, claims an account quota, and constructs a separate
Supabase repository for that request. Its public project key and caller token
preserve RLS. No production buyer route uses an administrator key.

The Data API remains independently protected: direct requests cannot bypass RLS
or atomic RPC checks. The demo/session/assistant Edge Functions are specialized
workflows on that same schema, not another CRUD store. Browser profile reads are
authentication metadata, not a separate buyer data path.

## Buyer contract

Create/update bodies contain name (trimmed, 1–120 characters), phone (normalized
to 7–15 digits), preferredCourier (`LBC` or `J&T Express`), addresses, and pickups.
Each array is limited to 30 objects. Addresses require street, barangay, city,
province, and zipCode; pickups require branchName and branchAddress. Location
strings are trimmed and limited to 500 characters. Optional location IDs are
bounded and distinct within their array. The first requested default wins, or the
first location becomes default. J&T requires an address; LBC requires at least
one address or pickup. Unrecognized client fields, including owner_id, are not
forwarded to database mutations.

List returns summary objects with addressCount and pickupCount. Detail and saves
return the same camelCase buyer shape as the existing UI. Creation returns 201
and a Location header; delete returns an empty 204. Record IDs belonging to other
accounts are treated exactly like missing IDs (404).

## Authentication, limits, and errors

All routes except health require `Authorization: Bearer <Supabase access token>`.
The owner OAuth rule is evaluated in PostgreSQL, not inferred from user-editable
metadata. There is no unauthenticated legacy mode. API quotas are persistent,
atomic, account-based fixed windows of 120 requests/minute. The assistant retains
its separate 20/minute quota. Responses expose RateLimit-Limit,
RateLimit-Remaining, and RateLimit-Reset (seconds until reset); 429 adds Retry-After.

JSON bodies are limited to 100 KiB, with a 2,000,000-byte exception for owner-only
backup inspection/restore after authentication and owner checks. Compressed
request bodies are rejected. Local Express request reception is bounded to 15
seconds; upstream fetches have a 15-second deadline. Hosted request reception is
additionally subject to Vercel's platform limits.

Problem JSON contains type, title, status, detail, instance, correlationId,
message, and optional field errors. Stable application SQLSTATEs PT400/PT403/PT404
are mapped explicitly; unique violations map to 409 and check violations to 400.
Infrastructure failures return 503/504. Unexpected errors return a generic 500.
Logs contain the correlation ID and error code, not bearer tokens, submitted
buyer details, database connection strings, or raw provider error payloads.

Backup endpoints accept the existing district-wheels-owner-backup-v1 document
directly as the JSON body. Inspect calls restore_owner_backup with dry_run=true;
restore uses false. The database enforces owner scope and performs the additive
restore atomically. Export explicitly pages records so the normal Data API
1,000-row cap cannot conceal an oversized backup.

## Release and recovery

1. Keep a private administrator backup outside Git and record row counts and
   fingerprints for buyers, addresses, pickups, and audit logs.
2. Inspect live migration history. Apply only the new application_api migration,
   transactionally with its history record. It adds allowlist/quota RPCs and
   typed errors; it does not rewrite buyer rows. Never replay the historical
   owner-provisioning migration on a populated hosted project.
3. Configure server SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY plus the two VITE_
   variables in Vercel Preview. Preserve the exact deployed Edge Function origin
   allowlist while adding the specific preview origin needed for testing.
4. Deploy a preview and verify Node health, denied anonymous access, authenticated
   directory requests through Express, malformed input, conflicts, cross-account
   denial, backup authorization, SPA refresh, CSP, and the existing assistant.
5. Record evidence and open a PR. Production website promotion remains a separate
   release step. Deploy the refactored assistant only after local/preview checks;
   the current production function can coexist with this additive migration.
6. After an authorized production promotion, repeat smoke checks and compare data
   fingerprints. Keep the previous Vercel deployment available for rollback.

If application verification fails, keep/reinstate the previous website deployment.
The additive migration can stay installed during rollback; do not delete quota
infrastructure or buyer records as a recovery shortcut. Use the private backup
only if verified data corruption requires recovery.

## November 3, 2026 preview receipt

Migration 20261102172828 was applied transactionally to the existing hosted
project after explicit approval and a verified private backup outside Git.
Buyers (66), addresses (10), pickup locations (56), and audit logs (80) retained
identical fingerprints immediately after migration. Owner-only fingerprints
were also verified against that backup after the disposable demo smoke test.
The demo test record was removed; its create/update/delete audit events remain.

Preview: https://district-wheels-dispatch-directory-apipreview.vercel.app
(dpl_6FZvuPyu4oerUTD2Qsbh8YyWQVBA). Health, real demo sign-in, buyer CRUD through
Express, direct-route refresh, assistant reply, and browser CSP/runtime checks
passed. Preview deployment protection remains enabled. Public Supabase settings
were supplied to this preview deployment only; production Vercel settings and
the production website/assistant code were not promoted or redeployed.

The exact production and local origins plus the active previews created during this
review were explicitly approved for APP_ORIGINS. Previous unknown preview origins
may have been removed because Supabase exposes only the original value's digest.
The hosted database advisors report an existing intentional authenticated
security-definer assistant quota function and disabled leaked-password
protection; see the checklist for their disposition.

## Local portability details

The historical owner migration now skips automatic owner binding only when the
expected GitHub identity is absent and the buyer table is empty. It still refuses
unknown existing ownership. No profile is granted automatically in that case.
The local bootstrap creates only a demo profile after migrations, with generated
credentials and fictional records. It rejects non-loopback HTTP Supabase URLs.
Integration fixtures use a synthetic local GitHub identity and local JWT secret
to exercise both OAuth and password-session policies without external accounts.
