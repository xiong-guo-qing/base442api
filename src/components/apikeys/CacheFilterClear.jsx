import { useEffect, useState } from 'react';
import { Filter, Trash2, AlertTriangle, Eye } from 'lucide-react';

export default function CacheFilterClear({ adminToken, onCleared }) {
  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [createdAfter, setCreatedAfter] = useState('');
  const [createdBefore, setCreatedBefore] = useState('');
  const [minHits, setMinHits] = useState('');
  const [maxHits, setMaxHits] = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetch('/functions/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cachemodels', adminToken }),
    }).then(r => r.json()).then(d => setModels(d.models || []));
  }, [adminToken]);

  const buildPayload = (dryRun) => ({
    action: 'filterclearcache',
    adminToken,
    model: model || undefined,
    createdAfter: createdAfter ? new Date(createdAfter).toISOString() : undefined,
    createdBefore: createdBefore ? new Date(createdBefore).toISOString() : undefined,
    minHits: minHits === '' ? undefined : Number(minHits),
    maxHits: maxHits === '' ? undefined : Number(maxHits),
    dryRun,
  });

  const handlePreview = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/functions/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(true)),
      });
      const data = await res.json();
      setPreview(data);
      setConfirming(false);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelete = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/functions/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(false)),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `已删除 ${data.deleted} 条缓存` });
        setPreview(null);
        setConfirming(false);
        onCleared?.();
      } else {
        setMessage({ type: 'error', text: data.error?.message || '删除失败' });
      }
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setModel(''); setCreatedAfter(''); setCreatedBefore(''); setMinHits(''); setMaxHits('');
    setPreview(null); setConfirming(false); setMessage(null);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-slate-200">条件批量清理</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">模型</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
            <option value="">全部模型</option>
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">创建时间 ≥</label>
          <input type="datetime-local" value={createdAfter} onChange={(e) => setCreatedAfter(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">创建时间 ≤</label>
          <input type="datetime-local" value={createdBefore} onChange={(e) => setCreatedBefore(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">最小命中次数</label>
          <input type="number" min="0" value={minHits} onChange={(e) => setMinHits(e.target.value)} placeholder="不限"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">最大命中次数</label>
          <input type="number" min="0" value={maxHits} onChange={(e) => setMaxHits(e.target.value)} placeholder="不限"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={handlePreview} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm transition-colors disabled:opacity-50">
          <Eye className="w-4 h-4" /> 预览匹配数量
        </button>
        <button onClick={reset} disabled={loading}
          className="px-4 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-slate-400 text-sm transition-colors disabled:opacity-50">
          重置
        </button>
      </div>

      {preview && (
        <div className="mt-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700">
          <div className="flex items-center gap-2 text-sm text-slate-300 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            匹配 <span className="text-amber-400 font-bold text-lg">{preview.count}</span> 条缓存条目
          </div>
          {preview.count > 0 && preview.preview && (
            <div className="text-xs text-slate-500 space-y-1 mb-3 font-mono">
              {preview.preview.map(p => (
                <div key={p.id}>
                  <span className="text-blue-300">{p.model}</span> · 命中 {p.hits} · {new Date(p.created).toLocaleString()}
                </div>
              ))}
              {preview.count > preview.preview.length && <div>... 还有 {preview.count - preview.preview.length} 条</div>}
            </div>
          )}
          {preview.count > 0 && !confirming && (
            <button onClick={() => setConfirming(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 text-red-300 text-sm transition-colors">
              <Trash2 className="w-4 h-4" /> 删除这 {preview.count} 条
            </button>
          )}
          {confirming && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-400">确认删除？此操作不可恢复</span>
              <button onClick={handleConfirmDelete} disabled={loading}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {loading ? '删除中...' : '确认删除'}
              </button>
              <button onClick={() => setConfirming(false)} disabled={loading}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm transition-colors disabled:opacity-50">
                取消
              </button>
            </div>
          )}
        </div>
      )}

      {message && (
        <div className={`mt-3 px-3 py-2 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}