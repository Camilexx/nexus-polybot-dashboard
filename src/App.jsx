import { useState, useEffect, useCallback, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Activity, TrendingUp, Target, Zap, DollarSign,
  RefreshCw, CheckCircle, XCircle, Clock, AlertCircle,
  Cpu, BarChart2, ArrowUpRight, Flame, Eye, Shield,
  AlertTriangle, BookOpen, Award, Filter,
  ExternalLink, GitBranch, Database,
} from "lucide-react";
import {
  fetchSummary, fetchStrategies, fetchRecentTrades,
  fetchTimeline, fetchBankrollHistory, fetchPatterns,
  fetchRiskStatus, isConfigured,
} from "./supabase";

/* ─── Constants ─────────────────────────────────────── */
const REFRESH = 15000;
const LIVE_TARGET = { resolved: 150, wr: 65, brier: 0.25 };

const C = {
  orange: "#E8650A", green: "#00D4AA", red: "#FF4455",
  blue: "#3B82F6", purple: "#8B5CF6", yellow: "#F59E0B",
  dim: "#6B6A7A", border: "rgba(255,255,255,0.06)", card: "#0D0D0D",
  bg: "#050505", text: "#E8E8F0",
};

const STRAT_COLORS = {
  momentum: C.blue, value_bet: C.orange, negrisk_arb: C.green,
  binary_arb: C.purple, general: "#4A4A5A",
  corners_1h: C.yellow, tarjetas: "#EC4899",
};

const RISK_MAP = {
  NORMAL:       { color: C.green,  bg: "bg-[#00D4AA]/8",  border: "border-[#00D4AA]/20", label: "NORMAL",       icon: CheckCircle },
  DEFENSIVE:    { color: C.yellow, bg: "bg-[#F59E0B]/8",  border: "border-[#F59E0B]/20", label: "DEFENSIVE",    icon: AlertTriangle },
  CONSERVATIVE: { color: C.orange, bg: "bg-[#E8650A]/8",  border: "border-[#E8650A]/20", label: "CONSERVATIVE", icon: Shield },
  PAUSED:       { color: C.red,    bg: "bg-[#FF4455]/8",  border: "border-[#FF4455]/20", label: "PAUSED",       icon: XCircle },
};

/* ─── Utilities ──────────────────────────────────────── */
function getRelativeTime(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/* ─── useAsync hook ──────────────────────────────────── */
function useAsync(fn, interval = REFRESH) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [ts, setTs]           = useState(null);

  const run = useCallback(async () => {
    try {
      setData(await fn());
      setTs(new Date());
      setError(null);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [fn]);

  useEffect(() => {
    run();
    const id = setInterval(run, interval);
    return () => clearInterval(id);
  }, [run, interval]);

  return { data, loading, error, ts, refetch: run };
}

/* ─── Animated counter ───────────────────────────────── */
function Counter({ value, prefix = "", suffix = "", dec = 0 }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const target = Number(value) || 0;
    const delta = target - n;
    if (Math.abs(delta) < 0.005) { setN(target); return; }
    const step = delta / 20;
    const id = setInterval(() => {
      setN(prev => {
        const next = prev + step;
        if (Math.abs(next - target) < Math.abs(step)) { clearInterval(id); return target; }
        return next;
      });
    }, 16);
    return () => clearInterval(id);
  }, [value]); // eslint-disable-line
  return <>{prefix}{n.toFixed(dec)}{suffix}</>;
}

/* ─── Countdown to next refresh ─────────────────────── */
function Countdown({ interval = REFRESH }) {
  const [ms, setMs] = useState(interval);
  useEffect(() => {
    setMs(interval);
    const id = setInterval(() => setMs(p => p <= 100 ? interval : p - 100), 100);
    return () => clearInterval(id);
  }, [interval]);
  return <span className="font-mono text-[#6B6A7A] text-[10px]">{(ms / 1000).toFixed(0)}s</span>;
}

