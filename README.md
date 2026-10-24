# tathaastu-admin-backend

Backend API for the Tathaastu Admin Dashboard and Abhimantrit storefront.

**Storage:** local files only (no MongoDB). JSON data under `storage/data/`, media under `uploads/` (+ mirror in `storage/images/`).

## Setup

```bash
npm install
cp env.example .env
# edit .env — set PORT and JWT_SECRET (MongoDB not required)
npm run seed    # optional first-time sample data
npm run dev
```

## Storage layout

```
storage/
  data/                 # products.json, store_customers.json, store_orders.json, …
  images/               # mirrored uploads
uploads/                # served at http://host:PORT/uploads/...
```

Manage products, homepage banners, blogs, and media from the **admin panel**. The storefront reads everything via `/api/store/*`.

## Scripts

- `npm start` — run the server
- `npm run dev` — run with nodemon
- `npm run seed` — remedies + sample products + store collections/CMS/coupons
- `npm run seed:remedies` / `npm run seed:products` — individual seeds
- `npm run import:gemsmantra` — full product import (optional)

Pair with storefront: sibling folder `abhimantrit` (`NEXT_PUBLIC_API_URL` → this server).  
Pair with admin: sibling folder `tathaastu-admin_frontend` (`BACKEND_URL` → this server).

See `brain/overview.md`.
