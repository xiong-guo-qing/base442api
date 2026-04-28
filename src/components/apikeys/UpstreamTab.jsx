import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Save } from 'lucide-react';

export default function UpstreamTab({ adminToken }) {
  const [form, setForm] = useState({ endpoint: '', apiKey: '', model: '', enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    base44.functions.invoke('admin', { action: 'getupstream', adminToken }).then(res => {
      const u = res.data?.upstream;
      if (u) setForm({ endpoint: u.endpoint || '', apiKey: u.apiKey || '', model: u.model || '', enabled: u.enabled ?? true });
      setLoading(false);
    });
  }, [adminToken]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    await base44.functions.invoke('admin', { action: 'setupstream', adminToken, ...form });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div className="text-center text-slate-500 py-12">加载中...</div>;

  return (
    <div className="max-w-xl">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h3 className="font-semibold text-slate-200 mb-1">自定义上游 API</h3>
        <p className="text-sm text-slate-400 mb-6">当 Base44 内置 LLM 调用失败时，自动 fallback 到此上游</p>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Endpoint URL</label>
            <input
              type="url"
              value={form.endpoint}
              onChange={e => setForm(f => ({ ...f, endpoint: e.target.value }))}
              placeholder="https://api.openai.com/v1"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">API Key</label>
            <input
              type="password"
              value={form.apiKey}
              onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
              placeholder="sk-..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">默认模型（可选）</label>
            <input
              type="text"
              value={form.model}
              onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
              placeholder="gpt-4o-mini"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
              className={`relative w-10 h-6 rounded-full transition-colors ${form.enabled ? 'bg-blue-600' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${form.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-slate-300">{form.enabled ? '启用上游 fallback' : '禁用上游 fallback'}</span>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 text-white font-medium rounded-xl transition-all text-sm"
          >
            <Save className="w-4 h-4" />
            {saved ? '已保存 ✓' : saving ? '保存中...' : '保存配置'}
          </button>
        </form>
      </div>
    </div>
  );
}