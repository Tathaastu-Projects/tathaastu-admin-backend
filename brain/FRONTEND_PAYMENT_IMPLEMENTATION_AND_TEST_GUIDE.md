# Store Frontend — Easebuzz Payment Implementation & Test Guide

**Backend branch:** `sumit_new`  
**Audience:** Store frontend engineers  
**API base:** `NEXT_PUBLIC_API_BASE_URL` (example `http://localhost:3024/api`)

This doc tells you **exactly what to build**, **how to test every real-world payment scenario**, and what the backend already covers.

---

## 1. Backend status (what’s done vs FE)

| Area | Backend | Store FE must build |
|------|---------|---------------------|
| COD checkout | Done | COD option + success page |
| Online initiate + redirect | Done | Pay button → redirect |
| paymentToken security | Done | Save & send token |
| Webhook / return confirm | Done | Success/fail pages only |
| Processing / timeout / back | Done (sync + reconcile) | **Polling UI + sync on resume** |
| Double-pay guard | Done (409 PAYMENT_IN_PROGRESS) | Disable Pay again; handle 409 |
| Cancel unpaid | Done | Abandon checkout → cancel |
| Refund | Done (admin) | Admin UI optional |
| Manual review queue | Done (admin APIs) | Admin UI optional |
| Demo mode | Done | Local-only confirm-demo |

**Nothing critical is left pending on backend for store checkout.**  
Remaining work is almost entirely **frontend UX + Easebuzz dashboard webhook config**.

---

## 2. APIs frontend must use

### Config
```http
GET /store/payments/config
```
Use `isDemo`, `isConfigured`, `iframe`, `paymentMethods`.

### Create order
```http
POST /store/orders
```
```json
{
  "paymentMethod": "cod" | "online",
  "customer": { "name", "phone", "email" },
  "shippingAddress": { "line1", "city", "state", "pincode", "country" },
  "items": [{ "productId", "variantId?", "quantity" }],
  "couponCode": ""
}
```
Online response includes:
- `data.id` (storeOrderId)
- `data.orderNumber`
- `data.paymentToken` ← **save this**
- `data.paymentExpiresAt`

### Initiate Easebuzz
```http
POST /store/payments/easebuzz/initiate
```
```json
{ "storeOrderId": "...", "paymentToken": "..." }
```

**Live success:** `{ paymentUrl, isDemo:false, txnid, ... }` → `window.location.href = paymentUrl`  
**Demo:** `{ isDemo:true }` → call confirm-demo  
**In progress:** HTTP **409** `PAYMENT_IN_PROGRESS` → show processing, call sync (do **not** open a new payment)

### Confirm demo (keys empty only)
```http
POST /store/payments/easebuzz/confirm-demo
{ "storeOrderId", "paymentToken" }
```

### Poll status (no Easebuzz call — cheap)
```http
GET /store/payments/status?storeOrderId=...&paymentToken=...
```
or
```http
GET /store/payments/status?orderNumber=TST-...&phone=98xxxxxxxx
```

Response fields FE should use:
- `uiState`: `processing | paid | failed | expired | cod_placed | refunded | ...`
- `shouldPoll`, `nextPollAfterMs`
- `canRetryPayment`, `canCancelUnpaid`
- `userMessage`

### Sync with Easebuzz (after timeout / back / stuck)
```http
POST /store/payments/easebuzz/sync
{ "storeOrderId", "paymentToken" }
```
Same shape as status, plus `action` / `synced`.

### Cancel unpaid
```http
POST /store/payments/cancel-unpaid
{ "storeOrderId", "paymentToken" }
```

### Track order
```http
GET /store/orders/:orderNumber?phone=
```

### Admin (admin panel)
```http
POST /store/admin/payments/refund
GET  /store/admin/payments/manual-review
POST /store/admin/payments/manual-review/:id/resolve
POST /store/admin/payments/reconcile
GET  /store/admin/orders?needsManualReview=true&paymentStatus=pending
```

---

## 3. Required frontend pages / flows

### A) Checkout
1. Choose **COD** or **Online**
2. Place order
3. If COD → success page
4. If Online → initiate → redirect (or demo confirm)

### B) `/payment/processing` (or reuse checkout waiting state)
Shown when:
- user returned with unclear status
- timeout
- back button
- 409 payment in progress

