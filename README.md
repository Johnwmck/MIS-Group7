# Team 7 Books

MIS 321 Team 7 bookstore: a same-origin ASP.NET Core API and browser client, with
JSON persistence, customer membership, staff tools, and a university MIS assistant.
This is a class prototype: no real payment, shipment, tracking, or email delivery occurs.

## Start locally

Install the **.NET 10 SDK**, then run from the repository root:

```sh
dotnet run --project API/Team7Books.Api.csproj --launch-profile http
```

Open **http://localhost:5187**. No separate frontend server, Node installation, or
database is needed. Keep the terminal open; Ctrl+C stops the server. Bootstrap,
fonts, and external cover images use internet access. Covers have local fallbacks.

On an interactive Development launch, if no MIS key is configured, startup pauses
and asks for an authorized university key **without echoing it**. Enter cancels
startup when the input is empty; Ctrl+C cancels too. The key becomes an environment
variable for that API process. The terminal then offers to save it for future
launches in `API/.env`; the default is **No**, which keeps it process-only.
Saving preserves other settings, uses atomic file replacement, and sets owner-only
read/write permissions on macOS/Linux. On Windows the file inherits directory
permissions. `.env` is plaintext local configuration, not encrypted storage.
Never paste a key into chat or commit it.

If an environment or `.env` key already exists, there is no prompt. Redirected,
non-interactive, and non-Development launches never wait for terminal input. They
start the store and explain missing assistant configuration in the terminal and UI.

Alternatively, copy `API/.env.example` to `API/.env` and edit it locally before
starting. The example contains placeholders only. The API resolves this directory
explicitly, so launching from the repository root works. Real environment variables
override `.env`; hosting does not require a file. The API and provider transport
never send the credential to the browser or include provider response bodies in errors.

| Setting | Default / purpose |
| --- | --- |
| `MIS_LLM_KEY` | Authorized university API key; canonical spelling |
| `MIS_LLM_KeY` | Handout alias, also accepted; canonical spelling wins if both environment spellings exist |
| `MIS_LLM_ENDPOINT` | `https://local-llm.uamishub.com/v1` |
| `MIS_LLM_MODEL` | `qwen3.8-27b` |
| `MIS_LLM_TIMEOUT_SECONDS` | 150 seconds for a whole assistant turn; bounded 5–300 |
| `MIS_LLM_MAX_TOKENS` | 1800 per provider round; bounded 128–4096 |

A newly issued MIS key can be **pending or lack model access**. A 403/404 response
asks you to confirm access to `qwen3.8-27b` with the university; regenerating the key
is not the recommended fix. Missing keys, unauthorized credentials, model access,
service failures, rate limits, cancellation, and timeouts are distinguished.
“Configured” means a key exists; a successful chat is the live access check.
There is no silent scripted fallback and no local model startup requirement.

## Customer experience

- Home and catalog share compact, full-cover tiles, visible sale/member badges,
  favorites, stock indicators, and quick Add to Cart. The catalog retains search,
  filters, sorting, URL state, and 48-book pages. Details show related series in
  decimal reading order before other recommendations.
- Guest favorites are saved in the browser. Signing in merges them with the
  server account in one transaction, without duplicates. Guest entries are
  cleared only after success; a failed merge preserves them for retry.
- Registration, sign-in/out, account edits, saved card summaries, own order history,
  and rewards use server accounts. Passwords use ASP.NET Core `PasswordHasher`.
  An HttpOnly, SameSite=Strict cookie is revalidated against the saved account on
  every request. Browser storage and supplied customer IDs cannot authorize access.
- Carts remain in the browser across sign-in/out. Signed-in orders attach to the
  authenticated account; guests can still check out. Registering with an old guest
  order's email does not claim that order.
- Checkout obtains current server prices and a rewards quote. It rejects changed
  prices, changed account identity, unavailable books, and insufficient inventory.
  A saved request key makes **Retry confirmation** safe after a lost response.
  Do not discard an unconfirmed checkout: use its retry button to recover it.
