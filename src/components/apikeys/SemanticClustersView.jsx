import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Brain, Download, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function downloadJson(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function buildClusters(items, threshold) {
  const clusters = [];
  items.forEach(item => {
    const target = clusters.find(cluster => cosine(cluster.center, item.embedding) >= threshold);
    if (target) target.items.push(item);
    else clusters.push({ center: item.embedding, items: [item] });
  });
  return clusters
    .map((cluster, index) => ({
      id: index + 1,
      size: cluster.items.length,
      hits: cluster.items.reduce((sum, item) => sum + (item.hits || 0), 0),
      avgHits: cluster.items.length ? Number((cluster.items.reduce((sum, item) => sum + (item.hits || 0), 0) / cluster.items.length).toFixed(1)) : 0,
      preview: cluster.items[0]?.last_user_text || (cluster.items[0]?.content || '').slice(0, 80),
      items: cluster.items,
    }))
    .sort((a, b) => b.size - a.size || b.hits - a.hits);
}

export default function SemanticClustersView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(0.88);

  const load = async () => {
    setLoading(true);
    const caches = await base44.entities.ResponseCache.list('-created_date', 500);
    setItems((caches || []).filter(item => Array.isArray(item.embedding) && item.embedding.length > 0));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const clusters = useMemo(() => buildClusters(items, threshold), [items, threshold]);
  const lowHitItems = items.filter(item => (item.hits || 0) <= 1);
  const highHitLine = Math.max(10, ...items.map(item => item.hits || 0).sort((a, b) => a - b).slice(Math.floor(items.length * 0.9), Math.floor(items.length * 0.9) + 1));
  const highHitItems = items.filter(item => (item.hits || 0) >= highHitLine);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2"><Brain className="w-4 h-4 text-purple-400" /> 语义聚类</h3>
          <p className="text-xs text-slate-500 mt-1">按缓存问题的语义向量聚合相似问题，辅助判断匹配阈值是否过松或过紧</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
            <SlidersHorizontal className="w-4 h-4" /> 阈值 {threshold.toFixed(2)}
            <input type="range" min="0.7" max="0.98" step="0.01" value={threshold} onChange={e => setThreshold(Number(e.target.value))} className="w-28" />
          </div>
          <button onClick={load} disabled={loading} className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 text-xs disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新</button>
          <button onClick={() => downloadJson('low-hit-cache-items.json', lowHitItems)} className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl text-amber-300 text-xs"><Download className="w-4 h-4" /> 导出低命中</button>
          <button onClick={() => downloadJson('high-hit-cache-items.json', highHitItems)} className="flex items-center gap-2 px-3 py-2 bg-green-500/10 hover:bg-green-500/20 rounded-xl text-green-300 text-xs"><Download className="w-4 h-4" /> 导出高命中</button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-10 text-slate-500 text-sm">暂无带语义向量的缓存项</div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-3">相似问题簇分布</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={clusters.slice(0, 12)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="id" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }} formatter={(value, key) => [value, key === 'size' ? '缓存项' : '命中']} />
                <Bar dataKey="size" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="hits" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 max-h-72 overflow-auto">
            <div className="text-xs text-slate-400 mb-3">Top 聚类明细</div>
            <div className="space-y-2">
              {clusters.slice(0, 8).map(cluster => (
                <div key={cluster.id} className="rounded-lg bg-slate-900 border border-slate-800 p-3">
                  <div className="flex items-center justify-between text-xs mb-1"><span className="text-purple-300">Cluster #{cluster.id}</span><span className="text-slate-500">{cluster.size} 项 · {cluster.hits} 命中 · 均值 {cluster.avgHits}</span></div>
                  <div className="text-xs text-slate-300 line-clamp-2">{cluster.preview || '无预览'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}