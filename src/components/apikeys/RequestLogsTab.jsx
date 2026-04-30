import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { RefreshCw, Search, Clock, ExternalLink } from 'lucide-react';
import StreamEventsViewer from './StreamEventsViewer';

function StatusBadge({ code }) {
  const ok = code >= 200 && code < 300;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{code}</span>;
}

function CacheBadge({ value }) {
  const label = { hit: '命中', semantic_hit: '语义命中', miss: '未命中', error: '错误' }[value] || '-';
  const color = value === 'miss' ? 'text-amber-400 bg-amber-500/10' : value === 'error' ? 'text-red-400 bg-red-500/10' : 'text-blue-400 bg-blue-500/10';
  return <span className={`px-2 py-0.5 rounded-full text-xs ${color}`}>{label}</span>;
}

export default function RequestLogsTab({ adminToken }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    const res = await base44.functions.invoke('admin', { action: 'requestlogs', adminToken });
    setLogs(res.data?.logs || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = logs.filter(log => {
    const text = `${log.request_id || ''} ${log.endpoint || ''} ${log.model || ''} ${log.api_key_name || ''} ${log.source_ip || ''}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-200">请求日志</h2>
          <p className="text-sm text-slate-500">查看请求参数、状态码、耗时和来源信息</p>
        </div>
        <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 text-sm disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索请求 ID、模型、来源 IP 或 API Key..." className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {loading ? <div className="p-8 text-center text-slate-500">加载中...</div> : filtered.length === 0 ? <div className="p-8 text-center text-slate-500">暂无请求日志</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-800 bg-slate-800/50">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">时间</th><th className="text-left px-4 py-3 text-slate-400 font-medium">来源</th><th className="text-left px-4 py-3 text-slate-400 font-medium">接口 / 模型</th><th className="text-center px-4 py-3 text-slate-400 font-medium">状态</th><th className="text-right px-4 py-3 text-slate-400 font-medium">耗时</th><th className="text-center px-4 py-3 text-slate-400 font-medium">缓存</th><th className="text-right px-4 py-3 text-slate-400 font-medium">详情</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map(log => <tr key={log.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{log.logged_at ? new Date(log.logged_at).toLocaleString('zh-CN') : '-'}</td>
                  <td className="px-4 py-3"><div className="text-slate-300 text-xs font-mono">{log.source_ip || '-'}</div><div className="text-slate-500 text-xs truncate max-w-[180px]">{log.api_key_name || log.api_key_id || '-'}</div></td>
                  <td className="px-4 py-3"><div className="text-slate-300 text-xs">{log.endpoint}</div><code className="text-blue-300 text-xs font-mono">{log.model || log.requested_model || '-'}</code></td>
                  <td className="px-4 py-3 text-center"><StatusBadge code={log.status_code || 0} /></td>
                  <td className="px-4 py-3 text-right text-slate-300"><span className="inline-flex items-center gap-1"><Clock className="w-3 h-3 text-slate-500" />{log.duration_ms || 0}ms</span></td>
                  <td className="px-4 py-3 text-center"><CacheBadge value={log.cache_status} /></td>
                  <td className="px-4 py-3 text-right"><button onClick={() => setSelected(log)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-blue-600/20 text-slate-300 hover:text-blue-300 text-xs"><ExternalLink className="w-3.5 h-3.5" /> 查看</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={() => setSelected(null)}>
        <div className="w-full max-w-2xl bg-slate-950 border-l border-slate-800 p-6 overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-start mb-4"><div><h3 className="text-lg font-semibold text-slate-100">请求详情</h3><p className="text-xs text-slate-500 font-mono">{selected.request_id}</p></div><button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-200">关闭</button></div>
          <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
            <div className="bg-slate-900 rounded-xl p-3"><div className="text-slate-500 text-xs">状态码</div><StatusBadge code={selected.status_code || 0} /></div>
            <div className="bg-slate-900 rounded-xl p-3"><div className="text-slate-500 text-xs">处理耗时</div><div className="text-slate-200">{selected.duration_ms || 0}ms</div></div>
            <div className="bg-slate-900 rounded-xl p-3"><div className="text-slate-500 text-xs">来源 IP</div><div className="text-slate-200 font-mono text-xs">{selected.source_ip || '-'}</div></div>
            <div className="bg-slate-900 rounded-xl p-3"><div className="text-slate-500 text-xs">User Agent</div><div className="text-slate-300 text-xs break-all">{selected.user_agent || '-'}</div></div>
          </div>
          <div className="space-y-4">
            <div><div className="text-sm font-medium text-slate-300 mb-2">请求参数</div><pre className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 whitespace-pre-wrap overflow-auto max-h-80">{selected.request_params || '-'}</pre></div>
            <div><div className="text-sm font-medium text-slate-300 mb-2">响应摘要 / 错误</div><pre className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 whitespace-pre-wrap">{selected.error_message || selected.response_summary || '-'}</pre></div>
            <StreamEventsViewer log={selected} />
            <div><div className="text-sm font-medium text-slate-300 mb-2">来源页面</div><pre className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 whitespace-pre-wrap break-all">Origin: {selected.origin || '-'}\nReferer: {selected.referer || '-'}</pre></div>
          </div>
        </div>
      </div>}
    </div>
  );
}