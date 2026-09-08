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
- `npm run seed` — seed data (if `scripts/seed.js` is present)
