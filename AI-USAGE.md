# AI usage

This project was built with AI assistance. This file records how I used it.

I chose the dispatch problem, planned the buyer workflow, and built the first working version of the website. I also wrote the early sorting and phone-handling changes listed below. The ideas and requirements for later features were mine; Codex built much of their code. I tested those features, reported problems, and directed the fixes.

My planning is recorded in the [proposal](docs/proposal.md), [wireframes](docs/wireframes.md), and [Week 1 journal](journal/week-1.md). This account separates my ideas and self-written code from Codex-written code. It does not estimate a percentage from commit counts.

## 1. How I used AI

### 2026-09-27 - Dispatch Assistant workflow

* Tool: Codex
* What I asked for: Handle natural-language buyer details for LBC door-to-door, LBC branch pickup, and J&T Express door-to-door, and prepare add, edit, and delete actions.
* What it gave back: Changes to the Supabase Edge Function, buyer form, chat component, and tests.
* What I kept, what I changed, and why: I kept the review-first flow so an interpretation would not directly change a buyer record. I tried the workflow and requested corrections where it failed.
* Commit: [Assistant buyer and branch workflows](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/8fc138d)

### 2026-09-27 - Delivery-type correction

* Tool: Codex
* What I asked for: Fix a case where the assistant treated an LBC door-to-door address as branch pickup.
* What it gave back: A parser change and a regression test.
* What I kept, what I changed, and why: I kept the safeguard that stops an explicit door-to-door request from opening a pickup form. Choosing the wrong method would produce the wrong shipping details.
* Commit: [Assistant buyer and branch workflows](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/8fc138d)

### 2026-09-27 - LBC branch search

* Tool: Codex
* What I asked for: Fix a failing message containing a buyer name, phone number, and “Imall Canlubang, Calamba City Laguna.” The assistant's Google link had searched the buyer's name as if it were the branch.
* What it gave back: Changes to pickup parsing and search-link handling, plus a test.
* What I kept, what I changed, and why: I kept a search based only on branch and location, plus an unsaved form for my review. Buyer details should not enter an external branch search.
* Commit: [Assistant buyer and branch workflows](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/8fc138d)

### 2026-10-01 - Buyer-name formatting

* Tool: Codex
* What I asked for: Save names with initial capitals and normalized spaces, whether entered in uppercase, lowercase, or mixed case, through the form or assistant.
* What it gave back: Shared formatting logic and tests.
* What I kept, what I changed, and why: I kept one formatter for both input paths so they follow the same rule.
* Commit: [Assistant composer and buyer names](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/a76bb96)

### 2026-10-01 - Chat composer

* Tool: Codex
* What I asked for: Add five suggested actions above the message box and an input that expands for long messages.
* What it gave back: Prompt templates, input resizing, and interaction tests.
* What I kept, what I changed, and why: I kept the templates editable before sending so I can enter the correct buyer and location details.
* Commit: [Assistant composer and buyer names](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/a76bb96)

### 2026-10-03 - Responsive navigation

* Tool: Codex
* What I asked for: Improve desktop and phone navigation and move Owner Backup out of the directory.
* What it gave back: An owner-only backup page, mobile menu, and active-page indicator. Its first version also added an unnecessary Add Buyer header link.
* What I kept, what I changed, and why: I pointed out the duplicate action and asked for a cleaner header. I kept the backup page and menu, with Add Buyer remaining on the page.
* Commit: [Owner backup and responsive navigation](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/cbac53df861e4e7d30ecebfca5e1dc25c398660f)

### 2026-10-03 - Navigation shift

* Tool: Codex
* What I asked for: Investigate the small header movement between Buyer Directory and Owner Backup, checking active-link weight and scrollbar width.
* What it gave back: A measurement of the link-width change and CSS that keeps the active indicator without changing font weight while reserving scrollbar space.
* What I kept, what I changed, and why: I kept the focused fix after desktop-width checks because the logo, links, and controls should remain still.
* Commit: [Layout and active navigation styling](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/386be74540030e95dfb45803394fb4f83ad7d0d8)

## 2. Where the AI got it wrong

### Case 1 - It chose the wrong delivery type

* What it gave me: For an LBC door-to-door request, the Dispatch Assistant selected branch pickup and put the address in the branch-name field.
* What was wrong with it: The selected method did not match my request and could produce incorrect shipping details.
* What I did instead: I reported the failure and asked Codex to preserve the explicit delivery type. Codex changed the parser and added a regression test.
* Commit: [Assistant buyer and branch workflows](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/8fc138d)

### Case 2 - It searched for a buyer's name as a branch

* What it gave me: The “Check on Google” link searched for “LBC Riz Lawrence Quejada Philippines branch address” rather than the Imall Canlubang branch and city.
* What was wrong with it: The search was unhelpful and sent buyer information into a public query.
* What I did instead: I supplied the failing input and required a query based only on branch and location clues. Codex fixed the parser and link and added a test.
* Commit: [Assistant buyer and branch workflows](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/8fc138d)

### Case 3 - It forgot a branch I had confirmed

