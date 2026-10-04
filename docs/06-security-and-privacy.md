# Security and privacy

District Wheels Dispatch Directory stores buyer names, phone numbers, and delivery or pickup details. This document records the safeguards visible in the repository and the checks needed before using the app with real buyer information. The [owner and demo rollout guide](demo-owner-rollout.md) has the hosted setup and release procedure.

## Repository and configuration

- `.gitignore` excludes `.env`, `.env.*`, local development data, backups, and build output. `client/.env.example` contains placeholders for the public browser configuration.
- A check of currently tracked filenames found no `.env`, `.pem`, `id_rsa`, or `student.json` file. This filename check does not inspect past commits or prove that every file is free of sensitive content.
- The browser receives only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Service-role credentials, the demo password, and the assistant API key belong in Supabase Edge Function secrets, never in `VITE_` variables or screenshots.
- If a credential is exposed, rotate it at the provider and redeploy the affected function. Removing a file from the latest commit does not revoke the credential or erase Git history.

## Application access

- Supabase Auth identifies users. Database row-level security policies protect buyers, addresses, pickup locations, profiles, and audit logs. The owner and demo profiles have separate data; the demo uses fictional shared records.
- The public demo-session function checks allowed origins and claims a rate-limited sign-in slot before returning a demo session. The assistant checks the caller's Supabase user and approved profile. These checks still need verification against the deployed Supabase configuration.
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
- [ ] Run a dependency audit, review findings, and record any accepted issues. This document does not claim that an audit has passed.
- [ ] Verify the live assistant's third-party data handling and decide what notice or consent is needed before entering real buyer details.
- [ ] Check that private backups stay outside Git and can be restored by the approved owner.

The main remaining privacy risk is sending real buyer details to the assistant's external model. Until that handling has been reviewed, use fictional demo data and minimize what is entered into chat.