- Card entry is for demo cards only. The browser sends only brand, last four digits,
  expiration, and name. Full card numbers are neither sent to the API nor persisted.
- Existing whole-order returns/cancellations remain available for signed-in purchases
  within 30 days. These are prototype receipts, not actual money transfers. Inventory
  and rewards reverse atomically. There is no guest-return or exchange workflow.

## Promotions and rewards

**Admin → Promotions & Rewards** creates and edits names, eligible books, percent
discounts, start/end timestamps, public/member eligibility, and active state.
Dates entered by the form use the browser's local time and are stored in UTC.
Start is inclusive, end exclusive. Activate/deactivate does not override dates.
Edits use revision tokens to reject stale changes.

For each book, the **best eligible public or member percentage offer** applies;
percentage discounts never stack. Unit prices round to cents, midpoint away from
zero. Guests see the current public price plus a lower member-price teaser when
available. Signed-in members see the price they will pay. Prices, banners, cart,
checkout, assistant tools, and receipts use the same server rules.

- Earn **1 point per whole dollar** of merchandise after promotions and redemption,
  excluding tax. Points are available only after the order is successfully saved.
- Redeem **100 points for $5**, in whole 100-point increments. Redemption cannot
  exceed the existing balance or cover more than the merchandise subtotal.
  For example, $4.99 of merchandise cannot use a $5 reward block.
- Subtract rewards from discounted merchandise, then calculate **10% sales tax**,
  rounded once on that subtotal. Current-purchase earnings cannot fund its redemption.
- Each order has unique award/redemption ledger entries. A prototype refund reverses
  its earnings and restores its redemption once. If those earnings were already
  spent, the balance can go negative; future earnings offset it and redemption is
  unavailable until sufficient points return.
- Account pages show balance/history; confirmations, internal records, and CSVs show
  savings and points. Revenue reports use saved totals after all discounts and refunds.

The one-time migration retains the previous **Merry & Bright** offer as editable
JSON data (20%, selected books, November 10–December 25, 2026 UTC). It adds an editable
**Member bookshelf** offer (15%, books present during migration, November 1–December
31, 2026 UTC). New books must be added to an offer explicitly. Staff can adjust these
demo offers before December 3; no expired Halloween mechanism remains in code.

## Assistant architecture

The browser posts conversation text and current cart context to `/api/assistant/chat`.
`MisModelClient` sends OpenAI-compatible streaming .NET HTTP requests with
`chat_template_kwargs.enable_thinking=false`. It assembles SSE text and indexed tool
argument fragments, verifies completion, and rejects truncated/invalid streams.
Only complete replies reach the browser; the UI offers loading, Cancel, and Retry.
This avoids exposing incomplete arguments and the provider's long non-streamed
request timeout. The transport uses framework HTTP/JSON facilities without an SDK
package dependency.

The service limits history, response sizes, and tool rounds. Tools can search current
catalog prices/availability, exclude authors, fetch book/series details, read current
store policies/deals/rewards, read the signed-in customer's own order, prepare cart
additions, and offer local navigation. They cannot order, redeem, refund, or administer
the store. Identity always comes from the server cookie. An email/model-supplied ID
is never proof of ownership.

The browser confirms cart actions using shared cart validation. Cart selections and
assistant action receipts are saved in one storage write, preventing duplicate adds
on retries/restoration. Repeated tool calls for the same book are deduplicated.
Cart count, preview, and the visible cart refresh after changes. Conversation context
is tab-scoped across customer pages and cleared on identity changes.

For Hunger Games, the series tool lists the catalog's four entries in reading order,
including unavailable entries. It prepares available requested entries, explains
skips, and asks whether to add extra copies when books are already in the cart. It
does not promise titles absent from this catalog. Help FAQs and assistant policy
facts share `API/Services/AssistantKnowledge.cs`.

