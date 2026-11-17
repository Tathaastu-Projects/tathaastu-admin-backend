# Store Frontend — What You Need to Implement

**Audience:** Store frontend team (customer-facing shop)  
**Admin panel:** already handled in `tathaastu_admin/frontend` (do **not** build admin tools here)  
**Backend:** `sumit_new` APIs under `/api/store/*`

---

## Your job (store frontend only)

Customers browse → cart → checkout → pay (COD or Easebuzz) → track order.  
You must handle **processing / timeout / back button** safely so customers don’t pay twice.

---

## Do NOT build in store frontend

- Refund UI
- Manual payment review queue
- Admin reconcile / sync-from-dashboard tools
- Product CRUD / CMS editors  

Those are **Admin frontend** responsibilities.

---

## Pages to implement

| Page | Purpose |
|------|---------|
| Checkout | Address + COD / Online |
| Easebuzz redirect | After initiate |
| `/payment/processing` | Timeout, back, “still confirming” |
| `/order/success` | Paid or COD placed |
| `/order/failed` | Failed / expired + retry |
| `/track-order` | orderNumber + phone |

---

## APIs you must call

Base: `NEXT_PUBLIC_API_BASE_URL` (example `https://storebackend.../api`)

### 1) Config
```http
GET /store/payments/config
```
Use `isDemo`, `paymentMethods`.

### 2) Create order
```http
POST /store/orders
```
```json
{
  "paymentMethod": "cod" | "online",
  "customer": { "name", "phone", "email" },
  "shippingAddress": { "line1", "city", "state", "pincode", "country": "India" },
  "items": [{ "productId", "variantId?", "quantity" }],
  "couponCode": ""
}
```

**Online response includes:**
- `data.id` → storeOrderId  
- `data.orderNumber`  
- `data.paymentToken` ← **save in sessionStorage**  
- `data.paymentExpiresAt`

### 3) Start Easebuzz
```http
POST /store/payments/easebuzz/initiate
{ "storeOrderId": "...", "paymentToken": "..." }
```

| Result | Action |
|--------|--------|
| `isDemo: false` + `paymentUrl` | `window.location.href = paymentUrl` |
| `isDemo: true` | call confirm-demo (local only) |
| HTTP **409** `PAYMENT_IN_PROGRESS` | go to processing page — **do not pay again** |

### 4) Demo confirm (only when keys empty)
```http
POST /store/payments/easebuzz/confirm-demo
{ "storeOrderId", "paymentToken" }
```

### 5) Processing / timeout / back (critical)
```http
GET /store/payments/status?storeOrderId=...&paymentToken=...
POST /store/payments/easebuzz/sync
{ "storeOrderId", "paymentToken" }
```

Use response:
- `uiState`: `processing | paid | failed | expired | ...`
- `shouldPoll`, `nextPollAfterMs`
- `userMessage`
- `canRetryPayment`, `canCancelUnpaid`

**Rule:** screen timeout ≠ payment failed. Keep polling/syncing.

### 6) Cancel unpaid (user abandons)
```http
POST /store/payments/cancel-unpaid
{ "storeOrderId", "paymentToken" }
```

### 7) Track order
```http
GET /store/orders/:orderNumber?phone=
```

---

## Required UX behavior

1. After Pay click → save:
   - `pendingStoreOrderId`
   - `pendingOrderNumber`
   - `pendingPaymentToken`
2. Redirect to Easebuzz
3. On return / back / app resume → open **processing** page
4. Poll status every ~4s; periodically call **sync**
5. Disable “Pay again” while `uiState === "processing"`
6. Only show success when `uiState === "paid"` (or COD placed)
7. On failed/expired → allow retry or COD

### Copy to show users
- Processing: “Payment is processing. Do not pay again. We’re confirming with the bank.”
- Timeout: “Still confirming your payment. Please wait.”
- 409: “A payment is already in progress for this order.”

---

## Minimal flow code

```js
// 1) create online order
const order = await api.post("/store/orders", { paymentMethod: "online", ... });
sessionStorage.setItem("pendingStoreOrderId", order.data.id);
sessionStorage.setItem("pendingPaymentToken", order.data.paymentToken);

// 2) initiate
const pay = await api.post("/store/payments/easebuzz/initiate", {
  storeOrderId: order.data.id,
  paymentToken: order.data.paymentToken,
});

if (pay.http === 409) {
  router.push("/payment/processing");
  return;
}
if (pay.data.isDemo) {
  await api.post("/store/payments/easebuzz/confirm-demo", {
    storeOrderId: order.data.id,
    paymentToken: order.data.paymentToken,
  });
  router.push(`/order/success?orderNumber=${order.data.orderNumber}`);
  return;
}
window.location.href = pay.data.paymentUrl;
```

```js
// processing page
async function loop(orderId, token) {
  while (true) {
    const s = await api.get(`/store/payments/status?storeOrderId=${orderId}&paymentToken=${token}`);
    if (!s.data.shouldPoll) {
      if (s.data.uiState === "paid") return goSuccess(s.data);
      return goFailed(s.data);
    }
    await api.post("/store/payments/easebuzz/sync", { storeOrderId: orderId, paymentToken: token });
    await sleep(s.data.nextPollAfterMs || 4000);
  }
}
```

---

## Test checklist (store FE)

- [ ] COD places order without paymentToken flow
- [ ] Online redirects to Easebuzz test URL
- [ ] Back from Easebuzz → processing page, not new payment
- [ ] Timeout message stays “processing”, not “failed”
- [ ] Double Pay → 409 handled
- [ ] Success only after `uiState=paid`
- [ ] Failed/expired → retry works
- [ ] Track order by number + phone
- [ ] Cancel unpaid restores ability to shop again

---

## Related backend docs
- Scenarios: `EASEBUZZ_REAL_PAYMENT_SCENARIOS.md`
- Detailed API + test matrix: `FRONTEND_PAYMENT_IMPLEMENTATION_AND_TEST_GUIDE.md`
- Admin vs store split: `STORE_VS_ADMIN_FRONTEND_TASKS.md`

---

## Env for store app

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3024/api
```

Never put `EASEBUZZ_KEY` / `EASEBUZZ_SALT` in store frontend.
