# Zerodha Trader Dashboard

Personal trading dashboard for Zerodha. No API keys. No OAuth setup. Works out of the box.

## How it works

Uses Zerodha's **enc_token** method — the same session token your browser uses when logged in to Kite. Paste it once per day.

**Token flow:**
1. Paste `enc_token` on the Connect page
2. Stored in memory (Zustand) + `sessionStorage` (survives refresh)
3. Every request: Browser → Our Next.js API route → Zerodha's servers
4. Zerodha sees `Authorization: enctoken <your_token>`
5. Token never touches any third-party server

**Token lifetime:** Expires at 6:00 AM next day.

---

## Getting your enc_token

1. Open [kite.zerodha.com](https://kite.zerodha.com) and log in
2. Press `F12` → DevTools
3. Go to **Application** → **Cookies** → `https://kite.zerodha.com`
4. Find cookie named **`enctoken`**
5. Copy the entire value
6. Paste into the Connect page

---

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No `.env` files needed.

---

## Deploy to Vercel

```bash
npm install -g vercel
vercel
```

No environment variables required. Deploy and use.

---

## Features

- **Portfolio** — Holdings + positions with live P&L, day change, available funds
- **Trading** — Place MARKET/LIMIT/SL/SL-M orders, view today's order book
- **Auto-disconnect** — 401/403 from Zerodha clears session and redirects to /connect
- **Session badge** — Shows expiry time when connected

## Stack

Next.js 14 · TypeScript · Tailwind CSS · shadcn/ui · Zustand · Axios · Vercel
