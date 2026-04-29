import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Activity, AlertTriangle, Coins, RefreshCw, Timer } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

function StatCard({ icon: Icon, label, value, sublabel, color }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
        <Icon className={`w-4 h-4 ${color}`} /> {label}
      </div>
      <div className="text-2xl font-bold text-slate-100">{value}</div>
      {sublabel && <div className="text-xs text-slate-500 mt-1">{sublabel}</div>}
    </div>
  );
}

function normalizeModel(model) {
  if (!model) return 'unknown';
  if (model.includes('gpt')) return model.replaceAll('_', '-').toUpperCase();
  if (model.includes('claude')) return model.replaceAll('_', '-').replace(/\b\w/g, c => c.toUpperCase());
  if (model.includes('gemini')) return model.replaceAll('_', '-').replace(/\b\w/g, c => c.toUpperCase());
  return model;
}

export default function ModelPerformanceTab() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [requestLogs, usageStats] = await Promise.all([
      base44.entities.RequestLog.list('-created_date', 500),
      base44.entities.UsageStats.list('-created_date', 500),
    ]);
    setLogs(requestLogs || []);
    setStats(usageStats || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const { performanceData, tokenData, summary } = useMemo(() => {
    const byModel = {};
    logs.forEach(log => {
      const model = normalizeModel(log.model || log.requested_model);
      if (!byModel[model]) byModel[model] = { model, requests: 0, errors: 0, duration: 0, tokens: 0 };
      byModel[model].requests += 1;
      byModel[model].duration += log.duration_ms || 0;
      if ((log.status_code || 0) >= 400) byModel[model].errors += 1;
    });

    stats.forEach(stat => {
      const model = normalizeModel(stat.model);
      if (!byModel[model]) byModel[model] = { model, requests: 0, errors: 0, duration: 0, tokens: 0 };
      byModel[model].tokens += stat.total_tokens || 0;
    });

    const rows = Object.values(byModel).map(item => ({
      model: item.model,
      requests: item.requests,
      avgLatency: item.requests ? Math.round(item.duration / item.requests) : 0,
      errorRate: item.requests ? Number(((item.errors / item.requests) * 100).toFixed(1)) : 0,
      tokens: item.tokens,
    })).sort((a, b) => b.requests + b.tokens - (a.requests + a.tokens));

    const totalRequests = rows.reduce((sum, row) => sum + row.requests, 0);
    const totalTokens = rows.reduce((sum, row) => sum + row.tokens, 0);
    const avgLatency = totalRequests ? Math.round(logs.reduce((sum, log) => sum + (log.duration_ms || 0), 0) / totalRequests) : 0;
    const totalErrors = logs.filter(log => (log.status_code || 0) >= 400).length;

    return {
      performanceData: rows,
      tokenData: rows.filter(row => row.tokens > 0),
      summary: {
        totalRequests,
        totalTokens,
        avgLatency,
        errorRate: totalRequests ? ((totalErrors / totalRequests) * 100).toFixed(1) : '0.0',
      },
    };
  }, [logs, stats]);

  const tooltipStyle = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 };

  if (loading) return <div className="text-center py-12 text-slate-500">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">模型表现</h2>
          <p className="text-sm text-slate-500">对比不同模型的平均响应时间、错误率和 Token 消耗</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 text-sm disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="记录请求" value={summary.totalRequests} sublabel="已记录链路日志" color="text-blue-400" />
        <StatCard icon={Timer} label="平均响应" value={`${summary.avgLatency}ms`} sublabel="所有模型平均值" color="text-purple-400" />
        <StatCard icon={AlertTriangle} label="错误率" value={`${summary.errorRate}%`} sublabel="HTTP 4xx/5xx 占比" color="text-red-400" />
        <StatCard icon={Coins} label="Token 消耗" value={summary.totalTokens.toLocaleString()} sublabel="最近 500 条统计" color="text-green-400" />
      </div>

      {performanceData.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">暂无模型表现数据</div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">平均响应时间</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={performanceData} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="model" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value}ms`, '平均响应']} />
                <Bar dataKey="avgLatency" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">错误率对比</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={performanceData} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="model" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${value}%`, '错误率']} />
                <Bar dataKey="errorRate" fill="#ef4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 lg:col-span-2">
            <h3 className="text-sm font-semibold text-slate-200 mb-4">Token 消耗分布</h3>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={tokenData} dataKey="tokens" nameKey="model" cx="50%" cy="50%" outerRadius={105} label={({ model, percent }) => `${model} ${(percent * 100).toFixed(0)}%`}>
                  {tokenData.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [Number(value).toLocaleString(), 'Token']} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}