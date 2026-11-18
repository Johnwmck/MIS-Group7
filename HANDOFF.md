# Local handoff — November 18, 2026

Prepared for the December 3 review with Amber Fenimore. Work stayed local; no remote
repository operations, pushes, pull requests, or deployment were performed.

## Delivered and why it matters

- **MIS assistant:** university endpoint/model, OpenAI-compatible streaming, thinking
  disabled, bounded tool execution, explicit failures/cancellation/retry. Recommendations
  and series entries come from current catalog services. Catalog cards link to real
  books; follow-ups carry displayed book IDs, authors, and prices. Cart additions use
  application inventory rules and have duplicate protection and visible cart refresh.
- **Easy key setup:** an interactive Development launch pauses when no key exists and
  reads it invisibly. The key can be process-only or optionally saved to ignored
  `API/.env`, preserving other settings. Saved files are owner-only on macOS/Linux.
  Existing environment/file keys skip the prompt. No key is exposed in the browser,
  logs, or provider error responses. Non-interactive launches do not hang.
- **Membership value:** persisted favorites, deliberate guest merge, private purchase
  history, eligible member prices, and purchase-funded rewards. Existing accounts,
  saved card summaries, guest checkout, and customer return/cancel flows are retained.
- **Business controls:** server-authorized staff accounts and employee management,
  inventory/reporting protection, editable public/member promotions, rewards records,
  and CSV fields. Customers cannot reach internal APIs by changing browser storage.
- **Reliable purchases:** server quotes; exact cent rounding and 10% tax; one atomic
  JSON transaction for inventory, order, card summary, redemption, and earnings.
  Identical purchase retries return the original order, including after restart.
- **Presentation and policy:** compact full-cover tiles, distinct member/sale badges,
  series-first related books, mobile navigation/chat/favorites, shared truthful FAQs,
  and confirmation copy explaining that this prototype neither charges nor ships.

## Decisions to know

1. JSON remains the runtime store; no database or new runtime package dependency.
2. The existing holiday 20% offer becomes editable data. A 15% member offer applies
   to books present at migration through December 31, 2026 UTC. Admin can change both.
   Best eligible percentage wins; discounts do not compound. New books are explicitly
   added to promotions rather than silently inheriting every offer.
3. Rewards: one point per whole dollar after discounts/redemption, excluding tax;
   100 points = $5 in complete blocks. Current-order points cannot be spent immediately.
   The taxable subtotal is after rewards. No signup points or retroactive awards.
4. Existing prototype refunds reverse the order's earnings and restore its redemption.
   Spending earned points and then refunding their source can produce a negative balance;
   future earnings offset it. No real refund/payment integration was added.
5. Default staff credentials remain available for Development demos, with server-side
   hashing and roles. Browser-only staff records cannot be trusted/imported as authority.
   Reset preserves server staff while clearing customers, orders, rewards, and favorites
   and restoring the seed catalog and default offers.
6. Streaming occurs between the provider and API. The browser waits for a complete,
   validated turn rather than receiving partial action arguments. There is no automatic
   scripted fallback.
7. Guest order emails do not prove ownership. Only signed-in orders appear in account
   history or assistant account lookups. A guest's original confirmation remains their
   receipt; a pending checkout can recover it using its original request.

## Verification

- API build: **0 warnings, 0 errors**.
- **25 core checks:** money rounding, best-offer/date boundaries, redemption limits,
  fragmented/truncated streams, migration, exact ISBN/decimal-series preservation,
  untaxed historical receipts, failed atomic replacement, restart/corruption handling,
  `.env` precedence, file permissions, and affirmative cart intent.
- **52 API integration checks:** isolated registration/roles/isolation/favorites,
  public/member pricing, redemption/earning, concurrent and repeated purchase requests,
  failed-save rollback, guest ownership, stock settings, staff revocation, assistant
  tools and collection duplicate clarification, provider error/timeout handling,
  restart, refunds, rankings, and reset.
- **22 browser checks:** actual Chrome registration and guest-favorite merge,
  recommendations/cart actions, restored transcript and receipt deduplication, member
  purchase and loss-of-response recovery, order history, later reward redemption,
  series cards, mobile layout on six customer pages, keyboard/cancellation behavior,
  admin promotion creation, rewards records, and CSV export. No uncaught JavaScript
  errors. Signed-in navigation is checked on all six mobile pages.
