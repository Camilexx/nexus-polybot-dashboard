import { useState, useEffect, useCallback } from "react";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import {
  Activity, TrendingUp, Target, Zap,
  DollarSign, BarChart2, RefreshCw, AlertCircle,
  CheckCircle, XCircle, Circle, ArrowUpRight, Cpu
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";
const REFRESH = 10000;

const STRAT_COLORS = {
  momentum:    "#3B82F6",
  value_bet:   "#E8650A",
  negrisk_arb: "#00D4AA",
  binary_arb:  "#8B5CF6",
  general:     "#6B6A7A",
  corners_1h:  "#F59E0B",
  tarjetas:    "#EC4899",
};

function useData(endpoint, interval = REFRESH) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch(`${API}${endpoint}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
      setLastUpdate(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, interval);
    return () => clearInterval(id);
  }, [fetchData, interval]);

  return { data, loading, error, lastUpdate, refetch: fetchData };
}

function AnimatedNumber({ value, prefix = "", suffix = "", decimals = 0 }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const target = Number(value) || 0;
    const diff = target - display;
    if (Math.abs(diff) < 0.01) { setDisplay(target); return; }
    const step = diff / 20;
    const id = setInterval(() => {
      setDisplay(prev => {
        const next = prev + step;
        if (Math.abs(next - target) < Math.abs(step)) { clearInterval(id); return target; }
        return next;
      });
    }, 16);
    return () => clearInterval(id);
  }, [value]);
  return <span>{prefix}{display.toFixed(decimals)}{suffix}</span>;
}

function StatCard({ icon: Icon, label, value, sub, color = "orange", prefix = "", suffix = "", decimals = 0, glow = false }) {
  const colors = {
    orange: { text: "text-[#E8650A]", bg: "bg-[#E8650A]/10", border: "border-[#E8650A]/20" },
    green:  { text: "text-[#00D4AA]", bg: "bg-[#00D4AA]/10", border: "border-[#00D4AA]/20" },
    red:    { text: "text-[#FF4455]", bg: "bg-[#FF4455]/10", border: "border-[#FF4455]/20" },
    blue:   { text: "text-[#3B82F6]", bg: "bg-[#3B82F6]/10", border: "border-[#3B82F6]/20" },
    purple: { text: "text-[#8B5CF6]", bg: "bg-[#8B5CF6]/10", border: "border-[#8B5CF6]/20" },
  };
  const c = colors[color] || colors.orange;
  return (
    <div className={`card p-5 flex flex-col gap-3 ${glow ? `glow-${color}` : ""}`} style={{ animation: "fadeIn 0.5s ease-out" }}>
      <div className="flex items-center justify-between">
        <span className="text-[#6B6A7A] text-xs font-mono uppercase tracking-widest">{label}</span>
        <div className={`${c.bg} ${c.border} border p-1.5 rounded-lg`}>
          <Icon size={14} className={c.text} />
        </div>
      </div>
      <div className={`font-[Barlow_Condensed] text-3xl font-bold ${c.text}`}>
        <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </div>
      {sub && <span className="text-[#6B6A7A] text-xs">{sub}</span>}
    </div>
  );
}

function ProgressRing({ pct, size = 120 }) {
  const r   = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (Math.min(pct, 100) / 100);
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1A1A1A" strokeWidth="8" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E8650A" strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1s ease-out" }} />
    </svg>
  );
}

function OutcomeRow({ trade }) {
  const icons = {
    win:     <CheckCircle size={14} className="text-[#00D4AA]" />,
    loss:    <XCircle     size={14} className="text-[#FF4455]" />,
    pending: <Circle      size={14} className="text-[#E8650A] animate-pulse" />,
    skip:    <AlertCircle size={14} className="text-[#6B6A7A]" />,
  };
  const colorMap = {
    win: "text-[#00D4AA]", loss: "text-[#FF4455]",
    pending: "text-[#E8650A]", skip: "text-[#6B6A7A]",
  };
  const outcome = trade.outcome || "skip";
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[#1A1A1A] hover:bg-[#111] transition-colors px-2 rounded">
      <div className="shrink-0">{icons[outcome] || icons.skip}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[#F0EFF8] truncate">{trade.market_name}</p>
        <div className="flex gap-2 mt-0.5">
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
            style={{ background: `${STRAT_COLORS[trade.strategy] || "#333"}22`, color: STRAT_COLORS[trade.strategy] || "#666" }}>
            {trade.strategy?.toUpperCase()}
          </span>
          <span className="text-[9px] text-[#6B6A7A] font-mono">{trade.confianza?.toFixed(1)}%</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        {trade.pnl != null && outcome !== "pending" && outcome !== "skip" ? (
          <span className={`text-xs font-mono font-bold ${trade.pnl >= 0 ? "text-[#00D4AA]" : "text-[#FF4455]"}`}>
            {trade.pnl >= 0 ? "+" : ""}{trade.pnl?.toFixed(2)}
          </span>
        ) : (
          <span className={`text-xs font-mono ${colorMap[outcome]}`}>
            ${trade.stake?.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}

function StrategyCard({ s }) {
  const color  = STRAT_COLORS[s.strategy] || "#6B6A7A";
  const wr = s.win_rate || 0;
  return (
    <div className="card p-4 flex flex-col gap-3 hover:border-[#E8650A]/30 transition-colors">
      <div className="flex items-center justify-between">
        <span className="font-[Barlow_Condensed] font-bold text-sm uppercase tracking-wide" style={{ color }}>
          {s.strategy?.replace(/_/g, " ")}
        </span>
        <span className="text-[10px] font-mono text-[#6B6A7A]">{s.total} trades</span>
      </div>
      <div className="flex gap-4 text-center">
        <div>
          <div className="text-lg font-[Barlow_Condensed] font-bold" style={{ color: wr >= 55 ? "#00D4AA" : wr >= 45 ? "#E8650A" : "#FF4455" }}>
            {wr.toFixed(1)}%
          </div>
          <div className="text-[9px] text-[#6B6A7A] uppercase tracking-wide">Win Rate</div>
        </div>
        <div>
          <div className={`text-lg font-[Barlow_Condensed] font-bold ${s.pnl >= 0 ? "text-[#00D4AA]" : "text-[#FF4455]"}`}>
            {s.pnl >= 0 ? "+" : ""}{s.pnl?.toFixed(2)}
          </div>
          <div className="text-[9px] text-[#6B6A7A] uppercase tracking-wide">PnL</div>
        </div>
        <div>
          <div className="text-lg font-[Barlow_Condensed] font-bold text-[#8B5CF6]">{s.avg_ev?.toFixed(4)}</div>
          <div className="text-[9px] text-[#6B6A7A] uppercase tracking-wide">Avg EV</div>
        </div>
      </div>
      <div className="w-full bg-[#1A1A1A] rounded-full h-1">
        <div className="h-1 rounded-full progress-bar"
          style={{ width: `${Math.min(wr, 100)}%`, background: color }} />
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card p-3 text-xs font-mono border-[#E8650A]/30">
      <p className="text-[#6B6A7A] mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}</p>
      ))}
    </div>
  );
};

export default function App() {
  const { data: summary, lastUpdate, refetch } = useData("/api/summary");
  const { data: strategies }                    = useData("/api/strategies");
  const { data: trades }                        = useData("/api/trades/recent");
  const { data: timeline }                      = useData("/api/trades/timeline");
  const { data: bankrollHistory }               = useData("/api/bankroll/history");

  const pct = summary?.progress || 0;

  return (
    <div className="min-h-screen bg-[#080808] text-[#F0EFF8]">
      <div className="scanline" />

      {/* HEADER */}
      <header className="border-b border-[#1A1A1A] px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-[#080808]/90 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Cpu size={20} className="text-[#E8650A]" />
            <span className="font-[Barlow_Condensed] font-bold text-xl tracking-widest text-[#E8650A]">NEXUS</span>
            <span className="font-[Barlow_Condensed] text-xl tracking-widest text-[#F0EFF8]">POLYBOT</span>
          </div>
          <div className="flex items-center gap-2 bg-[#0D0D0D] border border-[#1A1A1A] px-3 py-1.5 rounded-full">
            <div className="live-dot" />
            <span className="text-[10px] font-mono text-[#00D4AA] uppercase tracking-widest">PAPER MODE LIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-mono text-[#6B6A7A]">
            {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : "Connecting..."}
          </span>
          <button onClick={refetch}
            className="p-2 rounded-lg border border-[#1A1A1A] hover:border-[#E8650A]/50 transition-colors cursor-pointer">
            <RefreshCw size={14} className="text-[#6B6A7A]" />
          </button>
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto space-y-6">

        {/* PROGRESS HERO */}
        <div className="card p-6 flex flex-col md:flex-row items-center gap-8 glow-orange">
          <div className="relative">
            <ProgressRing pct={pct} size={130} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-[Barlow_Condensed] font-black text-2xl text-[#E8650A]">{pct.toFixed(1)}%</span>
              <span className="text-[9px] font-mono text-[#6B6A7A] uppercase">Progress</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-end gap-2 mb-1">
              <span className="font-[Barlow_Condensed] font-black text-5xl text-[#F0EFF8]">
                {summary?.total?.toLocaleString() || "0"}
              </span>
              <span className="text-[#6B6A7A] font-mono text-sm mb-2">/ 5,000 trades</span>
            </div>
            <p className="text-[#6B6A7A] text-sm mb-4">Paper mode calibration — Target: 5,000 trades before live trading</p>
            <div className="w-full bg-[#1A1A1A] rounded-full h-2">
              <div className="h-2 rounded-full bg-gradient-to-r from-[#E8650A] to-[#FF6B2B] progress-bar"
                style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="bg-[#1A1A1A] rounded-xl p-4">
              <div className="font-[Barlow_Condensed] font-bold text-2xl text-[#00D4AA]">{summary?.won || 0}</div>
              <div className="text-[9px] font-mono text-[#6B6A7A] uppercase tracking-wide">Won</div>
            </div>
            <div className="bg-[#1A1A1A] rounded-xl p-4">
              <div className="font-[Barlow_Condensed] font-bold text-2xl text-[#FF4455]">{summary?.lost || 0}</div>
              <div className="text-[9px] font-mono text-[#6B6A7A] uppercase tracking-wide">Lost</div>
            </div>
            <div className="bg-[#1A1A1A] rounded-xl p-4">
              <div className="font-[Barlow_Condensed] font-bold text-2xl text-[#E8650A]">{summary?.pending || 0}</div>
              <div className="text-[9px] font-mono text-[#6B6A7A] uppercase tracking-wide">Pending</div>
            </div>
            <div className="bg-[#1A1A1A] rounded-xl p-4">
              <div className="font-[Barlow_Condensed] font-bold text-2xl text-[#8B5CF6]">{summary?.skipped || 0}</div>
              <div className="text-[9px] font-mono text-[#6B6A7A] uppercase tracking-wide">Skipped</div>
            </div>
          </div>
        </div>

        {/* STAT CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={DollarSign} label="Bankroll" value={summary?.bankroll || 10}
            prefix="$" decimals={2} color="orange" glow />
          <StatCard icon={TrendingUp} label="Total PnL" value={summary?.pnl || 0}
            prefix="$" decimals={2} color={(summary?.pnl || 0) >= 0 ? "green" : "red"} />
          <StatCard icon={Target} label="Win Rate" value={summary?.win_rate || 0}
            suffix="%" decimals={1} color="blue" />
          <StatCard icon={Activity} label="Brier Score" value={summary?.brier || 0}
            decimals={4} color="purple"
            sub={(summary?.brier || 1) < 0.2 ? "Calibrated" : "Calibrating..."} />
        </div>

        {/* CHARTS ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Timeline Chart */}
          <div className="card p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-[Barlow_Condensed] font-bold uppercase tracking-widest text-sm">Trade Activity (24h)</h3>
              <BarChart2 size={14} className="text-[#6B6A7A]" />
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={timeline || []}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#E8650A" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#E8650A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" />
                <XAxis dataKey="hour" stroke="#2A2A2A" tick={{ fill: "#6B6A7A", fontSize: 10 }} />
                <YAxis stroke="#2A2A2A" tick={{ fill: "#6B6A7A", fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="trades" stroke="#E8650A" fill="url(#grad)"
                  strokeWidth={2} name="Trades" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Strategy Pie */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-[Barlow_Condensed] font-bold uppercase tracking-widest text-sm">Strategy Mix</h3>
              <Zap size={14} className="text-[#6B6A7A]" />
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={strategies || []} dataKey="total" nameKey="strategy"
                  cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={3}>
                  {(strategies || []).map((s, i) => (
                    <Cell key={i} fill={STRAT_COLORS[s.strategy] || "#333"} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {(strategies || []).slice(0, 4).map((s, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: STRAT_COLORS[s.strategy] || "#333" }} />
                    <span className="text-[#6B6A7A] font-mono">{s.strategy?.replace(/_/g, " ")}</span>
                  </div>
                  <span className="font-mono text-[#F0EFF8]">{s.total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* STRATEGIES + LIVE TRADES */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Strategy Cards */}
          <div className="lg:col-span-3 space-y-3">
            <h3 className="font-[Barlow_Condensed] font-bold uppercase tracking-widest text-sm text-[#6B6A7A]">
              Strategy Performance
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(strategies || []).map((s, i) => <StrategyCard key={i} s={s} />)}
            </div>
          </div>

          {/* Live Trades Feed */}
          <div className="lg:col-span-2 card p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-[Barlow_Condensed] font-bold uppercase tracking-widest text-sm">Live Feed</h3>
              <div className="flex items-center gap-2">
                <div className="live-dot" />
                <span className="text-[10px] font-mono text-[#6B6A7A]">REAL-TIME</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[500px] space-y-0.5">
              {(trades || []).slice(0, 30).map((t, i) => <OutcomeRow key={i} trade={t} />)}
            </div>
          </div>
        </div>

        {/* BANKROLL CHART */}
        {(bankrollHistory || []).length > 1 && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-[Barlow_Condensed] font-bold uppercase tracking-widest text-sm">Bankroll Evolution</h3>
              <ArrowUpRight size={14} className={(summary?.pnl || 0) >= 0 ? "text-[#00D4AA]" : "text-[#FF4455]"} />
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={bankrollHistory}>
                <defs>
                  <linearGradient id="gradBank" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00D4AA" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00D4AA" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" />
                <XAxis dataKey="id" stroke="#2A2A2A" tick={{ fill: "#6B6A7A", fontSize: 10 }} />
                <YAxis stroke="#2A2A2A" tick={{ fill: "#6B6A7A", fontSize: 10 }} domain={["auto","auto"]} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="balance" stroke="#00D4AA" fill="url(#gradBank)"
                  strokeWidth={2} name="Bankroll $" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* FOOTER */}
        <footer className="text-center py-4 text-[#2A2A2A] text-xs font-mono">
          NEXUS OS — POLYBOT DASHBOARD v1.0 — PAPER MODE — {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}
