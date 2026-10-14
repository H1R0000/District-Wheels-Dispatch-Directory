# Persistent assistant draft and validated extraction

## Implementation plan

This task uses the user's orchestration instructions from `Documents/AI ORCHESTATION`.
The primary session owns integration and release. Genuine native subagents receive
the configured role instructions explicitly because this chat does not expose a
custom-agent-type selector. Custom-role activation and per-role sandbox enforcement
are not claimed.

1. Backend developer: maintain a server-validated canonical buyer state, merge
   corrections, and use bounded AI extraction when deterministic parsing is incomplete.
2. Frontend developer: persist the state per signed-in account in session storage,
   keep the current summary and review action consistent, and reset state on clear,
   new buyer, or successful completion.
3. QA and security review: check state isolation, correction handling, stale replies,
   evidence validation, branch-query privacy, and regressions.
4. Primary session: inspect the integrated changes, run the complete tests and build,
   verify representative flows in the website, and release using existing deployment
   authorization.

## Shared contract

- Requests keep the existing `messages` array and may include `buyerStateToken`.
- Active buyer responses may include `buyerState` and `buyerStateToken` together.
- State is `{ version: 1, id, revision, buyer, status }`; status is `collecting` or
  `ready`. The client displays the buyer but does not submit it as authoritative state.
- The server validates the signed state token for the authenticated account.
- A draft is not a saved buyer. Only a successful database operation can report Saved.
- Persistence initially lasts for the browser tab's session and refreshes; it is not
  cross-device storage and requires no new buyer database table.

## Acceptance criteria

- Changing one detail preserves the other supplied details.
- An unrelated question, request failure, or refresh does not discard the current draft.
- A new buyer, clear chat, account change, or successful save cannot reuse the old draft.
- AI output must pass schema and supplied-evidence checks before merging.
- Missing or conflicting fields produce a focused follow-up; invented private address
  details are rejected.
- Branch searches use only destination details, never a buyer's identity.
- Existing official branch verification, review-before-save, duplicate checking,
  sign-in rules, and demo access continue to work.

## Validation

The integrated `npm test` run passed 124 tests, and `npm run build` passed.
Focused security review confirmed that the reproduced buyer/branch identity swaps
are rejected, including uncertain first messages. Resolver calls and Google links
also check destination clues for buyer identity and phone information.

Coverage includes token tampering, expiration and account binding; state retention
and resets; stale response/revision handling; evidence validation; provider failures;
correction-to-canonical-draft integration; and branch-query privacy. The existing
Vite bundle-size warning remains.

Live verification and release are in progress. Signing uses an existing server
secret without exposing it. Tokens expire after 24 hours; persistence is limited
to the current browser session. If signing configuration is unavailable, responses
explicitly use the existing stateless conversation fallback.
