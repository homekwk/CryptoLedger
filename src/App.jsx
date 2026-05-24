import React, { useState, useCallback, useRef, useEffect } from "react";
import Papa from "papaparse";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell
} from "recharts";

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const parseAmt = (s) => {
  if (!s) return 0;
  const m = String(s).trim().match(/^[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
};

const normalizePair = (pair, combine) => {
  const p = pair.trim().toUpperCase();
  return combine ? p.replace(/BUSD$/, "USDT") : p;
};

const getCoin = (pair) => {
  const p = pair.toUpperCase();
  for (const q of ["USDT", "BUSD", "BNB", "BTC", "ETH"])
    if (p.endsWith(q)) return p.slice(0, p.length - q.length);
  return p;
};

const fmt$ = (v, sign = true) => {
  const abs = "$" + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!sign) return abs;
  return (v >= 0 ? "+" : "-") + abs;
};

const fmtNum = (v, d = 4) =>
  Math.abs(v) < 0.0001 ? v.toExponential(3) : v.toLocaleString(undefined, { maximumFractionDigits: d });

// ─── FIFO ENGINE ──────────────────────────────────────────────────────────────
function computePnL(orders, combine) {
  const filled = orders.filter((r) => (r.Status || "").trim().toUpperCase() === "FILLED");
  filled.sort((a, b) => new Date(a.Time) - new Date(b.Time));

  const byPair = {};
  filled.forEach((o) => {
    const pair = normalizePair(o.Pair || "", combine);
    if (!byPair[pair]) byPair[pair] = [];
    byPair[pair].push(o);
  });

  const results = {};
  const allSellTrades = [];
  const allBuyTrades = [];

  Object.entries(byPair).forEach(([pair, ords]) => {
    const coin = getCoin(pair);
    const buyQ = [];
    let totalBuy = 0, totalSell = 0, realizedPnL = 0;
    let winTrades = 0, loseTrades = 0, grossWin = 0, grossLoss = 0, numTrades = 0;

    ords.forEach((o) => {
      const side = (o.Side || "").trim().toUpperCase();
      const qty = parseAmt(o["Executed²"] || o["Executed"] || "");
      const total = parseAmt(o["Trading total³"] || o["Trading total"] || "");
      const price = parseFloat(o["Average Price"]) || 0;
      const originalPair = (o.Pair || "").trim().toUpperCase();
      if (qty === 0) return;

      if (side === "BUY") {
        buyQ.push({ qty, total, price });
        totalBuy += total;
        numTrades++;
        allBuyTrades.push({ pair, coin, originalPair, date: (o.Time || "").slice(0, 10), qty, price, total, side: "BUY" });
      } else if (side === "SELL") {
        let rem = qty, cost = 0;
        while (rem > 1e-9 && buyQ.length) {
          const b = buyQ[0];
          if (b.qty <= rem + 1e-9) {
            cost += b.total; rem -= b.qty; buyQ.shift();
          } else {
            const pct = rem / b.qty;
            cost += b.total * pct;
            b.qty -= rem; b.total *= 1 - pct; rem = 0;
          }
        }
        const pnl = total - cost;
        realizedPnL += pnl; totalSell += total; numTrades++;
        if (pnl >= 0) { winTrades++; grossWin += pnl; }
        else { loseTrades++; grossLoss += pnl; }
        allSellTrades.push({ pair, coin, originalPair, date: (o.Time || "").slice(0, 10), qty, price, revenue: total, cost, pnl, side: "SELL" });
      }
    });

    const openQty = buyQ.reduce((s, b) => s + b.qty, 0);
    const openCost = buyQ.reduce((s, b) => s + b.total, 0);
    results[pair] = { coin, pair, realizedPnL, totalBuy, totalSell, winTrades, loseTrades, grossWin, grossLoss, numTrades, openQty, openCost, openAvgCost: openQty > 0 ? openCost / openQty : 0 };
  });

  allSellTrades.sort((a, b) => new Date(a.date) - new Date(b.date));
  allBuyTrades.sort((a, b) => new Date(a.date) - new Date(b.date));
  const allTrades = [...allBuyTrades, ...allSellTrades].sort((a, b) => new Date(a.date) - new Date(b.date));
  return { results, allSellTrades, allBuyTrades, allTrades };
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
const Badge = ({ v, children }) => (
  <span style={{
    display: "inline-block", padding: "2px 8px", borderRadius: 4,
    fontSize: "0.7rem", fontFamily: "var(--mono)", fontWeight: 700,
    background: v >= 0 ? "rgba(0,229,160,0.12)" : "rgba(255,77,106,0.12)",
    color: v >= 0 ? "var(--accent)" : "var(--red)",
  }}>{children || fmt$(v)}</span>
);

const Card = ({ label, value, sub, color = "blue" }) => {
  const colors = { green: "#00e5a0", red: "#ff4d6a", blue: "#3b82f6", yellow: "#ffb800" };
  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: "1rem 1.2rem", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: colors[color] }} />
      <div style={{ fontSize: "0.68rem", color: "var(--text3)", fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.5rem" }}>{label}</div>
      <div style={{ fontSize: "1.25rem", fontWeight: 700, fontFamily: "var(--mono)" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.68rem", color: "var(--text3)", marginTop: "0.25rem", fontFamily: "var(--mono)" }}>{sub}</div>}
    </div>
  );
};

const MiniBarChart = ({ data, valueKey, nameKey, color = "#00e5a0" }) => {
  const max = Math.max(...data.map((d) => Math.abs(d[valueKey])), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
      {data.map((d, i) => {
        const pct = (Math.abs(d[valueKey]) / max) * 100;
        const c = d[valueKey] >= 0 ? "#00e5a0" : "#ff4d6a";
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 26 }}>
            <div style={{ width: 88, fontSize: "0.75rem", fontWeight: 600, textAlign: "right", flexShrink: 0, color: "var(--text)" }}>{d[nameKey]}</div>
            <div style={{ flex: 1, height: 16, borderRadius: 3, background: "var(--bg3)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: typeof color === "string" ? (color === "auto" ? c : color) : c, transition: "width 0.6s ease" }} />
            </div>
            <div style={{ width: 88, fontFamily: "var(--mono)", fontSize: "0.68rem", color: c, flexShrink: 0 }}>{fmt$(d[valueKey])}</div>
          </div>
        );
      })}
    </div>
  );
};

const SectionTitle = ({ children }) => (
  <div style={{ fontSize: "0.72rem", fontFamily: "var(--mono)", color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.75rem" }}>{children}</div>
);

const ChartBox = ({ children, style }) => (
  <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.2rem", ...style }}>{children}</div>
);

const TableWrap = ({ children, maxH }) => (
  <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", maxHeight: maxH, overflowY: maxH ? "auto" : "visible" }}>{children}</div>
);

// ─── UPLOAD SCREEN ────────────────────────────────────────────────────────────
function UploadScreen({ onFile }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handle = (file) => { if (file) onFile(file); };
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem",
      background: "radial-gradient(ellipse at 20% 50%, rgba(0,229,160,0.06) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(59,130,246,0.05) 0%, transparent 50%), var(--bg)" }}>
      <div style={{ fontSize: "2.2rem", fontWeight: 800, letterSpacing: "-0.03em", background: "linear-gradient(135deg,#00e5a0,#3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "var(--sans)" }}>CryptoLedger</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: "0.7rem", color: "var(--text3)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "3rem" }}>Portfolio P&L Calculator</div>

      <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
        style={{ width: "100%", maxWidth: 520, border: `1.5px dashed ${dragging ? "var(--accent)" : "var(--border2)"}`,
          borderRadius: 16, padding: "3rem 2rem", textAlign: "center", cursor: "pointer",
          background: dragging ? "rgba(0,229,160,0.04)" : "var(--bg2)", transition: "all 0.2s" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>📂</div>
        <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Drop your Binance CSV here</h3>
        <p style={{ fontSize: "0.8rem", color: "var(--text2)", marginBottom: "1.5rem" }}>
          Export from Binance → Orders → Spot Order History → Export<br />
          Supported: Binance Spot Order History CSV
        </p>
        <button onClick={() => inputRef.current.click()}
          style={{ background: "var(--accent)", color: "#000", border: "none", borderRadius: 8, padding: "0.65rem 1.6rem",
            fontFamily: "var(--sans)", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}>
          Choose File
        </button>
        <input ref={inputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => handle(e.target.files[0])} />
      </div>

      <div style={{ marginTop: "1.5rem", display: "inline-flex", alignItems: "center", gap: "0.5rem",
        background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 20, padding: "0.4rem 1rem",
        fontFamily: "var(--mono)", fontSize: "0.7rem", color: "var(--text3)" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--yellow)", display: "inline-block" }} />
        Binance Spot CSV · All processing in browser · No data upload
      </div>
    </div>
  );
}

// ─── TOOLTIP ──────────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 8, padding: "0.5rem 0.9rem", fontFamily: "var(--mono)", fontSize: "0.72rem" }}>
      <div style={{ color: "var(--text2)", marginBottom: 2 }}>{payload[0]?.payload?.x}</div>
      <div style={{ color: "var(--accent)" }}>Cum. P&L: ${payload[0]?.value?.toFixed(2)}</div>
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [rawOrders, setRawOrders] = useState([]);
  const [combine, setCombine] = useState(true);
  const [tab, setTab] = useState("realized");
  const [filterCoin, setFilterCoin] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterSort, setFilterSort] = useState("pnl_asc");
  const [filterShow, setFilterShow] = useState("all");
  const [tradeView, setTradeView] = useState("all"); // "all" | "buy" | "sell"

  const handleFile = useCallback((file) => {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: ({ data }) => {
        setRawOrders(data);
        const { allTrades } = computePnL(data, true);
        if (allTrades.length) {
          setFilterFrom(allTrades[0].date);
          setFilterTo(allTrades[allTrades.length - 1].date);
        }
      },
    });
  }, []);

  if (!rawOrders.length) return <UploadScreen onFile={handleFile} />;

  const { results, allSellTrades, allBuyTrades, allTrades } = computePnL(rawOrders, combine);
  const allCoins = [...new Set(Object.values(results).map((e) => e.coin))].sort();

  // apply filters
  let entries = Object.values(results);
  if (filterCoin) entries = entries.filter((e) => e.coin === filterCoin);

  let trades = allSellTrades;
  let buyTrades = allBuyTrades;
  let combinedTrades = allTrades;

  if (filterCoin) {
    trades = trades.filter((t) => t.coin === filterCoin);
    buyTrades = buyTrades.filter((t) => t.coin === filterCoin);
    combinedTrades = combinedTrades.filter((t) => t.coin === filterCoin);
  }
  if (filterFrom) {
    trades = trades.filter((t) => t.date >= filterFrom);
    buyTrades = buyTrades.filter((t) => t.date >= filterFrom);
    combinedTrades = combinedTrades.filter((t) => t.date >= filterFrom);
  }
  if (filterTo) {
    trades = trades.filter((t) => t.date <= filterTo);
    buyTrades = buyTrades.filter((t) => t.date <= filterTo);
    combinedTrades = combinedTrades.filter((t) => t.date <= filterTo);
  }

  if (filterFrom || filterTo) {
    const agg = {};
    trades.forEach((t) => {
      if (!agg[t.pair]) agg[t.pair] = { ...results[t.pair], realizedPnL: 0, winTrades: 0, loseTrades: 0, grossWin: 0, grossLoss: 0 };
      agg[t.pair].realizedPnL += t.pnl;
      if (t.pnl >= 0) { agg[t.pair].winTrades++; agg[t.pair].grossWin += t.pnl; }
      else { agg[t.pair].loseTrades++; agg[t.pair].grossLoss += t.pnl; }
    });
    entries = Object.values(agg);
  }

  if (filterShow === "profit") entries = entries.filter((e) => e.realizedPnL > 0);
  if (filterShow === "loss") entries = entries.filter((e) => e.realizedPnL < 0);
  if (filterShow === "top10") entries = [...entries].sort((a, b) => Math.abs(b.realizedPnL) - Math.abs(a.realizedPnL)).slice(0, 10);

  if (filterSort === "pnl_asc") entries.sort((a, b) => a.realizedPnL - b.realizedPnL);
  if (filterSort === "pnl_desc") entries.sort((a, b) => b.realizedPnL - a.realizedPnL);
  if (filterSort === "name") entries.sort((a, b) => a.coin.localeCompare(b.coin));
  if (filterSort === "trades") entries.sort((a, b) => b.numTrades - a.numTrades);

  // summary
  const totalPnL = entries.reduce((s, e) => s + e.realizedPnL, 0);
  const totalBuy = entries.reduce((s, e) => s + e.totalBuy, 0);
  const totalSell = entries.reduce((s, e) => s + e.totalSell, 0);
  const grossWin = entries.reduce((s, e) => s + e.grossWin, 0);
  const grossLoss = entries.reduce((s, e) => s + e.grossLoss, 0);
  const winners = entries.filter((e) => e.realizedPnL > 0);
  const losers = entries.filter((e) => e.realizedPnL < 0);

  // timeline
  let cum = 0;
  const timelineData = trades.map((t) => { cum += t.pnl; return { x: t.date, y: parseFloat(cum.toFixed(2)) }; });

  // monthly
  const monthly = {};
  trades.forEach((t) => {
    const m = t.date.slice(0, 7);
    if (!monthly[m]) monthly[m] = 0;
    monthly[m] += t.pnl;
  });
  const monthlyData = Object.entries(monthly).sort().map(([x, y]) => ({ x, y: parseFloat(y.toFixed(2)) }));

  // open positions
  const openPos = Object.values(results).filter((e) => e.openQty > 0.0001 && e.openCost > 0.5).sort((a, b) => b.openCost - a.openCost);
  const totalOpenCost = openPos.reduce((s, e) => s + e.openCost, 0);

  const navStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.85rem 1.5rem", borderBottom: "1px solid var(--border)", background: "var(--bg)", position: "sticky", top: 0, zIndex: 100, flexWrap: "wrap", gap: "0.5rem" };
  const ctrlStyle = { display: "flex", gap: "0.6rem", padding: "0.6rem 1.5rem", borderBottom: "1px solid var(--border)", flexWrap: "wrap", alignItems: "center", background: "var(--bg)" };
  const tabBtn = (id, label) => (
    <button key={id} onClick={() => setTab(id)}
      style={{ fontFamily: "var(--sans)", fontSize: "0.75rem", fontWeight: 600, padding: "0.4rem 1rem", border: "none", borderRadius: 7, cursor: "pointer",
        background: tab === id ? "var(--bg3)" : "transparent", color: tab === id ? "var(--text)" : "var(--text2)", transition: "all 0.15s" }}>
      {label}
    </button>
  );

  const thStyle = { background: "var(--bg2)", color: "var(--text3)", fontFamily: "var(--mono)", fontSize: "0.64rem", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0.65rem 1rem", textAlign: "right", borderBottom: "1px solid var(--border)", fontWeight: 400 };
  const tdStyle = { padding: "0.55rem 1rem", borderBottom: "1px solid var(--border)", textAlign: "right", fontFamily: "var(--mono)", fontSize: "0.74rem", color: "var(--text)" };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* NAV */}
      <nav style={navStyle}>
        <span style={{ fontSize: "1.2rem", fontWeight: 800, background: "linear-gradient(135deg,#00e5a0,#3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "var(--sans)" }}>CryptoLedger</span>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4, background: "var(--bg2)", borderRadius: 10, padding: 4 }}>
            {tabBtn("realized", "Realized P&L")}
            {tabBtn("open", "Open Positions")}
            {tabBtn("trades", "Order History")}
          </div>
          <button onClick={() => setRawOrders([])}
            style={{ background: "transparent", border: "1px solid var(--border2)", borderRadius: 7, color: "var(--text2)", fontFamily: "var(--mono)", fontSize: "0.7rem", padding: "0.4rem 0.8rem", cursor: "pointer" }}>
            ↩ New File
          </button>
        </div>
      </nav>

      {/* CONTROLS */}
      <div style={ctrlStyle}>
        <span style={{ fontSize: "0.68rem", color: "var(--text3)", fontFamily: "var(--mono)", textTransform: "uppercase" }}>Coin</span>
        <select value={filterCoin} onChange={(e) => setFilterCoin(e.target.value)} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text)", fontFamily: "var(--mono)", fontSize: "0.72rem", padding: "0.35rem 0.65rem" }}>
          <option value="">All coins</option>
          {allCoins.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <span style={{ fontSize: "0.68rem", color: "var(--text3)", fontFamily: "var(--mono)", textTransform: "uppercase" }}>From</span>
        <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text)", fontFamily: "var(--mono)", fontSize: "0.72rem", padding: "0.35rem 0.65rem" }} />

        <span style={{ fontSize: "0.68rem", color: "var(--text3)", fontFamily: "var(--mono)", textTransform: "uppercase" }}>To</span>
        <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text)", fontFamily: "var(--mono)", fontSize: "0.72rem", padding: "0.35rem 0.65rem" }} />

        <select value={filterSort} onChange={(e) => setFilterSort(e.target.value)} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text)", fontFamily: "var(--mono)", fontSize: "0.72rem", padding: "0.35rem 0.65rem" }}>
          <option value="pnl_asc">P&L Low→High</option>
          <option value="pnl_desc">P&L High→Low</option>
          <option value="name">Name A→Z</option>
          <option value="trades">Most Trades</option>
        </select>

        <select value={filterShow} onChange={(e) => setFilterShow(e.target.value)} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--text)", fontFamily: "var(--mono)", fontSize: "0.72rem", padding: "0.35rem 0.65rem" }}>
          <option value="all">All coins</option>
          <option value="profit">Winners only</option>
          <option value="loss">Losers only</option>
          <option value="top10">Top 10 |P&L|</option>
        </select>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.74rem", color: "var(--text2)", fontFamily: "var(--mono)" }}>
          Combine USDT+BUSD
          <div onClick={() => setCombine((v) => !v)} style={{ width: 36, height: 20, background: combine ? "var(--accent)" : "var(--bg3)", borderRadius: 10, border: `1px solid ${combine ? "var(--accent)" : "var(--border2)"}`, cursor: "pointer", position: "relative", transition: "all 0.2s" }}>
            <div style={{ position: "absolute", top: 2, left: combine ? 18 : 2, width: 14, height: 14, background: "#fff", borderRadius: "50%", transition: "left 0.2s" }} />
          </div>
        </div>
      </div>

      <div style={{ padding: "1.5rem" }}>

        {/* ── REALIZED P&L TAB ── */}
        {tab === "realized" && (
          <>
            {/* Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
              <Card label="Total Realized P&L" value={<span style={{ color: totalPnL >= 0 ? "var(--accent)" : "var(--red)" }}>{fmt$(totalPnL)}</span>} sub={`${entries.length} coins`} color={totalPnL >= 0 ? "green" : "red"} />
              <Card label="Total Bought" value={`$${totalBuy.toLocaleString(undefined,{maximumFractionDigits:0})}`} sub={`${entries.reduce((s,e)=>s+e.numTrades,0)} orders`} color="blue" />
              <Card label="Total Sold" value={`$${totalSell.toLocaleString(undefined,{maximumFractionDigits:0})}`} sub={`${trades.length} sell trades`} color="blue" />
              <Card label="Gross Profit" value={<span style={{ color: "var(--accent)" }}>+${grossWin.toLocaleString(undefined,{maximumFractionDigits:2})}</span>} sub={`${entries.reduce((s,e)=>s+e.winTrades,0)} winning sells`} color="green" />
              <Card label="Gross Loss" value={<span style={{ color: "var(--red)" }}>-${Math.abs(grossLoss).toLocaleString(undefined,{maximumFractionDigits:2})}</span>} sub={`${entries.reduce((s,e)=>s+e.loseTrades,0)} losing sells`} color="red" />
              <Card label="Win / Loss Coins" value={<span><span style={{color:"var(--accent)"}}>{winners.length}</span> / <span style={{color:"var(--red)"}}>{losers.length}</span></span>} sub={`${entries.length ? Math.round(winners.length/entries.length*100) : 0}% win rate`} color="yellow" />
            </div>

            {/* P&L bars + Timeline */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <SectionTitle>P&L by Coin (top 20)</SectionTitle>
                <ChartBox>
                  <MiniBarChart data={[...entries].sort((a,b)=>a.realizedPnL-b.realizedPnL).slice(0,20)} valueKey="realizedPnL" nameKey="coin" color="auto" />
                </ChartBox>
              </div>
              <div>
                <SectionTitle>Cumulative Realized P&L Over Time</SectionTitle>
                <ChartBox style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timelineData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="x" tick={{ fill: "#4a5568", fontSize: 10, fontFamily: "Space Mono" }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: "#4a5568", fontSize: 10, fontFamily: "Space Mono" }} tickFormatter={(v) => "$" + v} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="y" stroke="#00e5a0" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartBox>
              </div>
            </div>

            {/* Monthly */}
            <div style={{ marginBottom: "1rem" }}>
              <SectionTitle>Monthly P&L</SectionTitle>
              <ChartBox style={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="x" tick={{ fill: "#4a5568", fontSize: 10, fontFamily: "Space Mono" }} />
                    <YAxis tick={{ fill: "#4a5568", fontSize: 10, fontFamily: "Space Mono" }} tickFormatter={(v) => "$" + v} />
                    <Tooltip formatter={(v) => ["$" + v.toFixed(2), "P&L"]} contentStyle={{ background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 8, fontFamily: "Space Mono", fontSize: "0.72rem" }} />
                    <Bar dataKey="y" radius={[3,3,0,0]}>
                      {monthlyData.map((d, i) => <Cell key={i} fill={d.y >= 0 ? "#00e5a0" : "#ff4d6a"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>
            </div>

            {/* Winners / Losers */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              {[["🏆 Top Winners", winners.slice(0,8), "g"], ["💸 Top Losers", losers.slice(0,8), "r"]].map(([title, rows, cls]) => (
                <div key={title}>
                  <SectionTitle>{title}</SectionTitle>
                  <TableWrap>
                    <table style={{ width: "100%", fontSize: "0.78rem", borderCollapse: "collapse" }}>
                      <thead><tr>
                        {["Coin","Realized P&L","Trades","Buy Vol"].map(h => <th key={h} style={h==="Coin"?{...thStyle,textAlign:"left"}:thStyle}>{h}</th>)}
                      </tr></thead>
                      <tbody>{rows.map((e, i) => (
                        <tr key={i}>
                          <td style={{...tdStyle,textAlign:"left",fontFamily:"var(--sans)",fontWeight:600}}>{e.coin}</td>
                          <td style={tdStyle}><Badge v={e.realizedPnL} /></td>
                          <td style={tdStyle}>{e.winTrades + e.loseTrades}</td>
                          <td style={tdStyle}>${e.totalBuy.toLocaleString(undefined,{maximumFractionDigits:0})}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </TableWrap>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── OPEN POSITIONS TAB ── */}
        {tab === "open" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
              <Card label="Total Cost Basis" value={`$${totalOpenCost.toLocaleString(undefined,{maximumFractionDigits:0})}`} sub={`${openPos.length} positions`} color="yellow" />
              <Card label="Largest Position" value={openPos[0]?.coin || "—"} sub={openPos[0] ? `$${openPos[0].openCost.toFixed(0)} invested` : ""} color="blue" />
              <Card label="Avg Avg Cost" value={`$${openPos.length ? (totalOpenCost/openPos.length).toFixed(0) : 0}`} sub="per position" color="blue" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <SectionTitle>Open Positions — Cost Basis</SectionTitle>
                <TableWrap maxH={400}>
                  <table style={{ width: "100%", fontSize: "0.78rem", borderCollapse: "collapse" }}>
                    <thead><tr>
                      {["Coin","Qty Held","Avg Cost","Cost Basis","% of Total"].map(h => <th key={h} style={h==="Coin"?{...thStyle,textAlign:"left"}:thStyle}>{h}</th>)}
                    </tr></thead>
                    <tbody>{openPos.map((e, i) => (
                      <tr key={i}>
                        <td style={{...tdStyle,textAlign:"left",fontFamily:"var(--sans)",fontWeight:600}}>{e.coin}</td>
                        <td style={tdStyle}>{fmtNum(e.openQty)}</td>
                        <td style={tdStyle}>${fmtNum(e.openAvgCost)}</td>
                        <td style={tdStyle}>${e.openCost.toFixed(2)}</td>
                        <td style={tdStyle}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                            <div style={{ width: 50, height: 5, background: "var(--bg3)", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${Math.min(100, e.openCost/totalOpenCost*100)}%`, height: "100%", background: "var(--yellow)", borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: "0.68rem" }}>{(e.openCost/totalOpenCost*100).toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </TableWrap>
              </div>
              <div>
                <SectionTitle>Cost Basis Distribution (top 15)</SectionTitle>
                <ChartBox>
                  <MiniBarChart data={openPos.slice(0,15)} valueKey="openCost" nameKey="coin" color="#ffb800" />
                </ChartBox>
              </div>
            </div>
          </>
        )}

        {/* ── ORDER HISTORY TAB ── */}
        {tab === "trades" && (() => {
          const visibleTrades = tradeView === "sell" ? [...trades].reverse()
            : tradeView === "buy" ? [...buyTrades].reverse()
            : [...combinedTrades].reverse();

          const buyCount = buyTrades.length;
          const sellCount = trades.length;
          const totalBuyVol = buyTrades.reduce((s, t) => s + t.total, 0);
          const totalSellVol = trades.reduce((s, t) => s + t.revenue, 0);

          const segBtn = (id, label, count, color) => (
            <button key={id} onClick={() => setTradeView(id)} style={{
              fontFamily: "var(--mono)", fontSize: "0.72rem", padding: "0.4rem 1rem",
              border: `1px solid ${tradeView === id ? color : "var(--border2)"}`,
              borderRadius: 7, cursor: "pointer",
              background: tradeView === id ? `${color}18` : "transparent",
              color: tradeView === id ? color : "var(--text2)",
              transition: "all 0.15s", display: "flex", alignItems: "center", gap: "0.4rem"
            }}>
              {label}
              <span style={{ background: tradeView === id ? color : "var(--bg3)", color: tradeView === id ? "#000" : "var(--text3)", borderRadius: 10, padding: "1px 6px", fontSize: "0.65rem", fontWeight: 700 }}>{count}</span>
            </button>
          );

          return (
            <>
              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "0.75rem", marginBottom: "1.2rem" }}>
                <Card label="Total Buy Orders" value={buyCount} sub={`$${totalBuyVol.toLocaleString(undefined,{maximumFractionDigits:0})} volume`} color="blue" />
                <Card label="Total Sell Orders" value={sellCount} sub={`$${totalSellVol.toLocaleString(undefined,{maximumFractionDigits:0})} volume`} color="red" />
                <Card label="Showing" value={visibleTrades.length} sub={tradeView === "all" ? "buy + sell" : tradeView === "buy" ? "buy only" : "sell only"} color="yellow" />
              </div>

              {/* Toggle buttons */}
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", alignItems: "center" }}>
                <span style={{ fontSize: "0.7rem", color: "var(--text3)", fontFamily: "var(--mono)", marginRight: "0.25rem" }}>VIEW</span>
                {segBtn("all", "All Orders", buyCount + sellCount, "var(--text)")}
                {segBtn("buy", "Buys Only", buyCount, "var(--accent)")}
                {segBtn("sell", "Sells Only", sellCount, "var(--red)")}
              </div>

              <TableWrap maxH={560}>
                <table style={{ width: "100%", fontSize: "0.78rem", borderCollapse: "collapse" }}>
                  <thead><tr>
                    {["Date","Pair","Side","Qty","Price","Value","P&L"].map(h => (
                      <th key={h} style={["Date","Pair"].includes(h) ? {...thStyle, textAlign:"left"} : thStyle}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{visibleTrades.map((t, i) => {
                    const isBuy = t.side === "BUY";
                    const value = isBuy ? t.total : t.revenue;
                    return (
                      <tr key={i} style={{ borderLeft: `2px solid ${isBuy ? "rgba(0,229,160,0.3)" : "rgba(255,77,106,0.3)"}` }}>
                        <td style={{...tdStyle, textAlign:"left", fontFamily:"var(--mono)", fontSize:"0.7rem"}}>{t.date}</td>
                        <td style={{...tdStyle, textAlign:"left", fontFamily:"var(--sans)", fontWeight:600}}>
                          {t.originalPair}
                          {combine && t.originalPair !== t.pair && (
                            <span style={{ marginLeft:5, fontSize:"0.6rem", fontFamily:"var(--mono)", background:"rgba(59,130,246,0.12)", color:"var(--blue)", padding:"1px 5px", borderRadius:3, verticalAlign:"middle" }}>→{t.pair}</span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <span style={{ display:"inline-block", padding:"2px 8px", borderRadius:4, fontSize:"0.68rem", fontFamily:"var(--mono)", fontWeight:700,
                            background: isBuy ? "rgba(0,229,160,0.12)" : "rgba(255,77,106,0.12)",
                            color: isBuy ? "var(--accent)" : "var(--red)" }}>
                            {isBuy ? "BUY" : "SELL"}
                          </span>
                        </td>
                        <td style={tdStyle}>{fmtNum(t.qty)}</td>
                        <td style={tdStyle}>${fmtNum(t.price)}</td>
                        <td style={tdStyle}>${value.toFixed(2)}</td>
                        <td style={tdStyle}>
                          {isBuy
                            ? <span style={{ color:"var(--text3)", fontFamily:"var(--mono)", fontSize:"0.68rem" }}>—</span>
                            : <Badge v={t.pnl} />}
                        </td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </TableWrap>
            </>
          );
        })()}
      </div>
    </div>
  );
}
