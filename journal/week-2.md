# Reflection Journal — Week 2

## Week of: September 21–27, 2026

*Progress recorded through September 26, 2026.*

## My goal this week

My goal was to turn the Week 1 plan into a usable District Wheels Dispatch Directory. I wanted the fulfillment manager to search for a buyer, review the right LBC or J&T Express details, and copy them into a courier form. I also needed to protect the owner's records while giving reviewers a safe way to try the application.

## What I did

I built the four planned React screens: Buyer Directory, Buyer Details, Add Buyer, and Edit Buyer. I added search by name or phone, alphabetical sorting, buyer forms, courier-specific addresses and pickup locations, and copy controls that normalize phone numbers. The interface now follows the task flow I mapped in the Week 1 wireframes.

I added an Express API for local development and tests, plus PostgreSQL tables for buyers and their saved locations. Partial unique indexes enforce the rule that a buyer can have at most one default address and one default LBC pickup location. For the browser app, I added Supabase authentication and data access with row-level policies. The September 23 rollout notes record checks that the demo's fictional buyers were separate from the owner's records and that the demo could be reset without changing owner data.

I also added a dispatch assistant that prepares buyer drafts for review and helps resolve LBC branch details. The local tests now cover API validation and CRUD behavior, phone formatting, search, and branch matching. On September 26, `npm test` passed all 38 tests. More recent backup, deletion confirmation, and interface changes are still local work that needs review before release.

## What blocked me

The production build check stopped with an access-denied error while loading the Vite configuration in this workspace. That leaves the build result unverified; it does not tell me whether the application source would build in the intended environment.

The browser app also depends on Supabase configuration and deployed functions, so passing local tests is not enough to prove that sign-in, demo reset, and assistant lookups work everywhere. The buyer save flow makes several client-side database writes; an interruption between them could leave a partial update. I need to verify and harden that flow before treating it as reliable for important records.

The original README still describes a documentation-only project. I drafted an updated version, `README_2.md`, but the repository's main README and final deployment instructions still need to be brought up to date.

## What I learned

Building from the wireframes exposed details that were easy to miss during planning: search has to handle formatted phone numbers, courier choice changes which location fields are required, and copied values need predictable formatting. Those rules became clearer once I wrote the forms and tests.

I also learned that a working sign-in screen is only one part of protecting buyer data. The database policies, approved profiles, and separate demo records matter because the browser can call the data service directly. Finally, this week showed me why I should separate a passed local test from a verified production build or live integration: each proves a different part of the application.

## Next week

I will review the latest local changes, verify the production build and Supabase flows, and address the partial-update risk in buyer saving. I will also finish the main README, test keyboard and mobile use, and document the final deployment and submission links.

## End-of-week update — September 26

I fixed the build configuration, made Supabase buyer save and deletion atomic, and checked the live mobile create, edit, and delete flow with fictional demo data. All 38 local tests and the local and Vercel production builds passed. The deployed directory is at https://district-wheels-dispatch-directory.vercel.app. The earlier blockers above describe the checkpoint before these fixes.
