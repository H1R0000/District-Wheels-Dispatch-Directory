# Finish and deploy plan

Status checked: 2026-09-26

## Release status

The application is live at [district-wheels-dispatch-directory.vercel.app](https://district-wheels-dispatch-directory.vercel.app), deployment `dpl_7AWffWiYn5JzCvPbc4BGH7RJn2ea`, commit `ded43fa`. The Vercel build, 38 local tests, mobile demo sign-in, direct form-route refresh, assistant draft preparation, and demo buyer create/edit/delete passed. Supabase Auth and Edge Function origins include the production domain. Release changes were pushed in separate commits. Vercel's automatic GitHub connection still needs a GitHub login connection on the Vercel account; CLI deployment works.

The checklist below records the original plan and distinguishes completed checks from those that still need an account owner or a separate owner-session review.

## Current baseline

- The React directory, Supabase Auth and database path, demo, backup UI, and dispatch assistant exist in the working tree. Many changes are uncommitted.
- All 38 local tests and `npm run build` pass with Vite's runner config loader.
- The active Supabase project has 19 owner buyers at the current release baseline. The earlier count of 13 is historical. Atomic save and delete migrations are applied; older local and live migration timestamps still differ.
- The connected Vercel team has no project for this application yet. There is no local `.vercel` link or `vercel.json`.
- `client/.env.example` and the Vercel configuration are prepared for the next repository commit.

## 1. Stabilize the implementation

- [ ] Review the current working-tree changes and identify the exact release set. Preserve the 13 existing owner buyers and keep backups and credentials out of Git.
- [x] Make buyer save atomic in Supabase. A demo-scoped forced child-row failure left the prior buyer and address untouched. Deletion and its audit record are atomic too.
- [ ] Review the backup restore, deletion confirmation, and assistant flows. Verify owner-only backup access, confirmation expiry, demo isolation, and assistant drafts requiring human review.
- [ ] Reconcile local migrations and deployed Edge Function versions with the live Supabase project. Apply only missing, reviewed changes. Run Supabase security advisors and confirm RLS and function permissions.

**Done when:** create, edit, delete, backup, restore, demo reset, and assistant actions work against the configured project without changing owner records unexpectedly.

## 2. Finish release verification

- [x] Make `npm run build` and `npm run dev:client` reliable with the runner config loader.
- [x] Run `npm test` and the production build in the current workspace. A clean install and Vercel build remain to be checked.
- [ ] Exercise the full buyer flow on desktop and phone: sign in, search, open, copy, create, edit, delete, sign out, and demo reset. Check direct refresh of each React route.
- [ ] Check keyboard focus, form errors, screen-reader labels and status messages, and small-screen layouts. Fix issues found.
- [x] Verify demo cannot read owner rows or call owner backup restore. Confirm the current 19 owner rows and their fingerprint remain unchanged after demo tests.

**Done when:** tests and build pass, the four routes and main fulfillment flow work, and access checks pass.

## 3. Prepare the repository and Vercel project

- [x] Replace the planning-only `README.md` with current setup, feature, environment, migration, test, and deployment instructions. Add demo screenshots.
- [x] Update `.gitignore` so `client/.env.example` is tracked while real `.env.local` files remain ignored. Review release files for secrets and real buyer data.
- [x] Add Vercel configuration for this root-level npm project: run `npm run build`, publish `client/dist`, and rewrite application routes to `/index.html`. The optional Express API is not deployed.
- [ ] Create and link a Vercel project in the connected team. Configure **only** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the browser build. Keep service-role keys, demo credentials, and assistant secrets in Supabase Edge Function secrets.
- [ ] Once the Vercel URL exists, add its exact origin to the Supabase Edge Function `APP_ORIGINS` secret and add the production URL to Supabase Auth URL configuration. Permit preview URLs deliberately rather than opening all origins.
- [ ] Commit the verified release set and connect the GitHub repository for repeatable preview and production deployments.

**Done when:** the repository is reproducible from a clean clone and Vercel has the correct build, output, routing, and public environment settings.

## 4. Deploy and verify

- [ ] Deploy a Vercel preview first. Test direct route refresh, GitHub sign-in redirect, one-click demo, CRUD, copy, reset, backup controls, and assistant calls on the preview URL. Check the browser console, network failures, and Vercel build logs.
- [ ] Recheck Supabase access boundaries and owner record count after preview testing. Keep test writes in demo data wherever possible.
- [ ] Deploy the same verified revision to Vercel production. Record the production URL, commit SHA, deployment ID, and verification date in the README or release notes.
- [ ] Smoke-test production from a fresh browser session. Keep the last good Vercel deployment available for rollback.

**Release gate:** production is complete only when the live URL loads, the owner and demo flows pass, and no real owner data has been lost or exposed.
