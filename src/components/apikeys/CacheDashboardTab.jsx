import { useEffect, useState } from 'react';
import { Database, Zap, TrendingUp, RefreshCw, Coins, Eye } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import CacheFilterClear from './CacheFilterClear';
import CacheTrendsCharts from './CacheTrendsCharts';
import CacheDetailDrawer from './CacheDetailDrawer';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

function StatCard({ icon: Icon, label, value, sublabel, color = 'blue' }) {
  const colorMap = {
    blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/30 text-blue-400',
    purple: 'from-purple-500/20 to-purple-600/5 border-purple-500/30 text-purple-400',
    green: 'from-green-500/20 to-green-600/5 border-green-500/30 text-green-400',
    amber: 'from-amber-500/20 to-amber-600/5 border-amber-500/30 text-amber-400',
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-5 ${colorMap[color]}`}>
      <div className="flex items-center gap-2 text-xs font-medium mb-2 opacity-90">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <div className="text-3xl font-bold text-slate-100">{value}</div>
      {sublabel && <div className="text-xs text-slate-400 mt-1">{sublabel}</div>}
    </div>
  );
}

export default function CacheDashboardTab({ adminToken }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/functions/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cachedashboard', adminToken }),
      });
      const json = await res.json();
      setData(json.summary ? json : { error: json.error?.message || '缓存数据加载失败' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading && !data) {
    return <div className="text-center py-12 text-slate-500">加载中...</div>;
  }

  if (!data || !data.summary) {
    return <div className="text-center py-12 text-slate-500">{data?.error || '暂无数据'}</div>;
  }

  const { summary, byModel, byKey, top10 } = data;
  const hitRatePct = (summary.hitRate * 100).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-200">缓存仪表盘</h2>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="缓存命中率" value={`${hitRatePct}%`} sublabel={`${summary.totalHits} 次命中`} color="blue" />
        <StatCard icon={Database} label="缓存条目" value={summary.totalEntries} sublabel="活跃缓存数" color="purple" />
        <StatCard icon={Zap} label="总命中次数" value={summary.totalHits} sublabel={`共 ${summary.totalRequests} 个请求`} color="green" />
        <StatCard icon={Coins} label="节省 Token" value={summary.savedTokens.toLocaleString()} sublabel="估算值" color="amber" />
      </div>

      {/* Trends charts */}
      <CacheTrendsCharts adminToken={adminToken} />

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* By model */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">按模型命中分布</h3>
          {byModel.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">暂无命中数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={byModel} dataKey="hits" nameKey="model" cx="50%" cy="50%" outerRadius={80} label={(e) => `${e.model}: ${e.hits}`}>
                  {byModel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By API key */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">API Key 请求量 (Top 10)</h3>
          {byKey.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={byKey} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={120} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }} />
                <Bar dataKey="requests" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Filter & batch clear */}
      <CacheFilterClear adminToken={adminToken} onCleared={load} />

      {/* Top 10 entries */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Top 10 最常命中的缓存条目</h3>
        {top10.length === 0 || top10.every(t => t.hits === 0) ? (
          <div className="text-center py-12 text-slate-500 text-sm">暂无命中记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase">
                  <th className="text-left py-2 font-medium">#</th>
                  <th className="text-left py-2 font-medium">模型</th>
                  <th className="text-left py-2 font-medium">内容预览</th>
                  <th className="text-right py-2 font-medium">命中</th>
                  <th className="text-right py-2 font-medium">Token</th>
                  <th className="text-right py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {top10.map((entry, i) => (
                  <tr key={entry.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 text-slate-500">{i + 1}</td>
                    <td className="py-3"><span className="text-blue-300 font-mono text-xs">{entry.model}</span></td>
                    <td className="py-3 text-slate-300 max-w-md truncate" title={entry.preview}>{entry.preview || <span className="text-slate-600">(空)</span>}</td>
                    <td className="py-3 text-right">
                      <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs font-semibold">
                        {entry.hits}
                      </span>
                    </td>
                    <td className="py-3 text-right text-slate-400 font-mono text-xs">{entry.tokens.toLocaleString()}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => setDetailId(entry.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-blue-600/20 hover:text-blue-300 text-slate-300 text-xs transition-colors border border-slate-700 hover:border-blue-500/40"
                      >
                        <Eye className="w-3.5 h-3.5" /> 详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CacheDetailDrawer
        adminToken={adminToken}
        cacheId={detailId}
        open={!!detailId}
        onClose={() => setDetailId(null)}
      />
    </div>
  );
}