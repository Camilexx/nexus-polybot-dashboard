import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import {
  Activity, TrendingUp, Target, Zap, Trophy,
  DollarSign, BarChart2, RefreshCw, AlertCircle,
  CheckCircle, XCircle, Circle, ArrowUpRight, Cpu,
  Flame, Shield, Clock, Eye
} from "lucide-react";
import {
  fetchSummary, fetchStrategies, fetchRecentTrades,
  fetchTimeline, fetchBankrollHistory, isConfigured
} from "./supabase";

const REFRESH = 15000;

const STRAT_COLORS = {
  momentum:    "#3B82F6",
  value_bet:   "#E8650A",
  negrisk_arb: "#00D4AA",
  binary_arb:  "#8B5CF6",
  general:     "#6B6A7A",
  corners_1h:  "#F59E0B",
  tarjetas:    "#EC4899",
};

const STRAT_ICONS = {
  momentum:    Flame,
  value_bet:   Eye,
  negrisk_arb: Shield,
  binary_arb:  Zap,
};

/* ─── Hook: fetch any async fn with auto-refresh ─── */
function useAsync(asyncFn, interval = REFRESH) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const run = useCallback(async () => {
    try {
      const result = await asyncFn();
      setData(result);
      setLastUpdate(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [asyncFn]);

  useEffect(() => {
    run();
    const id = setInterval(run, interval);
    return () => clearInterval(id);
  }, [run, interval]);

  return { data, loading, error, lastUpdate, refetch: run };
}

/* ─── Animated Number ─── */
function AnimatedNumber({ value, prefix = "", suffix = "", decimals = 0 }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const target = Number(value) || 0;
    const diff = target - display;
    if (Math.abs(diff) < 0.01) { setDisplay(target); return; }
    const step = diff / 15;
    const id = setInterval(() => {
      setDisplay(prev => {
        const next = prev + step;
        if (Math.abs(next - target) < Math.abs(step)) { clearInterval(id); return target; }
        return next;
      });
    }, 20);
    return () => clearInterval(id);
  }, [value]);
  return <span>{prefix}{display.toFixed(decimals)}{suffix}</span>;
}