- **4 pseudo-terminal checks:** hidden key entry and optional restricted save; existing
  key skips prompt; blank cancels without saving; process-only entry leaves no file.
- JavaScript syntax, local HTML assets, and Git whitespace checks pass.
- Tests use temporary files and loopback services, never the active store's reset.
  Migration was exercised on a copy of local state, and each integration run verifies
  the real state file was unchanged by that run. Existing data remains in place.
- Review screenshots: ignored `.test-artifacts/desktop-catalog.png`,
  `desktop-home.png`, `mobile-help.png`, and `admin-promotions.png`.

The deterministic provider in tests verifies transport and application/tool boundaries;
it does **not** prove the university model behaves correctly with a live key. No key was
present in the environment or `API/.env`; the existing API on port 5187 also reported
missing credentials. The outstanding live check is described below.

## Repeatable final demo

1. Restart the API in an interactive terminal using the README command. If prompted,
   enter an authorized key privately and choose whether to save it. In Admin, review
   offer dates, stock, and member eligibility. Do not reset existing work just to demo.
2. On the customer homepage, explain free membership, then register a new account.
   Save a favorite and show that it survives navigation/sign-out/sign-in.
3. Ask the assistant: “Recommend a fantasy book under $15.” Follow with “something
   cheaper” and “by another author.” Verify displayed prices match product pages.
4. Ask “add the second one.” Open Cart and confirm its count and visible contents.
   Ask for the Hunger Games collection, then request additions. If any are already
   in the cart, choose “only missing entries” or explicitly request duplicates.
   Explain unavailable entries and that this is the catalog's four-book collection.
5. Choose at least one book showing **Member offer applied**. Complete a demo purchase
   using `4242 4242 4242 4242` and a future expiration. No real card or charge is needed.
   For the redemption demonstration, buy enough available merchandise to earn at least
   100 points after discounts (for example, a collection plus several other books).
6. Open My Account: show the order, exact savings/tax, awarded points, and ledger.
   Begin another purchase with at least $5 of eligible merchandise. Select 100 points,
   review the $5 discount before tax, and complete it. Show the revised balance/history.
7. In a separate browser/profile, sign in as Admin. Show both orders, current inventory,
   promotion rules, reward award/redemption entries, revenue/tax reports, best sellers,
   and the exported CSV. Keep customer and staff sessions separate during the demo.

## Remaining limitations and next check

- **Live MIS access is unverified.** After configuring the key, run steps 3–4 against
  the actual endpoint, including the collection duplicate question. Confirm a response
  from `qwen3.8-27b`, correct recommendations/follow-ups, and actual cart changes. If
  the key lacks model access, confirm university activation rather than regenerating it.
- This remains a single-process, JSON-backed class prototype. Browser carts are local
  to that browser; assistant conversation is tab-scoped. Favorites/orders/rewards are
  server-persisted. External cover/CDN availability can affect visuals.
- No payments, shipping, tracking emails, exchanges, or account email verification
  were added. Help and receipts describe that honestly.
- Production deployment, production credential rotation/account recovery, and
  distributed/multi-server persistence are outside this local scope. For later hosting,
  provide environment variables, HTTPS, durable state/Data Protection storage, and
  non-demo staff credentials. The README covers configuration and reset behavior.


Repair-pass verification (November 18, 2026): build passed with zero warnings/errors;
25 core checks, 52 simulated-provider API checks, 22 browser acceptance checks,
and 11 focused browser race checks passed. The four terminal checks above describe
the earlier implementation verification; they were not rerun in this repair pass.
No live MIS model success was verified in this pass. Existing store JSON was unchanged
by integration tests. Browser selection now defaults to Playwright Chromium, with
PLAYWRIGHT_EXECUTABLE_PATH / PLAYWRIGHT_CHANNEL overrides.

Assistant state is scoped to a cross-tab identity epoch and a server-validated session
fingerprint. Session changes are checked before model use, after model completion,
after catalog validation, on focus, and every ten seconds. Cart data is not cleared.
Clear Conversation and page exit invalidate outstanding work. Cart and action receipts
remain a single write; cancellation after that write does not undo the committed action.
Uncertain purchases retain their original request. Recovery checks the current account
before replay and before showing confirmation; guest requests from a changed identity
epoch are retained but cannot be replayed automatically under the new identity.