Behavior:
1. Read `storeOrderId` + `paymentToken` from `sessionStorage`
2. Poll `GET /payments/status` every `nextPollAfterMs` (default 4s)
3. Every 2–3 polls (or on button “Check now”) call `POST .../sync`
4. Stop when `uiState` is `paid` / `failed` / `expired`
5. **Never** start a second payment while `uiState === "processing"`

### C) Success / Failed
- Success: order number, amount, items
- Failed/expired: Retry payment (new initiate) or switch COD / cancel

### D) Order tracking
- orderNumber + phone → show paymentStatus + status

### sessionStorage keys (recommended)
```js
pendingStoreOrderId
pendingOrderNumber
pendingPaymentToken
pendingPaymentExpiresAt
```

---

## 4. Copy-paste FE helper

```js
const API = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function createOrder(body) {
  const res = await fetch(`${API}/store/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function initiatePayment(storeOrderId, paymentToken) {
  const res = await fetch(`${API}/store/payments/easebuzz/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storeOrderId, paymentToken }),
  });
  const json = await res.json();
  return { http: res.status, ...json };
}

export async function getPaymentStatus({ storeOrderId, paymentToken, orderNumber, phone }) {
  const qs = new URLSearchParams();
  if (storeOrderId) qs.set("storeOrderId", storeOrderId);
  if (paymentToken) qs.set("paymentToken", paymentToken);
  if (orderNumber) qs.set("orderNumber", orderNumber);
  if (phone) qs.set("phone", phone);
  const res = await fetch(`${API}/store/payments/status?${qs}`);
  return res.json();
}

export async function syncPayment(storeOrderId, paymentToken) {
  const res = await fetch(`${API}/store/payments/easebuzz/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storeOrderId, paymentToken }),
  });
  return res.json();
}

export async function cancelUnpaid(storeOrderId, paymentToken) {
  const res = await fetch(`${API}/store/payments/cancel-unpaid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storeOrderId, paymentToken }),
  });
  return res.json();
}

export async function payOnline(checkoutBody) {
  const orderRes = await createOrder({ ...checkoutBody, paymentMethod: "online" });
  if (!orderRes.success) throw new Error(orderRes.message);
  const { id, orderNumber, paymentToken, paymentExpiresAt } = orderRes.data;
  sessionStorage.setItem("pendingStoreOrderId", id);
  sessionStorage.setItem("pendingOrderNumber", orderNumber);
  sessionStorage.setItem("pendingPaymentToken", paymentToken);
  if (paymentExpiresAt) sessionStorage.setItem("pendingPaymentExpiresAt", paymentExpiresAt);

  const pay = await initiatePayment(id, paymentToken);
  if (pay.http === 409 || pay.code === "PAYMENT_IN_PROGRESS") {
    window.location.href = `/payment/processing?orderId=${id}`;
    return { mode: "processing" };
  }
  if (!pay.success) throw new Error(pay.message);
  if (pay.data?.isDemo) {
    await fetch(`${API}/store/payments/easebuzz/confirm-demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeOrderId: id, paymentToken }),
    });
    window.location.href = `/order/success?orderNumber=${orderNumber}`;
    return { mode: "demo" };
  }
  window.location.href = pay.data.paymentUrl;
  return { mode: "redirect" };
}
```

### Processing page loop
```js
async function runProcessingLoop(orderId, token) {
  for (;;) {
    const status = await getPaymentStatus({ storeOrderId: orderId, paymentToken: token });
    const d = status.data;
    if (!d?.shouldPoll) {
      if (d.uiState === "paid") return navigateSuccess(d);
      return navigateFailed(d);
    }
    // periodically force Easebuzz sync
    await syncPayment(orderId, token);
    await new Promise((r) => setTimeout(r, d.nextPollAfterMs || 4000));
  }
}

