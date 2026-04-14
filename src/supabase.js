/**
 * NEXUS POLYBOT — Supabase Direct Client v3.0
 * Queries Supabase REST API efficiently using count headers
 * instead of fetching all rows. Handles 5000+ trades.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const baseHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
};

async function query(table, params = {}, extraHeaders = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), { headers: { ...baseHeaders, ...extraHeaders } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${r.statusText}`);
  return { data: await r.json(), headers: r.headers };
}

async function countWhere(table, filters = {}) {
  const params = { select: "id", ...filters };
  const { headers } = await query(table, params, {
    Prefer: "count=exact",
    Range: "0-0",
  });
  const range = headers.get("content-range") || "0-0/0";
  return parseInt(range.split("/")[1]) || 0;
}

async function queryAll(table, params = {}) {
  const { data } = await query(table, params, { Range: "0-9999" });
  return data;
}

/* ─── Summary ─── */
export async function fetchSummary() {
  const [total, won, lost, pending, skipped, bankrollRows, pnlData, brierData] =
    await Promise.all([
      countWhere("trades"),
      countWhere("trades", { outcome: "eq.win" }),
      countWhere("trades", { outcome: "eq.loss" }),
      countWhere("trades", { outcome: "eq.pending" }),
      countWhere("trades", { outcome: "eq.skipped" }),
      queryAll("bankroll", { select: "balance", order: "id.desc", limit: "1" }),
      queryAll("trades", { select: "pnl", "pnl": "not.is.null", limit: "10000" }),
      queryAll("trades", { select: "brier_score", "brier_score": "gt.0", limit: "10000" }),
    ]);

  const pnl = pnlData.reduce((a, r) => a + (r.pnl || 0), 0);
  const brier = brierData.length
    ? brierData.reduce((a, r) => a + r.brier_score, 0) / brierData.length
    : 0;
  const bankroll = bankrollRows.length ? bankrollRows[0].balance : 10.0;
  const bestData = pnlData.filter((r) => r.pnl > 0);
  const best = bestData.length ? Math.max(...bestData.map((r) => r.pnl)) : 0;

  return {
    total, won, lost, pending, skipped,
    pnl:       Math.round(pnl * 100) / 100,
    bankroll:  Math.round(bankroll * 100) / 100,
    win_rate:  Math.round((won / Math.max(won + lost, 1)) * 1000) / 10,
    brier:     Math.round(brier * 10000) / 10000,
    best_trade: Math.round(best * 100) / 100,
  };
}

/* ─── Strategies ─── */
export async function fetchStrategies() {
  const trades = await queryAll("trades", {
    select: "strategy,outcome,pnl,brier_score,confianza,ev",
  });

  const map = {};
  for (const t of trades) {
    const s = t.strategy || "unknown";
    if (!map[s]) map[s] = { total: 0, won: 0, lost: 0, pnl: 0, brierSum: 0, brierN: 0, confSum: 0, evSum: 0 };
    map[s].total++;
    if (t.outcome === "win")  map[s].won++;
    if (t.outcome === "loss") map[s].lost++;
    if (t.pnl != null)        map[s].pnl += t.pnl;
    if (t.brier_score && t.brier_score > 0) { map[s].brierSum += t.brier_score; map[s].brierN++; }
    map[s].confSum += t.confianza || 0;
    map[s].evSum   += t.ev || 0;
  }

  return Object.entries(map)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .map(([name, d]) => ({
      strategy:  name,
      total:     d.total,
      won:       d.won,
      lost:      d.lost,
      resolved:  d.won + d.lost,
      win_rate:  Math.round((d.won / Math.max(d.won + d.lost, 1)) * 1000) / 10,
      pnl:       Math.round(d.pnl * 100) / 100,
      brier:     d.brierN ? Math.round((d.brierSum / d.brierN) * 10000) / 10000 : 0,
      avg_conf:  Math.round((d.confSum / Math.max(d.total, 1)) * 10) / 10,
      avg_ev:    Math.round((d.evSum / Math.max(d.total, 1)) * 10000) / 10000,
    }));
}

/* ─── Recent Trades ─── */
export async function fetchRecentTrades(limit = 50) {
  return queryAll("trades", {
    select: "id,market_name,strategy,confianza,stake,ev,odds,outcome,pnl,created_at,league",
    order:  "id.desc",
    limit:  String(limit),
  });
}

/* ─── Timeline ─── */
export async function fetchTimeline() {
  const trades = await queryAll("trades", { select: "created_at,outcome,pnl" });
  const hours = {};
  for (const t of trades) {
    const h = (t.created_at || "").slice(11, 13) + ":00" || "??:00";
    if (!hours[h]) hours[h] = { trades: 0, won: 0, pnl: 0 };
    hours[h].trades++;
    if (t.outcome === "win") hours[h].won++;
    hours[h].pnl += t.pnl || 0;
  }
  return Object.entries(hours)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hour, d]) => ({ hour, ...d, pnl: Math.round(d.pnl * 100) / 100 }));
}

/* ─── Bankroll History ─── */
export async function fetchBankrollHistory() {
  return queryAll("bankroll", { select: "id,balance,note,timestamp", order: "id.asc", limit: "200" });
}

/* ─── Patterns (self-improvement) ─── */
export async function fetchPatterns() {
  try {
    return await queryAll("patterns", { select: "*", order: "id.desc", limit: "20" });
  } catch { return []; }
}

/* ─── Risk Status (computed from bankroll + recent trades) ─── */
export async function fetchRiskStatus() {
  const [bankrollAll, recentOutcomes, bankrollCurrent] = await Promise.all([
    queryAll("bankroll", { select: "balance", order: "id.asc", limit: "500" }),
    queryAll("trades", {
      select: "outcome",
      order: "id.desc",
      limit: "10",
      "outcome": "in.(win,loss)",
    }),
    queryAll("bankroll", { select: "balance", order: "id.desc", limit: "1" }),
  ]);

  const current  = bankrollCurrent[0]?.balance || 10;
  const maxEver  = bankrollAll.reduce((m, r) => Math.max(m, r.balance || 0), current);
  const drawdown = maxEver > 0 ? (maxEver - current) / maxEver : 0;

  let lossStreak = 0;
  for (const r of recentOutcomes) {
    if (r.outcome === "loss") lossStreak++;
    else break;
  }

  let status = "NORMAL";
  if (current < 5)       status = "PAUSED";
  else if (drawdown > 0.2) status = "DEFENSIVE";
  else if (lossStreak >= 3) status = "CONSERVATIVE";

  return { status, bankroll: current, maxEver, drawdown, lossStreak };
}

export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}
