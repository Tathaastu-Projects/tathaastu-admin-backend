# Real Payment Edge Cases — Easebuzz + Our Store Backend

**Branch:** `sumit_new`  
**Official docs:** https://docs.easebuzz.in/docs/  
**Easebuzz guidance (important):** treat **webhooks / status API** as source of truth — never trust only the browser screen or “success URL”.

---

## Golden rules (always)

1. **Money can leave the customer’s bank before your website shows success.**
2. **Order is “paid” only when backend confirms** (webhook and/or Transaction Retrieve API).
3. **Browser back / close / internet drop does not cancel a bank debit.**
4. **Same payment must never create two paid orders** (idempotent + unique `txnid` / `easepayid`).
5. **Pending is a normal state** — show “Payment processing… checking status”, don’t say failed immediately.

---

## How money & order relate

| Layer | Who controls it | Meaning |
|-------|-----------------|--------|
| Bank / UPI / Card network | Bank | Debit / hold / decline |
| Easebuzz | Gateway | Final txn status: success / failure / pending / dropped / bounced… |
| Our backend | Us | Mark `StoreOrder` paid / failed / expired; ship only if paid |
| Browser | User | Can disappear anytime — **not trusted alone** |

So: **amount cut ≠ order confirmed** until our server marks `paymentStatus: "paid"`.

---

## What we already have on `sumit_new`

| Mechanism | Purpose |
|-----------|---------|
| Create order **before** pay (`paymentMethod: online`) | Stock held; we have an order id + `paymentToken` |
| Unique `txnid` per initiate | Easebuzz rejects reuse; avoids double initiate confusion |
| **S2S webhook** `/api/store/payments/easebuzz/webhook` | Primary “mark paid” authority |
| **Return URL** `/api/store/payments/easebuzz/return` | UX redirect; still confirms via **Retrieve API** |
| **Retrieve / sync** `/api/store/payments/easebuzz/sync` | Recover when user lost internet / closed tab |
| **Reconcile scheduler** | Background check of pending online orders |
| Payment hold TTL (`paymentExpiresAt`, default ~15 min) | Expire unpaid holds; restore stock if never paid |
| Atomic paid transition + `easepayid` replay block | No double-pay / replay |
| Refund API v2 | If money taken but business must reverse |

---

## Scenario catalogue

### 1) User pays successfully, then internet dies on “Processing…”

**What happens**
- Bank / UPI may already succeed.
- Browser never reaches our success page.
- User thinks payment failed.

**Will money be cut?** Often **yes** (if bank already approved).

**Will order be placed/paid?**
- Order already exists (we create it before redirect).
- It becomes **paid** when:
  1. Easebuzz **webhook** hits our server, or
  2. Reconcile/sync calls **Transaction Retrieve API** and sees success.

**What user should see**
- “Payment is processing. Don’t pay again. We’re confirming with the bank.”
- Auto-poll sync for 30–60s, then “Check order status” with order number + phone.

**How we handle**
- Webhook → `applyPaidAtomically`
- Scheduler / `POST .../easebuzz/sync` → retrieve by `txnid`
- FE: never start a **second** payment for same order until sync says failed/expired

---

### 2) User presses Back while Easebuzz shows “Processing”

**What happens**
- Leaving the page does **not** stop bank processing.
- Debit may still succeed seconds later.

**Money cut?** Possible **yes**.  
**Order paid?** Yes later via webhook/retrieve — not via the back button.

**Wrong UX:** “Payment cancelled” immediately → user pays again → **double charge risk**.

**Correct UX**
- Back → “Checking payment status…” → call sync
- If still pending → “Wait / refresh”
- If success → order success
- If failed/expired → allow retry (new `txnid`) or COD

---

### 3) User closes browser / kills app after paying

Same as (1) and (2).  
**Webhook + reconcile** are the recovery path.  
User can track: `GET /api/store/orders/:orderNumber?phone=`

---

### 4) Payment succeeds on Easebuzz, but webhook never arrives

**Causes:** wrong webhook URL, server down, firewall, hash reject, temporary outage.

**Money cut?** Yes.  
**Order unpaid in our DB?** Temporarily yes — until retrieve/reconcile.

**How we handle**
1. Register webhook in Easebuzz dashboard →  
   `https://<api>/api/store/payments/easebuzz/webhook`
2. Return URL also calls Retrieve API
3. Background reconcile pending orders
4. Manual admin reconcile: `POST /api/store/admin/payments/reconcile`
5. User “Refresh payment status” → sync endpoint

---

### 5) User sees success on Easebuzz, but our site shows failed (or opposite)

**Cause:** trusted browser only / race / old tab.

**Rule:** UI must follow **our backend** status after verify/sync, not Easebuzz HTML alone.

**How we handle**
- Return handler uses Retrieve API
- Idempotent paid mark
- FE always re-fetches order after return

---

### 6) Double click “Pay” / Pay again because of fear

**Risk:** two `txnid`s → two possible bank charges.

**How we handle**
- One open online order + payment hold
- FE disables Pay button after initiate; store `pendingOrderId`
- Sync first before allowing new initiate
- If first txn success → second initiate should be blocked (`already paid`)
- If first failed → new initiate with **new txnid** is OK
- If both somehow succeed (rare) → second `easepayid` replay blocked / needs manual refund of duplicate