/* ─── Brier Score SVG Gauge ──────────────────────────── */
function BrierGauge({ value = 0 }) {
  const CX = 100, CY = 100, R = 68;
  const START = 135, SPAN = 270, MAX = 0.50;
  const norm = Math.min(Math.max(value / MAX, 0), 1);

  const polar = (deg) => {
    const rad = (deg * Math.PI) / 180;
    return [+(CX + R * Math.cos(rad)).toFixed(2), +(CY + R * Math.sin(rad)).toFixed(2)];
  };

  const [sx, sy] = polar(START);
  const [ex, ey] = polar(START + SPAN);
  const fillEnd   = START + SPAN * norm;
  const [fx, fy]  = polar(fillEnd);
  const fillLarge = (SPAN * norm) > 180 ? 1 : 0;

  const NR  = 52;
  const nRad = (fillEnd * Math.PI) / 180;
  const nx  = +(CX + NR * Math.cos(nRad)).toFixed(2);
  const ny  = +(CY + NR * Math.sin(nRad)).toFixed(2);

  const tickDeg = START + SPAN * (0.25 / MAX);
  const [ti1x, ti1y] = polar(tickDeg);
  const ti2R = R - 14;
  const ti2x = +(CX + ti2R * Math.cos(tickDeg * Math.PI / 180)).toFixed(2);
  const ti2y = +(CY + ti2R * Math.sin(tickDeg * Math.PI / 180)).toFixed(2);

  const color = value < 0.25 ? "#00D4AA" : value < 0.35 ? "#F59E0B" : "#FF4455";
  const label = value < 0.25 ? "CALIBRADO" : value < 0.35 ? "MEJORANDO" : "CALIBRANDO";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 22 200 150" fill="none" xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", maxWidth: 148 }}>
        <path d={`M ${sx} ${sy} A ${R} ${R} 0 1 1 ${ex} ${ey}`}
          stroke="#1C1C2A" strokeWidth={7} strokeLinecap="round" />
        {norm > 0.005 && (
          <path d={`M ${sx} ${sy} A ${R} ${R} 0 ${fillLarge} 1 ${fx} ${fy}`}
            stroke={color} strokeWidth={7} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 5px ${color}70)`, transition: "all 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
        )}
        <line x1={ti1x} y1={ti1y} x2={ti2x} y2={ti2y}
          stroke="#00D4AA" strokeWidth={1.5} opacity={0.45} />
        <line x1={CX} y1={CY} x2={nx} y2={ny}
          stroke={color} strokeWidth={1.5} strokeLinecap="round"
          style={{ transition: "all 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
        <circle cx={CX} cy={CY} r={5} fill={color} opacity={0.25} />
        <circle cx={CX} cy={CY} r={3} fill={color} />
        <circle cx={CX} cy={CY} r={1.2} fill="#050505" />
        <text x={CX} y={CY - 8} textAnchor="middle"
          fontFamily="'JetBrains Mono',monospace" fontSize={19} fontWeight={700} fill={color}>
          {value.toFixed(4)}
        </text>
        <text x={CX} y={CY + 10} textAnchor="middle"
          fontFamily="'DM Sans',sans-serif" fontSize={7} fill="#6B6A7A" letterSpacing="0.08em">
          {label}
        </text>
        <text x={CX} y={CY + 20} textAnchor="middle"
          fontFamily="'DM Sans',sans-serif" fontSize={6} fill="#3A3A4A" letterSpacing="0.06em">
          META &lt; 0.25
        </text>
      </svg>
    </div>
  );
}

/* ─── StatBox (used in StrategyCard) ────────────────── */
function StatBox({ label, value, color, mono = false }) {
  const textColor = color === "green" ? "#00D4AA"
    : color === "red"    ? "#FF4455"
    : color === "orange" ? "#E8650A"
    : "#C0C0D0";
  return (
    <div className="stat-box">
      <span className="stat-box-value"
        style={{ color: textColor, fontFamily: mono ? "'JetBrains Mono',monospace" : undefined }}>
        {value}
      </span>
      <span className="stat-box-label">{label}</span>
    </div>
  );
}

/* ─── StatusBadge ────────────────────────────────────── */
function StatusBadge({ status }) {
  const color = status === "DOMINANTE" ? "#00D4AA"
    : status === "CALIBRANDO" ? "#E8650A"
    : "#3A3A4A";
  return (
    <span className="font-mono text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border"
      style={{ color, background: `${color}12`, borderColor: `${color}28` }}>
      {status}
    </span>
  );
}

/* ─── Strategy Card ──────────────────────────────────── */
function StrategyCard({ strategy, rank }) {
  const isDominant    = strategy.resolved > 0 && strategy.wr > 60 && strategy.pnl > 0 && strategy.resolved >= 10;
  const isCalibrating = strategy.resolved > 0 && (!isDominant);
  const statusLabel   = isDominant ? "DOMINANTE" : isCalibrating ? "CALIBRANDO" : "SIN DATOS";

  return (
    <div className={`strategy-card ${isDominant ? "dominant" : isCalibrating ? "calibrating" : "inactive"}`}>

      {/* Header */}
      <div className="strat-header">
        <div className="strat-name-group">
          <span className="strat-rank">#{rank}</span>
          <span className="strat-name" style={{ color: STRAT_COLORS[strategy.raw] || C.dim }}>
            {strategy.name}
          </span>
        </div>
        <StatusBadge status={statusLabel} />
      </div>

      {/* WR — main metric */}
      <div className="strat-wr-section">
        <div className="strat-wr-number"
          style={{ color: strategy.wr >= 65 ? "#00D4AA" : strategy.wr >= 45 ? "#E8650A" : "#FF4455" }}>
          {strategy.resolved > 0 ? `${strategy.wr.toFixed(1)}%` : "—"}
        </div>
        <div className="strat-wr-bar">
          <div className="strat-wr-fill"
            style={{
              width: `${Math.min(strategy.wr, 100)}%`,
              background: strategy.wr >= 65 ? "#00D4AA" : strategy.wr >= 45 ? "#E8650A" : "#FF4455",
            }} />
        </div>
        <span className="strat-wr-label">WIN RATE</span>
      </div>

      {/* Stats grid 2×3 */}
      <div className="strat-stats">
        <StatBox label="TRADES"    value={strategy.total.toLocaleString()} mono />
        <StatBox label="RESUELTOS" value={strategy.resolved} mono />
        <StatBox label="PNL"       value={`${strategy.pnl >= 0 ? "+" : ""}$${strategy.pnl.toFixed(2)}`}
          color={strategy.pnl >= 0 ? "green" : "red"} mono />
        <StatBox label="AVG EV"    value={strategy.avgEv ? strategy.avgEv.toFixed(4) : "—"} mono />
        <StatBox label="BRIER"     value={strategy.brier > 0 ? strategy.brier.toFixed(4) : "—"}
          color={strategy.brier < 0.2 ? "green" : strategy.brier < 0.35 ? "orange" : "red"} mono />
        <StatBox label="CONFIANZA" value={strategy.avgConf ? `${strategy.avgConf.toFixed(0)}%` : "—"} mono />
      </div>

      {/* Insight */}
      {isDominant && (
        <div className="strat-insight dominant-insight">
          ⚡ Edge confirmado — usar para live trading
        </div>
      )}
      {strategy.resolved === 0 && (
        <div className="strat-insight inactive-insight">
          ⏳ Sin resoluciones reales — no activar con capital
        </div>
      )}
    </div>
  );
}

/* ─── Strategy Section ───────────────────────────────── */
function StrategyTable({ strats }) {
  const strategies = (strats || []).map(s => ({
    raw:      s.strategy,
    name:     (s.strategy || "").replace(/_/g, " ").toUpperCase(),
    total:    s.total    || 0,
    resolved: s.resolved || 0,
    wr:       s.win_rate || 0,
    pnl:      s.pnl      || 0,
    avgEv:    s.avg_ev   || 0,
    brier:    s.brier    || 0,
    avgConf:  s.avg_conf || 0,
  }));

  return (
    <div className="strategy-section">
      <div className="section-header">
        <div>
          <span className="section-title">STRATEGY PERFORMANCE</span>
          <span className="section-meta">Análisis cuantitativo en tiempo real</span>
        </div>
        <span className="text-[9px] font-mono text-[#3A3A5A]">{strategies.length} estrategias</span>
      </div>
      <div className="strategy-grid">
        {strategies.map((s, i) => <StrategyCard key={i} strategy={s} rank={i + 1} />)}
      </div>
    </div>
  );
}

/* ─── Trade Row (v4.1) ───────────────────────────────── */
function TradeRow({ trade, isNew = false }) {
  const outcomeConfig = {
    win:     { icon: "✓", color: "#00D4AA", bg: "rgba(0,212,170,0.12)",  label: "WIN"  },
    loss:    { icon: "✗", color: "#FF4455", bg: "rgba(255,68,85,0.12)",   label: "LOSS" },
    pending: { icon: "◐", color: "#E8650A", bg: "rgba(232,101,10,0.10)",  label: "LIVE" },
    skipped: { icon: "—", color: "#333",    bg: "transparent",            label: "SKIP" },
    skip:    { icon: "—", color: "#333",    bg: "transparent",            label: "SKIP" },
  };
  const oc         = outcomeConfig[trade.outcome] || outcomeConfig.skipped;
  const stratColor = STRAT_COLORS[trade.strategy] || C.dim;

  return (
    <div className={`trade-row ${isNew ? "trade-row-new" : ""} ${trade.outcome || "skip"}`}>
      {/* Outcome dot */}
      <div className="trade-outcome-dot" style={{ background: oc.bg, color: oc.color }}>
        <span className={trade.outcome === "pending" ? "pulse-icon" : ""}>{oc.icon}</span>
      </div>

      {/* Main info */}
      <div className="trade-main">
        <div className="trade-strat-badge" style={{ color: stratColor }}>
          {trade.strategy?.replace(/_/g, " ").toUpperCase()}
        </div>
        <div className="trade-market">{trade.market_name}</div>
        <div className="trade-meta">
          <span className="trade-conf">{trade.confianza?.toFixed(0)}% conf</span>
          {trade.ev != null && (
            <span className="trade-ev" style={{ color: trade.ev > 0 ? "#00D4AA" : "#FF4455" }}>
              EV {trade.ev?.toFixed(3)}
            </span>
          )}
          <span className="trade-time">{getRelativeTime(trade.created_at)}</span>
        </div>
      </div>

      {/* Value */}
      <div className="trade-value">
        {trade.outcome === "win" && (
          <span className="trade-pnl win">+${trade.pnl?.toFixed(2)}</span>
        )}
        {trade.outcome === "loss" && (
          <span className="trade-pnl loss">-${Math.abs(trade.pnl || trade.stake || 0).toFixed(2)}</span>
        )}
        {trade.outcome === "pending" && (
          <span className="trade-stake">${trade.stake?.toFixed(2)}</span>
        )}
        {(trade.outcome === "skipped" || trade.outcome === "skip") && (
          <span className="trade-skip">SKIP</span>
        )}
      </div>
    </div>
  );
}

/* ─── Live Feed ──────────────────────────────────────── */
function LiveFeed({ trades }) {
  const [filter, setFilter] = useState("ALL");
  const FILTERS = ["ALL", "WIN", "LOSS", "PENDING", "NEGRISK"];

  // Track new IDs across renders
  const seenIds = useRef(new Set());
  useEffect(() => {
    if (trades) trades.forEach(t => seenIds.current.add(t.id));
  }, []); // eslint-disable-line

  const isNew = (t) => t.id && !seenIds.current.has(t.id);

  useEffect(() => {
    if (trades) trades.forEach(t => seenIds.current.add(t.id));
  }, [trades]);

  const filtered = (trades || []).filter(t => {
    if (filter === "ALL")     return true;
    if (filter === "WIN")     return t.outcome === "win";
    if (filter === "LOSS")    return t.outcome === "loss";
    if (filter === "PENDING") return t.outcome === "pending";
    if (filter === "NEGRISK") return t.strategy === "negrisk_arb";
    return true;
  }).slice(0, 40);

  return (
    <div className="card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[rgba(255,255,255,0.05)]">
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-[#E8650A]" />
          <p className="text-[11px] font-bold uppercase tracking-[0.12em]">Live Feed</p>
          <div className="flex items-center gap-1.5 ml-1 px-2 py-0.5 rounded-full bg-[#00D4AA]/6 border border-[#00D4AA]/12">
            <div className="live-dot" style={{ width: 5, height: 5 }} />
            <span className="text-[8px] font-bold text-[#00D4AA] uppercase tracking-wider">Live</span>
          </div>
        </div>
        <span className="text-[9px] font-mono text-[#3A3A5A]">{(trades || []).length} trades</span>
      </div>

      {/* Filter tabs */}
      <div className="trade-filters">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`filter-btn ${filter === f ? "active" : ""}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto" style={{ maxHeight: 480 }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-[#3A3A5A]">
            <Clock size={22} strokeWidth={1.5} />
            <p className="text-[11px]">Sin trades para este filtro</p>
          </div>
        ) : filtered.map((t, i) => <TradeRow key={t.id || i} trade={t} isNew={isNew(t)} />)}
      </div>
    </div>
  );
}

