# Project Increment Report - Week 1

## Week of: September 14-20, 2026

## Project

**District Wheels Dispatch Directory**

The project is a dispatch reference tool for finding repeat buyers and copying their saved shipping information into LBC or J&T Express forms. This first increment focused on defining the workflow and testing the screen structure before starting the full React, Express, and PostgreSQL implementation.

## What changed this week

- Wrote the project proposal and defined the app's audience, four main screens, required data, primary task flow, and first technical risk.
- Built responsive wireframes for Buyer Directory, Buyer Details, Add Buyer, and Edit Buyer.
- Added an interactive screen selector so each wireframe can be reviewed without scrolling through four full mockups at once.
- Added desktop, phone, and side-by-side viewport controls to test the responsive layout plan.
- Documented the screen map, component hierarchy, atomic-design levels, component states, and the main fulfillment walkthrough.
- Created a visual design system using District Wheels yellow (`#FFD200`), including color roles, typography, an 8px spacing scale, reusable component examples, responsive rules, and accessibility checks.
- Exported the wireframes and design system as PDFs for review and submission.

## Evidence of progress

| Date | Commit | Evidence |
| --- | --- | --- |
| September 17, 2026 | `83d92ae` - Add District Wheels project proposal | Defines the problem, users, routes, state, screen contents, required content, and database risk. |
| September 17, 2026 | `a1b98ba` - Create District Wheels wireframes | Adds the hosted responsive wireframe board, styles, interaction script, and hosting configuration. |
| Week 1 report update | Current published version | Adds the report plus the completed wireframe and design-system deliverables. |

## Why

The fulfillment manager's job depends on speed and accuracy. Planning the complete flow first exposed exactly which buyer, address, pickup-location, courier, and copy-feedback states the finished app must support. The responsive wireframes also confirm that the same task order can work on desktop and phone before time is spent building the database and API.

The design system turns repeated visual decisions into reusable rules. Defining the yellow action color, type scale, spacing unit, controls, feedback, and accessibility behavior now should reduce inconsistent styling when the real components are implemented.

## What broke or what I got stuck on

- The first PDF exports had inconsistent button-label padding, crowded metadata, and checklist content that extended beyond its card. I corrected the shared button alignment and adjusted the affected card spacing, then rechecked all pages.
- The hardest planned data rule is still unresolved in code: each buyer may have several addresses and LBC pickup locations, but only one default of each type. The intended solution is an Express API transaction plus PostgreSQL partial unique indexes, but it has not been implemented or tested yet.
- The current hosted work is a planning prototype. Its fields and records are placeholders, and the controls demonstrate layout changes rather than saving real data.
- The expected course folder `content/finals/` was not present in this checkout. I used the supplied finals overview, report template, and rubric as the available assignment references.

## What is left

- Create the final React application and connect its four routes.
- Build the Node/Express REST API for buyers, addresses, pickup locations, and couriers.
- Design, migrate, and seed the PostgreSQL database with fictional data.
- Implement search, create, edit, delete, default-location changes, and clipboard actions.
- Add input validation, loading, empty, success, and failure states.
- Test the one-default-per-buyer database rule and error handling.
- Replace placeholder wireframe content with working components and real API responses.
- Complete the setup, usage, endpoint, structure, screenshot, and known-issues sections in the project README.
- Perform keyboard, responsive, and accessibility testing before the final submission.

