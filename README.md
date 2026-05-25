# CryptoLedger 📊

A privacy-first Binance Spot Order History P&L calculator. Upload your CSV, get instant realized/unrealized P&L, order history, and open positions — all computed in your browser with zero data upload.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | [React 18](https://react.dev) | UI rendering and state management |
| CSV Parsing | [PapaParse 5](https://www.papaparse.com) | Fast, header-aware CSV parsing |
| Charts | [Recharts 2](https://recharts.org) | Line chart, bar chart (timeline & monthly P&L) |
| Styling | Inline CSS + CSS Variables | Zero-dependency dark theme, no Tailwind/CSS-in-JS library |
| Fonts | [Google Fonts](https://fonts.google.com) — Syne + Space Mono | Display + monospace pairing |
| Build | [Create React App](https://create-react-app.dev) | Zero-config React build toolchain |
| Deployment | [Vercel](https://vercel.com) | Static site hosting with automatic GitHub deploys |

**P&L Methodology:** FIFO (First In, First Out) cost basis matching — the same method used by most tax authorities.

---

## Setup Guide

### Prerequisites

- [Node.js](https://nodejs.org) v16 or higher
- npm (bundled with Node.js)
- A Binance account with Spot order history

### Step 1 — Export your Binance CSV

1. Log in to [Binance](https://www.binance.com)
2. Go to **Orders → Spot Order History**
3. Click **Export** (top-right corner)
4. Select your desired date range
5. Click **Generate** and download the CSV file

### Step 2 — Clone or download the project

**Option A — Download ZIP** (from this repo or the provided zip):
```bash
unzip cryptoledger.zip
cd cryptoledger
```

**Option B — Clone from GitHub:**
```bash
git clone https://github.com/YOUR_USERNAME/cryptoledger.git
cd cryptoledger
```

### Step 3 — Install dependencies

```bash
npm install
```

This installs React, PapaParse, Recharts, and all build dependencies (~300MB in `node_modules`).

### Step 4 — Run locally

```bash
npm start
```

Opens `http://localhost:3000` in your browser automatically. The app hot-reloads on any file change.

### Step 5 — Build for production

```bash
npm run build
```

Outputs a static site to the `/build` folder, ready to deploy anywhere.

---

## Deploy to Vercel

### Option A — Vercel CLI (fastest)

```bash
npm install -g vercel
npm run build
vercel --prod
```

### Option B — GitHub + Vercel (recommended for ongoing updates)

1. Push the project to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   gh repo create cryptoledger --public --push
   ```
2. Go to [vercel.com](https://vercel.com) → **New Project**
3. Click **Import** next to your GitHub repo
4. Framework preset: **Create React App** (auto-detected)
5. Leave all other settings as default
6. Click **Deploy**

Your app will be live at `https://cryptoledger.vercel.app` (or similar) within ~60 seconds. Every future `git push` triggers an automatic redeploy.

---

## How to Use

1. Open the app and drag-and-drop (or click to choose) your Binance Spot CSV
2. The dashboard loads instantly — all processing is in your browser
3. Use the **Combine USDT+BUSD toggle** to merge `AVAXUSDT` + `AVAXBUSD` into a single `AVAX` entry
4. Use the **Coin**, **Date range**, **Sort**, and **Show** filters to drill down
5. Switch tabs: **Realized P&L** → **Open Positions** → **Order History**
6. In **Order History**, toggle between **All Orders**, **Buys Only**, and **Sells Only**

---

## Changelog

### v1.2.0 — Order History (Buy & Sell)
- **New:** Order History tab now shows **All Orders**, **Buys Only**, and **Sells Only** views
- **New:** Buy trades display with green left-border indicator; sell trades display with red
- **New:** Summary cards in Order History showing total buy count, sell count, and volume
- **New:** Showing count badge updates dynamically as you switch views

### v1.1.0 — BUSD Display Fix
- **Fixed:** All Trades table now shows the **original pair** (e.g. `BTCBUSD`) instead of only the normalized pair
- **New:** When Combine is ON and a BUSD trade was merged, a blue `→BTCUSDT` badge is shown inline
- **Fixed:** Coin filter now correctly includes both USDT and BUSD trades when combine mode is active

### v1.0.0 — Initial Release
- Upload Binance Spot Order History CSV via drag-and-drop or file picker
- FIFO P&L calculation engine for all filled orders
- Realized P&L dashboard: summary cards, P&L by coin bar chart, cumulative timeline, monthly breakdown, winners/losers tables
- Open Positions tab: cost basis per coin, % of portfolio, distribution bar chart
- All Trades tab: filterable sell history with FIFO-matched P&L per trade
- USDT + BUSD combine toggle
- Filters: coin selector, date range, sort options, winners/losers/top 10
- 100% in-browser — no data leaves your machine

### v1.2.1 — Filter Bug Fixes
- **Fixed:** Coin filter + date range now work together correctly — previously selecting a coin like BTC then changing the date range would show 0 data
- **Fixed:** Date re-aggregation now seeds from the coin-filtered entries first, so coins with no sells in the date window show 0 P&L instead of disappearing
- **Fixed:** Order History date range now anchors to the earliest buy OR sell trade (not just sells), so buy-only history is visible
- **Improved:** Empty state messages added throughout — "No data in selected range", "No winners/losers in range", "No orders in selected range"

### v1.2.2 — Critical Date Parsing Fix
- **Fixed (critical):** Binance CSV exports dates as `YY-MM-DD HH:MM:SS` (e.g. `26-05-11 08:11:13`), not `YYYY-MM-DD`. The old `slice(0,10)` produced `"26-05-11 0"` — a broken string that failed all date comparisons against the `YYYY-MM-DD` filter inputs, causing every single trade to be filtered out and all P&L to show as $0
- **Fixed:** Date sort in the FIFO engine now uses `parseDate()` for correct chronological ordering
- **Added:** `parseDate()` helper that converts `"YY-MM-DD HH:MM:SS"` → `"YYYY-MM-DD"` consistently across all date usages
