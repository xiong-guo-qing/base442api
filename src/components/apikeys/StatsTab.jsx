import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { RefreshCw, Trash2 } from 'lucide-react';

export default function StatsTab({ adminToken }) {
  const [stats, setStats] = useState([]);
  const [cacheStats, setCacheStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [statsRes, cacheRes] = await Promise.all([
      base44.functions.invoke('admin', { action: 'stats', adminToken }),
      base44.functions.invoke('admin', { action: 'cachestats', adminToken }),
    ]);
    setStats(statsRes.data?.stats || []);
    setCacheStats(cacheRes.data || null);
    setLoading(false);
  }, [adminToken]);

  useEffect(() => { load(); }, [load]);

  const handleClearCache = async () => {
    if (!confirm('确认清空所有缓存？')) return;
    setClearing(true);
    await base44.functions.invoke('admin', { action: 'clearcache', adminToken });
    await load();
    setClearing(false);
  };

  const totalTokens = stats.reduce((s, r) => s + (r.total_tokens || 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-500 mb-1">总请求数</div>
          <div className="text-2xl font-bold text-slate-100">{stats.length}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-500 mb-1">总 Token</div>
          <div className="text-2xl font-bold text-blue-400">{totalTokens.toLocaleString()}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-500 mb-1">缓存条目</div>
          <div className="text-2xl font-bold text-purple-400">{cacheStats?.count || 0}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-xs text-slate-500 mb-1">缓存命中 / 节省 Token</div>
          <div className="text-2xl font-bold text-green-400">{cacheStats?.totalHits || 0}</div>
          <div className="text-xs text-slate-500">~{(cacheStats?.savedTokens || 0).toLocaleString()} tokens</div>
        </div>
      </div>

      {/* Cache controls */}
      <div className="flex justify-between items-center">
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 text-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
        <button
          onClick={handleClearCache}
          disabled={clearing}
          className="flex items-center gap-2 px-4 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-xl text-sm transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          {clearing ? '清空中...' : '清空缓存'}
        </button>
      </div>

      {/* Stats table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-slate-500">加载中...</div>
          ) : stats.length === 0 ? (
            <div className="p-8 text-center text-slate-500">暂无使用记录</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/50">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">时间</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">模型</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Prompt</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Completion</th>
                  <th className="text-right px-4 py-3 text-slate-400 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {stats.map(r => (
                  <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                      {r.timestamp ? new Date(r.timestamp).toLocaleString('zh-CN') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-blue-300 text-xs font-mono">{r.model}</code>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">{(r.prompt_tokens || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{(r.completion_tokens || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-200">{(r.total_tokens || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}