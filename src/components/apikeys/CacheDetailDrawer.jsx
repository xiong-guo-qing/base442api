import { useEffect, useState } from 'react';
import { X, Copy, Check, Clock, Database, Zap, Hash, FileText, AlertTriangle, Info } from 'lucide-react';

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  const onCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={onCopy} className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors" title="复制">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function Field({ label, value, mono, children }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      {children ? children : (
        <div className={`text-sm text-slate-200 ${mono ? 'font-mono break-all' : ''}`}>{value ?? <span className="text-slate-600">—</span>}</div>
      )}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleString('zh-CN'); } catch { return iso; }
}

function formatTtl(seconds) {
  if (seconds === null || seconds === undefined) return '永久';
  if (seconds <= 0) return '已过期';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}天 ${h}小时`;
  if (h > 0) return `${h}小时 ${m}分钟`;
  return `${m}分钟`;
}

export default function CacheDetailDrawer({ adminToken, cacheId, open, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !cacheId) return;
    setLoading(true);
    setError(null);
    setData(null);
    fetch('/functions/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cachedetail', adminToken, cacheId }),
    })
      .then(r => r.json())
      .then(json => {
        if (json.error) setError(json.error.message || '加载失败');
        else setData(json.entry);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, cacheId, adminToken]);

  if (!open) return null;

  const e = data;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-2xl bg-slate-950 border-l border-slate-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">缓存条目详情</h2>
            <p className="text-xs text-slate-500 mt-0.5">完整请求参数、响应内容与过期元数据</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {loading && <div className="text-center py-12 text-slate-500">加载中...</div>}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4" /> {error}
            </div>
          )}

          {e && (
            <>
              {/* Status pills */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-300 text-xs font-mono">{e.model}</span>
                {e.is_single_turn && (
                  <span className="px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-300 text-xs">单轮（语义可命中）</span>
                )}
                {e.is_expired ? (
                  <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-300 text-xs flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> 已过期
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-green-500/10 text-green-300 text-xs flex items-center gap-1">
                    <Clock className="w-3 h-3" /> 有效
                  </span>
                )}
                <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 text-xs">命中 {e.hits} 次</span>
              </div>

              {/* Note */}
              <div className="flex gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-400" />
                <div>
                  本系统仅持久化原始请求的 <span className="text-slate-200 font-mono">cache_key</span>（请求哈希）与最后用户输入文本以节省存储；下方"原始请求参数"为可恢复的元数据集合。
                </div>
              </div>

              {/* Section: Request */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" /> 请求参数 (Request)
                </h3>
                <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <Field label="模型" value={e.model} mono />
                  <Field label="是否单轮请求" value={e.is_single_turn ? '是' : '否'} />
                  <div className="col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs text-slate-500 uppercase tracking-wide">Cache Key (SHA-256)</div>
                      <CopyBtn text={e.cache_key} />
                    </div>
                    <div className="text-xs text-slate-300 font-mono break-all bg-slate-950 rounded-md p-2 border border-slate-800">{e.cache_key}</div>
                  </div>
                  <div className="col-span-2">
                    <Field label="最后用户文本 (Last User Text)">
                      {e.last_user_text ? (
                        <pre className="text-xs text-slate-200 whitespace-pre-wrap bg-slate-950 rounded-md p-3 border border-slate-800 max-h-48 overflow-y-auto">{e.last_user_text}</pre>
                      ) : (
                        <div className="text-sm text-slate-600">—（多轮请求或未记录）</div>
                      )}
                    </Field>
                  </div>
                  {e.embedding_summary && (
                    <div className="col-span-2">
                      <Field label="语义嵌入向量 (Embedding)">
                        <div className="text-xs text-slate-400 font-mono bg-slate-950 rounded-md p-2 border border-slate-800">
                          <div>维度: <span className="text-slate-200">{e.embedding_summary.dim}</span> · 非零分量: <span className="text-slate-200">{e.embedding_summary.nonZero}</span></div>
                          <div className="mt-1 truncate">前8维: [{e.embedding_summary.preview.map(v => v.toFixed(4)).join(', ')} ...]</div>
                        </div>
                      </Field>
                    </div>
                  )}
                </div>
              </section>

              {/* Section: Response */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-green-400" /> 响应内容 (Response)
                  </h3>
                  <CopyBtn text={e.content} />
                </div>
                <pre className="text-sm text-slate-200 whitespace-pre-wrap bg-slate-900 rounded-xl p-4 border border-slate-800 max-h-96 overflow-y-auto">{e.content || <span className="text-slate-600">(空)</span>}</pre>
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-500">输入 Token</div>
                    <div className="text-lg font-bold text-slate-200">{e.prompt_tokens.toLocaleString()}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-500">输出 Token</div>
                    <div className="text-lg font-bold text-slate-200">{e.completion_tokens.toLocaleString()}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-500">总 Token</div>
                    <div className="text-lg font-bold text-blue-300">{e.total_tokens.toLocaleString()}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-500">字符数</div>
                    <div className="text-lg font-bold text-slate-200">{e.content_length.toLocaleString()}</div>
                  </div>
                </div>
              </section>

              {/* Section: Expiration metadata */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" /> 过期逻辑元数据
                </h3>
                <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <Field label="创建时间" value={formatDate(e.created_date)} />
                  <Field label="最后更新" value={formatDate(e.updated_date)} />
                  <Field label="过期时间 (expires_at)" value={formatDate(e.expires_at)} />
                  <Field label="剩余有效期 (TTL)">
                    <div className={`text-sm font-medium ${e.is_expired ? 'text-red-400' : 'text-green-400'}`}>
                      {formatTtl(e.ttl_seconds)}
                    </div>
                  </Field>
                  <Field label="累计命中次数 (hits)">
                    <div className="flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-sm text-slate-200">{e.hits}</span>
                    </div>
                  </Field>
                  <Field label="状态">
                    {e.is_expired
                      ? <span className="text-sm text-red-400">已失效（待清理任务回收）</span>
                      : <span className="text-sm text-green-400">活跃可命中</span>}
                  </Field>
                  <div className="col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs text-slate-500 uppercase tracking-wide">条目 ID</div>
                      <CopyBtn text={e.id} />
                    </div>
                    <div className="text-xs text-slate-400 font-mono bg-slate-950 rounded-md p-2 border border-slate-800 break-all">{e.id}</div>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}