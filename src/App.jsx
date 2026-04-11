import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Activity, TrendingUp, Target, Zap, DollarSign,
  RefreshCw, CheckCircle, XCircle, Clock, AlertCircle,
  Cpu, BarChart2, ArrowUpRight, Flame, Eye, Shield,
} from "lucide-react";
import {
  fetchSummary, fetchStrategies, fetchRecentTrades,
  fetchTimeline, fetchBankrollHistory, isConfigured,
} from "./supabase";

/* ─── Constants ───────────────────────────────────── */
const REFRESH = 15000;

const C = {
  orange: "#E8650A",
  green:  "#00D296",
  red:    "#F04060",
  blue:   "#3B82F6",
  purple: "#8B5CF6",
  dim:    "#6B6A7A",
  border: "#1E1E2E",
  card:   "#12121A",
  bg:     "#0A0A0F",
  text:   "#E8E8F0",
};

const STRAT_COLORS = {
  momentum:    C.blue,
  value_bet:   C.orange,
  negrisk_arb: C.green,
  binary_arb:  C.purple,
  general:     "#4A4A5A",
  corners_1h:  "#F59E0B",
  tarjetas:    "#EC4899",
};

const STRAT_ICONS = {
  momentum:    Flame,
  value_bet:   Eye,
  negrisk_arb: Shield,
  binary_arb:  Zap,
};

/* ─── Hooks ───────────────────────────────────────── */
function useAsync(fn, interval = REFRESH) {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [ts, setTs]               = useState(null);

  const run = useCallback(async () => {
    try {
      setData(await fn());
      setTs(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fn]);

  useEffect(() => {
    run();
    const id = setInterval(run, interval);
    return () => clearInterval(id);
  }, [run, interval]);

  return { data, loading, error, ts, refetch: run };
}

/* ─── Animated counter ────────────────────────────── */
function Counter({ value, prefix = "", suffix = "", dec = 0 }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const target = Number(value) || 0;
    const delta  = target - n;
    if (Math.abs(delta) < 0.005) { setN(target); return; }
    const step = delta / 18;
    const id = setInterval(() => {
      setN(prev => {
        const next = prev + step;
        if (Math.abs(next - target) < Math.abs(step)) { clearInterval(id); return target; }
        return next;
      });
    }, 18);
    return () => clearInterval(id);
  }, [value]); // eslint-disable-line
  return <>{prefix}{n.toFixed(dec)}{suffix}</>;
}

/* ─── Stat card ───────────────────────────────────── */
const ACCENT = {
  orange: { text: "text-[#E8650A]", bg: "bg-[#E8650A]/8",  border: "border-[#E8650A]/15" },
  green:  { text: "text-[#00D296]", bg: "bg-[#00D296]/8",  border: "border-[#00D296]/15" },
  red:    { text: "text-[#F04060]", bg: "bg-[#F04060]/8",  border: "border-[#F04060]/15" },
  blue:   { text: "text-[#3B82F6]", bg: "bg-[#3B82F6]/8",  border: "border-[#3B82F6]/15" },
  purple: { text: "text-[#8B5CF6]", bg: "bg-[#8B5CF6]/8",  border: "border-[#8B5CF6]/15" },
};

function StatCard({ icon: Icon, label, value, sub, color = "orange", prefix = "", suffix = "", dec = 0 }) {
  const a = ACCENT[color] || ACCENT.orange;
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#6B6A7A] uppercase tracking-[0.12em]">{label}</span>
        <div className={`${a.bg} ${a.border} border p-1.5 rounded-lg`}>
          <Icon size={13} className={a.text} strokeWidth={2.5} />
        </div>
      </div>
      <p className={`text-[1.85rem] font-black leading-none tracking-tight ${a.text}`}>
        <Counter value={value} prefix={prefix} suffix={suffix} dec={dec} />
      </p>
      {sub && <span className="text-[11px] text-[#6B6A7A] font-medium">{sub}</span>}
    </div>
  );
}

