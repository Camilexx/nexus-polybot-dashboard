/**
 * NEXUS POLYBOT — Supabase Direct Client
 * Queries Supabase REST API from the browser using anon key.
 * No backend needed — RLS policies allow public reads.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

async function query(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), { headers });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${r.statusText}`);
  return r.json();
}

export async function fetchSummary() {
  const [trades, bankrollRows] = await Promise.all([
    query("trades", { select: "id,outcome,pnl,brier_score" }),
    query("bankroll", { select: "balance", order: "id.desc", limit: "1" }),
  ]);

  const total = trades.length;
  const won = trades.filter((t) => t.outcome === "win").length;
  const lost = trades.filter((t) => t.outcome === "loss").length;
  const pending = trades.filter((t) => t.outcome === "pending").length;
  const skipped = trades.filter((t) => t.outcome === "skip" || t.outcome === "skipped").length;
  const pnlVals = trades.filter((t) => t.pnl != null).map((t) => t.pnl);
  const pnl = pnlVals.reduce((a, b) => a + b, 0);
  const brierVals = trades.filter((t) => t.brier_score && t.brier_score > 0).map((t) => t.brier_score);
  const brier = brierVals.length ? brierVals.reduce((a, b) => a + b, 0) / brierVals.length : 0;
  const winPnls = trades.filter((t) => t.outcome === "win" && t.pnl).map((t) => t.pnl);
  const best = winPnls.length ? Math.max(...winPnls) : 0;
  const bankroll = bankrollRows.length ? bankrollRows[0].balance : 10.0;

  return {
    total,
    won,
    lost,
    pending,
    skipped,
    pnl: Math.round(pnl * 100) / 100,
    bankroll: Math.round(bankroll * 100) / 100,
    win_rate: Math.round((won / Math.max(won + lost, 1)) * 1000) / 10,
    brier: Math.round(brier * 10000) / 10000,
    best_trade: Math.round(best * 100) / 100,
  };
}

export async function fetchStrategies() {
  const trades = await query("trades", {
    select: "strategy,outcome,pnl,brier_score,confianza,ev",
  });

  const map = {};
  for (const t of trades) {
    const s = t.strategy || "unknown";
    if (!map[s]) map[s] = { total: 0, won: 0, lost: 0, pnl: 0, brierSum: 0, brierN: 0, confSum: 0, evSum: 0 };
    map[s].total++;
    if (t.outcome === "win") map[s].won++;
    if (t.outcome === "loss") map[s].lost++;
    if (t.pnl != null) map[s].pnl += t.pnl;
    if (t.brier_score && t.brier_score > 0) { map[s].brierSum += t.brier_score; map[s].brierN++; }
    map[s].confSum += t.confianza || 0;
    map[s].evSum += t.ev || 0;
  }

  return Object.entries(map)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, d]) => ({
      strategy: name,
      total: d.total,
      won: d.won,
      lost: d.lost,
      win_rate: Math.round((d.won / Math.max(d.won + d.lost, 1)) * 1000) / 10,
      pnl: Math.round(d.pnl * 100) / 100,
      brier: d.brierN ? Math.round((d.brierSum / d.brierN) * 10000) / 10000 : 0,
      avg_conf: Math.round((d.confSum / Math.max(d.total, 1)) * 10) / 10,
      avg_ev: Math.round((d.evSum / Math.max(d.total, 1)) * 10000) / 10000,
    }));
}

export async function fetchRecentTrades(limit = 50) {
  return query("trades", {
    select: "id,market_name,strategy,confianza,stake,ev,odds,outcome,pnl,created_at,league",
    order: "id.desc",
    limit: String(limit),
  });
}

export async function fetchTimeline() {
  const trades = await query("trades", { select: "created_at,outcome,pnl" });
  const hours = {};
  for (const t of trades) {
    const ca = t.created_at || "";
    const h = ca.length >= 13 ? ca.slice(11, 13) + ":00" : "??:00";
    if (!hours[h]) hours[h] = { trades: 0, won: 0, pnl: 0 };
    hours[h].trades++;
    if (t.outcome === "win") hours[h].won++;
    hours[h].pnl += t.pnl || 0;
  }
  return Object.entries(hours)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hour, d]) => ({ hour, ...d, pnl: Math.round(d.pnl * 100) / 100 }));
}

export async function fetchBankrollHistory() {
  const rows = await query("bankroll", {
    select: "id,balance,note,timestamp",
    order: "id.asc",
    limit: "200",
  });
  return rows;
}

export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}