/* ─── Stat Card ─── */
function StatCard({ icon: Icon, label, value, sub, color = "orange", prefix = "", suffix = "", decimals = 0, glow = false }) {
  const colors = {
    orange: { text: "text-[#E8650A]", bg: "bg-[#E8650A]/10", border: "border-[#E8650A]/20", shadow: "shadow-[#E8650A]/5" },
    green:  { text: "text-[#00D4AA]", bg: "bg-[#00D4AA]/10", border: "border-[#00D4AA]/20", shadow: "shadow-[#00D4AA]/5" },
    red:    { text: "text-[#FF4455]", bg: "bg-[#FF4455]/10", border: "border-[#FF4455]/20", shadow: "shadow-[#FF4455]/5" },
    blue:   { text: "text-[#3B82F6]", bg: "bg-[#3B82F6]/10", border: "border-[#3B82F6]/20", shadow: "shadow-[#3B82F6]/5" },
    purple: { text: "text-[#8B5CF6]", bg: "bg-[#8B5CF6]/10", border: "border-[#8B5CF6]/20", shadow: "shadow-[#8B5CF6]/5" },
  };
  const c = colors[color] || colors.orange;
  return (
    <div className={`card p-5 flex flex-col gap-3 ${glow ? `glow-${color}` : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-[#6B6A7A] text-[11px] font-mono uppercase tracking-[0.15em]">{label}</span>
        <div className={`${c.bg} ${c.border} border p-2 rounded-xl`}>
          <Icon size={14} className={c.text} strokeWidth={2.5} />
        </div>
      </div>
      <div className={`font-display text-[2rem] font-extrabold leading-none ${c.text}`}>
        <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </div>
      {sub && <span className="text-[#6B6A7A] text-[11px] font-mono">{sub}</span>}
    </div>
  );
}

/* ─── Counter Box (for hero section) ─── */
function CounterBox({ value, label, color }) {
  const colorMap = {
    green:  "text-[#00D4AA]",
    red:    "text-[#FF4455]",
    orange: "text-[#E8650A]",
    purple: "text-[#8B5CF6]",
    blue:   "text-[#3B82F6]",
  };
  return (
    <div className="bg-[#111]/80 backdrop-blur rounded-xl p-4 text-center min-w-[90px] border border-[#1A1A1A]">
      <div className={`font-display font-extrabold text-[1.75rem] leading-none ${colorMap[color] || "text-white"}`}>
        {(value || 0).toLocaleString()}
      </div>
      <div className="text-[9px] font-mono text-[#6B6A7A] uppercase tracking-[0.2em] mt-1.5">{label}</div>
    </div>
  );
}

/* ─── Trade Row ─── */
function OutcomeRow({ trade, index }) {
  const icons = {
    win:     <CheckCircle size={15} className="text-[#00D4AA]" />,
    loss:    <XCircle     size={15} className="text-[#FF4455]" />,
    pending: <Clock       size={15} className="text-[#E8650A] animate-pulse" />,
    skip:    <AlertCircle size={15} className="text-[#6B6A7A]" />,
    skipped: <AlertCircle size={15} className="text-[#6B6A7A]" />,
  };
  const colorMap = {
    win: "text-[#00D4AA]", loss: "text-[#FF4455]",
    pending: "text-[#E8650A]", skip: "text-[#6B6A7A]", skipped: "text-[#6B6A7A]",
  };
  const outcome = trade.outcome || "skip";
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[#1A1A1A]/60 hover:bg-[#111]/50 transition-all px-3 rounded-lg group"
      style={{ animationDelay: `${index * 30}ms` }}>
      <div className="shrink-0 group-hover:scale-110 transition-transform">{icons[outcome] || icons.skip}</div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-[#F0EFF8] truncate leading-tight">{trade.market_name || "Unknown market"}</p>
        <div className="flex gap-2 mt-1">
          <span className="text-[9px] font-mono px-2 py-0.5 rounded-md font-medium"
            style={{ background: `${STRAT_COLORS[trade.strategy] || "#333"}18`, color: STRAT_COLORS[trade.strategy] || "#666" }}>
            {trade.strategy?.toUpperCase().replace(/_/g, " ")}
          </span>
          <span className="text-[9px] text-[#6B6A7A] font-mono">{trade.confianza?.toFixed(1)}%</span>
          {trade.ev != null && <span className="text-[9px] text-[#8B5CF6] font-mono">EV:{trade.ev?.toFixed(3)}</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        {trade.pnl != null && outcome !== "pending" && outcome !== "skip" && outcome !== "skipped" ? (
          <span className={`text-[13px] font-mono font-bold ${trade.pnl >= 0 ? "text-[#00D4AA]" : "text-[#FF4455]"}`}>
            {trade.pnl >= 0 ? "+" : ""}{trade.pnl?.toFixed(2)}
          </span>
        ) : (
          <span className={`text-[12px] font-mono ${colorMap[outcome]}`}>
            ${trade.stake?.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Strategy Card ─── */
function StrategyCard({ s }) {
  const color = STRAT_COLORS[s.strategy] || "#6B6A7A";
  const wr = s.win_rate || 0;
  const Icon = STRAT_ICONS[s.strategy] || Zap;
  return (
    <div className="card p-5 flex flex-col gap-4 hover:border-[#E8650A]/30 transition-all group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg" style={{ background: `${color}18` }}>
            <Icon size={16} style={{ color }} strokeWidth={2.5} />
          </div>
          <span className="font-display font-bold text-[13px] uppercase tracking-wide" style={{ color }}>
            {s.strategy?.replace(/_/g, " ")}
          </span>
        </div>
        <span className="text-[10px] font-mono text-[#6B6A7A] bg-[#111] px-2 py-1 rounded-md">
          {s.total.toLocaleString()}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-[1.1rem] font-display font-bold"
            style={{ color: wr >= 55 ? "#00D4AA" : wr >= 45 ? "#E8650A" : "#FF4455" }}>
            {wr.toFixed(1)}%
          </div>
          <div className="text-[8px] text-[#6B6A7A] uppercase tracking-widest mt-0.5">Win</div>
        </div>
        <div>
          <div className={`text-[1.1rem] font-display font-bold ${s.pnl >= 0 ? "text-[#00D4AA]" : "text-[#FF4455]"}`}>
            {s.pnl >= 0 ? "+" : ""}{s.pnl?.toFixed(2)}
          </div>
          <div className="text-[8px] text-[#6B6A7A] uppercase tracking-widest mt-0.5">PnL</div>
        </div>
        <div>
          <div className="text-[1.1rem] font-display font-bold text-[#8B5CF6]">{s.avg_ev?.toFixed(4)}</div>
          <div className="text-[8px] text-[#6B6A7A] uppercase tracking-widest mt-0.5">EV</div>
        </div>
        <div>
          <div className="text-[1.1rem] font-display font-bold text-[#3B82F6]">{s.brier?.toFixed(4)}</div>
          <div className="text-[8px] text-[#6B6A7A] uppercase tracking-widest mt-0.5">Brier</div>
        </div>
      </div>
      <div className="w-full bg-[#111] rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all duration-1000"
          style={{ width: `${Math.min(wr, 100)}%`, background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
      </div>
    </div>
  );
}

/* ─── Tooltip ─── */
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111] border border-[#2A2A2A] rounded-xl p-3 text-xs font-mono shadow-2xl">
      <p className="text-[#6B6A7A] mb-1.5 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2" style={{ color: p.color }}>
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
        </p>
      ))}
    </div>
  );
};

/* ─── Not Configured Screen ─── */
function NotConfigured() {
  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center">
      <div className="card p-10 max-w-lg text-center space-y-4">
        <Cpu size={48} className="text-[#E8650A] mx-auto" />
        <h1 className="font-display font-bold text-2xl text-[#F0EFF8]">NEXUS POLYBOT</h1>
        <p className="text-[#6B6A7A] text-sm">
          Dashboard not connected. Set the following environment variables in Vercel:
        </p>
        <div className="bg-[#111] rounded-xl p-4 text-left font-mono text-xs space-y-1 text-[#E8650A]">
          <p>VITE_SUPABASE_URL=https://your-project.supabase.co</p>
          <p>VITE_SUPABASE_ANON_KEY=your-anon-key</p>
        </div>
        <p className="text-[#6B6A7A] text-xs">Then redeploy for changes to take effect.</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════ */
export default function App() {
  const { data: summary, lastUpdate, refetch, error } = useAsync(fetchSummary);
  const { data: strategies }      = useAsync(fetchStrategies);
  const { data: trades }          = useAsync(fetchRecentTrades);
  const { data: timeline }        = useAsync(fetchTimeline);
  const { data: bankrollHistory } = useAsync(fetchBankrollHistory);

  if (!isConfigured()) return <NotConfigured />;

  const resolved = (summary?.won || 0) + (summary?.lost || 0);
  const total = summary?.total || 0;

  return (
    <div className="min-h-screen bg-[#080808] text-[#F0EFF8] font-body">
      <div className="scanline" />

      {/* ── HEADER ── */}
      <header className="border-b border-[#1A1A1A] px-6 py-3.5 flex items-center justify-between sticky top-0 z-50 bg-[#080808]/95 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <Cpu size={22} className="text-[#E8650A]" strokeWidth={2.5} />
            <span className="font-display font-extrabold text-[1.3rem] tracking-[0.15em] text-[#E8650A]">NEXUS</span>
            <span className="font-display font-bold text-[1.3rem] tracking-[0.15em] text-[#F0EFF8]">POLYBOT</span>
          </div>
          <div className="flex items-center gap-2 bg-[#0D0D0D] border border-[#00D4AA]/20 px-3 py-1.5 rounded-full">
            <div className="live-dot" />
            <span className="text-[10px] font-mono text-[#00D4AA] uppercase tracking-[0.2em] font-medium">
              Paper Mode Live
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {error && (
            <span className="text-[10px] font-mono text-[#FF4455] bg-[#FF4455]/10 px-2 py-1 rounded">
              Connection error
            </span>
          )}
          <span className="text-[10px] font-mono text-[#6B6A7A]">
            {lastUpdate ? `${lastUpdate.toLocaleTimeString()}` : "Connecting..."}
          </span>
          <button onClick={refetch}
            className="p-2 rounded-xl border border-[#1A1A1A] hover:border-[#E8650A]/50 hover:bg-[#E8650A]/5 transition-all cursor-pointer active:scale-95">
            <RefreshCw size={14} className="text-[#6B6A7A]" />
          </button>
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto space-y-6">

        {/* ── HERO SECTION ── */}
        <div className="card p-8 glow-orange relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#E8650A]/3 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#8B5CF6]/3 rounded-full blur-[80px] pointer-events-none" />

          <div className="relative flex flex-col lg:flex-row items-start lg:items-center gap-8">
            {/* Main counter */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Activity size={16} className="text-[#E8650A]" />
                <span className="text-[11px] font-mono text-[#6B6A7A] uppercase tracking-[0.2em]">Total Trades Registered</span>
              </div>
              <div className="flex items-end gap-3 mb-3">
                <span className="font-display font-black text-[4.5rem] leading-none text-[#F0EFF8] tracking-tight">
                  {total.toLocaleString()}
                </span>
                <span className="text-[#6B6A7A] font-mono text-sm mb-3">trades</span>
              </div>
              <p className="text-[#6B6A7A] text-sm mb-5 max-w-md">
                Infinite paper mode — continuous calibration and self-improvement.
                {resolved > 0 && ` ${resolved} resolved, ${summary?.pending || 0} awaiting outcomes.`}
              </p>
              {/* Mini progress bar based on resolved */}
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-[#111] rounded-full h-2 max-w-md overflow-hidden">
                  <div className="h-2 rounded-full bg-gradient-to-r from-[#E8650A] to-[#FF6B2B] transition-all duration-1000"
                    style={{ width: `${Math.min((resolved / Math.max(total, 1)) * 100, 100)}%` }} />
                </div>
                <span className="text-[10px] font-mono text-[#6B6A7A]">
                  {resolved > 0 ? `${((resolved / total) * 100).toFixed(1)}% resolved` : "Awaiting resolution"}
                </span>
              </div>
            </div>

            {/* Outcome counters */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <CounterBox value={summary?.won} label="Won" color="green" />
              <CounterBox value={summary?.lost} label="Lost" color="red" />
              <CounterBox value={summary?.pending} label="Pending" color="orange" />
              <CounterBox value={summary?.skipped} label="Skipped" color="purple" />
            </div>
          </div>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={DollarSign} label="Bankroll" value={summary?.bankroll || 10}
            prefix="$" decimals={2} color="orange" glow />
          <StatCard icon={TrendingUp} label="Total PnL" value={summary?.pnl || 0}
            prefix="$" decimals={2} color={(summary?.pnl || 0) >= 0 ? "green" : "red"} />
          <StatCard icon={Target} label="Win Rate" value={summary?.win_rate || 0}
            suffix="%" decimals={1} color="blue"
            sub={resolved > 10 ? `${resolved} resolved trades` : "Waiting for data..."} />
          <StatCard icon={Activity} label="Brier Score" value={summary?.brier || 0}
            decimals={4} color="purple"
            sub={(summary?.brier || 1) < 0.2 && resolved > 0 ? "Well calibrated" : resolved > 0 ? "Calibrating..." : "No data yet"} />
        </div>

        {/* ── CHARTS ROW ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Timeline Chart */}
          <div className="card p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <BarChart2 size={16} className="text-[#E8650A]" />
                <h3 className="font-display font-bold uppercase tracking-[0.15em] text-sm">Trade Activity</h3>
              </div>
              <span className="text-[9px] font-mono text-[#6B6A7A] bg-[#111] px-2 py-1 rounded-md">
                {(timeline || []).reduce((a, t) => a + t.trades, 0).toLocaleString()} total
              </span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={timeline || []}>
                <defs>
                  <linearGradient id="gradTrades" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#E8650A" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#E8650A" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradWon" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00D4AA" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00D4AA" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" />
                <XAxis dataKey="hour" stroke="#1A1A1A" tick={{ fill: "#6B6A7A", fontSize: 10 }} />
                <YAxis stroke="#1A1A1A" tick={{ fill: "#6B6A7A", fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="trades" stroke="#E8650A" fill="url(#gradTrades)"
                  strokeWidth={2} name="Total" />
                <Area type="monotone" dataKey="won" stroke="#00D4AA" fill="url(#gradWon)"
                  strokeWidth={1.5} name="Won" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Strategy Pie */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-[#8B5CF6]" />
                <h3 className="font-display font-bold uppercase tracking-[0.15em] text-sm">Strategy Mix</h3>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={strategies || []} dataKey="total" nameKey="strategy"
                  cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={2} strokeWidth={0}>
                  {(strategies || []).map((s, i) => (
                    <Cell key={i} fill={STRAT_COLORS[s.strategy] || "#333"} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-3">
              {(strategies || []).map((s, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: STRAT_COLORS[s.strategy] || "#333" }} />
                    <span className="text-[#9A99AA] font-mono">{s.strategy?.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[#F0EFF8] font-medium">{s.total.toLocaleString()}</span>
                    <span className={`font-mono text-[10px] ${s.pnl >= 0 ? "text-[#00D4AA]" : "text-[#FF4455]"}`}>
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
          {/* Strategy Cards */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center gap-2">
              <Trophy size={16} className="text-[#E8650A]" />
              <h3 className="font-display font-bold uppercase tracking-[0.15em] text-sm text-[#9A99AA]">
                Strategy Performance
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(strategies || []).map((s, i) => <StrategyCard key={i} s={s} />)}
            </div>
          </div>

          {/* Live Trades Feed */}
          <div className="lg:col-span-2 card p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-[#E8650A]" />
                <h3 className="font-display font-bold uppercase tracking-[0.15em] text-sm">Live Feed</h3>
              </div>
              <div className="flex items-center gap-2 bg-[#00D4AA]/8 px-2.5 py-1 rounded-full">
                <div className="live-dot" style={{ width: 6, height: 6 }} />
                <span className="text-[9px] font-mono text-[#00D4AA] font-medium tracking-wider">REAL-TIME</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[600px] space-y-0.5 scrollbar-thin">
              {(trades || []).length === 0 && (
                <div className="text-center py-12 text-[#6B6A7A] text-sm">
                  <Clock size={32} className="mx-auto mb-3 text-[#2A2A2A]" />
                  Waiting for trades...
                </div>
              )}
              {(trades || []).slice(0, 40).map((t, i) => <OutcomeRow key={t.id || i} trade={t} index={i} />)}
            </div>
          </div>
        </div>

        {/* ── BANKROLL CHART ── */}
        {(bankrollHistory || []).length > 1 && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <ArrowUpRight size={16} className={(summary?.pnl || 0) >= 0 ? "text-[#00D4AA]" : "text-[#FF4455]"} />
                <h3 className="font-display font-bold uppercase tracking-[0.15em] text-sm">Bankroll Evolution</h3>
              </div>
              <span className="text-[10px] font-mono text-[#6B6A7A] bg-[#111] px-2 py-1 rounded-md">
                {(bankrollHistory || []).length} entries
              </span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={bankrollHistory}>
                <defs>
                  <linearGradient id="gradBank" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00D4AA" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#00D4AA" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" />
                <XAxis dataKey="id" stroke="#1A1A1A" tick={{ fill: "#6B6A7A", fontSize: 10 }} />
                <YAxis stroke="#1A1A1A" tick={{ fill: "#6B6A7A", fontSize: 10 }} domain={["auto","auto"]} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="balance" stroke="#00D4AA" fill="url(#gradBank)"
                  strokeWidth={2} name="Bankroll $" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── FOOTER ── */}
        <footer className="text-center py-6 border-t border-[#1A1A1A]/50">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Cpu size={12} className="text-[#E8650A]" />
            <span className="text-[#2A2A2A] text-[11px] font-mono tracking-widest">
              NEXUS OS — POLYBOT DASHBOARD v2.0 — INFINITE MODE — {new Date().getFullYear()}
            </span>
          </div>
          <span className="text-[#1A1A1A] text-[10px] font-mono">
            Connected to Supabase | Auto-refresh {REFRESH/1000}s
          </span>
        </footer>
      </main>
    </div>
  );
}
