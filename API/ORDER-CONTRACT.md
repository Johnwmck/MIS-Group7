# Checkout and persistence contract

`POST /api/orders/quote` takes `{items: [{bookId, quantity}], redeemPoints}` and
returns authoritative current unit prices, account identity, available balance,
maximum redeemable points, promotion savings, reward discount, taxable subtotal,
10% tax, total, and expected earnings. No client price controls the quote.

`POST /api/orders` takes:

```json
{
  "requestKey": "a-unique-UUID-created-once-for-this-checkout",
  "customerName": "Demo Customer",
  "customerEmail": "customer@example.com",
  "items": [{ "bookId": 1, "quantity": 2, "price": 14.99 }],
  "redeemPoints": 0,
  "expectedTotal": 32.98,
  "expectedCustomerId": null,
  "newCard": {
    "brand": "Visa", "last4": "4242", "expMonth": 12,
    "expYear": 2035, "nameOnCard": "Demo Customer"
  },
  "saveNewCard": false
}
```

The sample amounts are illustrative; obtain current values from the quote. Use an
actual UUID for `requestKey`. Exactly one of `newCard` and `paymentMethodId` is required.
A saved card must belong to the authenticated customer. Never send full card numbers.

`expectedCustomerId` is only a stale-page guard; it grants no access. The server
associates the order with the account from the validated cookie. Guest orders have
no customer account association, even if their email later matches a registration.

The API requires distinct existing book IDs, whole quantities within available stock,
active books without manual out-of-stock status, and exact reviewed unit prices.
Limits are 100 distinct books, 1000 copies per book, and $1,000,000 merchandise per
checkout. Price or account changes require review. The server uses the best currently
eligible public/member percentage offer, rounded per unit away from zero to cents.
Reward redemption uses whole 100-point/$5 blocks bounded by the existing balance and
merchandise. It reduces the taxable subtotal. Tax is 10%, rounded once, midpoint away
from zero. Earnings are the floor of the discounted, after-redemption subtotal.

The order, item snapshots, optional saved card, inventory/revisions, next ID, and unique
reward ledger entries commit together. A failed save returns 503 and changes neither
the file nor live state. Completed orders retain original prices, promotion names,
list prices, savings, points, subtotal, tax, and total regardless of later catalog edits.
Pre-membership/pre-tax historical orders retain their original totals and earn no
retroactive points. Whole-order prototype refunds atomically restock inventory, reverse
awards, and restore redemptions without changing the original receipt.

A first successful submission returns **201**. The saved UUID, request fingerprint,
and authenticated owner make an identical retry return **200 with the original order**,
even after restart or stock changes. Reusing a key with different content/identity
returns **409**. UUIDs are generated using browser cryptographic randomness. Retain
both the UUID and exact request until the response is confirmed. The UI's “Retry
confirmation” resends that exact request after an ambiguous network failure; it never
allocates a replacement key. Cart cleanup follows confirmation, subtracting only
purchased quantities. A newly started checkout does not discard a pending retry receipt.

Malformed input returns 400; stock, price, balance, account, and stale-update conflicts
return 409. The client preserves selections on failures. It does not treat a lost
response as proof that a purchase failed.

Order collection/report reads require Employee or Admin. A single-order read requires
staff authorization or the owning customer session. Public best-seller data contains
book IDs and aggregate quantities only. The customer `/api/customers/me/orders` route
returns only their own orders. Reset requires Admin and preserves staff accounts while
clearing purchase/member state and restoring the seed catalog and default offers.
