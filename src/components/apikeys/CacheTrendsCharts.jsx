import { useEffect, useState } from 'react';
import { TrendingUp, HardDrive, Activity, RefreshCw } from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

export default function CacheTrendsCharts({ adminToken }) {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);

  const load = async (d = days) => {
    setLoading(true);
    try {
      const res = await fetch('/functions/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cachetrends', adminToken, days: d }),
      });
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(days); /* eslint-disable-next-line */ }, []);

  const handleRange = (d) => { setDays(d); load(d); };

  if (!data) {
    return <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-center text-slate-500">加载图表数据...</div>;
  }

  const { daily = [], storage = [] } = data;
  const tooltipStyle = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" /> 缓存趋势分析
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-800 rounded-lg p-1">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => handleRange(d)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${days === d ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {d}天
              </button>
            ))}
          </div>
          <button onClick={() => load(days)} disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Hit-rate trend */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-green-400" />
            <h4 className="text-sm font-medium text-slate-200">缓存命中率趋势 (%)</h4>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 100]} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v}%`} />
              <Line type="monotone" dataKey="hitRate" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} name="命中率" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Daily request volume */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-blue-400" />
            <h4 className="text-sm font-medium text-slate-200">每日请求量波动</h4>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={daily}>
              <defs>
                <linearGradient id="reqGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="hitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="requests" stroke="#3b82f6" fill="url(#reqGrad)" name="新请求" />
              <Area type="monotone" dataKey="hits" stroke="#8b5cf6" fill="url(#hitGrad)" name="缓存命中" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Storage per model */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <HardDrive className="w-4 h-4 text-amber-400" />
          <h4 className="text-sm font-medium text-slate-200">各模型缓存占用空间 (KB)</h4>
        </div>
        {storage.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">暂无缓存数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, storage.length * 36)}>
            <BarChart data={storage} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis type="category" dataKey="model" tick={{ fill: '#94a3b8', fontSize: 11 }} width={140} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, n, p) => [`${v} KB · ${p.payload.entries} 条`, '占用']} />
              <Bar dataKey="kb" radius={[0, 4, 4, 0]}>
                {storage.map((_, i) => (
                  <Bar key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}