# Server checkout contract

Phases 3–6 are implemented: request models, atomic server purchasing, connected
checkout, and server-backed order history and reporting.

## Purchase request

`POST /api/orders` accepts the same request for cart and Buy Now checkout:

```json
{
  "customerName": "Demo Customer",
  "customerEmail": "customer@example.com",
  "items": [
    { "bookId": 1, "quantity": 2, "price": 14.99 }
  ]
}
```

`CreateOrderRequest` and `OrderItemRequest` describe this input. `price` is the
unit price displayed during review, not permission to set the sale price. It is
required, including for free books. No client total, title, order ID, or date is
used. Cart mode is a browser concern and is not part of the transaction.

## Validation and transaction rules

- Require a nonblank customer name and a valid, nonblank email; trim both for storage.
- Require a nonempty item list, no null entries, positive integer book IDs and
  quantities, and a supplied nonnegative decimal price.
- Reject duplicate book IDs rather than purchasing their combined quantities.
- Require every book to exist, be Active, have positive inventory, and not have
  `manualStockOverride` set to `true` (the existing forced-out-of-stock rule).
  A `false` override never permits buying more than actual inventory.
- Require each quantity to fit current inventory.
- Require the reviewed price to equal the current catalog price. Reject a price
  change and require a fresh review; never silently charge a different amount.
- Calculate totals using server catalog prices and decimal arithmetic, rounded
  to two decimal places with midpoint rounding away from zero. Reject arithmetic
  overflow without changing state.
- Validate all items, prepare the order, reduce inventory, and save the order
  under one shared synchronization boundary with catalog mutations. A rejected
  request changes neither inventory nor order history.

Data annotations cover basic request fields; cross-item and catalog validation
are enforced by OrdersController, which also rejects null item entries.

## Completed order and errors

Success returns HTTP 201 with the completed `Order` directly:

```json
{
  "id": 1,
  "date": "2026-10-10T12:00:00+00:00",
  "customerName": "Demo Customer",
  "customerEmail": "customer@example.com",
  "items": [
    { "bookId": 1, "title": "To Kill a Mockingbird", "price": 14.99, "quantity": 2 }
  ],
  "subtotal": 29.98,
  "taxRate": 0.10,
  "tax": 3.00,
  "total": 32.98
}
```

The server assigns increasing order IDs and UTC timestamps. Saved titles and
prices remain unchanged after catalog edits or deletion. The camel-case fields
match existing history, CSV, and sales helpers. `OrderItem` stores no redundant
line total; reports calculate `price * quantity`.

Malformed requests return HTTP 400 using ASP.NET validation problem details
(`errors` and `title`). Transaction validation returns HTTP 400 with
`{ "error": "A readable explanation." }`; catalog/stock/price conflicts return
HTTP 409 with the same shape. Checkout handles both error formats and preserves
the cart and checkout selection on failure. An unconfirmed result blocks further
submission in that tab, including after refresh. Verify order history before
deliberately starting another checkout.

`GET /api/orders` supplies reporting; `GET /api/orders/{id}` retrieves one order.
Books and orders are persisted together in local JSON state; server restart
preserves them. First startup imports the seed CSV. `POST /api/demo/reset`
restores that catalog, clears orders, resets counters, and persists the result.
Disk-save failure returns HTTP 503 without applying the proposed change.
Browser login is not
server authorization. These are local prototype endpoints, not production
authentication or payment processing. Automatic purchase retries are not safe:
this contract does not yet include idempotency keys.