/* ─── Outcome badge ───────────────────────────────── */
function OutcomeBadge({ outcome }) {
  const map = {
    win:     { icon: <CheckCircle size={13} strokeWidth={2.5} />, cls: "text-[#00D296] bg-[#00D296]/8" },
    loss:    { icon: <XCircle     size={13} strokeWidth={2.5} />, cls: "text-[#F04060] bg-[#F04060]/8" },
    pending: { icon: <Clock       size={13} strokeWidth={2.5} />, cls: "text-[#E8650A] bg-[#E8650A]/8 animate-pulse" },
    skipped: { icon: <AlertCircle size={13} strokeWidth={2.5} />, cls: "text-[#6B6A7A] bg-[#6B6A7A]/8" },
    skip:    { icon: <AlertCircle size={13} strokeWidth={2.5} />, cls: "text-[#6B6A7A] bg-[#6B6A7A]/8" },
  };
  const { icon, cls } = map[outcome] || map.skip;
  return <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md ${cls}`}>{icon}</span>;
}

/* ─── Trade row ───────────────────────────────────── */
function TradeRow({ trade }) {
  const outcome = trade.outcome || "skip";
  const pnlColor = trade.pnl >= 0 ? "text-[#00D296]" : "text-[#F04060]";
  const stratColor = STRAT_COLORS[trade.strategy] || C.dim;
  return (
    <div className="grid grid-cols-[24px_1fr_auto] items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.02] transition-colors border-b border-[#1E1E2E]/60 last:border-0">
      <OutcomeBadge outcome={outcome} />
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-[#D0D0E0] truncate leading-snug">{trade.market_name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ color: stratColor, background: `${stratColor}18` }}>
            {trade.strategy?.replace(/_/g, " ")}
          </span>
          <span className="text-[10px] text-[#6B6A7A] font-mono">{trade.confianza?.toFixed(1)}%</span>
          {trade.ev != null && (
            <span className="text-[10px] text-[#8B5CF6] font-mono">EV {trade.ev?.toFixed(3)}</span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        {trade.pnl != null && outcome !== "pending" && outcome !== "skip" && outcome !== "skipped" ? (
          <span className={`text-[12px] font-bold font-mono ${pnlColor}`}>
            {trade.pnl >= 0 ? "+" : ""}{trade.pnl?.toFixed(2)}
          </span>
        ) : (
          <span className="text-[11px] font-mono text-[#6B6A7A]">${trade.stake?.toFixed(2)}</span>
        )}
      </div>
    </div>
  );
}

/* ─── Strategy card ───────────────────────────────── */
function StratCard({ s }) {
  const color = STRAT_COLORS[s.strategy] || C.dim;
  const Icon  = STRAT_ICONS[s.strategy] || Zap;
  const wr    = s.win_rate || 0;
  const wrColor = wr >= 60 ? C.green : wr >= 50 ? C.orange : C.red;
  return (
    <div className="card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}14` }}>
            <Icon size={15} style={{ color }} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color }}>
              {s.strategy?.replace(/_/g, " ")}
            </p>
            <p className="text-[10px] text-[#6B6A7A] font-medium">{s.total.toLocaleString()} trades</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[18px] font-black" style={{ color: wrColor }}>{wr.toFixed(1)}%</p>
          <p className="text-[9px] text-[#6B6A7A] uppercase tracking-wider">Win Rate</p>
        </div>
      </div>

      {/* Win bar */}
      <div className="h-1 bg-[#1E1E2E] rounded-full overflow-hidden">
        <div className="h-full rounded-full progress-bar" style={{ width: `${Math.min(wr, 100)}%`, background: wrColor }} />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: "PnL", val: `${s.pnl >= 0 ? "+" : ""}${s.pnl?.toFixed(2)}`, color: s.pnl >= 0 ? C.green : C.red },
          { label: "Avg EV", val: s.avg_ev?.toFixed(4), color: C.purple },
          { label: "Brier", val: s.brier?.toFixed(4), color: C.blue },
        ].map(m => (
          <div key={m.label} className="bg-[#0A0A0F] rounded-lg py-2">
            <p className="text-[13px] font-bold font-mono" style={{ color: m.color }}>{m.val}</p>
            <p className="text-[9px] text-[#6B6A7A] uppercase tracking-wider mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Tooltip ─────────────────────────────────────── */
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1A1A24] border border-[#2A2A3E] rounded-xl p-3 shadow-2xl text-[11px] font-mono min-w-[130px]">
      <p className="text-[#6B6A7A] font-semibold mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex justify-between gap-4" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span className="font-bold">{typeof p.value === "number" ? p.value.toFixed(2) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

/* ─── Not configured ──────────────────────────────── */
function Unconfigured() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center p-6">
      <div className="card p-10 max-w-md w-full text-center space-y-5">
        <Cpu size={40} className="text-[#E8650A] mx-auto" strokeWidth={1.5} />
        <h1 className="text-xl font-black uppercase tracking-widest text-[#E8E8F0]">NEXUS POLYBOT</h1>
        <p className="text-sm text-[#6B6A7A] leading-relaxed">
          Configure las variables de entorno en Vercel para conectar el dashboard.
        </p>
        <div className="bg-[#0A0A0F] rounded-xl p-4 text-left font-mono text-[11px] text-[#E8650A] space-y-1.5 border border-[#1E1E2E]">
          <p>VITE_SUPABASE_URL=https://xxx.supabase.co</p>
          <p>VITE_SUPABASE_ANON_KEY=sb_publishable_...</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════ */
export default function App() {
  const { data: s, ts, refetch, error } = useAsync(fetchSummary);
  const { data: strats }                = useAsync(fetchStrategies);
  const { data: trades }                = useAsync(fetchRecentTrades);
  const { data: timeline }              = useAsync(fetchTimeline);
  const { data: bankroll }              = useAsync(fetchBankrollHistory);

  if (!isConfigured()) return <Unconfigured />;

  const resolved   = (s?.won || 0) + (s?.lost || 0);
  const total      = s?.total || 0;
  const resolvedPct = total > 0 ? (resolved / total) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-[#E8E8F0]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <div className="scanline" />

      {/* ══ HEADER ══ */}
      <header className="sticky top-0 z-50 bg-[#0A0A0F]/95 backdrop-blur-md border-b border-[#1E1E2E]">
        <div className="max-w-[1520px] mx-auto px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <Cpu size={18} className="text-[#E8650A]" strokeWidth={2} />
              <span className="font-black text-[15px] tracking-[0.18em] text-[#E8650A]">NEXUS</span>
              <span className="font-bold text-[15px] tracking-[0.18em] text-[#E8E8F0]">POLYBOT</span>
            </div>
            <div className="h-4 w-px bg-[#1E1E2E]" />
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#00D296]/6 border border-[#00D296]/12">
              <div className="live-dot" />
              <span className="text-[10px] font-bold text-[#00D296] uppercase tracking-[0.15em]">Paper Mode</span>
            </div>
          </div>
          {/* Right */}
          <div className="flex items-center gap-4">
            {error && (
              <span className="text-[10px] font-semibold text-[#F04060] bg-[#F04060]/8 px-2.5 py-1 rounded-lg">
                Connection error
              </span>
            )}
            <span className="text-[11px] text-[#6B6A7A] font-medium hidden sm:block">
              {ts ? ts.toLocaleTimeString() : "—"}
            </span>
            <button onClick={refetch}
              className="w-8 h-8 rounded-lg border border-[#1E1E2E] flex items-center justify-center hover:border-[#E8650A]/40 hover:bg-[#E8650A]/5 transition-all active:scale-95">
              <RefreshCw size={13} className="text-[#6B6A7A]" />
            </button>
          </div>
        </div>
      </header>

      {/* ══ MAIN ══ */}
      <main className="max-w-[1520px] mx-auto px-6 py-6 space-y-5">

        {/* ── HERO ── */}
        <div className="card glow-orange p-6 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-[#E8650A]/4 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col lg:flex-row items-start lg:items-center gap-6">

            {/* Left: counter */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-[#6B6A7A] uppercase tracking-[0.18em] mb-2">
                Total Trades Registered
              </p>
              <div className="flex items-end gap-2.5 mb-2">
                <span className="text-[3.5rem] font-black leading-none text-[#E8E8F0] tracking-tight">
                  {total.toLocaleString()}
                </span>
                <span className="text-[#6B6A7A] font-semibold text-sm mb-2">trades</span>
              </div>
              <p className="text-[13px] text-[#6B6A7A] mb-4 font-medium">
                Infinite mode — {resolved > 0 ? `${resolved} resolved, ${s?.pending || 0} awaiting outcomes` : "Awaiting first resolutions"}
              </p>
              {/* Resolution bar */}
              <div className="flex items-center gap-3 max-w-sm">
                <div className="flex-1 h-1.5 bg-[#1E1E2E] rounded-full overflow-hidden">
                  <div className="h-full bg-[#E8650A] rounded-full progress-bar" style={{ width: `${resolvedPct}%` }} />
                </div>
                <span className="text-[10px] font-semibold text-[#6B6A7A] shrink-0">
                  {resolvedPct.toFixed(1)}% resolved
                </span>
              </div>
            </div>

            {/* Right: counters grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-3 shrink-0">
              {[
                { val: s?.won,     label: "Won",     color: "#00D296" },
                { val: s?.lost,    label: "Lost",    color: "#F04060" },
                { val: s?.pending, label: "Pending", color: "#E8650A" },
                { val: s?.skipped, label: "Skipped", color: "#6B6A7A" },
              ].map(({ val, label, color }) => (
                <div key={label} className="bg-[#0A0A0F] border border-[#1E1E2E] rounded-xl px-4 py-3 text-center min-w-[88px]">
                  <p className="text-[1.6rem] font-black leading-none" style={{ color }}>
                    {(val || 0).toLocaleString()}
                  </p>
                  <p className="text-[9px] font-bold text-[#6B6A7A] uppercase tracking-[0.15em] mt-1.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard icon={DollarSign} label="Bankroll"   value={s?.bankroll || 10} prefix="$" dec={2} color="orange" />
          <StatCard icon={TrendingUp} label="Total PnL"  value={s?.pnl || 0} prefix="$" dec={2}
            color={(s?.pnl || 0) >= 0 ? "green" : "red"} />
          <StatCard icon={Target}     label="Win Rate"   value={s?.win_rate || 0} suffix="%" dec={1} color="blue"
            sub={resolved > 0 ? `${resolved} resolved` : "No data yet"} />
          <StatCard icon={Activity}   label="Brier Score" value={s?.brier || 0} dec={4} color="purple"
            sub={(s?.brier || 1) < 0.2 && resolved > 0 ? "Well calibrated ✓" : resolved > 0 ? "Calibrating..." : "No data yet"} />
        </div>

        {/* ── CHARTS ROW ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Timeline */}
          <div className="card p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <BarChart2 size={15} className="text-[#E8650A]" />
                <p className="text-[12px] font-bold uppercase tracking-[0.12em]">Trade Activity</p>
              </div>
              <span className="text-[10px] text-[#6B6A7A] font-semibold bg-[#0A0A0F] px-2.5 py-1 rounded-lg border border-[#1E1E2E]">
                {(timeline || []).reduce((a, t) => a + t.trades, 0).toLocaleString()} total
              </span>
            </div>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={timeline || []} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#E8650A" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#E8650A" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gW" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#00D296" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#00D296" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="#1E1E2E" />
                <XAxis dataKey="hour" stroke="#1E1E2E" tick={{ fill: "#6B6A7A", fontSize: 10, fontFamily: "Montserrat" }} />
                <YAxis stroke="#1E1E2E" tick={{ fill: "#6B6A7A", fontSize: 10, fontFamily: "Montserrat" }} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="trades" stroke="#E8650A" fill="url(#gT)" strokeWidth={1.5} name="Trades" />
                <Area type="monotone" dataKey="won"    stroke="#00D296" fill="url(#gW)" strokeWidth={1.5} name="Won" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Pie */}
          <div className="card p-5">
            <div className="flex items-center gap-2.5 mb-5">
              <Zap size={15} className="text-[#8B5CF6]" />
              <p className="text-[12px] font-bold uppercase tracking-[0.12em]">Strategy Mix</p>
            </div>
            <ResponsiveContainer width="100%" height={165}>
              <PieChart>
                <Pie data={strats || []} dataKey="total" nameKey="strategy"
                  cx="50%" cy="50%" outerRadius={68} innerRadius={42} paddingAngle={2} strokeWidth={0}>
                  {(strats || []).map((s, i) => (
                    <Cell key={i} fill={STRAT_COLORS[s.strategy] || C.dim} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-3">
              {(strats || []).map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: STRAT_COLORS[s.strategy] || C.dim }} />
                    <span className="text-[11px] text-[#9A9AAA] font-medium capitalize">
                      {s.strategy?.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-[#E8E8F0]">{s.total.toLocaleString()}</span>
                    <span className={`text-[10px] font-bold font-mono ${s.pnl >= 0 ? "text-[#00D296]" : "text-[#F04060]"}`}>
                      {s.pnl >= 0 ? "+" : ""}{s.pnl.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── STRATEGIES + LIVE FEED ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Strategy cards */}
          <div className="lg:col-span-3 space-y-4">
            <p className="text-[11px] font-bold text-[#6B6A7A] uppercase tracking-[0.15em] flex items-center gap-2">
              <Target size={13} className="text-[#E8650A]" /> Strategy Performance
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(strats || []).map((s, i) => <StratCard key={i} s={s} />)}
            </div>
          </div>

          {/* Live feed */}
          <div className="lg:col-span-2 card flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E1E2E]">
              <div className="flex items-center gap-2.5">
                <Activity size={14} className="text-[#E8650A]" />
                <p className="text-[12px] font-bold uppercase tracking-[0.12em]">Live Feed</p>
              </div>
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#00D296]/6 border border-[#00D296]/12">
                <div className="live-dot" style={{ width: 6, height: 6 }} />
                <span className="text-[9px] font-bold text-[#00D296] uppercase tracking-wider">Real-time</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[560px] px-2 py-2 space-y-0">
              {(trades || []).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-[#6B6A7A]">
                  <Clock size={28} strokeWidth={1.5} />
                  <p className="text-[12px] font-medium">Awaiting trades...</p>
                </div>
              ) : (
                (trades || []).slice(0, 40).map((t, i) => <TradeRow key={t.id || i} trade={t} />)
              )}
            </div>
          </div>
        </div>

        {/* ── BANKROLL CHART ── */}
        {(bankroll || []).length > 1 && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <ArrowUpRight size={15} className={(s?.pnl || 0) >= 0 ? "text-[#00D296]" : "text-[#F04060]"} />
                <p className="text-[12px] font-bold uppercase tracking-[0.12em]">Bankroll Evolution</p>
              </div>
              <span className="text-[10px] text-[#6B6A7A] font-semibold bg-[#0A0A0F] px-2.5 py-1 rounded-lg border border-[#1E1E2E]">
                {(bankroll || []).length} entries
              </span>
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={bankroll} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#00D296" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#00D296" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="#1E1E2E" />
                <XAxis dataKey="id" stroke="#1E1E2E" tick={{ fill: "#6B6A7A", fontSize: 10, fontFamily: "Montserrat" }} />
                <YAxis stroke="#1E1E2E" tick={{ fill: "#6B6A7A", fontSize: 10, fontFamily: "Montserrat" }} domain={["auto","auto"]} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="balance" stroke="#00D296" fill="url(#gB)" strokeWidth={2} name="Balance $" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── FOOTER ── */}
        <footer className="flex items-center justify-center gap-3 py-5 border-t border-[#1E1E2E]/40">
          <Cpu size={11} className="text-[#2A2A3E]" />
          <p className="text-[10px] font-semibold text-[#2A2A3E] uppercase tracking-[0.2em]">
            NEXUS OS · POLYBOT DASHBOARD v2.1 · INFINITE MODE · {new Date().getFullYear()}
          </p>
        </footer>
      </main>
    </div>
  );
}
