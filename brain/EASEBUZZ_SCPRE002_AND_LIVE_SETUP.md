# Why Easebuzz Success → SCPRE002 (and how to fix) + Real payment setup

## Part 1 — Why clicking Success still fails (your screenshot)

You reached the test OTP page (good — initiate + keys work).  
Then **Success** → Easebuzz error:

`SCPRE002 — Please retry your transaction. Something went wrong.`

### Most likely cause on your machine

Your backend sends:

```text
surl/furl = http://localhost:3024/api/store/payments/easebuzz/return
```

Easebuzz (their cloud) must finish the transaction and redirect/POST to that URL.  
**`localhost` is your PC — Easebuzz servers cannot reliably complete that callback.**  
So their test bank shows Success attempt → then **SCPRE002**.

This is **not** because you typed the wrong OTP (4390 was correct).

### Other less common causes
- Return URLs not allowed / not matching dashboard settings
- Wrong key/salt pair (less likely — you already got the OTP page)
- Mixing test key with prod env (yours looks correctly on `testpay`)

### How to fix TEST payments locally

#### Option A — Public tunnel (recommended for local)

1. Install [ngrok](https://ngrok.com/) (or Cloudflare Tunnel)
2. Expose backend:
   ```bash
   ngrok http 3024
   ```
3. Copy the HTTPS URL, e.g. `https://abc123.ngrok-free.app`
4. In `backend/.env`:
   ```env
   EASEBUZZ_ENV=test
   EASEBUZZ_KEY=...your test key...
   EASEBUZZ_SALT=...your test salt...
   BACKEND_PUBLIC_URL=https://abc123.ngrok-free.app
   STOREFRONT_URL=http://localhost:3000
   FRONTEND_BASE_URL=http://localhost:3000
   ```
5. Restart backend
6. New checkout → Pay → OTP → **Success**
7. Easebuzz should hit:  
   `https://abc123.ngrok-free.app/api/store/payments/easebuzz/return`  
   then redirect to store `/payment` → processing → paid

#### Option B — Deploy test API to a public HTTPS host
Same idea: `BACKEND_PUBLIC_URL` must be a URL the internet can open.

#### After Success, verify
- Store: processing → **paid / success**
- Admin Store Orders: same order `paymentStatus=paid`
- Network tab: `GET .../payments/status` eventually returns `"uiState":"paid"`

---

## Part 2 — Real (live) payment setup — every step

### Step 1 — Easebuzz live account
1. Login: https://dashboard.easebuzz.in/ (live, not testdashboard)
2. Complete KYC / merchant activation if pending
3. Open **Account / API Credentials**
4. Copy **Live Merchant Key** and **Live Salt**  
   (different from test)

### Step 2 — Ask Easebuzz (if needed)
Email `support@easebuzz.in` / call support and confirm:
- Hosted Checkout enabled
- Transaction Webhook enabled
- Refund API v2 enabled (for admin refunds)
- Your production domains allowed for surl/furl/webhook

### Step 3 — Production URLs (must be HTTPS)
Example:

| Purpose | Example |
|---------|---------|
| Store website | `https://www.abhimantritstore.com` |
| Backend API | `https://storebackend.abhimantritstore.com` |

### Step 4 — Backend production `.env`
```env
EASEBUZZ_MERCHANT_KEY=LIVE_KEY_HERE
# or EASEBUZZ_KEY=LIVE_KEY_HERE
EASEBUZZ_SALT=LIVE_SALT_HERE
EASEBUZZ_ENV=prod
EASEBUZZ_IFRAME=0
PAYMENT_GATEWAY=easebuzz

BACKEND_PUBLIC_URL=https://storebackend.abhimantritstore.com
STOREFRONT_URL=https://www.abhimantritstore.com
FRONTEND_BASE_URL=https://www.abhimantritstore.com
```

**Never** use test keys with `EASEBUZZ_ENV=prod`.

### Step 5 — Easebuzz dashboard webhook
In live dashboard → Transaction Webhook / Notifications:

```text
https://storebackend.abhimantritstore.com/api/store/payments/easebuzz/webhook
```

Method: **POST**  
(Our GET on that path is only a health check.)

### Step 6 — What Easebuzz will call automatically
After live pay:

1. Browser →  
   `BACKEND_PUBLIC_URL/api/store/payments/easebuzz/return`  
   → redirects to store `/payment` → processing
2. Server-to-server →  
   `.../api/store/payments/easebuzz/webhook`  
   → marks order paid (authoritative)

### Step 7 — Deploy
1. Deploy backend with live env
2. Deploy store frontend with:
   ```env
   NEXT_PUBLIC_API_BASE_URL=https://storebackend.abhimantritstore.com/api
   ```
3. Deploy admin frontend pointing at same API
4. Restart services after env change

### Step 8 — Smoke test on live (small amount)
1. Place a **₹1–₹10** (or minimum allowed) real order
2. Pay with real UPI/card
3. Confirm:
   - Store success only after `uiState=paid`
   - Admin order = `paid`
   - Easebuzz live dashboard shows success for same `txnid`
4. Optional: admin **Refund** that small payment
5. Test one fail/cancel + one back/timeout path

### Step 9 — Go-live checklist
- [ ] Live key + salt only on server (not in store FE)
- [ ] `EASEBUZZ_ENV=prod`
- [ ] HTTPS `BACKEND_PUBLIC_URL` + `STOREFRONT_URL`
- [ ] Webhook URL saved in Easebuzz live dashboard
- [ ] Webhook returns quickly (HTTP 200)
- [ ] Processing page + sync working on store FE
- [ ] Admin sync/refund/manual-review available
- [ ] Support knows: money cut + unpaid → Sync / txnid / refund

---

## Part 3 — Quick map: Test vs Live

| Item | Test now | Live later |
|------|----------|------------|
| Dashboard | testdashboard.easebuzz.in | dashboard.easebuzz.in |
| Pay host | testpay.easebuzz.in | pay.easebuzz.in |
| Keys | Test key/salt | Live key/salt |
| `EASEBUZZ_ENV` | `test` | `prod` |
| `BACKEND_PUBLIC_URL` | **ngrok HTTPS** or public staging API | production API HTTPS |
| Webhook | optional with ngrok; needed for realism | **required** |
| Money | fake/test | real |

---

## What you should do right now

1. Keep test keys  
2. Run **ngrok http 3024**  
3. Set `BACKEND_PUBLIC_URL` to the ngrok HTTPS URL  
4. Restart backend  
5. New order → OTP → Success again  

If Success still returns SCPRE002 after a public HTTPS return URL, contact Easebuzz with:
- Merchant key (test)
- Txn ID: e.g. `ABM1794826278784eba7a5`
- Error: `SCPRE002`
- Your surl value
