# Who Implements What — Store Frontend vs Admin Frontend

**Backend:** `sumit_new` (APIs already ready)  
**Two frontends:**

| App | Who uses it | Purpose |
|-----|-------------|---------|
| **Store frontend** | Customers | Browse, cart, checkout, pay, track order |
| **Admin frontend** | Internal team | Catalog, orders, CMS, refunds, payment ops |

---

## 1. Store frontend (customer app)

Customer buys products here. This app talks to `/api/store/*` and payment APIs.

### Must implement

#### A) Catalog & cart (if not already done)
- Product list / PDP / collections
- Cart, wishlist, coupons
- Customer login/register (optional for guest checkout)

#### B) Checkout
- Address form
- Choose payment:
  - **COD** → `POST /api/store/orders` with `paymentMethod: "cod"`
  - **Online** → create order with `paymentMethod: "online"`, save `paymentToken`

#### C) Online payment (Easebuzz) — critical
1. `GET /api/store/payments/config`
2. `POST /api/store/payments/easebuzz/initiate` with `{ storeOrderId, paymentToken }`
3. Redirect to `paymentUrl` (or demo confirm if `isDemo`)
4. **Processing page** (timeout / back / network cases):
   - Poll `GET /api/store/payments/status`
   - Call `POST /api/store/payments/easebuzz/sync` after timeout/back/resume
   - Handle `409 PAYMENT_IN_PROGRESS` (do not pay again)
5. Success / failed pages from backend `uiState` (`paid` / `failed` / `expired`)
6. `POST /api/store/payments/cancel-unpaid` if user abandons unpaid order

#### D) After purchase
- Order success page (order number, amount, items)
- Order tracking: `GET /api/store/orders/:orderNumber?phone=`
- My orders (if logged in): `GET /api/store/auth/orders`

### Store FE does **NOT** implement
- Refunds
- Manual payment review
- Reconcile tools
- Product CRUD / CMS editing
- Admin order status changes (packed/shipped/etc.)

### Store FE pages to build/update

| Page | Responsibility |
|------|----------------|
| Checkout | COD vs Online, create order |
| Redirect to Easebuzz | Initiate + `paymentUrl` |
| `/payment/processing` | Poll status + sync (back/timeout) |
| `/order/success` | Paid / COD placed |
| `/order/failed` | Retry / COD / support |
| `/track-order` | orderNumber + phone |

### Store FE session data to save
```text
pendingStoreOrderId
pendingOrderNumber
pendingPaymentToken
pendingPaymentExpiresAt
```

### Full store payment guide
`backend/brain/FRONTEND_PAYMENT_IMPLEMENTATION_AND_TEST_GUIDE.md`

---

## 2. Admin frontend (admin panel)

Internal team manages the store from here. Talks to `/api/products`, `/api/store/admin/*`, etc.

### Must implement / wire

#### A) Catalog management (mostly done / continue)
- Products CRUD, images, variants, stock, Excel import
- Collections, status list/unlist

#### B) Store Orders management
- List orders (`GET /api/store/admin/orders`)
- Filters: status, **paymentStatus**, **needsManualReview**
- Order detail
- Update fulfillment status: placed → confirmed → packed → shipped → delivered / cancelled  
  (`PATCH /api/store/admin/orders/:id/status`)
- Show payment fields:
  - `paymentMethod` (cod/online)
  - `paymentStatus` (pending/paid/failed/expired/refunded/partial_refunded)
  - `easebuzzTxnId`, `easebuzzPaymentId`
  - `needsManualReview` badge

#### C) Payment ops (new / important)
| Feature | API |
|---------|-----|
| Sync one order payment | `POST /api/store/admin/orders/:id/sync-payment` |
| Reconcile pending payments | `POST /api/store/admin/payments/reconcile` |
| Refund (full/partial) | `POST /api/store/admin/payments/refund` |
| Manual review queue | `GET /api/store/admin/payments/manual-review` |
| Resolve manual review | `POST /api/store/admin/payments/manual-review/:id/resolve` |

Admin UI should let ops:
1. See “Payment pending” online orders
2. Click **Sync payment** if customer says “money cut but order unpaid”
3. Click **Refund** for duplicates / cancel-after-pay
4. Open **Manual review** list when paid-after-cancel happens

#### D) CMS / content (if in scope)
- Banners, SEO, header, about, blogs, FAQs, etc. (`/api/store/admin/...`)

#### E) Coupons / reviews moderation
- Coupons CRUD
- Review approve/reject

### Admin FE does **NOT** implement
- Easebuzz hosted checkout redirect for customers
- Customer processing/timeout polling page
- Customer “Pay now” flow  
  (Admin only supports recovery: sync / refund / review)

### Admin FE screens to add/update

| Screen | What to show/do |
|--------|------------------|
| Store Orders list | paymentStatus, method, manual-review filter |
| Store Order detail | Sync payment button, refund button, Easebuzz ids |
| Payments → Manual review | Queue of problem orders |
| Payments → Refund modal | amount, cancel order toggle |
| (Optional) Reconcile button | Run batch pending sync |

---

## 3. Split by payment scenario

| Real scenario | Store FE | Admin FE |
|---------------|----------|----------|
| Customer pays successfully | Show success from return/sync | Order appears paid |
| Processing / timeout / back | Processing page + sync poll | — |
| Money cut, site still unpaid | Keep polling sync; show “checking” | Sync payment / reconcile |
| Customer abandons unpaid | cancel-unpaid | Optional view cancelled |
| Double pay risk | Block Pay again; handle 409 | Refund duplicate if needed |
| Paid after cancel | Customer support contact | Manual review + refund/resolve |
| COD order | Place COD + success | Fulfill as normal COD |
| Customer wants refund | Support request only | Admin refund API |

---

## 4. Simple ownership rule

```text
Store frontend  =  buy + pay + track + waiting/processing UX
Admin frontend  =  manage catalog + fulfill orders + refund/sync/review
Backend         =  source of truth (webhook, retrieve, reconcile)
```

---

## 5. Implementation priority

### Store frontend (do first for go-live)
1. Checkout COD + Online  
2. Initiate + redirect  
3. **Processing page + sync on back/timeout**  
4. Success / fail  
5. Track order  

### Admin frontend (do in parallel / next)
1. Store Orders list + payment columns  
2. Sync payment button on order detail  
3. Refund action  
4. Manual review queue  

---

## 6. API quick map

### Store FE uses
- `POST /store/orders`
- `GET /store/payments/config`
- `POST /store/payments/easebuzz/initiate`
- `POST /store/payments/easebuzz/confirm-demo` (local only)
- `GET /store/payments/status`
- `POST /store/payments/easebuzz/sync`
- `POST /store/payments/cancel-unpaid`
- `GET /store/orders/:orderNumber?phone=`

### Admin FE uses
- `GET /store/admin/orders`
- `GET /store/admin/orders/:id`
- `PATCH /store/admin/orders/:id/status`
- `POST /store/admin/orders/:id/sync-payment`
- `POST /store/admin/payments/reconcile`
- `POST /store/admin/payments/refund`
- `GET /store/admin/payments/manual-review`
- `POST /store/admin/payments/manual-review/:id/resolve`
- Plus products/CMS/coupons APIs

---

## 7. Related docs
- Store payment build + test: `FRONTEND_PAYMENT_IMPLEMENTATION_AND_TEST_GUIDE.md`
- Real payment scenarios: `EASEBUZZ_REAL_PAYMENT_SCENARIOS.md`
- Merged API overview: `EASEBUZZ_SUMIT_NEW.md`
