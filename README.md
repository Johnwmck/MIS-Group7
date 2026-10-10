# Team 7 Books

MIS 321 Team 7 bookstore project for browsing books, placing demo orders, and
managing the catalog and inventory.

## Run locally

1. Install the .NET 10 SDK.
2. Open a terminal in this repository's root folder and run:

   ```sh
   dotnet run --project API/Team7Books.Api.csproj --launch-profile http
   ```

3. Open http://localhost:5187 in your browser.

Keep the terminal running while using the site. Press Ctrl+C to stop the server.
You do not need a separate frontend server or matching folder paths across
teammates' computers. Open the browser link rather than opening HTML files directly.
Bootstrap and book cover images require internet access.

## Pages

- **Customer home:** Browse, search, filter, sort, and view details from the Books API.
  Add to Cart and Buy Now validate quantities against current API inventory.
- **Cart and checkout:** Review current API titles, prices, and availability,
  then place an order through the server.
- **Internal login:** Open http://localhost:5187/login.html to access employee or
  admin pages.
- **Employee:** Manage inventory and availability; view server orders and export CSV.
- **Admin:** Add, edit, and delete books; manage inventory and view reports.

## Demo accounts

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `admin123` |
| Employee | `employee` | `employee123` |

These are fake accounts for the local prototype.

## Current demo behavior

Customer, Admin, and Employee share the local API catalog. First startup loads the
573 books in `Seed Data/Team7_SeedBooks.csv`. Later startups load saved state, so inventory,
catalog edits/deletions, new books, and orders survive restarts. Refresh a page to
see changes made on another page. Each machine has its own independent state.

The normal customer page loads `/api/books`; no preview URL is needed. Customer
Best Sellers, internal order history, CSV exports, and Admin sales statistics use
server orders. Cart selections and checkout snapshots remain in browser storage, but book details
and validation come from the API. Cart reconciliation removes unavailable books
and reduces quantities when inventory falls. API failures preserve saved selections.
Purchases validate the entire order before reducing server inventory and saving
an order. New purchases add 10% sales tax, rounded to cents; cart, checkout,
confirmation, history, and CSV display the subtotal, tax, and total. Admin reports
separate before-tax revenue from tax collected. Existing pre-tax orders retain
their original totals and show zero tax. Changed prices require a fresh review. Failed requests preserve selections;
an unconfirmed purchase result blocks resubmission until you check history and
deliberately start another checkout. Buy Now leaves the saved cart separate.
Admin's **Reset Demo Data** restores the CSV catalog, deletes completed orders,
resets ID counters, and saves that demo state. It also clears the initiating
browser's cart, checkout selection, and demo accounts while preserving its Admin
session. Other browsers/tabs should refresh and review their selections after reset.

## Local persistence

Catalog updates include the revision shown when the form/control was loaded.
Purchases and edits replace that token; stale updates return HTTP 409 and require
refresh/reopening the form. Reset generates fresh tokens too. Existing saved
books without tokens receive them automatically on load. Successful cart checkout
subtracts only confirmed purchased quantities from the current shared cart, keeping
items and extra copies added by other tabs while the request was in flight.

The seed CSV is version-controlled and copied into the API build/publish output.
It is never rewritten by purchases or catalog operations. Saved state lives at
`API/App_Data/bookstore-state.json` during normal local runs and is Git-ignored.
Books, orders, counters, and a format version are saved together using a flushed
temporary file and atomic replacement. A failed save does not change live state.

A saved-state file takes precedence over changed seed data; use Reset Demo Data
to apply a revised seed catalog. Invalid or unreadable saved data stops startup
instead of silently wiping changes. Back up that file before recovery. Only one
API process may own a given state file; a process lock prevents accidental sharing.
For isolated tests, configuration overrides `Bookstore:StatePath` and
`Bookstore:SeedPath` select different files (environment variables use
`Bookstore__StatePath` and `Bookstore__SeedPath`).

Catalog requests accept checksum-valid ISBN-10/ISBN-13 values; hyphens and
spaces are removed when saving API edits. Prices must be nonnegative amounts
with at most two decimal places (including reviewed checkout prices). Seed
import and saved-state loading share these catalog validation rules.
Saved orders must have valid items/customer/date data, consistent subtotal,
10% tax and total calculations, and non-reusable ID counters. Untaxed historical
orders remain valid only when their original totals match their item snapshots.
Malformed snapshots are rejected without modifying the saved file.

Series names and nullable decimal reading sequences are preserved by catalog
operations, editable in Admin, and displayed in customer details. Browser demo
accounts remain browser-only. The reset endpoint has no server authentication:
this is still a local prototype, not a production-ready deployment.

## Backend checkout design

Request and saved-order models are defined in `API/Models`.
See [the checkout contract](API/ORDER-CONTRACT.md) for validation, price-change,
transaction, and response rules. Phase 7 removed browser catalog seeds, catalog
and order persistence, and browser purchasing. Old `savedBooks` and `savedOrders`
storage entries are ignored and left untouched; no browser data is imported into
server orders. A confirmed server demo reset can clear the unconfirmed-purchase
safeguard because all prior demo orders have been deleted.
Phase 8 separates shared code by responsibility. Pages load only their needed
scripts, in dependency order, before their page controller:

| File | Responsibility |
| --- | --- |
| `api.js` | Same-origin book and order requests |
| `book-utils.js` | Currency and stock-display rules |
| `cart-state.js` | Cart selections and API reconciliation |
| `checkout-state.js` | Checkout snapshots and customer validation |
| `internal-users.js` | Prototype accounts and login sessions |
| `demo-reset.js` | Server demo reset and initiating-browser cleanup |
| `reporting.js` | Sales rankings, dashboard, recommendations, history rendering/search |
| `order-export.js` | Order CSV formatting and download |

`order-history.js` owns history loading, search/export events, and displayed-order
state. Report renderers take explicit data and DOM targets; they do not initialize
themselves or own page globals. Order CSV behavior is unchanged; catalog CSV
import/export is separate future work. No bundler or ES module conversion is needed.

## Review checks

Build the API:

```sh
dotnet build API/Team7Books.Api.csproj
```

Review cart and Buy Now purchases, tax breakdowns, order reports, and CSV export.
Check that catalog changes and orders survive an API restart. Test invalid ISBNs
and prices, then confirm Reset Demo Data restores seeds and clears orders.