* What it gave me: After I replied “correct” to a sourced LBC branch result, the assistant asked for the branch name and address again.
* What was wrong with it: I had already confirmed that branch; the remaining information needed was the buyer's details.
* What I did instead: I reported the reply and asked Codex to preserve and reverify the previous branch while requesting only the missing details. Codex changed context handling and tests.
* Commit: [Assistant buyer and branch workflows](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/8fc138d)

## 3. Who wrote what

### Written by me

#### First working website

* File: [`client/src/App.jsx`](client/src/App.jsx), [`client/src/pages/BuyerDirectoryPage.jsx`](client/src/pages/BuyerDirectoryPage.jsx), [`client/src/pages/BuyerDetailsPage.jsx`](client/src/pages/BuyerDetailsPage.jsx), and [`client/src/styles.css`](client/src/styles.css)
* Commit: [Build initial buyer directory application](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/1f2b164)
* What it does and why it is built this way: I built the initial React/Vite website with District Wheels branding, directory and details routes, search, buyer cards, and copyable contact and address fields. The directory called the first Express buyer endpoints, waited briefly before searching, and canceled an outdated request when the query changed. I added loading, empty, error, and not-found states plus responsive CSS. Later commits redesigned and expanded this initial version.

#### Stored phone normalization

* File: [`server/phone.js`](server/phone.js), [`server/store.js`](server/store.js), [`server/postgres-store.js`](server/postgres-store.js), and [`test/api.test.js`](test/api.test.js)
* Commit: [Normalize saved buyer phone numbers](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/ed46a12fbd094a75711f2edada6599cd33789c92)
* What it does and why it is built this way: I made the API reject a phone value with no digits, then strip non-digits before storing buyer and recipient numbers. Both stores use that value, and phone searches ignore punctuation. The tests check formatted input and normalized output.

#### Alphabetical directory

* File: [`server/store.js`](server/store.js), [`server/postgres-store.js`](server/postgres-store.js), and [`test/api.test.js`](test/api.test.js)
* Commit: [Sort buyer directory alphabetically](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/224fc001ee9f5ece1c59f9055e5f781f12f52d52)
* What it does and why it is built this way: I sorted buyers in both storage paths so the directory is predictable with either backend. The in-memory path uses locale-aware comparison; SQL orders by lowercased name, original name, and ID for a stable tie break. The API test checks the order.

#### Courier phone copy

* File: [`client/src/utils/phone.js`](client/src/utils/phone.js), [`client/src/components/CopyField.jsx`](client/src/components/CopyField.jsx), and [`test/phone.test.js`](test/phone.test.js)
* Commit: [Normalize phone numbers when copying](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/3e3018c27a5d1102c492b549f62637fcdbd632ee)
* What it does and why it is built this way: I separated the displayed number from the clipboard value. The helper strips punctuation and a leading zero for the courier form; the details page uses it for single fields and grouped shipping details. Tests cover formatted, already normalized, and empty input. A later [fix](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/886e06d) corrected a handler-name collision from this change.

#### Search example

* File: [`client/src/pages/BuyerDirectoryPage.jsx`](client/src/pages/BuyerDirectoryPage.jsx)
* Commit: [Update buyer search placeholder](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/3de896745bef0d677c9b8d8cfa7333dbc988474f)
* What it does and why it is built this way: I changed the placeholder to an example matching the project's sample buyer and phone input. This is a small wording edit, not my main programming evidence.

### Later features I specified and Codex built or edited

- **Dispatch Assistant:** I defined the three delivery methods, form review, LBC branch lookup, and buyer edit and removal behavior. Codex implemented much of the Edge Function, frontend, and tests. I tried examples and reported wrong outputs. [Commit](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/8fc138d).
- **Owner Backup and navigation:** I asked for Backup to move out of the directory and for better phone navigation. I rejected a duplicate Add Buyer link. Codex edited [`client/src/pages/OwnerBackupPage.jsx`](client/src/pages/OwnerBackupPage.jsx), [`client/src/components/AppHeader.jsx`](client/src/components/AppHeader.jsx), and related files. [Commit](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/cbac53df861e4e7d30ecebfca5e1dc25c398660f).
- **Header stability:** I noticed the movement between pages and specified what the fix should preserve. Codex edited [`client/src/styles.css`](client/src/styles.css), and I reviewed the result. [Commit](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/386be74540030e95dfb45803394fb4f83ad7d0d8).

### The AI-written part I understand best

* File: [`client/src/utils/navigation.js`](client/src/utils/navigation.js)
* Commit: [Owner backup and responsive navigation](https://github.com/H1R0000/District-Wheels-Dispatch-Directory/commit/cbac53df861e4e7d30ecebfca5e1dc25c398660f)
* What it does and why we kept it: Codex wrote this helper. `currentNavigationSection` maps `/` and buyer paths to Directory and `/owner/backup` to Backup, so the header can mark the active link. `canAccessOwnerBackup` allows the backup page only for an owner who is not in demo mode. The header hides the link for other users, and the page redirects them. I kept the shared helper because these decisions are short and covered by [`test/navigation.test.js`](test/navigation.test.js). Database access rules still protect records; hiding a link alone is not authorization.
