# Test payment — step-by-step click path

Use **Easebuzz test keys** (`EASEBUZZ_ENV=test`).

## Ports

| App | URL |
|-----|-----|
| Backend API | http://localhost:3024 |
| Store frontend (customer) | http://localhost:3000 |
| Admin frontend | http://localhost:3003 |

Start all three before testing:
- `backend` → `npm run dev`
- store app → its own `npm run dev` (port 3000)
- `frontend` (admin) → `npm run dev` (port 3003)

---

## A) Happy path (success)

### Store side
1. Open **http://localhost:3000**
2. Add a product to cart → go to **Checkout**
3. Fill name, phone, email, full address
4. Choose **Online / Pay now** (not COD)
5. Place order  
   - Order is created (`paymentToken` saved in session)
6. You should redirect to **Easebuzz testpay** (`testpay.easebuzz.in`)
7. Complete payment with Easebuzz **test** instruments (from test dashboard docs)
8. After pay, browser returns to store **`/payment`** → then **`/payment/processing`**
9. Wait until UI shows **Success** (`uiState=paid`)  
   - Note the **order number**

### Admin side (verify)
1. Open **http://localhost:3003** → login
2. Go to **Store Orders**
3. Find that order number
4. Check:
   - Payment method: `online`
   - Payment status: **`paid`**
   - Order status: usually **`confirmed`**
   - Easebuzz txn / pay id visible in order drawer
5. Optional: open drawer → confirm amounts/items match

**Pass if:** store shows success AND admin shows `paid`.

---

## B) Back button / timeout (must not look like failed)

1. Checkout → Online → reach Easebuzz page
2. Press **browser Back** (or wait until “timeout” feeling without finishing pay)
3. Store should open **`/payment/processing`**
4. Message should be like: “Payment is processing… do not pay again”
5. It should **poll/sync**, not jump to Failed immediately
6. Then either:
   - finish payment in another tab / later → becomes Success, or
   - abandon → later failed/expired / cancel unpaid

**Pass if:** timeout/back ≠ instant “Payment failed”.

---

## C) Double Pay

1. Start online checkout once (order created, payment initiated)
2. Try Pay again for the same pending order (or spam Pay)
3. Expect **409 / processing** — no second fresh charge flow

**Pass if:** blocked / sent to processing.

---

## D) Fail / cancel on Easebuzz

1. Checkout → Online → Easebuzz
2. Cancel / fail the payment on gateway
3. Return → processing → then **Failed / expired**
4. Admin order: `paymentStatus` = `failed` or `expired` (or cancelled unpaid)

**Pass if:** can retry or choose COD afterward.

---

## E) COD (control)

1. Checkout → **COD** → place order
2. Success without Easebuzz
3. Admin: method `cod`, payment usually `pending`

---

## F) Admin recovery tools (after a paid test order)

1. **Store Orders** → filter payment `paid`
2. Open order → **Refund…** (small amount or full)
3. Confirm refund in admin; order may become `partial_refunded` / `refunded`
4. **Payment Reviews** page: should be empty unless a conflict was flagged
5. Button **Sync pending payments** (reconcile) — safe to click; should not break paid orders

---

## If something fails — check this first

| Symptom | Check |
|---------|--------|
| No redirect to Easebuzz | Backend running? test keys in `backend/.env`? `GET /api/store/payments/config` → `isConfigured: true` |
| Return goes to wrong site | `STOREFRONT_URL` / `FRONTEND_BASE_URL` must match store URL |
| Stuck forever processing | Call sync works? order has `easebuzzTxnId`? check admin Sync button |
| Admin can’t load orders | Admin `BACKEND_URL=http://localhost:3024`, logged in |
| Port 3003 in use | Kill old node on 3003, then `npm run dev` again |

---

## Minimal checklist

- [ ] Success pay → admin `paid`
- [ ] Back/timeout → processing (not failed)
- [ ] Double pay blocked
- [ ] Fail/cancel → failed path
- [ ] COD works
- [ ] Admin refund works on test paid order
