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
  dim: "#6B6A7A", border: "#1E1E2E", card: "#0E0E16",
  bg: "#080808", text: "#E8E8F0",
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

/* ─── useAsync hook ──────────────────────────────────── */
function useAsync(fn, interval = REFRESH) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [ts, setTs]         = useState(null);

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
      <p className={`text-[2rem] font-black leading-none tracking-tight ${a.text}`}>
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
    { label: "Win Rate > 65%",       ok: wr >= LIVE_TARGET.wr,      current: `${wr.toFixed(1)}%`,  target: "65%" },
    { label: "PnL positivo",         ok: pnl > 0,                    current: `$${pnl.toFixed(2)}`, target: "$0" },
    { label: "Resueltos ≥ 150",      ok: resolved >= LIVE_TARGET.resolved, current: `${resolved}`, target: "150" },
    { label: "Brier Score < 0.25",   ok: brier < LIVE_TARGET.brier,  current: brier.toFixed(4),     target: "0.25" },
  ];

  const passed  = criteria.filter(c => c.ok).length;
  const pct     = Math.round((passed / criteria.length) * 100);
  const allOk   = passed === criteria.length;

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

      {/* Master bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-[#6B6A7A] font-medium">Progreso general</span>
          <span className="text-[11px] font-bold font-mono" style={{ color: allOk ? C.green : C.orange }}>{pct}%</span>
        </div>
        <div className="h-2 bg-[#1E1E2E] rounded-full overflow-hidden">
          <div className="h-full rounded-full progress-bar"
            style={{ width: `${pct}%`, background: allOk ? C.green : C.orange }} />
        </div>
      </div>

      {/* Criteria list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {criteria.map((c, i) => (
          <div key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border
            ${c.ok ? "bg-[#00D4AA]/5 border-[#00D4AA]/12" : "bg-[#1E1E2E]/40 border-[#1E1E2E]"}`}>
            {c.ok
              ? <CheckCircle size={13} className="text-[#00D4AA] shrink-0" strokeWidth={2.5} />
              : <XCircle     size={13} className="text-[#FF4455] shrink-0" strokeWidth={2.5} />}
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
          <p className="text-[13px] font-black" style={{ color: rm.color }}>{rm.label}</p>
          <p className="text-[10px] text-[#6B6A7A] font-medium">Modo actual de operación</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Bankroll", val: `$${(r.bankroll || 0).toFixed(2)}`, color: C.green },
          { label: "Max ever", val: `$${(r.maxEver || r.bankroll || 10).toFixed(2)}`, color: C.blue },
          { label: "Drawdown", val: `${((r.drawdown || 0) * 100).toFixed(1)}%`, color: r.drawdown > 0.2 ? C.red : C.dim },
          { label: "Loss streak", val: r.lossStreak || 0, color: (r.lossStreak || 0) >= 3 ? C.red : C.dim },
        ].map(m => (
          <div key={m.label} className="bg-[#080808] rounded-lg p-2.5 text-center">
            <p className="text-[14px] font-black font-mono" style={{ color: m.color }}>{m.val}</p>
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
        <div className="h-1.5 bg-[#1E1E2E] rounded-full overflow-hidden">
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
        <span className="ml-auto text-[9px] font-bold text-[#6B6A7A] bg-[#1E1E2E] px-2 py-0.5 rounded-full">
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
            <div key={i} className="px-3 py-2.5 rounded-lg bg-[#080808] border border-[#1E1E2E] space-y-1">
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
  const outcome = trade.outcome || "skip";
  const pnlColor = (trade.pnl || 0) >= 0 ? "text-[#00D4AA]" : "text-[#FF4455]";
  const stratColor = STRAT_COLORS[trade.strategy] || C.dim;
  return (
    <div className="grid grid-cols-[24px_1fr_auto] items-center gap-2.5 px-3 py-2 rounded-lg
      hover:bg-white/[0.02] transition-colors border-b border-[#1E1E2E]/50 last:border-0">
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
    if (s.resolved === 0) return { label: "INACTIVO", color: C.dim };
    if (s.pnl > 0 && s.win_rate >= 60 && s.resolved >= 10) return { label: "DOMINANTE", color: C.green };
    if (s.resolved >= 5) return { label: "CALIBRANDO", color: C.orange };
    return { label: "POCOS DATOS", color: C.yellow };
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[#1E1E2E]">
        <BarChart2 size={14} className="text-[#E8650A]" />
        <p className="text-[11px] font-bold uppercase tracking-[0.14em]">Strategy Performance</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-[#1E1E2E]">
              {["Estrategia","Trades","Resueltos","WR%","PnL","Avg EV","Brier","Estado"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-[9px] font-bold text-[#6B6A7A] uppercase tracking-[0.12em] whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(strats || []).map((s, i) => {
              const wr = s.win_rate || 0;
              const wrColor = wr >= 60 ? C.green : wr >= 45 ? C.orange : wr > 0 ? C.red : C.dim;
              const b = badge(s);
              const color = STRAT_COLORS[s.strategy] || C.dim;
              const Icon = STRAT_ICONS[s.strategy] || Zap;
              return (
                <tr key={i} className="border-b border-[#1E1E2E]/50 last:border-0 hover:bg-white/[0.015] transition-colors">
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
                      <span className="font-bold font-mono" style={{ color: wrColor }}>{wr.toFixed(1)}%</span>
                      <div className="w-12 h-1 bg-[#1E1E2E] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${wr}%`, background: wrColor }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold font-mono ${s.pnl >= 0 ? "text-[#00D4AA]" : "text-[#FF4455]"}`}>
                        {s.pnl >= 0 ? "+" : ""}{s.pnl.toFixed(2)}
                      </span>
                      <div className="w-10 h-1 bg-[#1E1E2E] rounded-full overflow-hidden">
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

/* ─── Live feed with filter ──────────────────────────── */
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
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#1E1E2E]">
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
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[#1E1E2E]">
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
    <div className="bg-[#1A1A26] border border-[#2A2A3E] rounded-xl p-3 shadow-2xl text-[10px] font-mono min-w-[120px]">
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
    <div className="min-h-screen bg-[#080808] flex items-center justify-center p-6">
      <div className="card p-10 max-w-md w-full text-center space-y-5">
        <Cpu size={40} className="text-[#E8650A] mx-auto" strokeWidth={1.5} />
        <h1 className="text-xl font-black uppercase tracking-widest text-[#E8E8F0]">NEXUS POLYBOT</h1>
        <p className="text-sm text-[#6B6A7A] leading-relaxed">Configure las variables de entorno en Vercel.</p>
        <div className="bg-[#080808] rounded-xl p-4 text-left font-mono text-[11px] text-[#E8650A] space-y-1.5 border border-[#1E1E2E]">
          <p>VITE_SUPABASE_URL=https://xxx.supabase.co</p>
          <p>VITE_SUPABASE_ANON_KEY=sb_publishable_...</p>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN APP — v3.0
   ══════════════════════════════════════════════════════ */
export default function App() {
  const { data: s,        ts, refetch, error } = useAsync(fetchSummary);
  const { data: strats }                       = useAsync(fetchStrategies);
  const { data: trades }                       = useAsync(fetchRecentTrades);
  const { data: timeline }                     = useAsync(fetchTimeline);
  const { data: bankroll }                     = useAsync(fetchBankrollHistory);
  const { data: patterns }                     = useAsync(fetchPatterns);
  const { data: risk }                         = useAsync(fetchRiskStatus);

  if (!isConfigured()) return <Unconfigured />;

  const resolved     = (s?.won || 0) + (s?.lost || 0);
  const total        = s?.total || 0;
  const pnlPositive  = (s?.pnl || 0) >= 0;

  return (
    <div className="min-h-screen text-[#E8E8F0]" style={{ background: C.bg, fontFamily: "'Montserrat', sans-serif" }}>
      <div className="scanline" />

      {/* ══ HEADER ══ */}
      <header className="sticky top-0 z-50 border-b border-[#1E1E2E]"
        style={{ background: "rgba(8,8,8,0.97)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-[1600px] mx-auto px-6 h-13 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Cpu size={16} className="text-[#E8650A]" strokeWidth={2} />
              <span className="font-black text-[14px] tracking-[0.2em] text-[#E8650A]">NEXUS</span>
              <span className="font-bold text-[14px] tracking-[0.2em]">POLYBOT</span>
            </div>
            <div className="h-4 w-px bg-[#1E1E2E]" />
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00D4AA]/6 border border-[#00D4AA]/15">
              <div className="live-dot" />
              <span className="text-[9px] font-bold text-[#00D4AA] uppercase tracking-[0.15em]">Paper Mode</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1E1E2E]/60 border border-[#2A2A3E]">
              <span className="text-[9px] font-semibold text-[#6B6A7A] uppercase tracking-wider">v3.0</span>
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
            <button onClick={refetch}
              className="w-7 h-7 rounded-lg border border-[#1E1E2E] flex items-center justify-center
                hover:border-[#E8650A]/40 hover:bg-[#E8650A]/5 transition-all active:scale-95">
              <RefreshCw size={11} className="text-[#6B6A7A]" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-5 space-y-4">

        {/* ══ HERO ROW — 5 métricas críticas ══ */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          <div className="card p-4 xl:col-span-1 flex flex-col gap-2 glow-orange">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-[#6B6A7A] uppercase tracking-[0.14em]">Bankroll</span>
              <div className="bg-[#E8650A]/8 border border-[#E8650A]/15 p-1.5 rounded-lg">
                <DollarSign size={11} className="text-[#E8650A]" strokeWidth={2.5} />
              </div>
            </div>
            <p className="text-[1.9rem] font-black leading-none tracking-tight text-[#E8650A]">
              <Counter value={s?.bankroll || 10} prefix="$" dec={2} />
            </p>
            <p className="text-[10px] text-[#6B6A7A]">
              desde $10.00 inicial
            </p>
          </div>

          <div className={`card p-4 flex flex-col gap-2 ${pnlPositive ? "glow-green" : ""}`}>
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-[#6B6A7A] uppercase tracking-[0.14em]">PnL Total</span>
              <div className={`${pnlPositive ? "bg-[#00D4AA]/8 border-[#00D4AA]/15" : "bg-[#FF4455]/8 border-[#FF4455]/15"} border p-1.5 rounded-lg`}>
                <TrendingUp size={11} className={pnlPositive ? "text-[#00D4AA]" : "text-[#FF4455]"} strokeWidth={2.5} />
              </div>
            </div>
            <p className={`text-[1.9rem] font-black leading-none tracking-tight ${pnlPositive ? "text-[#00D4AA]" : "text-[#FF4455]"}`}>
              <Counter value={s?.pnl || 0} prefix={pnlPositive ? "+$" : "-$"} dec={2} />
            </p>
            <p className="text-[10px] text-[#6B6A7A]">{resolved} trades resueltos</p>
          </div>

          <div className="card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-[#6B6A7A] uppercase tracking-[0.14em]">Win Rate</span>
              <div className="bg-[#3B82F6]/8 border border-[#3B82F6]/15 p-1.5 rounded-lg">
                <Target size={11} className="text-[#3B82F6]" strokeWidth={2.5} />
              </div>
            </div>
            <p className="text-[1.9rem] font-black leading-none tracking-tight text-[#3B82F6]">
              <Counter value={s?.win_rate || 0} suffix="%" dec={1} />
            </p>
            <div className="h-1 bg-[#1E1E2E] rounded-full overflow-hidden">
              <div className="h-full rounded-full progress-bar" style={{ width: `${s?.win_rate || 0}%`, background: C.blue }} />
            </div>
          </div>

          <div className="card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-[#6B6A7A] uppercase tracking-[0.14em]">Trades</span>
              <div className="bg-[#8B5CF6]/8 border border-[#8B5CF6]/15 p-1.5 rounded-lg">
                <Activity size={11} className="text-[#8B5CF6]" strokeWidth={2.5} />
              </div>
            </div>
            <p className="text-[1.9rem] font-black leading-none tracking-tight text-[#8B5CF6]">
              <Counter value={resolved} dec={0} />
            </p>
            <p className="text-[10px] text-[#6B6A7A]">{total.toLocaleString()} total registrados</p>
          </div>

          {/* Brier gauge */}
          <div className="card p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-bold text-[#6B6A7A] uppercase tracking-[0.14em]">Brier Score</span>
              <div className="bg-[#F59E0B]/8 border border-[#F59E0B]/15 p-1.5 rounded-lg">
                <Zap size={11} className="text-[#F59E0B]" strokeWidth={2.5} />
              </div>
            </div>
            <p className="text-[1.9rem] font-black leading-none tracking-tight text-[#F59E0B]">
              <Counter value={s?.brier || 0} dec={4} />
            </p>
            <div>
              <div className="h-1 bg-[#1E1E2E] rounded-full overflow-hidden mb-1">
                <div className="h-full rounded-full progress-bar"
                  style={{ width: `${Math.min((s?.brier || 0) / 0.5 * 100, 100)}%`,
                    background: (s?.brier || 1) < 0.25 ? C.green : C.yellow }} />
              </div>
              <p className="text-[9px] text-[#6B6A7A]">{(s?.brier || 1) < 0.25 ? "✓ Calibrado" : "Calibrando..."}</p>
            </div>
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
              <span className="text-[9px] text-[#6B6A7A] font-semibold bg-[#080808] px-2 py-1 rounded-lg border border-[#1E1E2E]">
                {(bankroll || []).length} entries
              </span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={bankroll || []} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#00D4AA" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#00D4AA" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="#1E1E2E" />
                <XAxis dataKey="id" stroke="#1E1E2E" tick={{ fill: "#6B6A7A", fontSize: 9, fontFamily: "JetBrains Mono" }} />
                <YAxis stroke="#1E1E2E" tick={{ fill: "#6B6A7A", fontSize: 9, fontFamily: "JetBrains Mono" }} domain={["auto","auto"]} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="balance" stroke="#00D4AA" fill="url(#gB)" strokeWidth={2} name="Balance $" />
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
                  {(strats || []).map((s, i) => (
                    <Cell key={i} fill={STRAT_COLORS[s.strategy] || C.dim} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2 max-h-[120px] overflow-y-auto pr-1">
              {(strats || []).map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: STRAT_COLORS[s.strategy] || C.dim }} />
                    <span className="text-[10px] text-[#9A9AAA] capitalize">{s.strategy?.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] font-bold text-[#E8E8F0]">{s.total.toLocaleString()}</span>
                    <span className={`text-[10px] font-bold font-mono ${s.pnl >= 0 ? "text-[#00D4AA]" : "text-[#FF4455]"}`}>
                      {s.pnl >= 0 ? "+" : ""}{s.pnl.toFixed(2)}
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
            <span className="text-[9px] text-[#6B6A7A] font-semibold bg-[#080808] px-2 py-1 rounded-lg border border-[#1E1E2E]">
              {(timeline || []).reduce((a, t) => a + t.trades, 0).toLocaleString()} total
            </span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={timeline || []} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#1E1E2E" vertical={false} />
              <XAxis dataKey="hour" stroke="#1E1E2E" tick={{ fill: "#6B6A7A", fontSize: 9, fontFamily: "JetBrains Mono" }} />
              <YAxis stroke="#1E1E2E" tick={{ fill: "#6B6A7A", fontSize: 9, fontFamily: "JetBrains Mono" }} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="trades" fill="#E8650A" fillOpacity={0.75} radius={[2,2,0,0]} name="Trades" />
              <Bar dataKey="won"    fill="#00D4AA" fillOpacity={0.75} radius={[2,2,0,0]} name="Won" />
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
          <div className="lg:col-span-2 space-y-4">
            <SelfImprovementPanel patterns={patterns} />
          </div>
        </div>

        {/* ══ FOOTER ══ */}
        <footer className="pt-2 pb-6 border-t border-[#1E1E2E]/40">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Cpu size={11} className="text-[#2A2A3E]" />
              <p className="text-[9px] font-bold text-[#2A2A3E] uppercase tracking-[0.2em]">
                NEXUS OS · POLYBOT v3.0 · PAPER MODE · {new Date().getFullYear()}
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
              <div className="h-3 w-px bg-[#1E1E2E]" />
              <div className="flex items-center gap-1.5 text-[9px] text-[#3A3A5A]">
                <ChevronRight size={10} />
                <span>Próxima evaluación live: {LIVE_TARGET.resolved - resolved > 0 ? `${LIVE_TARGET.resolved - resolved} resol. más` : "¡LISTO!"}</span>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