## Staff and authorization

Development seed accounts:

| Role | Username | Password |
| --- | --- | --- |
| Administrator | `admin` | `admin123` |
| Employee | `employee` | `employee123` |

These are local demo credentials. Staff passwords are hashed in JSON. Employees
can adjust inventory/availability and read order reports; only administrators can
create/delete books, change catalog details, manage employees/promotions, inspect
all rewards, and reset demo data. APIs enforce these roles independently of the UI.
Employee edits cannot change posted price/title fields. Disabled employees and
changed credentials invalidate their sessions.

First startup/migration outside Development requires `BOOKSTORE_ADMIN_PASSWORD`
and `BOOKSTORE_EMPLOYEE_PASSWORD`; these can also be set before a first local launch
to replace the demo seed passwords. Existing staff are not overwritten on restart.
Old browser-only staff records are ignored; recreate needed employees through Admin.
For a later hosted instance, use HTTPS, persistent application/Data Protection storage,
server environment variables, and non-demo staff credentials. Deployment is outside
this local implementation.

## JSON state, migration, and reset

Runtime state remains **`API/App_Data/bookstore-state.json`**, Git-ignored and excluded
from publish output. `Bookstore__StatePath` and `Bookstore__SeedPath` select alternate
files. Only one API process can own a state file; a process lock prevents sharing.
CSV remains bootstrap data and is never rewritten by purchases.

Version 1 loads conservatively and migrates once to version 2, adding promotions,
staff, rewards, and session identifiers. Exact ISBN strings, decimal series sequences,
inventory, custom descriptions/biographies, customers/favorites, and historical order
snapshots are retained. The existing conservative catalog-metadata migration remains.
Only the former derived `salePrice` cache is removed; original list prices and amounts
paid are retained. Historical orders receive no retroactive points.

Every mutation builds a detached snapshot. Order insertion, inventory deduction,
optional saved card, reward redemption, and earning are validated and written together,
using a flushed temporary file and atomic replacement before publishing live state.
Failed writes do not apply partial changes. Malformed/incomplete snapshots stop startup
without reset. Back up the state file before recovery; never delete it merely to start.

**Admin Reset Demo Data is destructive:** restores the seed catalog and default offers,
deletes customers/favorites/orders/rewards, and resets their counters. Server staff
accounts remain, including the authorized administrator session. The initiating
browser's demo cart, checkout, favorites, and chat are cleared; other tabs should
refresh. Old customer cookies cannot regain a later account that reused an ID.

See [checkout contract](API/ORDER-CONTRACT.md) and [local handoff](HANDOFF.md).

## Verification

From the root:

```sh
dotnet build API/Team7Books.Api.csproj
dotnet run --project tests/Core/Team7Books.Checks.csproj -- "$PWD"
python3 tests/integration.py
python3 tests/key_prompt.py
```

Tests use temporary state, including a **copy** of existing local data. Integration
checks start loopback API and deterministic streaming-provider servers; they do not
reset real data or establish live MIS model access. The terminal test uses a temporary
project layout, pseudo-terminal, and throwaway key; it verifies hidden input, optional
save, no repeat prompt, and cancelled startup. It requires macOS/Linux.

Optional browser acceptance checks require Python Playwright and locally installed
Google Chrome (the default executable path in `tests/browser_checks.py` is for macOS):

```sh
python3 -m venv /tmp/team7-browser-checks
/tmp/team7-browser-checks/bin/pip install playwright
/tmp/team7-browser-checks/bin/python tests/integration.py --browser
```

This exercises registration, guest-favorite merge, chat cart actions/restoration,
member checkout, a lost purchase response and safe retry, rewards redemption, internal
records/CSV, and desktop/mobile behavior. Screenshots go to ignored `.test-artifacts/`.
The final live-provider check requires an authorized key with access to the configured
MIS model; see the handoff for the remaining acceptance step.
