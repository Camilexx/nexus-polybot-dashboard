import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Activity, TrendingUp, Target, Zap, DollarSign,
  RefreshCw, CheckCircle, XCircle, Clock, AlertCircle,
  Cpu, BarChart2, ArrowUpRight, Flame, Eye, Shield,
  AlertTriangle, BookOpen, TrendingDown, Award, Filter,
  ExternalLink, GitBranch, Database, ChevronRight,
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
const STRAT_ICONS = { momentum: Flame, value_bet: Eye, negrisk_arb: Shield, binary_arb: Zap };

const RISK_MAP = {
  NORMAL:       { color: C.green,  bg: "bg-[#00D4AA]/8",  border: "border-[#00D4AA]/20", label: "NORMAL",       icon: CheckCircle },
  DEFENSIVE:    { color: C.yellow, bg: "bg-[#F59E0B]/8",  border: "border-[#F59E0B]/20", label: "DEFENSIVE",    icon: AlertTriangle },
  CONSERVATIVE: { color: C.orange, bg: "bg-[#E8650A]/8",  border: "border-[#E8650A]/20", label: "CONSERVATIVE", icon: Shield },
  PAUSED:       { color: C.red,    bg: "bg-[#FF4455]/8",  border: "border-[#FF4455]/20", label: "PAUSED",       icon: XCircle },
};

