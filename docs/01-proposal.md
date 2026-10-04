# Proposal

## App name

District Wheels Dispatch Directory.

## What the app is for, in one sentence

A private directory that helps the District Wheels fulfillment manager find repeat buyers and copy their saved shipping details into LBC or J&T Express forms.

## Who is it for

The primary user is the fulfillment manager. Reviewers can enter a separate demo with fictional buyer records. The demo cannot access the owner's records.

## The problem and the planned solution

Repeat shipments require looking up and retyping the same contact and location details. The directory saves buyer records with delivery addresses and LBC pickup locations, supports name or phone search, and places copy actions next to the fields used in courier forms. The manager still reviews and pastes the information into the external courier form; the app does not book shipments.

## Sections or routes this app needs

| Route | Purpose |
| --- | --- |
| `/` | Search the Buyer Directory and open a record. |
| `/buyers/new` | Add a buyer and shipping location. |
| `/buyers/:buyerId` | Review, select, and copy saved details. |
| `/buyers/:buyerId/edit` | Update the buyer and saved locations. |
| `/owner/backup` | Export or restore owner data; owner access only. |

The Dispatch Assistant is available within the app. It can prepare add or edit drafts and help check LBC branch details, but the user reviews a form before saving.

## State: what data does the app hold?

Each buyer has a name, phone number, preferred courier, saved delivery addresses, and optional LBC pickup locations. One address and one pickup location can be marked as the default of their type. Supabase also stores approved profiles and audit records. The demo uses a separate profile and fictional data.

## Where each piece is hosted

The React and Vite browser app is deployed on Vercel. Supabase hosts authentication, PostgreSQL data, access policies, and Edge Functions for the demo and assistant. The repository also contains a separate Express API with JSON or PostgreSQL storage for local development and tests; the deployed browser app calls Supabase directly.

## What changed since the first proposal

The [original working proposal](proposal.md) planned four screens and a basic buyer workflow. The completed app adds owner backup, a separate demo, a review-first Dispatch Assistant, and database functions that save or delete records with their audit entries in one transaction. The [main README](../README.md) describes the current behavior and known limits.

## Risks and limits

- Buyer names, phone numbers, and addresses need access controls and careful handling. See [security and privacy](06-security-and-privacy.md).
- The assistant uses an external model. Only necessary information should be entered, and suggested details need human review.
- Courier websites, rates, booking, tracking, and automatic form filling remain outside this project's scope.
