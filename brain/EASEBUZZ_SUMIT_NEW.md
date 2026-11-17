# Easebuzz on `sumit_new` — merged best of govind_dev + sumit

Base: **govind_dev** (secure Hosted Checkout).  
Added from **sumit**: config, demo mode, payment ledger, refund API, iframe flag.

## What stays from govind (do not regress)

- `paymentToken` on online order create
- Initiate requires token + rate limit
- S2S webhook is primary paid authority
- Browser `/return` confirms via Transaction retrieve API
- Amount / txn / easepayid replay checks
- Reconcile scheduler + manual sync
- Cancel unpaid with token

## Added on this branch

| Feature | Endpoint |
|---------|----------|
| Payment config | `GET /api/store/payments/config` |
| Initiate (live or demo) | `POST /api/store/payments/easebuzz/initiate` |
| Demo confirm (keys empty only) | `POST /api/store/payments/easebuzz/confirm-demo` |
| Webhook | `POST /api/store/payments/easebuzz/webhook` |
| Browser return | `GET/POST /api/store/payments/easebuzz/return` |
| Sync | `POST /api/store/payments/easebuzz/sync` |
| Admin reconcile | `POST /api/store/admin/payments/reconcile` |
| Admin refund (v2) | `POST /api/store/admin/payments/refund` |
| Cancel unpaid | `POST /api/store/payments/cancel-unpaid` |
| COD order | `POST /api/store/orders` with `paymentMethod: "cod"` |

## Checkout flows

### COD
1. `POST /api/store/orders` `{ paymentMethod: "cod", ... }`
2. Order stays `paymentStatus: pending` until delivery / admin marks paid
3. No Easebuzz / no paymentToken required for COD

### Online (live keys)
1. Create order `paymentMethod: "online"` → receive `paymentToken`
2. `POST .../easebuzz/initiate` with `{ storeOrderId, paymentToken }`
3. Redirect to `paymentUrl`
4. Easebuzz → backend `/return` + webhook → order `paid`

### Online (demo — empty KEY/SALT)
1. Same create order
2. Initiate returns `isDemo: true`
3. `POST .../easebuzz/confirm-demo` with `{ storeOrderId, paymentToken }`
4. Order marked paid locally

### Refund (admin JWT)
```json
POST /api/store/admin/payments/refund
Authorization: Bearer <adminJwt>
{
  "orderId": "...",
  "amount": 100,
  "cancelOrder": true
}
```
Uses Easebuzz Refund API v2 hash: `key|merchant_refund_id|easebuzz_id|refund_amount|salt`.

## Env

```env
EASEBUZZ_MERCHANT_KEY=   # or EASEBUZZ_KEY
EASEBUZZ_SALT=
EASEBUZZ_ENV=test
EASEBUZZ_IFRAME=0
PAYMENT_GATEWAY=easebuzz
BACKEND_PUBLIC_URL=http://localhost:3024
STOREFRONT_URL=http://localhost:3000
FRONTEND_BASE_URL=http://localhost:3000
```