**Ops:** refund duplicate via admin refund API.

---

### 7) User abandons on Easebuzz without paying (true cancel)

**Money cut?** No.  
**Order?** Stays pending → then failed/expired; stock restored.

**How we handle**
- Failure statuses (userCancelled, dropped, bounced, failure…) via webhook/retrieve
- `cancel-unpaid` from FE when user explicitly abandons
- TTL expiry reconcile restores stock

---

### 8) Status stays “pending” for a long time (UPI collect / bank delay)

**Normal** for UPI. Easebuzz/docs treat pending as valid interim state.

**Money?** May clear success or fail later.  
**Order?** Keep unpaid; don’t ship.

**How we handle**
- Don’t mark failed too early
- Reconcile until success/failure/expiry
- After `paymentExpiresAt`: mark expired, restore stock
- If money succeeds **after** expiry/cancel → our code flags **manual review** (paid after cancel) — ops refund or re-open order

---

### 9) Bank declined (insufficient funds, wrong OTP, limit)

**Money cut?** No (or temporary hold released by bank).  
**Order?** failed; allow retry or COD.

---

### 10) “Dropped” / “Bounced” / timeout at gateway

Easebuzz can return non-success terminal-ish statuses.  
Treat via `isFailureStatus` / retrieve; restore stock if unpaid hold ends.

---

### 11) Amount cut, but order never confirmed in our system (worst fear)

**This is the classic “paid but order not confirmed” case.**

**Why:** webhook miss + user never returned + reconcile not run yet.

**Solution ladder**
1. Prevention: reliable public webhook URL + HTTPS + always HTTP 200 after verify
2. Auto: reconcile job every few minutes for `paymentStatus=pending` + has `easebuzzTxnId`
3. User self-serve: “Check payment status” (sync)
4. Support: Easebuzz dashboard search by phone/amount/time + our `orderNumber`/`txnid`
5. If Easebuzz = success and our order unpaid → run sync / mark paid
6. If Easebuzz = success but order cancelled & stock restored → **refund** or recreate order (manual review flag)

---

### 12) Order created, payment never started

User added address, order placed online, then left.

**Money?** No.  
**Stock?** Held until cancel/expiry → restore.

---

### 13) Partial success confusion (paid ₹X, order total ₹Y)

**How we handle:** amount match check (±0.05) before mark paid. Mismatch → reject / manual review (don’t ship).

---

### 14) Refund scenarios

| Case | Action |
|------|--------|
| Duplicate successful charge | Admin refund one `easepayid` |
| Paid after cancel / stock already restored | Prefer refund (or manual re-stock + confirm) |
| Customer cancelled after paid | Refund API v2 + cancel order |
| Partial refund | Supported (`partial_refunded`) |

Refund needs stored **`easepayid`** (`easebuzzPaymentId`).

---

### 15) COD vs Online mix-ups

COD never hits Easebuzz.  
If user switches mind: cancel unpaid online (stock restore) then create COD order — or admin changes method carefully.

---

## Frontend UX you should ship (critical)

1. After redirect to Easebuzz, save `orderId`, `orderNumber`, `paymentToken` in `sessionStorage`.
2. On any return / back / app resume → call **sync** (or open order tracking), not a blind new payment.
3. Show states clearly:
   - `pending` → “Processing payment…”
   - `paid` → success
   - `failed` / `expired` → retry / COD
4. Disable “Pay again” while pending.
5. Show support line + order number.

Suggested FE calls:

```http
POST /api/store/payments/easebuzz/sync
{ "storeOrderId": "...", "paymentToken": "..." }
```

```http
GET /api/store/orders/TST-.../?phone=98xxxxxxxx
```

---

## Backend checklist (ops)

- [ ] Easebuzz dashboard **Transaction Webhook** = production `/api/store/payments/easebuzz/webhook`
- [ ] `BACKEND_PUBLIC_URL` correct (return URL reachable)
- [ ] `STOREFRONT_URL` correct (redirect after return)
- [ ] Reconcile scheduler running (server start)
- [ ] Monitor pending orders older than N minutes
- [ ] Admin refund path tested on test keys
- [ ] Never delete unpaid online orders blindly without syncing Easebuzz first

---

## Short answers to your exact questions

### “I paid, internet gone, still processing — what happens?”
Money may already be cut. Order becomes paid when webhook/reconcile confirms. User should wait/check status — **not pay again**.

### “I pressed back while processing — amount cut? order placed? refund?”
- Amount **can** be cut.
- Order becomes paid via server confirmation (not via back button).
- Refund only if we decide business-wise (duplicate/cancel), not automatically just because they pressed back.

### “Amount cut but order not placed?”
In our design order **is already created** before payment.  
If you mean “not marked paid / not confirmed”: sync/reconcile fixes it; if unrecoverable business conflict → refund.

---

## Mental model for the team

```text
Customer action (back/close/offline)
        ≠
Bank result (success/fail/pending)
        ≠
Our order status (until webhook/retrieve says so)
```

**Always reconcile pending online payments. Never trust the browser alone.**