// On visibilitychange / pageshow / back:
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    const id = sessionStorage.getItem("pendingStoreOrderId");
    const token = sessionStorage.getItem("pendingPaymentToken");
    if (id && token) syncPayment(id, token);
  }
});
```

---

## 5. How to test every flow

### Prep
1. Backend running on `:3024` (`sumit_new`)
2. `.env` has test `EASEBUZZ_KEY` + `EASEBUZZ_SALT` + `EASEBUZZ_ENV=test`
3. Set:
   ```env
   BACKEND_PUBLIC_URL=http://localhost:3024
   STOREFRONT_URL=http://localhost:3000
   ```
4. Easebuzz test dashboard → webhook (for staging/prod):  
   `https://<public-api>/api/store/payments/easebuzz/webhook`  
   Local webhook needs a tunnel (ngrok) if you want real S2S callbacks locally.

### Test matrix

| # | Scenario | How to test | Expected |
|---|----------|-------------|----------|
| 1 | COD | Create order `paymentMethod:cod` | 201, no paymentToken, placed/pending |
| 2 | Happy online pay | Initiate → open paymentUrl → pay test instrument | Return → paid/confirmed |
| 3 | Processing poll | After initiate, call status before paying | `uiState:processing`, `shouldPoll:true` |
| 4 | Timeout UI | Wait on processing page without completing | Keep processing; sync may stay pending; **not** failed |
| 5 | Back button | Start pay, press back to site | Processing page → sync; if paid later → success |
| 6 | Kill tab after pay | Pay on Easebuzz, close tab | Webhook/reconcile marks paid; track by orderNumber |
| 7 | Double Pay | Initiate twice quickly | 2nd → **409 PAYMENT_IN_PROGRESS** |
| 8 | Cancel unpaid | Initiate then cancel-unpaid | cancelled + stock restored |
| 9 | Decline / fail on gateway | Fail payment on Easebuzz | failed; canRetryPayment true |
| 10 | Demo mode | Clear KEY/SALT, restart, initiate | isDemo → confirm-demo → paid |
| 11 | Demo blocked with keys | Keys set, call confirm-demo | 403 |
| 12 | Sync recovery | Paid at Easebuzz, call sync | action paid / already_paid |
| 13 | Admin refund | Paid order → admin refund | refunded / partial_refunded |
| 14 | Manual review list | Force paid-after-cancel path or flag | appears in manual-review API |
| 15 | Track order | GET orders/:orderNumber?phone= | Shows paymentStatus |

### curl cheatsheet

```bash
# config
curl -s http://127.0.0.1:3024/api/store/payments/config

# status
curl -s "http://127.0.0.1:3024/api/store/payments/status?storeOrderId=ID&paymentToken=TOKEN"

# sync
curl -s -X POST http://127.0.0.1:3024/api/store/payments/easebuzz/sync \
  -H "Content-Type: application/json" \
  -d "{\"storeOrderId\":\"ID\",\"paymentToken\":\"TOKEN\"}"

# cancel
curl -s -X POST http://127.0.0.1:3024/api/store/payments/cancel-unpaid \
  -H "Content-Type: application/json" \
  -d "{\"storeOrderId\":\"ID\",\"paymentToken\":\"TOKEN\"}"
```

### Local webhook tip
Use ngrok/cloudflare tunnel → set Easebuzz webhook to tunnel URL + `/api/store/payments/easebuzz/webhook`.  
Without tunnel, rely on **return retrieve + sync + reconcile** (still works).

---

## 6. UX copy (use these)

- Processing: “Payment is processing. Do not pay again. We’re confirming with the bank.”
- Timeout: “Still confirming your payment. This can take a minute. Please wait.”
- Success: “Payment successful. Order confirmed.”
- Failed: “Payment failed. You can retry or choose Cash on Delivery.”
- 409: “A payment is already in progress for this order.”

---

## 7. Production checklist

- [ ] Webhook URL set in Easebuzz dashboard
- [ ] `BACKEND_PUBLIC_URL` / `STOREFRONT_URL` HTTPS
- [ ] Processing page + sync on resume implemented
- [ ] Pay button disabled while processing
- [ ] Order tracking live
- [ ] Support knows: money cut + unpaid → sync / txnid / refund
- [ ] Admin refund + manual-review used by ops

---

## 8. Do / Don’t

**Do**
- Create order before pay
- Save paymentToken
- Poll status + sync after timeout/back
- Treat timeout as processing

**Don’t**
- Trust `?status=success` alone
- Start second payment while pending
- Put salt/key in frontend
- Tell user “failed” only because the page timed out