/* ─── Utilities ──────────────────────────────────────── */
function timeAgo(isoStr) {
  if (!isoStr) return "—";
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "ahora";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
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
  const START = 135;   // degrees — lower-left (7:30 clock)
  const SPAN  = 270;   // degrees — arc covers 270°, gap at bottom
  const MAX   = 0.50;  // 0.5 brier = 100% gauge fill

  const norm = Math.min(Math.max(value / MAX, 0), 1);

  const polar = (deg) => {
    const rad = (deg * Math.PI) / 180;
    return [+(CX + R * Math.cos(rad)).toFixed(2), +(CY + R * Math.sin(rad)).toFixed(2)];
  };

  const [sx, sy] = polar(START);
  const [ex, ey] = polar(START + SPAN);   // = polar(45)

  const fillEnd   = START + SPAN * norm;
  const [fx, fy]  = polar(fillEnd);
  const fillLarge = (SPAN * norm) > 180 ? 1 : 0;

  // Needle from center toward arc (a bit shorter than R)
  const NR  = 52;
  const nRad = (fillEnd * Math.PI) / 180;
  const nx  = +(CX + NR * Math.cos(nRad)).toFixed(2);
  const ny  = +(CY + NR * Math.sin(nRad)).toFixed(2);

  // Threshold tick at 0.25 brier
  const tickDeg = START + SPAN * (0.25 / MAX);
  const [ti1x, ti1y] = polar(tickDeg);   // outer
  const ti2R = R - 14;
  const ti2x = +(CX + ti2R * Math.cos(tickDeg * Math.PI / 180)).toFixed(2);
  const ti2y = +(CY + ti2R * Math.sin(tickDeg * Math.PI / 180)).toFixed(2);

  const color = value < 0.25 ? "#00D4AA" : value < 0.35 ? "#F59E0B" : "#FF4455";
  const label = value < 0.25 ? "CALIBRADO" : value < 0.35 ? "MEJORANDO" : "CALIBRANDO";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 22 200 150" fill="none" xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", maxWidth: 148 }}>
        {/* Track arc */}
        <path d={`M ${sx} ${sy} A ${R} ${R} 0 1 1 ${ex} ${ey}`}
          stroke="#1C1C2A" strokeWidth={7} strokeLinecap="round" />
        {/* Filled arc */}
        {norm > 0.005 && (
          <path d={`M ${sx} ${sy} A ${R} ${R} 0 ${fillLarge} 1 ${fx} ${fy}`}
            stroke={color} strokeWidth={7} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 5px ${color}70)`, transition: "all 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
        )}
        {/* Goal threshold tick at 0.25 */}
        <line x1={ti1x} y1={ti1y} x2={ti2x} y2={ti2y}
          stroke="#00D4AA" strokeWidth={1.5} opacity={0.45} />
        {/* Needle */}
        <line x1={CX} y1={CY} x2={nx} y2={ny}
          stroke={color} strokeWidth={1.5} strokeLinecap="round"
          style={{ transition: "all 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
        {/* Hub outer */}
        <circle cx={CX} cy={CY} r={5} fill={color} opacity={0.25} />
        {/* Hub inner */}
        <circle cx={CX} cy={CY} r={3} fill={color} />
        <circle cx={CX} cy={CY} r={1.2} fill="#050505" />
        {/* Score */}
        <text x={CX} y={CY - 8} textAnchor="middle"
          fontFamily="'JetBrains Mono',monospace" fontSize={19} fontWeight={700} fill={color}>
          {value.toFixed(4)}
        </text>
        {/* Label */}
        <text x={CX} y={CY + 10} textAnchor="middle"
          fontFamily="'DM Sans',sans-serif" fontSize={7} fill="#6B6A7A" letterSpacing="0.08em">
          {label}
        </text>
        {/* Goal label */}
        <text x={CX} y={CY + 20} textAnchor="middle"
          fontFamily="'DM Sans',sans-serif" fontSize={6} fill="#3A3A4A" letterSpacing="0.06em">
          META &lt; 0.25
        </text>
      </svg>
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

function StatCard({ icon: Icon, label, value, sub, color = "orange", prefix = "", suffix = "", dec = 0, pulse = false }) {
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

/* ─── Live criteria progress ────────────────────────── */
function LiveCriteriaPanel({ s }) {
  const resolved = (s?.won || 0) + (s?.lost || 0);
  const wr       = s?.win_rate || 0;
  const pnl      = s?.pnl || 0;
  const brier    = s?.brier || 1;

  const criteria = [
    { label: "Win Rate > 65%",     ok: wr >= LIVE_TARGET.wr,          current: `${wr.toFixed(1)}%`,  target: "65%" },
    { label: "PnL positivo",       ok: pnl > 0,                        current: `$${pnl.toFixed(2)}`, target: "$0" },
    { label: "Resueltos ≥ 150",    ok: resolved >= LIVE_TARGET.resolved, current: `${resolved}`,       target: "150" },
    { label: "Brier Score < 0.25", ok: brier < LIVE_TARGET.brier,      current: brier.toFixed(4),     target: "0.25" },
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

      {/* Master progress bar */}
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

      {/* Criteria list — checkmarks animate on mount/change */}
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

/* ─── Risk Status Panel ─────────────────────────────── */
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
          { label: "Bankroll",    val: `$${(r.bankroll || 0).toFixed(2)}`,            color: C.green },
          { label: "Max ever",    val: `$${(r.maxEver || r.bankroll || 10).toFixed(2)}`, color: C.blue },
          { label: "Drawdown",    val: `${((r.drawdown || 0) * 100).toFixed(1)}%`,   color: r.drawdown > 0.2 ? C.red : C.dim },
          { label: "Loss streak", val: r.lossStreak || 0,                              color: (r.lossStreak || 0) >= 3 ? C.red : C.dim },
        ].map(m => (
          <div key={m.label} className="bg-[#080808] rounded-lg p-2.5 text-center border border-[rgba(255,255,255,0.04)]">
            <p className="text-[14px] font-bold font-mono" style={{ color: m.color }}>{m.val}</p>
            <p className="text-[9px] text-[#6B6A7A] uppercase tracking-wider mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Drawdown bar */}
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

/* ─── Patterns / Self-improvement ───────────────────── */
function SelfImprovementPanel({ patterns }) {
  const pts = patterns || [];
  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen size={14} className="text-[#8B5CF6]" />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em]">Self-Improvement Log</span>
        <span className="ml-auto text-[9px] font-bold text-[#6B6A7A] bg-[#1A1A26] px-2 py-0.5 rounded-full border border-[rgba(255,255,255,0.05)]">
          {pts.length} patrones
        </span>
      </div>
      {pts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 gap-2 text-[#6B6A7A]">
          <BookOpen size={24} strokeWidth={1.5} />
          <p className="text-[11px] font-medium">Sin patrones detectados aún</p>
          <p className="text-[10px]">Ciclo cada 500 trades resueltos</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
          {pts.slice(0, 8).map((p, i) => (
            <div key={i} className="px-3 py-2.5 rounded-lg bg-[#080808] border border-[rgba(255,255,255,0.05)] space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{ color: C.purple, background: `${C.purple}18` }}>
                  {p.pattern_type || "pattern"}
                </span>
                {p.still_valid === false && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{ color: C.red, background: `${C.red}18` }}>obsoleto</span>
                )}
                <span className="ml-auto text-[9px] text-[#6B6A7A] font-mono">n={p.sample_size || "?"}</span>
              </div>
              <p className="text-[10px] text-[#B0B0C0] leading-relaxed">{p.description}</p>
              {p.action_taken && (
                <p className="text-[10px] text-[#8B5CF6] font-medium">→ {p.action_taken}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Outcome badge ──────────────────────────────────── */
function OutcomeBadge({ outcome }) {
  const map = {
    win:     { icon: <CheckCircle size={12} strokeWidth={2.5} />, cls: "text-[#00D4AA] bg-[#00D4AA]/8" },
    loss:    { icon: <XCircle     size={12} strokeWidth={2.5} />, cls: "text-[#FF4455] bg-[#FF4455]/8" },
    pending: { icon: <Clock       size={12} strokeWidth={2.5} />, cls: "text-[#E8650A] bg-[#E8650A]/8 animate-pulse" },
    skipped: { icon: <AlertCircle size={12} strokeWidth={2.5} />, cls: "text-[#6B6A7A] bg-[#6B6A7A]/8" },
    skip:    { icon: <AlertCircle size={12} strokeWidth={2.5} />, cls: "text-[#6B6A7A] bg-[#6B6A7A]/8" },
  };
  const { icon, cls } = map[outcome] || map.skip;
  return <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md ${cls}`}>{icon}</span>;
}

