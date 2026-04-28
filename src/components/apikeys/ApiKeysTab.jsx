import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Trash2, Copy, Check, RefreshCw, Power } from 'lucide-react';

function generateKey() {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return 'sk-' + hex;
}

export default function ApiKeysTab({ adminToken }) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await base44.functions.invoke('admin', { action: 'list', adminToken });
    setKeys(res.data?.keys || []);
    setLoading(false);
  }, [adminToken]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newKey) return;
    setCreating(true);
    await base44.functions.invoke('admin', { action: 'create', adminToken, key: newKey, name: newName });
    setNewKey('');
    setNewName('');
    await load();
    setCreating(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('确认删除此 API Key？')) return;
    await base44.functions.invoke('admin', { action: 'delete', adminToken, id });
    await load();
  };

  const handleToggle = async (id, enabled) => {
    await base44.functions.invoke('admin', { action: 'toggle', adminToken, id, enabled: !enabled });
    await load();
  };

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Create form */}
      <form onSubmit={handleCreate} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">创建新 API Key</h3>
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              placeholder="API Key (sk-...)"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setNewKey(generateKey())}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 text-sm transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-4 h-4" />
            一键生成
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="备注名称（可选）"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <button
            type="submit"
            disabled={creating || !newKey}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 text-white font-medium rounded-xl transition-all text-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {creating ? '创建中...' : '创建'}
          </button>
        </div>
      </form>

      {/* Key list */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-slate-200">API Keys ({keys.length})</h3>
          <button onClick={load} className="text-slate-500 hover:text-slate-300 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-500">加载中...</div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-slate-500">暂无 API Key，请创建一个</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {keys.map(k => (
              <div key={k.id} className="flex items-center gap-3 px-5 py-4">
                <div className={`w-2 h-2 rounded-full shrink-0 ${k.enabled ? 'bg-green-400' : 'bg-slate-600'}`} />
                <div className="flex-1 min-w-0">
                  {k.name && <div className="text-xs text-slate-400 mb-0.5">{k.name}</div>}
                  <code className="text-sm text-blue-300 font-mono truncate block">{k.key}</code>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCopy(k.key, k.id)}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {copiedId === k.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleToggle(k.id, k.enabled)}
                    className={`p-2 rounded-lg transition-colors ${k.enabled ? 'bg-green-900/30 text-green-400 hover:bg-green-900/50' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(k.id)}
                    className="p-2 rounded-lg bg-red-900/20 hover:bg-red-900/40 text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}