/* ─── Stat card ──────────────────────────────────────── */
const ACCENT = {
  orange: { text: "text-[#E8650A]", bg: "bg-[#E8650A]/8",  border: "border-[#E8650A]/15" },
  green:  { text: "text-[#00D4AA]", bg: "bg-[#00D4AA]/8",  border: "border-[#00D4AA]/15" },
  red:    { text: "text-[#FF4455]", bg: "bg-[#FF4455]/8",  border: "border-[#FF4455]/15" },
  blue:   { text: "text-[#3B82F6]", bg: "bg-[#3B82F6]/8",  border: "border-[#3B82F6]/15" },
  purple: { text: "text-[#8B5CF6]", bg: "bg-[#8B5CF6]/8",  border: "border-[#8B5CF6]/15" },
  yellow: { text: "text-[#F59E0B]", bg: "bg-[#F59E0B]/8",  border: "border-[#F59E0B]/15" },
};

function HeroCard({ icon: Icon, label, value, sub, color = "orange", prefix = "", suffix = "", dec = 0, pulse = false }) {
  const a = ACCENT[color] || ACCENT.orange;
  return (
    <div className={`card p-5 flex flex-col gap-3 ${pulse ? "glow-pulse" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-[#6B6A7A] uppercase tracking-[0.14em]">{label}</span>
        <div className={`${a.bg} ${a.border} border p-1.5 rounded-lg`}>
          <Icon size={12} className={a.text} strokeWidth={2.5} />
        </div>
      </div>
      <p className={`font-display leading-none ${a.text}`} style={{ fontSize: 34 }}>
        <Counter value={value} prefix={prefix} suffix={suffix} dec={dec} />
      </p>
      {sub && <span className="text-[10px] text-[#6B6A7A] font-medium">{sub}</span>}
    </div>
  );
}

/* ─── Live Criteria Panel ────────────────────────────── */
function LiveCriteriaPanel({ s }) {
  const resolved = (s?.won || 0) + (s?.lost || 0);
  const wr       = s?.win_rate || 0;
  const pnl      = s?.pnl || 0;
  const brier    = s?.brier || 1;

  const criteria = [
    { label: "Win Rate > 65%",     ok: wr >= LIVE_TARGET.wr,              current: `${wr.toFixed(1)}%`,  target: "65%" },
    { label: "PnL positivo",       ok: pnl > 0,                           current: `$${pnl.toFixed(2)}`, target: "$0" },
    { label: "Resueltos ≥ 150",    ok: resolved >= LIVE_TARGET.resolved,  current: `${resolved}`,        target: "150" },
    { label: "Brier Score < 0.25", ok: brier < LIVE_TARGET.brier,         current: brier.toFixed(4),     target: "0.25" },
  ];

  const passed = criteria.filter(c => c.ok).length;
  const pct    = Math.round((passed / criteria.length) * 100);
  const allOk  = passed === criteria.length;

  return (
    <div className={`card p-5 space-y-4 ${allOk ? "glow-green" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-[#E8650A]" />
          <span className="text-[11px] font-bold uppercase tracking-[0.14em]">PAPER → LIVE TRADING</span>
        </div>
        <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border
          ${allOk ? "text-[#00D4AA] bg-[#00D4AA]/8 border-[#00D4AA]/20" : "text-[#E8650A] bg-[#E8650A]/8 border-[#E8650A]/20"}`}>
          {passed}/{criteria.length} criterios
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-[#6B6A7A] font-medium">Progreso general</span>
          <span className="text-[11px] font-bold font-mono" style={{ color: allOk ? C.green : C.orange }}>{pct}%</span>
        </div>
        <div className="h-2 bg-[#1A1A26] rounded-full overflow-hidden">
          <div className="h-full rounded-full progress-bar"
            style={{ width: `${pct}%`, background: allOk ? C.green : C.orange }} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {criteria.map((c, i) => (
          <div key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors
            ${c.ok ? "bg-[#00D4AA]/5 border-[#00D4AA]/12" : "bg-[#1A1A26]/40 border-[rgba(255,255,255,0.05)]"}`}>
            {c.ok
              ? <CheckCircle key="ok" size={13} className="text-[#00D4AA] shrink-0 animate-check" strokeWidth={2.5} />
              : <XCircle     key="no" size={13} className="text-[#FF4455] shrink-0" strokeWidth={2.5} />}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-[#C0C0D0] truncate">{c.label}</p>
              <p className="text-[10px] font-mono" style={{ color: c.ok ? C.green : "#6B6A7A" }}>
                {c.current} <span className="text-[#3A3A4A]">/ {c.target}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
      {allOk && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#00D4AA]/10 border border-[#00D4AA]/25">
          <Award size={14} className="text-[#00D4AA]" />
          <span className="text-[11px] font-bold text-[#00D4AA]">LISTO PARA LIVE TRADING CON $20</span>
        </div>
      )}
    </div>
  );
}

/* ─── Risk Panel ─────────────────────────────────────── */
function RiskPanel({ risk }) {
  const r  = risk || { status: "NORMAL", bankroll: 10, drawdown: 0, lossStreak: 0 };
  const rm = RISK_MAP[r.status] || RISK_MAP.NORMAL;
  const Icon = rm.icon;

  return (
    <div className={`card p-5 space-y-4 border ${rm.border}`}>
      <div className="flex items-center gap-2">
        <Shield size={14} style={{ color: rm.color }} />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em]">Risk Manager</span>
      </div>
      <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${rm.bg} border ${rm.border}`}>
        <Icon size={18} style={{ color: rm.color }} strokeWidth={2} />
        <div>
          <p className="font-display text-[16px]" style={{ color: rm.color }}>{rm.label}</p>
          <p className="text-[10px] text-[#6B6A7A] font-medium">Modo actual de operación</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Bankroll",    val: `$${(r.bankroll || 0).toFixed(2)}`,               color: C.green },
          { label: "Max ever",    val: `$${(r.maxEver || r.bankroll || 10).toFixed(2)}`, color: C.blue },
          { label: "Drawdown",    val: `${((r.drawdown || 0) * 100).toFixed(1)}%`,       color: r.drawdown > 0.2 ? C.red : C.dim },
          { label: "Loss streak", val: r.lossStreak || 0,                                color: (r.lossStreak || 0) >= 3 ? C.red : C.dim },
        ].map(m => (
          <div key={m.label} className="bg-[#080808] rounded-lg p-2.5 text-center border border-[rgba(255,255,255,0.04)]">
            <p className="text-[14px] font-bold font-mono" style={{ color: m.color }}>{m.val}</p>
            <p className="text-[9px] text-[#6B6A7A] uppercase tracking-wider mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>
      <div>
        <div className="flex justify-between text-[9px] text-[#6B6A7A] mb-1">
          <span>Drawdown desde máximo</span>
          <span className="font-mono">{((r.drawdown || 0) * 100).toFixed(1)}% / 20%</span>
        </div>
        <div className="h-1.5 bg-[#1A1A26] rounded-full overflow-hidden">
          <div className="h-full rounded-full progress-bar"
            style={{ width: `${Math.min((r.drawdown || 0) * 100 / 20, 100)}%`,
              background: r.drawdown > 0.2 ? C.red : r.drawdown > 0.1 ? C.yellow : C.green }} />
        </div>
      </div>
    </div>
  );
}

/* ─── Self-Improvement Log (v4.1) ────────────────────── */
function SelfImprovementLog({ patterns }) {
  const typeConfig = {
    CALIBRATION_UNDERCONFIDENT: {
      icon: "📈", color: "#00D4AA",
      label: "SUBESTIMA",   short: "Subiendo stakes en rango de confianza",
    },
    CALIBRATION_OVERCONFIDENT: {
      icon: "📉", color: "#FF4455",
      label: "SOBREESTIMA", short: "Bajando stakes en rango de confianza",
    },
    STRATEGY_FLAGGED: {
      icon: "🚩", color: "#E8650A",
      label: "ESTRATEGIA",  short: "Revisión requerida",
    },
    PATTERN_FOUND: {
      icon: "🔍", color: "#8B5CF6",
      label: "PATRÓN",      short: "Nuevo patrón detectado",
    },
  };

  const pts = patterns || [];

  return (
    <div className="improvement-panel">
      <div className="section-header">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="section-title">SELF-IMPROVEMENT</span>
            <span className="improvement-badge">{pts.length} ajustes</span>
          </div>
          <span className="section-meta">Motor de autoaprendizaje</span>
        </div>
      </div>

      {pts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <div className="text-2xl">🧠</div>
          <div className="text-[12px] text-[#555]">Analizando patrones...</div>
          <div className="text-[10px] text-[#333] font-mono">El motor mejora cada 500 trades resueltos</div>
        </div>
      ) : (
        <div className="improvement-list">
          {pts.slice(0, 8).map((p, i) => {
            const cfg = typeConfig[p.pattern_type] || typeConfig.PATTERN_FOUND;
            return (
              <div key={i} className="improvement-item" style={{ "--accent": cfg.color }}>
                <div className="improvement-icon">{cfg.icon}</div>
                <div className="improvement-body">
                  <div className="improvement-type" style={{ color: cfg.color }}>{cfg.label}</div>
                  <div className="improvement-desc">{p.description || cfg.short}</div>
                  <div className="improvement-meta">
                    <span className="improvement-league">{p.league || "Global"}</span>
                    {p.confidence && (
                      <span className="improvement-conf">
                        {(p.confidence * 100).toFixed(0)}% conf
                      </span>
                    )}
                    <span className="improvement-sample">n={p.sample_size || "?"}</span>
                  </div>
                </div>
                <div className="improvement-action">
                  <span className="action-badge"
                    style={{ background: `${cfg.color}15`, color: cfg.color, border: `1px solid ${cfg.color}30` }}>
                    {p.action_taken || "APLICADO"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="improvement-footer">
        <div className="motor-status">
          <div className="live-dot" style={{ width: 5, height: 5, background: "#8B5CF6",
            animation: "dblRing 2.4s ease-out infinite",
            boxShadow: "none" }} />
          <span>Motor activo</span>
        </div>
        <div className="motor-stat">
          Ciclo: <strong>500 trades</strong>
        </div>
      </div>
    </div>
  );
}

/* ─── Chart tooltip ──────────────────────────────────── */
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#18182A] border border-[rgba(255,255,255,0.08)] rounded-xl p-3 shadow-2xl text-[10px] font-mono min-w-[120px]">
      <p className="text-[#6B6A7A] font-semibold mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex justify-between gap-4" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span className="font-bold">{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

/* ─── Unconfigured ───────────────────────────────────── */
function Unconfigured() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: C.bg }}>
      <div className="card p-10 max-w-md w-full text-center space-y-5">
        <Cpu size={40} className="text-[#E8650A] mx-auto" strokeWidth={1.5} />
        <h1 className="font-display text-2xl uppercase tracking-widest text-[#E8E8F0]">NEXUS POLYBOT</h1>
        <p className="text-sm text-[#6B6A7A] leading-relaxed">Configure las variables de entorno en Vercel.</p>
        <div className="bg-[#080808] rounded-xl p-4 text-left font-mono text-[11px] text-[#E8650A] space-y-1.5 border border-[rgba(255,255,255,0.06)]">
          <p>VITE_SUPABASE_URL=https://xxx.supabase.co</p>
          <p>VITE_SUPABASE_ANON_KEY=sb_publishable_...</p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN APP — v4.1
   ══════════════════════════════════════════════════════ */
export default function App() {
  const { data: s,      ts, refetch, error } = useAsync(fetchSummary);
  const { data: strats }                     = useAsync(fetchStrategies);
  const { data: trades }                     = useAsync(fetchRecentTrades);
  const { data: timeline }                   = useAsync(fetchTimeline);
  const { data: bankroll }                   = useAsync(fetchBankrollHistory);
  const { data: patterns }                   = useAsync(fetchPatterns);
  const { data: risk }                       = useAsync(fetchRiskStatus);

  const [spinKey, setSpinKey] = useState(0);
  const handleRefresh = () => { setSpinKey(k => k + 1); refetch(); };

  if (!isConfigured()) return <Unconfigured />;

  const resolved    = (s?.won || 0) + (s?.lost || 0);
  const total       = s?.total || 0;
  const pnlPositive = (s?.pnl || 0) >= 0;

  return (
    <div className="min-h-screen text-[#E8E8F0]" style={{ background: C.bg }}>
      <div className="scanline" />

      {/* ══ HEADER ══ */}
      <header className="sticky top-0 z-50 border-b border-[rgba(255,255,255,0.05)]"
        style={{ background: "rgba(5,5,5,0.97)", backdropFilter: "blur(14px)" }}>
        <div className="max-w-[1600px] mx-auto px-6 h-13 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Cpu size={15} className="text-[#E8650A]" strokeWidth={2} />
              <span className="font-display text-[15px] tracking-[0.22em] text-[#E8650A]">NEXUS</span>
              <span className="font-display text-[15px] tracking-[0.22em]">POLYBOT</span>
            </div>
            <div className="h-4 w-px bg-[rgba(255,255,255,0.06)]" />
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00D4AA]/6 border border-[#00D4AA]/15">
              <div className="live-dot" />
              <span className="text-[9px] font-bold text-[#00D4AA] uppercase tracking-[0.15em]">Paper Mode</span>
            </div>
            <div className="hidden sm:flex items-center px-2.5 py-1 rounded-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)]">
              <span className="text-[9px] font-semibold text-[#6B6A7A] uppercase tracking-wider">v4.1</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {error && (
              <span className="text-[9px] font-semibold text-[#FF4455] bg-[#FF4455]/8 px-2 py-1 rounded-lg border border-[#FF4455]/15">
                ERR: {error.slice(0, 30)}
              </span>
            )}
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="text-[9px] text-[#6B6A7A]">Refresh en</span>
              <Countdown />
            </div>
            <span className="text-[10px] text-[#6B6A7A] font-mono hidden sm:block">
              {ts ? ts.toLocaleTimeString() : "—"}
            </span>
            <button onClick={handleRefresh}
              className="w-7 h-7 rounded-lg border border-[rgba(255,255,255,0.06)] flex items-center justify-center
                hover:border-[#E8650A]/40 hover:bg-[#E8650A]/5 transition-all active:scale-95">
              <RefreshCw key={spinKey} size={11} className="text-[#6B6A7A] spin-once" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-5 space-y-4">

        {/* ══ HERO ROW ══ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 animate-fade-up">

          {/* Bankroll — 64px Barlow Condensed */}
          <div className="card p-4 xl:col-span-1 flex flex-col gap-2 glow-orange">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-[#6B6A7A] uppercase tracking-[0.14em]">Bankroll</span>
              <div className="bg-[#E8650A]/8 border border-[#E8650A]/15 p-1.5 rounded-lg">
                <DollarSign size={11} className="text-[#E8650A]" strokeWidth={2.5} />
              </div>
            </div>
            <p className="font-display leading-none tracking-tight text-[#E8650A]" style={{ fontSize: 64 }}>
              <Counter value={s?.bankroll || 10} prefix="$" dec={2} />
            </p>
            <p className="text-[10px] text-[#6B6A7A]">desde $10.00 inicial</p>
          </div>

          {/* PnL */}
          <div className={`card p-4 flex flex-col gap-2 ${pnlPositive ? "glow-green" : ""}`}>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-[#6B6A7A] uppercase tracking-[0.14em]">PnL Total</span>
              <div className={`${pnlPositive ? "bg-[#00D4AA]/8 border-[#00D4AA]/15" : "bg-[#FF4455]/8 border-[#FF4455]/15"} border p-1.5 rounded-lg`}>
                <TrendingUp size={11} className={pnlPositive ? "text-[#00D4AA]" : "text-[#FF4455]"} strokeWidth={2.5} />
              </div>
            </div>
            <p className={`font-display leading-none tracking-tight ${pnlPositive ? "text-[#00D4AA]" : "text-[#FF4455]"}`}
              style={{ fontSize: 38 }}>
              <Counter value={s?.pnl || 0} prefix={pnlPositive ? "+$" : "-$"} dec={2} />
            </p>
            <p className="text-[10px] text-[#6B6A7A]">{resolved} trades resueltos</p>
          </div>

          {/* Win Rate */}
          <div className="card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-[#6B6A7A] uppercase tracking-[0.14em]">Win Rate</span>
              <div className="bg-[#3B82F6]/8 border border-[#3B82F6]/15 p-1.5 rounded-lg">
                <Target size={11} className="text-[#3B82F6]" strokeWidth={2.5} />
              </div>
            </div>
            <p className="font-display leading-none tracking-tight text-[#3B82F6]" style={{ fontSize: 38 }}>
              <Counter value={s?.win_rate || 0} suffix="%" dec={1} />
            </p>
            <div className="h-1 bg-[#1A1A26] rounded-full overflow-hidden">
              <div className="h-full rounded-full progress-bar"
                style={{ width: `${s?.win_rate || 0}%`, background: C.blue }} />
            </div>
          </div>

          {/* Resueltos */}
          <div className="card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-[#6B6A7A] uppercase tracking-[0.14em]">Resueltos</span>
              <div className="bg-[#8B5CF6]/8 border border-[#8B5CF6]/15 p-1.5 rounded-lg">
                <Activity size={11} className="text-[#8B5CF6]" strokeWidth={2.5} />
              </div>
            </div>
            <p className="font-display leading-none tracking-tight text-[#8B5CF6]" style={{ fontSize: 38 }}>
              <Counter value={resolved} dec={0} />
            </p>
            <p className="text-[10px] text-[#6B6A7A]">{total.toLocaleString()} total registrados</p>
          </div>

          {/* Brier gauge */}
          <div className="card p-4 flex flex-col gap-1.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-bold text-[#6B6A7A] uppercase tracking-[0.14em]">Brier Score</span>
              <div className="bg-[#F59E0B]/8 border border-[#F59E0B]/15 p-1.5 rounded-lg">
                <Zap size={11} className="text-[#F59E0B]" strokeWidth={2.5} />
              </div>
            </div>
            <BrierGauge value={s?.brier || 0} />
          </div>
        </div>

        {/* ══ CRITERIA + RISK ══ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2"><LiveCriteriaPanel s={s} /></div>
          <RiskPanel risk={risk} />
        </div>

        {/* ══ CHARTS ══ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ArrowUpRight size={14} className="text-[#00D4AA]" />
                <p className="text-[11px] font-bold uppercase tracking-[0.12em]">Bankroll Evolution</p>
              </div>
              <span className="text-[9px] text-[#6B6A7A] font-semibold bg-[#080808] px-2 py-1 rounded-lg border border-[rgba(255,255,255,0.05)]">
                {(bankroll || []).length} entries
              </span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={bankroll || []} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#00D4AA" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#00D4AA" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="id" stroke="rgba(255,255,255,0.04)"
                  tick={{ fill: "#6B6A7A", fontSize: 9, fontFamily: "JetBrains Mono" }} />
                <YAxis stroke="rgba(255,255,255,0.04)"
                  tick={{ fill: "#6B6A7A", fontSize: 9, fontFamily: "JetBrains Mono" }} domain={["auto","auto"]} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="balance" stroke="#00D4AA" fill="url(#gB)" strokeWidth={1.5} name="Balance $" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={14} className="text-[#8B5CF6]" />
              <p className="text-[11px] font-bold uppercase tracking-[0.12em]">Strategy Mix</p>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={strats || []} dataKey="total" nameKey="strategy"
                  cx="50%" cy="50%" outerRadius={65} innerRadius={38} paddingAngle={2} strokeWidth={0}>
                  {(strats || []).map((st, i) => <Cell key={i} fill={STRAT_COLORS[st.strategy] || C.dim} />)}
                </Pie>
                <Tooltip content={<ChartTip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2 max-h-[120px] overflow-y-auto pr-1">
              {(strats || []).map((st, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: STRAT_COLORS[st.strategy] || C.dim }} />
                    <span className="text-[10px] text-[#9A9AAA] capitalize">{st.strategy?.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] font-bold">{st.total.toLocaleString()}</span>
                    <span className={`text-[10px] font-bold font-mono ${st.pnl >= 0 ? "text-[#00D4AA]" : "text-[#FF4455]"}`}>
                      {st.pnl >= 0 ? "+" : ""}{st.pnl.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ ACTIVITY CHART ══ */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 size={14} className="text-[#E8650A]" />
              <p className="text-[11px] font-bold uppercase tracking-[0.12em]">Trade Activity por Hora</p>
            </div>
            <span className="text-[9px] text-[#6B6A7A] font-semibold bg-[#080808] px-2 py-1 rounded-lg border border-[rgba(255,255,255,0.05)]">
              {(timeline || []).reduce((a, t) => a + t.trades, 0).toLocaleString()} total
            </span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={timeline || []} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="hour" stroke="rgba(255,255,255,0.04)"
                tick={{ fill: "#6B6A7A", fontSize: 9, fontFamily: "JetBrains Mono" }} />
              <YAxis stroke="rgba(255,255,255,0.04)"
                tick={{ fill: "#6B6A7A", fontSize: 9, fontFamily: "JetBrains Mono" }} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="trades" fill="#E8650A" fillOpacity={0.68} radius={[2,2,0,0]} name="Trades" />
              <Bar dataKey="won"    fill="#00D4AA" fillOpacity={0.68} radius={[2,2,0,0]} name="Won" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ══ STRATEGY CARDS (v4.1) ══ */}
        <StrategyTable strats={strats} />

        {/* ══ LIVE FEED + SELF-IMPROVEMENT ══ */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3"><LiveFeed trades={trades} /></div>
          <div className="lg:col-span-2"><SelfImprovementLog patterns={patterns} /></div>
        </div>

        {/* ══ FOOTER ══ */}
        <footer className="pt-2 pb-6 border-t border-[rgba(255,255,255,0.04)]">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Cpu size={11} className="text-[#2A2A3E]" />
              <p className="text-[9px] font-bold text-[#2A2A3E] uppercase tracking-[0.2em]">
                NEXUS OS · POLYBOT v4.1 · PAPER MODE · {new Date().getFullYear()}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {[
                { icon: GitBranch,    label: "GitHub",    href: "https://github.com/Camilexx/nexus-polybot-dashboard" },
                { icon: ExternalLink, label: "Dashboard", href: "https://polybotdashboard.vercel.app" },
                { icon: Database,     label: "Supabase",  href: "#" },
              ].map(({ icon: Icon, label, href }) => (
                <a key={label} href={href} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-[10px] font-semibold text-[#3A3A5A] hover:text-[#E8650A] transition-colors">
                  <Icon size={11} /><span>{label}</span>
                </a>
              ))}
            </div>
          </div>
        </footer>

      </main>
    </div>
  );
}
