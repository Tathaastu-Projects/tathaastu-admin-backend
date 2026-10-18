# tathaastu-admin-backend

Single Express + MongoDB API for **admin portal** and **storefront**.

## Clients

| Client | Folder | How it connects |
|--------|--------|-----------------|
| Store | `abhimantrit` | `NEXT_PUBLIC_API_URL` → `/api/store/*` |
| Admin UI | `tathaastu-admin_frontend` | `BACKEND_URL` rewrite → `/api/*` |

## Mounts (`server.js`)

| Prefix | Audience |
|--------|----------|
| `/api/auth` | Admin login (mock token today) |
| `/api/products` | Admin CRUD (+ `/public` for store fallback) |
| `/api/queries`, `/api/remedies`, `/api/users`, `/api/courses`, `/api/orders`, `/api/events`, `/api/notifications`, `/api/analytics` | Admin |
| `/api/store` | Store public + nested `/admin/*` (orders, CMS, coupons…) |
| `/api/store/admin/home-banners` | Homepage slider: list, upload, edit text and button category, delete |
| `/api/health` | Health |
| `/uploads` | Static uploads |

## Env essentials

`MONGODB_URI`, `PORT`, `JWT_SECRET`, `NODE_ENV`  
Optional: `RAZORPAY_*`, `STORE_*`, `MS_GRAPH_*`, `ADMIN_NOTIFICATION_EMAILS`

## Seed

`npm run seed` — remedies + sample products + collections/CMS/coupons  
Full import: `npm run import:gemsmantra`
