"""
NEXUS POLYBOT Dashboard API
FastAPI backend que lee trades.db en tiempo real.
Columns match actual DB schema: bankroll(id,timestamp,balance,note),
patterns(id,created_at,pattern_type,description,confidence,sample_size,action_taken,still_valid)
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import os
from datetime import datetime

app = FastAPI(title="NEXUS POLYBOT API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.getenv("DB_PATH", "../polybot/trades.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@app.get("/api/summary")
def get_summary():
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
        "progress":  round(total / 5000 * 100, 1),
        "target":    5000,
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/strategies")
def get_strategies():
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


@app.get("/api/trades/recent")
def get_recent_trades(limit: int = 50):
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


@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}
