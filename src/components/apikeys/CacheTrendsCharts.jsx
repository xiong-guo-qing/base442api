import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Activity, RefreshCw, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const DAY_COUNT = 7;

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function buildLast7Days() {
  return Array.from({ length: DAY_COUNT }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (DAY_COUNT - 1 - index));
    const key = dateKey(date);
    return { key, date: key.slice(5), apiRequests: 0, cacheHits: 0, hitRate: 0 };
  });
}

export default function CacheTrendsCharts() {
  const [daily, setDaily] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [stats, caches] = await Promise.all([
        base44.entities.UsageStats.list('-created_date', 500),
        base44.entities.ResponseCache.list('-updated_date', 500),
      ]);

      const days = buildLast7Days();
      const dayMap = Object.fromEntries(days.map(day => [day.key, day]));

      (stats || []).forEach(stat => {
        const key = dateKey(new Date(stat.created_date));
        if (dayMap[key]) dayMap[key].apiRequests += 1;
      });

      (caches || []).forEach(cache => {
        const key = dateKey(new Date(cache.updated_date || cache.created_date));
        if (dayMap[key]) dayMap[key].cacheHits += cache.hits || 0;
      });

      setDaily(days.map(day => {
        const total = day.apiRequests + day.cacheHits;
        return {
          ...day,
          hitRate: total > 0 ? Number(((day.cacheHits / total) * 100).toFixed(1)) : 0,
        };
      }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const tooltipStyle = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" /> 近 7 天使用趋势
          </h3>
          <p className="text-xs text-slate-500 mt-1">展示 API 请求量与缓存命中率变化</p>
        </div>
        <button onClick={load} disabled={loading}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={daily} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
          <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => name === '缓存命中率' ? [`${value}%`, name] : [value, name]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line yAxisId="left" type="monotone" dataKey="apiRequests" name="API 请求量" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          <Line yAxisId="right" type="monotone" dataKey="hitRate" name="缓存命中率" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          <Line yAxisId="left" type="monotone" dataKey="cacheHits" name="缓存命中次数" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}