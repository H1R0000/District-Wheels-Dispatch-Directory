# Final project proposal: District Wheels Dispatch Directory

This is the original working plan. The milestones below were updated after the app was deployed; the [current proposal summary](01-proposal.md) describes the finished structure.

## The idea

Build a private directory for the District Wheels fulfillment manager to find repeat buyers and copy their saved delivery or LBC branch pickup details into LBC and J&T Express shipping forms.

## Why

Preparing repeat shipments means looking up and retyping the same contact and location details. A searchable directory with copyable fields should make dispatch faster and reduce mistakes. This project also lets me practice building a responsive React interface, storing related records, and protecting buyer information.

## Scope

The first version will let a signed-in manager search buyers by name or phone number; view, add, edit, and delete buyer records; save multiple delivery addresses and LBC pickup locations; choose a default location; and copy individual shipping fields or grouped details. It will support LBC and J&T Express, with clear form validation and loading, empty, success, and error states. Development and demonstrations will use fictional buyer data.

The first version will not book shipments, calculate courier rates, track parcels, send messages to buyers, or automatically fill the courier websites. The manager will review and paste the details into the courier form.

## Milestones

- [x] Define the fulfillment workflow, four screens, responsive wireframes, and visual design system.
- [x] Build the initial React screens, buyer forms, copy controls, and buyer data model.
- [x] Add an Express API and a Supabase schema with sign-in access and buyer-level data rules.
- [x] Finish and verify the connected create, edit, and delete workflows with fictional demo records.
- [x] Verify database privacy rules and phone layouts; keep the owner records separate from the demo.
- [x] Check keyboard search, shipping-detail copy, and an assistant response on the deployed app with fictional demo data (October 4, 2026).
- [x] Deploy to Vercel and record the [live app URL](https://district-wheels-dispatch-directory.vercel.app).

The application is deployed and its core demo flow works. The [demo video](05-demo-video.md) still needs a recording link. Owner-only access and backup restore require a separate live check; see [security and privacy](06-security-and-privacy.md).

## Open questions

- Which exact field order and grouped copy format work best for the current LBC and J&T Express forms?
- The production browser uses Supabase; the Express/PostgreSQL API remains disabled by default for local development and tests.
- Buyer saves and deletes use database RPCs so the record, locations, and audit entry change in one transaction.
- Which real LBC branch details should be verified before use outside the fictional demonstration data?
