# tathaastu-admin-backend

Backend API for the Tathaastu Admin Dashboard.

## Setup

```bash
npm install
cp env.example .env
# edit .env with your MongoDB URI, JWT secret, and port
npm run dev
```

## Scripts

- `npm start` — run the server
- `npm run dev` — run with nodemon
- `npm run seed` — remedies + sample products + store collections/CMS/coupons
- `npm run seed:remedies` / `npm run seed:products` — individual seeds
- `npm run import:gemsmantra` — full product import (optional)

Pair with storefront: sibling folder `abhimantrit` (`NEXT_PUBLIC_API_URL` → this server).

See `brain/overview.md`.
