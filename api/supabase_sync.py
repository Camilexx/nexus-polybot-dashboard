"""
NEXUS POLYBOT — SQLite -> Supabase Sync v1.0
Sincroniza trades.db local con Supabase para que el dashboard
desplegado en Vercel tenga datos reales.

Uso:
  - Desde daemon: cada 5 ciclos de scan
  - Manual: python -m api.supabase_sync
  - Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, DB_PATH
"""

import os
import json
import sqlite3
import requests
from datetime import datetime
from loguru import logger

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "polybot", "trades.db"))

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}


def _supa_post(table: str, rows: list[dict]) -> dict:
    """Upsert rows into Supabase table."""
    if not rows:
        return {"table": table, "upserted": 0}

    url = f"{SUPABASE_URL}/rest/v1/{table}"
    # Batch in chunks of 500
    total = 0
    for i in range(0, len(rows), 500):
        chunk = rows[i:i + 500]
        r = requests.post(url, headers=HEADERS, json=chunk, timeout=30)
        if r.status_code in (200, 201):
            total += len(chunk)
        else:
            logger.warning(f"Supabase upsert {table} error: {r.status_code} {r.text[:200]}")
    return {"table": table, "upserted": total}


def sync_trades() -> dict:
    """Sync all trades from SQLite to Supabase."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("""
        SELECT id, market_id, market_name, strategy, confianza, stake,
               ev, odds, outcome, pnl, brier_score, bankroll_post,
               created_at, league, our_prob, market_prob
        FROM trades
        ORDER BY id
    """).fetchall()
    conn.close()

    data = []
    for r in rows:
        d = dict(r)
        # Ensure JSON-safe values
        for k, v in d.items():
            if v is None:
                d[k] = None
        data.append(d)

    return _supa_post("trades", data)


def sync_bankroll() -> dict:
    """Sync bankroll history from SQLite to Supabase."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT id, balance, note, timestamp FROM bankroll ORDER BY id").fetchall()
    conn.close()
    return _supa_post("bankroll", [dict(r) for r in rows])


def sync_patterns() -> dict:
    """Sync patterns from SQLite to Supabase."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("""
            SELECT id, pattern_type, description, confidence,
                   sample_size, action_taken, still_valid, created_at
            FROM patterns
        """).fetchall()
        conn.close()
        return _supa_post("patterns", [dict(r) for r in rows])
    except Exception:
        conn.close()
        return {"table": "patterns", "upserted": 0}


def sync_all() -> dict:
    """Full sync: trades + bankroll + patterns."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {"error": "SUPABASE_URL and SUPABASE_SERVICE_KEY not configured"}

    results = {}
    results["trades"] = sync_trades()
    results["bankroll"] = sync_bankroll()
    results["patterns"] = sync_patterns()
    results["timestamp"] = datetime.now().isoformat()

    total = sum(r.get("upserted", 0) for r in results.values() if isinstance(r, dict))
    logger.info(f"Supabase sync complete: {total} total rows upserted")
    return results


def reload_config():
    """Reload all config from environment after dotenv is loaded."""
    global SUPABASE_URL, SUPABASE_KEY, DB_PATH, HEADERS
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
    HEADERS["apikey"] = SUPABASE_KEY
    HEADERS["Authorization"] = f"Bearer {SUPABASE_KEY}"
    # DB_PATH: prefer env var, then look relative to this file
    env_db = os.getenv("DB_PATH", "")
    if env_db and os.path.exists(env_db):
        DB_PATH = env_db
    else:
        # Walk up from api/ -> polybot_dashboard/ -> worktree root -> polybot/trades.db
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        candidate = os.path.join(root, "polybot", "trades.db")
        if os.path.exists(candidate):
            DB_PATH = candidate
        else:
            DB_PATH = os.path.join(os.path.dirname(__file__), "..", "polybot", "trades.db")


def sync_to_supabase(batch_size: int = 500) -> dict:
    """
    Alias público para sync_all().
    Acepta batch_size para compatibilidad con sync_loop.py.
    Lee DB_PATH desde os.getenv('DB_PATH') con fallback a 'polybot/trades.db'.
    """
    global DB_PATH
    env_db = os.getenv("DB_PATH", "")
    if env_db:
        DB_PATH = env_db
    elif not os.path.isabs(DB_PATH) and not os.path.exists(DB_PATH):
        DB_PATH = "polybot/trades.db"
    return sync_all()


if __name__ == "__main__":
    from dotenv import load_dotenv
    # Find .env: try worktree root first (two levels up from api/)
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    env_path = os.path.join(root, ".env")
    if os.path.exists(env_path):
        load_dotenv(env_path)
        print(f"Loaded .env from: {env_path}")
    else:
        load_dotenv()

    reload_config()
    print(f"DB_PATH: {DB_PATH} (exists: {os.path.exists(DB_PATH)})")
    print(f"SUPABASE_URL: {SUPABASE_URL[:40]}..." if SUPABASE_URL else "SUPABASE_URL: NOT SET")

    if not SUPABASE_URL:
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env")
    else:
        result = sync_all()
        print(json.dumps(result, indent=2))
