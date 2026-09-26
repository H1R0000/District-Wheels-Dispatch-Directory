# Supabase owner and demo rollout

The browser app uses one approved owner profile and one dedicated demo profile. Database row-level policies separate their buyers, addresses, pickup locations, and audit logs. Demo records are fictional and shared by visitors.

## Existing hosted project

The hosted project already has the owner and demo users, schema, and Edge Functions. Its migration history includes earlier timestamps for some SQL files. Inspect `supabase_migrations.schema_migrations` and the live schema before applying further migrations. Never replay the initial schema against the populated project. Preserve the current owner data; counts recorded during an earlier rollout are historical, not a release baseline.

## Configure a fresh project

1. Create the Supabase project and configure GitHub OAuth for the approved owner account. Apply the SQL in `supabase/migrations/` in dependency order. The owner allowlist migration expects the verified GitHub identity named in that migration; review it for the intended account before applying.
2. Create a separate email/password Auth user for the demo with a generated password. Add its `demo` profile with `is_demo = true`; it must have no owner records or GitHub identity.
3. Set Edge Function secrets `DEMO_USER_ID`, `DEMO_EMAIL`, `DEMO_PASSWORD`, `DEMO_RATE_SALT`, `GROQ_API_KEY`, and `APP_ORIGINS`. `APP_ORIGINS` is a comma-separated list of exact browser origins. Supabase supplies its URL, public API key, and service-role key to the functions. Do not put any server secret in a Vite variable or Git.
4. Seed only fictional demo buyers through `reset_demo_data`, then deploy `demo-session`, `reset-demo`, and `dispatch-assistant` from `supabase/functions/`. The first two functions use application-level request checks; `reset-demo` also verifies the caller's token.
5. Disable arbitrary signups and configure the production Site URL and exact redirect URLs in Supabase Auth. Add approved preview URLs only while testing them.

## Release checks

- Export a private administrator backup of owner data and record a current count and fingerprint before any database change. Keep the backup outside the repository.
- Verify owner GitHub OAuth access and that an email/password session on the owner's linked Auth account cannot read owner buyers.
- Verify an unprofiled user, an anonymous request, and the demo account cannot read or modify owner rows. Verify the owner cannot read or modify demo rows.
- Enter demo in one click, edit a fictional buyer, and reset demo records. Anonymous or owner reset requests must fail.
- Test atomic buyer save and delete using demo-scoped records, including a forced error that must leave existing rows untouched.
- Test backup export and restore as owner only. An import must add missing records without overwriting existing records.
- Run Supabase security advisors. Inspect the browser bundle and network requests for server secrets. Check Edge Function CORS against the exact deployed origins.

## Recovery

If owner data changes unexpectedly, stop writes and restore from the verified private administrator backup. If a function secret is exposed, rotate that secret and redeploy the affected function. Keep the allowlist and row-level policies in place during recovery.
