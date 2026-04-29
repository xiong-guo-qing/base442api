import { useEffect, useState } from 'react';
import { Plus, Play, Trash2, Edit2, Flame, RefreshCw, CheckCircle2, XCircle, MinusCircle, X } from 'lucide-react';

const MODEL_OPTIONS = [
  'gpt_5_mini', 'gpt_5_4', 'gpt_5_5',
  'claude_sonnet_4_6', 'claude_opus_4_6', 'claude_opus_4_7',
  'gemini_3_flash', 'gemini_3_1_pro', 'automatic',
];

function StatusBadge({ status }) {
  if (!status) return <span className="text-slate-600 text-xs">未运行</span>;
  const map = {
    success: { icon: CheckCircle2, cls: 'bg-green-500/10 text-green-400', text: '成功' },
    error: { icon: XCircle, cls: 'bg-red-500/10 text-red-400', text: '失败' },
    skipped: { icon: MinusCircle, cls: 'bg-slate-500/10 text-slate-400', text: '跳过' },
  };
  const m = map[status] || map.skipped;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${m.cls}`}>
      <Icon className="w-3 h-3" /> {m.text}
    </span>
  );
}

function TemplateForm({ initial, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: '', prompt: '', model: 'gpt_5_mini', system: '', ttl_hours: 1, enabled: true,
    ...(initial || {}),
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = (e) => { e.preventDefault(); onSubmit(form); };

  return (
    <form onSubmit={submit} className="space-y-3 p-4 rounded-xl bg-slate-800/50 border border-slate-700">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-200">{initial?.id ? '编辑模板' : '新增预热模板'}</h4>
        <button type="button" onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-200">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">名称 *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} required
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">模型</label>
          <select value={form.model} onChange={e => set('model', e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
            {MODEL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-500 mb-1 block">系统指令 (可选)</label>
        <input value={form.system || ''} onChange={e => set('system', e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
      </div>
      <div>
        <label className="text-xs text-slate-500 mb-1 block">Prompt 模板 *</label>
        <textarea value={form.prompt} onChange={e => set('prompt', e.target.value)} required rows={4}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono" />
      </div>
      <div className="flex items-center gap-4">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">缓存 TTL (小时)</label>
          <input type="number" min="0.1" step="0.1" value={form.ttl_hours} onChange={e => set('ttl_hours', Number(e.target.value))}
            className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300 mt-5">
          <input type="checkbox" checked={form.enabled !== false} onChange={e => set('enabled', e.target.checked)} />
          启用 (定时运行)
        </label>
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">取消</button>
        <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">保存</button>
      </div>
    </form>
  );
}

export default function CacheWarmupTab({ adminToken }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | template object
  const [running, setRunning] = useState(null);
  const [message, setMessage] = useState(null);

  const call = async (action, extra = {}) => {
    const res = await fetch('/functions/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, adminToken, ...extra }),
    });
    return res.json();
  };

  const load = async () => {
    setLoading(true);
    const data = await call('warmuplist');
    setItems(data.items || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    if (form.id) {
      await call('warmupupdate', { templateId: form.id, ...form });
    } else {
      await call('warmupcreate', form);
    }
    setEditing(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('删除此预热模板？')) return;
    await call('warmupdelete', { templateId: id });
    load();
  };

  const handleToggle = async (item) => {
    await call('warmupupdate', { templateId: item.id, enabled: !item.enabled });
    load();
  };

  const handleRun = async (id) => {
    setRunning(id || 'all');
    setMessage(null);
    const data = await call('warmuprun', id ? { templateId: id } : {});
    setRunning(null);
    if (data.success) {
      setMessage({ type: 'success', text: `已处理 ${data.processed} 个模板` });
      load();
    } else {
      setMessage({ type: 'error', text: data.error || '运行失败' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-400" />
          <h2 className="text-lg font-semibold text-slate-200">缓存预热模板</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleRun(null)} disabled={running !== null}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600/30 border border-orange-600/40 text-orange-300 text-sm transition-colors disabled:opacity-50">
            <Play className={`w-4 h-4 ${running === 'all' ? 'animate-pulse' : ''}`} />
            {running === 'all' ? '运行中...' : '立即预热全部'}
          </button>
          <button onClick={load} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setEditing('new')} disabled={editing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">
            <Plus className="w-4 h-4" /> 新增模板
          </button>
        </div>
      </div>

      <div className="px-4 py-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400">
        系统会按设置的定时计划自动运行已启用的模板，将生成结果写入缓存。如果该 Prompt 在缓存中仍有效则跳过本次生成。
      </div>

      {message && (
        <div className={`px-3 py-2 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
          {message.text}
        </div>
      )}

      {editing && (
        <TemplateForm
          initial={editing === 'new' ? null : editing}
          onSubmit={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-500">加载中...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">暂无预热模板，点击"新增模板"开始</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase">
                <th className="text-left px-4 py-3 font-medium">名称 / Prompt</th>
                <th className="text-left py-3 font-medium">模型</th>
                <th className="text-left py-3 font-medium">TTL</th>
                <th className="text-left py-3 font-medium">状态</th>
                <th className="text-left py-3 font-medium">最后运行</th>
                <th className="text-right px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-200">{item.name}</div>
                    <div className="text-xs text-slate-500 truncate max-w-md mt-0.5" title={item.prompt}>{item.prompt}</div>
                  </td>
                  <td className="py-3 font-mono text-xs text-blue-300">{item.model}</td>
                  <td className="py-3 text-slate-400">{item.ttl_hours}h</td>
                  <td className="py-3">
                    <button onClick={() => handleToggle(item)}
                      className={`px-2 py-0.5 rounded-full text-xs ${item.enabled ? 'bg-green-500/10 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                      {item.enabled ? '启用' : '停用'}
                    </button>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-col gap-0.5">
                      <StatusBadge status={item.last_run_status} />
                      {item.last_run_at && (
                        <span className="text-xs text-slate-500">{new Date(item.last_run_at).toLocaleString('zh-CN')}</span>
                      )}
                      {item.last_error && (
                        <span className="text-xs text-red-400 truncate max-w-xs" title={item.last_error}>{item.last_error}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleRun(item.id)} disabled={running !== null}
                        className="p-1.5 rounded-lg hover:bg-orange-600/20 text-orange-300 disabled:opacity-50" title="立即运行">
                        <Play className={`w-4 h-4 ${running === item.id ? 'animate-pulse' : ''}`} />
                      </button>
                      <button onClick={() => setEditing(item)}
                        className="p-1.5 rounded-lg hover:bg-blue-600/20 text-blue-300" title="编辑">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(item.id)}
                        className="p-1.5 rounded-lg hover:bg-red-600/20 text-red-300" title="删除">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}