/* ─── Trade row ──────────────────────────────────────── */
function TradeRow({ trade }) {
  const outcome   = trade.outcome || "skip";
  const pnlColor  = (trade.pnl || 0) >= 0 ? "text-[#00D4AA]" : "text-[#FF4455]";
  const stratColor = STRAT_COLORS[trade.strategy] || C.dim;
  const ago       = timeAgo(trade.created_at);
  return (
    <div className="grid grid-cols-[24px_1fr_auto] items-center gap-2.5 px-3 py-2 rounded-lg
      hover:bg-[#E8650A]/[0.04] transition-colors border-b border-[rgba(255,255,255,0.04)] last:border-0">
      <OutcomeBadge outcome={outcome} />
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-[#D0D0E0] truncate leading-snug">{trade.market_name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ color: stratColor, background: `${stratColor}18` }}>
            {trade.strategy?.replace(/_/g, " ")}
          </span>
          <span className="text-[9px] text-[#6B6A7A] font-mono">{trade.confianza?.toFixed(1)}%</span>
          {trade.ev != null && (
            <span className="text-[9px] text-[#8B5CF6] font-mono">EV {trade.ev?.toFixed(3)}</span>
          )}
          <span className="text-[9px] text-[#3A3A5A] font-mono ml-auto">{ago}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        {trade.pnl != null && outcome !== "pending" && outcome !== "skip" && outcome !== "skipped" ? (
          <span className={`text-[11px] font-bold font-mono ${pnlColor}`}>
            {(trade.pnl || 0) >= 0 ? "+" : ""}{trade.pnl?.toFixed(2)}
          </span>
        ) : (
          <span className="text-[10px] font-mono text-[#6B6A7A]">${trade.stake?.toFixed(2)}</span>
        )}
      </div>
    </div>
  );
}

/* ─── Strategy table ─────────────────────────────────── */
function StrategyTable({ strats }) {
  const maxPnl = Math.max(...(strats || []).map(s => Math.abs(s.pnl)), 1);

  const badge = (s) => {
    if (s.resolved === 0)                               return { label: "INACTIVO",   color: C.dim };
    if (s.pnl > 0 && s.win_rate >= 60 && s.resolved >= 10) return { label: "DOMINANTE",  color: C.green };
    if (s.resolved >= 5)                                return { label: "CALIBRANDO", color: C.orange };
    return                                                     { label: "POCOS DATOS", color: C.yellow };
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[rgba(255,255,255,0.05)]">
        <BarChart2 size={14} className="text-[#E8650A]" />
        <p className="text-[11px] font-bold uppercase tracking-[0.14em]">Strategy Performance</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,0.05)]">
              {["Estrategia","Trades","Resueltos","WR%","PnL","Avg EV","Brier","Estado"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[9px] font-bold text-[#6B6A7A] uppercase tracking-[0.12em] whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(strats || []).map((s, i) => {
              const wr    = s.win_rate || 0;
              const wrCol = wr >= 60 ? C.green : wr >= 45 ? C.orange : wr > 0 ? C.red : C.dim;
              const b     = badge(s);
              const color = STRAT_COLORS[s.strategy] || C.dim;
              const Icon  = STRAT_ICONS[s.strategy] || Zap;
              return (
                <tr key={i}
                  className="border-b border-[rgba(255,255,255,0.04)] last:border-0 hover:bg-[#E8650A]/[0.04] transition-colors cursor-default">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                        style={{ background: `${color}14` }}>
                        <Icon size={11} style={{ color }} strokeWidth={2.5} />
                      </div>
                      <span className="font-bold uppercase tracking-wide" style={{ color }}>
                        {s.strategy?.replace(/_/g, " ")}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[#C0C0D0]">{s.total.toLocaleString()}</td>
                  <td className="px-4 py-3 font-mono text-[#C0C0D0]">{s.resolved}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-mono" style={{ color: wrCol }}>{wr.toFixed(1)}%</span>
                      <div className="w-12 h-1 bg-[#1A1A26] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${wr}%`, background: wrCol }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold font-mono ${s.pnl >= 0 ? "text-[#00D4AA]" : "text-[#FF4455]"}`}>
                        {s.pnl >= 0 ? "+" : ""}{s.pnl.toFixed(2)}
                      </span>
                      <div className="w-10 h-1 bg-[#1A1A26] rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                          style={{ width: `${Math.abs(s.pnl) / maxPnl * 100}%`,
                            background: s.pnl >= 0 ? C.green : C.red }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[#8B5CF6]">{s.avg_ev?.toFixed(4)}</td>
                  <td className="px-4 py-3 font-mono text-[#3B82F6]">{s.brier?.toFixed(4) || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border"
                      style={{ color: b.color, background: `${b.color}12`, borderColor: `${b.color}25` }}>
                      {b.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Live feed with filter tabs ─────────────────────── */
function LiveFeed({ trades }) {
  const [filter, setFilter] = useState("ALL");
  const FILTERS = ["ALL", "WIN", "LOSS", "PENDING", "NEGRISK"];

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
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[rgba(255,255,255,0.05)]">
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-[#E8650A]" />
          <p className="text-[11px] font-bold uppercase tracking-[0.12em]">Live Feed</p>
          <div className="flex items-center gap-1.5 ml-1 px-2 py-0.5 rounded-full bg-[#00D4AA]/6 border border-[#00D4AA]/12">
            <div className="live-dot" style={{ width: 5, height: 5 }} />
            <span className="text-[8px] font-bold text-[#00D4AA] uppercase tracking-wider">Live</span>
          </div>
        </div>
        <Filter size={11} className="text-[#6B6A7A]" />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[rgba(255,255,255,0.04)]">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-md transition-all
              ${filter === f
                ? "bg-[#E8650A]/15 text-[#E8650A] border border-[#E8650A]/25"
                : "text-[#6B6A7A] hover:text-[#9A9AAA] border border-transparent"}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-1" style={{ maxHeight: 480 }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-[#6B6A7A]">
            <Clock size={24} strokeWidth={1.5} />
            <p className="text-[11px] font-medium">Sin trades para este filtro</p>
          </div>
        ) : filtered.map((t, i) => <TradeRow key={t.id || i} trade={t} />)}
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

/* ─── Unconfigured state ─────────────────────────────── */
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
   MAIN APP — v4.0 Bloomberg-style Quantitative Terminal
   ══════════════════════════════════════════════════════ */
export default function App() {
  const { data: s,      ts, refetch, error } = useAsync(fetchSummary);
  const { data: strats }                     = useAsync(fetchStrategies);
  const { data: trades }                     = useAsync(fetchRecentTrades);
  const { data: timeline }                   = useAsync(fetchTimeline);
  const { data: bankroll }                   = useAsync(fetchBankrollHistory);
  const { data: patterns }                   = useAsync(fetchPatterns);
  const { data: risk }                       = useAsync(fetchRiskStatus);

  // Refresh button spin
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
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)]">
              <span className="text-[9px] font-semibold text-[#6B6A7A] uppercase tracking-wider">v4.0</span>
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

        {/* ══ HERO ROW — 5 métricas críticas ══ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 animate-fade-up">

          {/* Bankroll — large Barlow Condensed display */}
          <div className="card p-4 xl:col-span-1 flex flex-col gap-2 glow-orange">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-[#6B6A7A] uppercase tracking-[0.14em]">Bankroll</span>
              <div className="bg-[#E8650A]/8 border border-[#E8650A]/15 p-1.5 rounded-lg">
                <DollarSign size={11} className="text-[#E8650A]" strokeWidth={2.5} />
              </div>
            </div>
            <p className="font-display leading-none tracking-tight text-[#E8650A]"
              style={{ fontSize: 64 }}>
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
              <div className="h-full rounded-full progress-bar" style={{ width: `${s?.win_rate || 0}%`, background: C.blue }} />
            </div>
          </div>

          {/* Trades resolved */}
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

          {/* Brier Score — SVG gauge */}
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

        {/* ══ CRITERIA + RISK ROW ══ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <LiveCriteriaPanel s={s} />
          </div>
          <RiskPanel risk={risk} />
        </div>

        {/* ══ CHARTS ROW ══ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Bankroll evolution */}
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
                    <stop offset="0%"   stopColor="#00D4AA" stopOpacity={0.30} />
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

          {/* Strategy donut */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={14} className="text-[#8B5CF6]" />
              <p className="text-[11px] font-bold uppercase tracking-[0.12em]">Strategy Mix</p>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={strats || []} dataKey="total" nameKey="strategy"
                  cx="50%" cy="50%" outerRadius={65} innerRadius={38} paddingAngle={2} strokeWidth={0}>
                  {(strats || []).map((st, i) => (
                    <Cell key={i} fill={STRAT_COLORS[st.strategy] || C.dim} />
                  ))}
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
                    <span className="text-[10px] font-bold text-[#E8E8F0]">{st.total.toLocaleString()}</span>
                    <span className={`text-[10px] font-bold font-mono ${st.pnl >= 0 ? "text-[#00D4AA]" : "text-[#FF4455]"}`}>
                      {st.pnl >= 0 ? "+" : ""}{st.pnl.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ TRADE ACTIVITY BAR CHART ══ */}
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
              <Bar dataKey="trades" fill="#E8650A" fillOpacity={0.70} radius={[2,2,0,0]} name="Trades" />
              <Bar dataKey="won"    fill="#00D4AA" fillOpacity={0.70} radius={[2,2,0,0]} name="Won" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ══ STRATEGY TABLE ══ */}
        <StrategyTable strats={strats} />

        {/* ══ LIVE FEED + SELF-IMPROVEMENT ══ */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3">
            <LiveFeed trades={trades} />
          </div>
          <div className="lg:col-span-2">
            <SelfImprovementPanel patterns={patterns} />
          </div>
        </div>

        {/* ══ FOOTER ══ */}
        <footer className="pt-2 pb-6 border-t border-[rgba(255,255,255,0.04)]">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Cpu size={11} className="text-[#2A2A3E]" />
              <p className="text-[9px] font-bold text-[#2A2A3E] uppercase tracking-[0.2em]">
                NEXUS OS · POLYBOT v4.0 · PAPER MODE · {new Date().getFullYear()}
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
                  <Icon size={11} />
                  <span>{label}</span>
                </a>
              ))}
            </div>
          </div>
        </footer>

      </main>
    </div>
  );
}
