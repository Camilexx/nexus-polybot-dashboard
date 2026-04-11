"""
NEXUS POLYBOT Dashboard API — Dual Mode v2.0
FastAPI backend que lee datos de SQLite (local) o Supabase (produccion).

Modo local:  DB_PATH apunta a trades.db  |  USE_SUPABASE=false (default)
Modo prod:   SUPABASE_URL + SUPABASE_SERVICE_KEY  |  USE_SUPABASE=true

Columns: bankroll(id,timestamp,balance,note),
patterns(id,created_at,pattern_type,description,confidence,sample_size,action_taken,still_valid)
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import os
import requests
from datetime import datetime

app = FastAPI(title="NEXUS POLYBOT API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Config ---
DB_PATH = os.getenv("DB_PATH", "../polybot/trades.db")
USE_SUPABASE = os.getenv("USE_SUPABASE", "false").lower() in ("true", "1", "yes")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


# --- Data access layer ---

def get_db():
    """SQLite connection (local mode)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def supa_query(table: str, select: str = "*", params: dict = None) -> list[dict]:
    """Query Supabase REST API. Returns list of dicts."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    query_params = {"select": select}
    if params:
        query_params.update(params)
    r = requests.get(url, headers=headers, params=query_params, timeout=15)
    if r.ok:
        return r.json()
    return []


def supa_rpc(func_name: str, params: dict = None) -> any:
    """Call a Supabase RPC function."""
    url = f"{SUPABASE_URL}/rest/v1/rpc/{func_name}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    r = requests.post(url, headers=headers, json=params or {}, timeout=15)
    if r.ok:
        return r.json()
    return None


# --- Endpoints ---

@app.get("/api/summary")
def get_summary():
    if USE_SUPABASE:
        return _summary_supabase()
    return _summary_sqlite()


def _summary_sqlite():
    conn = get_db()
    total   = conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
    won     = conn.execute("SELECT COUNT(*) FROM trades WHERE outcome='win'").fetchone()[0]
    lost    = conn.execute("SELECT COUNT(*) FROM trades WHERE outcome='loss'").fetchone()[0]
    pending = conn.execute("SELECT COUNT(*) FROM trades WHERE outcome='pending'").fetchone()[0]
    skipped = conn.execute("SELECT COUNT(*) FROM trades WHERE outcome='skip'").fetchone()[0]
    pnl     = conn.execute("SELECT COALESCE(SUM(pnl),0) FROM trades WHERE pnl IS NOT NULL").fetchone()[0]
    bankroll = conn.execute("SELECT COALESCE(balance,10) FROM bankroll ORDER BY id DESC LIMIT 1").fetchone()
    brier   = conn.execute("SELECT COALESCE(AVG(brier_score),0) FROM trades WHERE brier_score IS NOT NULL AND brier_score > 0").fetchone()[0]
    best    = conn.execute("SELECT MAX(pnl) FROM trades WHERE outcome='win'").fetchone()[0]
    conn.close()
    win_rate = round(won / max(won + lost, 1) * 100, 1)
    return {
        "total":     total,
        "won":       won,
        "lost":      lost,
        "pending":   pending,
        "skipped":   skipped,
        "pnl":       round(pnl, 2),
        "bankroll":  round(bankroll[0] if bankroll else 10.0, 2),
        "win_rate":  win_rate,
        "brier":     round(brier, 4),
        "best_trade": round(best or 0, 2),
        "progress":  total,
        "target":    "infinite",
        "timestamp": datetime.now().isoformat(),
    }


def _summary_supabase():
    trades = supa_query("trades", "id,outcome,pnl,brier_score")
    total = len(trades)
    won = sum(1 for t in trades if t.get("outcome") == "win")
    lost = sum(1 for t in trades if t.get("outcome") == "loss")
    pending = sum(1 for t in trades if t.get("outcome") == "pending")
    skipped = sum(1 for t in trades if t.get("outcome") == "skip")
    pnl_vals = [t["pnl"] for t in trades if t.get("pnl") is not None]
    pnl = sum(pnl_vals) if pnl_vals else 0
    brier_vals = [t["brier_score"] for t in trades if t.get("brier_score") and t["brier_score"] > 0]
    brier = sum(brier_vals) / len(brier_vals) if brier_vals else 0
    win_pnls = [t["pnl"] for t in trades if t.get("outcome") == "win" and t.get("pnl")]
    best = max(win_pnls) if win_pnls else 0

    bankroll_rows = supa_query("bankroll", "balance", {"order": "id.desc", "limit": "1"})
    bankroll = bankroll_rows[0]["balance"] if bankroll_rows else 10.0

    win_rate = round(won / max(won + lost, 1) * 100, 1)
    return {
        "total":     total,
        "won":       won,
        "lost":      lost,
        "pending":   pending,
        "skipped":   skipped,
        "pnl":       round(pnl, 2),
        "bankroll":  round(bankroll, 2),
        "win_rate":  win_rate,
        "brier":     round(brier, 4),
        "best_trade": round(best, 2),
        "progress":  total,
        "target":    "infinite",
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/strategies")
def get_strategies():
    if USE_SUPABASE:
        return _strategies_supabase()
    return _strategies_sqlite()


def _strategies_sqlite():
    conn = get_db()
    rows = conn.execute("""
        SELECT strategy,
               COUNT(*) as total,
               SUM(CASE WHEN outcome='win' THEN 1 ELSE 0 END) as won,
               SUM(CASE WHEN outcome='loss' THEN 1 ELSE 0 END) as lost,
               COALESCE(AVG(CASE WHEN outcome IN ('win','loss') THEN brier_score END), 0) as brier,
               COALESCE(SUM(pnl), 0) as pnl,
               COALESCE(AVG(confianza), 0) as avg_conf,
               COALESCE(AVG(ev), 0) as avg_ev
        FROM trades
        GROUP BY strategy
        ORDER BY total DESC
    """).fetchall()
    conn.close()
    result = []
    for r in rows:
        total = r["total"]
        won   = r["won"] or 0
        lost  = r["lost"] or 0
        result.append({
            "strategy": r["strategy"],
            "total":    total,
            "won":      won,
            "lost":     lost,
            "win_rate": round(won / max(won + lost, 1) * 100, 1),
            "brier":    round(r["brier"] or 0, 4),
            "pnl":      round(r["pnl"] or 0, 2),
            "avg_conf": round(r["avg_conf"] or 0, 1),
            "avg_ev":   round(r["avg_ev"] or 0, 4),
        })
    return result


def _strategies_supabase():
    trades = supa_query("trades", "strategy,outcome,pnl,brier_score,confianza,ev")
    from collections import defaultdict
    strats = defaultdict(lambda: {"total": 0, "won": 0, "lost": 0, "pnl": 0,
                                   "brier_sum": 0, "brier_n": 0,
                                   "conf_sum": 0, "ev_sum": 0})
    for t in trades:
        s = t.get("strategy", "unknown")
        strats[s]["total"] += 1
        if t.get("outcome") == "win":
            strats[s]["won"] += 1
        if t.get("outcome") == "loss":
            strats[s]["lost"] += 1
        if t.get("pnl") is not None:
            strats[s]["pnl"] += t["pnl"]
        if t.get("brier_score") and t["brier_score"] > 0:
            strats[s]["brier_sum"] += t["brier_score"]
            strats[s]["brier_n"] += 1
        strats[s]["conf_sum"] += (t.get("confianza") or 0)
        strats[s]["ev_sum"] += (t.get("ev") or 0)

    result = []
    for name, d in sorted(strats.items(), key=lambda x: -x[1]["total"]):
        won = d["won"]
        lost = d["lost"]
        total = d["total"]
        result.append({
            "strategy": name,
            "total":    total,
            "won":      won,
            "lost":     lost,
            "win_rate": round(won / max(won + lost, 1) * 100, 1),
            "brier":    round(d["brier_sum"] / max(d["brier_n"], 1), 4),
            "pnl":      round(d["pnl"], 2),
            "avg_conf": round(d["conf_sum"] / max(total, 1), 1),
            "avg_ev":   round(d["ev_sum"] / max(total, 1), 4),
        })
    return result


@app.get("/api/trades/recent")
def get_recent_trades(limit: int = 50):
    if USE_SUPABASE:
        rows = supa_query("trades",
                          "id,market_name,strategy,confianza,stake,ev,odds,outcome,pnl,created_at,league",
                          {"order": "id.desc", "limit": str(limit)})
        return rows
    conn = get_db()
    rows = conn.execute("""
        SELECT id, market_name, strategy, confianza, stake,
               ev, odds, outcome, pnl, created_at, league
        FROM trades
        ORDER BY id DESC
        LIMIT ?
    """, (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/trades/timeline")
def get_timeline():
    if USE_SUPABASE:
        trades = supa_query("trades", "created_at,outcome,pnl")
        from collections import defaultdict
        hours = defaultdict(lambda: {"trades": 0, "won": 0, "pnl": 0})
        for t in trades:
            ca = t.get("created_at") or ""
            if len(ca) >= 13:
                h = ca[11:13] + ":00"
            else:
                continue
            hours[h]["trades"] += 1
            if t.get("outcome") == "win":
                hours[h]["won"] += 1
            hours[h]["pnl"] += (t.get("pnl") or 0)
        return [{"hour": h, **d} for h, d in sorted(hours.items())]

    conn = get_db()
    rows = conn.execute("""
        SELECT
            COALESCE(strftime('%H:00', created_at), strftime('%H:00', timestamp)) as hour,
            COUNT(*) as trades,
            COALESCE(SUM(CASE WHEN outcome='win' THEN 1 ELSE 0 END), 0) as won,
            COALESCE(SUM(pnl), 0) as pnl
        FROM trades
        WHERE created_at IS NOT NULL OR timestamp IS NOT NULL
        GROUP BY hour
        ORDER BY hour
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/bankroll/history")
def get_bankroll_history():
    if USE_SUPABASE:
        rows = supa_query("bankroll", "id,balance,note,timestamp",
                          {"order": "id.desc", "limit": "100"})
        return list(reversed(rows))
    conn = get_db()
    rows = conn.execute("""
        SELECT id, balance, note, timestamp
        FROM bankroll
        ORDER BY id DESC
        LIMIT 100
    """).fetchall()
    conn.close()
    return [dict(r) for r in reversed(rows)]


@app.get("/api/patterns")
def get_patterns():
    if USE_SUPABASE:
        return supa_query("patterns",
                          "id,pattern_type,description,confidence,sample_size,action_taken,still_valid,created_at",
                          {"still_valid": "eq.1", "order": "confidence.desc", "limit": "20"})
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT id, pattern_type, description, confidence,
                   sample_size, action_taken, still_valid, created_at
            FROM patterns
            WHERE still_valid = 1
            ORDER BY confidence DESC
            LIMIT 20
        """).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception:
        conn.close()
        return []


@app.get("/api/sync/status")
def sync_status():
    """Check Supabase sync status."""
    return {
        "mode": "supabase" if USE_SUPABASE else "sqlite",
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_KEY),
        "db_path": DB_PATH if not USE_SUPABASE else None,
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/health")
def health():
    return {"status": "ok", "mode": "supabase" if USE_SUPABASE else "sqlite",
            "timestamp": datetime.now().isoformat()}
