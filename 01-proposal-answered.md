# 1. App Proposal

## App name

**District Wheels Dispatch Directory**

## What the app is for, in one sentence

District Wheels Dispatch Directory helps the fulfillment manager quickly find a repeat buyer and copy the buyer's saved shipping information into the LBC or J&T Express website or mobile app.

## Who is it for

The app is for the District Wheels fulfillment manager who prepares shipments for repeat buyers. When the manager opens it, they need to search for a buyer by name or phone number, open the correct record, choose the appropriate address or LBC pickup location, and copy each required shipping value into an external courier form.

## Sections or routes this app needs

| # | Section / route | What it is for |
| - | --- | --- |
| 1 | Buyer Directory | Serves as the entry screen where the manager can search by partial buyer name or phone number and open the correct buyer record. |
| 2 | Buyer Details | Displays the buyer's contact information, preferred courier, saved addresses, and LBC pickup locations with an individual Copy button beside every value. |
| 3 | Add Buyer | Lets the manager create a buyer and enter the buyer's basic information plus an initial normal address or LBC branch pickup location. |
| 4 | Edit Buyer | Lets the manager update the buyer's name, phone number, preferred courier, addresses, and saved LBC pickup locations. |

Add and edit forms for addresses and LBC pickup locations can appear as focused dialogs or sections within the buyer form instead of becoming extra top-level routes. This keeps the app within four main screens and makes the workflow faster.

## State: what data does the app hold?

The most important screen is **Buyer Details**.

| Data | Shape (rough) | Who owns it (which component) | Changes when... |
| --- | --- | --- | --- |
| Buyer | `{ buyerId, name, phoneNumber, preferredCourier }` | `BuyerDetailsPage` | the page loads a buyer or the buyer's basic information is updated |
| Addresses | `[{ addressId, recipientName, recipientPhone, street, barangay, city, province, zipCode, isDefault }]` | `BuyerDetailsPage` | an address is added, edited, deleted, or made the default |
| LBC pickup locations | `[{ pickupId, recipientName, recipientPhone, branchName, branchAddress, isDefault }]` | `BuyerDetailsPage` | a pickup location is added, edited, deleted, or made the default |
| Shipping method | `"door-to-door" \| "branch-pickup"` | `ShippingDetails` | the manager switches between LBC Door to Door and Branch Pickup |
| Selected address | `addressId` or `null` | `ShippingDetails` | the manager chooses one of the buyer's saved addresses |
| Selected pickup | `pickupId` or `null` | `ShippingDetails` | the manager chooses one of the buyer's saved LBC pickup locations |
| Copy feedback | `fieldName` or `null` | `CopyField` | a copy succeeds, fails, or the short feedback message disappears |
| Loading and error state | `{ loading, error }` | `BuyerDetailsPage` | an API request begins, succeeds, or fails |

The buyer, addresses, and LBC pickup locations will ultimately come from the Express REST API and PostgreSQL database rather than being kept only in React.

## What each screen contains

- Screen: **Buyer Details**
  - District Wheels header and a link back to the Buyer Directory
  - Buyer name and actions for editing or deleting the buyer
  - Contact section with separate copyable fields for the buyer's name and phone number
  - Preferred courier section showing LBC or J&T Express
  - Shipping-method control that shows Door to Door for a normal address and, when the courier is LBC, also allows Branch Pickup
  - Saved-address selector with the default address clearly marked
  - Door-to-door shipping fields for recipient name, recipient phone, street, barangay, city, province, and ZIP code
  - Saved LBC pickup selector with the default pickup location clearly marked
  - Branch-pickup fields for recipient name, recipient phone, LBC branch name, and LBC branch address
  - An individual Copy button beside every value that may be pasted into a courier form
  - Convenience actions for **Copy Full Address** and **Copy All Shipping Details**
  - Subtle text feedback such as **Copied** that does not rely only on color or use repeated alert popups
  - Useful loading, error, and empty states when records cannot be loaded or no address or pickup location has been saved

## Content you need to gather

- Approximately ten fictional sample buyers with names, phone numbers, preferred couriers, normal addresses, and LBC branch pickup details
- The initial courier records: LBC and J&T Express
- Accurate examples of the shipping fields required by the LBC and J&T Express forms
- A list of LBC branch names and branch addresses needed for the sample pickup records
- District Wheels branding, including the correct name, logo if available, colors, and preferred type style
- Short interface messages for successful copying, failed copying, validation errors, empty search results, unavailable API, and failed saves or deletes
- Confirmation of the exact format required when using **Copy Full Address** or **Copy All Shipping Details**

Only fictional information will be used for development and demonstration; real customer records will not be included in the project files.

## One risk

The part I am least sure how to build is safely managing multiple saved addresses and LBC pickup locations while allowing only one default of each type per buyer. This affects both React state and PostgreSQL data. I plan to handle a default change through the Express API in a database transaction and use a PostgreSQL unique partial index so two addresses, or two LBC pickup locations, cannot accidentally be marked as the default for the same buyer.
