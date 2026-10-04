# Project Increment Report - Week 2

> Historical Week 2 checkpoint. The earlier build failure and “What is left” section describe the state before the release addendum below. See the [current README](../README.md) and [updated proposal milestones](proposal.md) for the present status.

## Week of: September 21-27, 2026

**Status as of September 26, 2026**

## Project

**District Wheels Dispatch Directory**

The Week 1 report covered the proposal, wireframes, and design system. This increment turns that plan into a working buyer directory and adds controlled demo access. The application now has React screens, data operations, a database schema, and tests. Some newer work is still present only in the local working tree.

## What changed this week

- Built the Buyer Directory, Buyer Details, Add Buyer, and Edit Buyer routes with responsive React components.
- Added buyer search, alphabetical sorting, create/edit/delete flows, courier-specific address and pickup information, and copy controls with phone-number normalization.
- Added Express buyer endpoints for local development and PostgreSQL tables for buyers, addresses, and pickup locations. Partial unique indexes enforce at most one default address and one default pickup location per buyer.
- Added a Supabase-backed app path with authentication and row-level access controls. A one-click demo uses fictional records separated from the owner's records; the rollout notes record checks of that separation and demo reset behavior on September 23.
- Added an in-app dispatch assistant that can prepare buyer drafts and look up LBC branch information for review. Branch lookup tests cover ambiguous matches, conflicting clues, and cached results.
- Added more recent local changes for backup, deletion confirmation, and interface polish. These should be reviewed and verified before they are described as deployed features.

## Evidence of progress

| Evidence | Result |
| --- | --- |
| `client/src/App.jsx` and page components | Four planned routes are implemented. |
| `db/migrations/001_initial.sql` and Supabase migrations | Buyer, address, and pickup tables include one-default-per-buyer indexes and access controls. |
| `docs/demo-owner-rollout.md` | Records the September 23 demo and owner access checks, including isolation and reset tests. |
| `npm test` on September 26 | 38 tests passed, including API behavior, phone formatting, search, and LBC branch resolution. |
| `npm run build` on September 26 | Could not complete in this workspace because the build process received an access-denied error while loading `client/vite.config.js`; production build status remains unverified. |

## Why

The directory now supports the fulfillment manager's main task: finding a buyer, reviewing the correct courier details, and copying information into an external shipping form. The data rules and access controls help keep saved locations consistent and separate demonstration records from owner data. The assistant prepares drafts for human review instead of directly changing a buyer record.

## What broke or what I got stuck on

- The repository README still describes a planning-only project and needs to be rewritten for the current application, setup, environment, and deployment process.
- The September 26 production build could not be verified because of a workspace access error. This result does not establish whether the application source builds successfully in a normal environment.
- The latest local changes are uncommitted. Their new backup and deletion flows need a focused review and end-to-end verification before release.
- Live Supabase behavior and the LBC lookup service depend on external configuration and services; the local test suite alone does not verify those integrations.

## What is left

- Resolve the build access issue and verify a production build.
- Review and test the uncommitted backup, deletion confirmation, and assistant changes against the configured Supabase project.
- Update the README with current setup, environment variables, database migrations, API behavior, usage, screenshots, and known issues.
- Complete keyboard, mobile, and accessibility checks on the working application.
- Commit the verified implementation and document the final deployment and submission links.

## Release addendum — September 26, 2026

The items above record the earlier checkpoint. Since then, buyer save and deletion became atomic Supabase database functions, the README was updated, and the restricted Windows build issue was resolved by using Vite's runner config loader. The final local run passed all 38 tests and `npm run build`; Vercel also built the same commit successfully.

The application is live at [district-wheels-dispatch-directory.vercel.app](https://district-wheels-dispatch-directory.vercel.app) from commit `ded43fa`. A fresh live mobile session passed one-click demo access, direct form-route refresh, assistant draft preparation with an official LBC branch match, buyer creation, editing, and deletion. The test buyer was removed. The owner's 19 buyer records were not used for the browser test. Supabase Auth and Edge Function origins now include the production domain. The assistant prepares a form draft for new buyers and opens the record for edits; saving still requires the user to review the form.

Vercel's GitHub repository connection still requires a GitHub login connection on the Vercel account. The project is deployed through the authenticated Vercel CLI, and all release commits were pushed to GitHub main.
