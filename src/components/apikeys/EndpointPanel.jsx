import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-slate-800 last:border-0">
      <div className="min-w-0">
        <div className="text-xs text-slate-500 mb-0.5">{label}</div>
        <code className="text-sm text-blue-300 font-mono break-all">{value}</code>
      </div>
      <button
        onClick={handleCopy}
        className="shrink-0 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
      >
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function EndpointPanel() {
  const base = `${window.location.origin}/functions/v1`;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <h2 className="text-sm font-semibold text-slate-200">API 端点</h2>
        <span className="text-xs text-slate-500 ml-auto">⚠️ 必须使用 /functions/v1 前缀</span>
      </div>
      <CopyRow label="OpenAI Base URL (SDK base_url)" value={base} />
      <CopyRow label="Chat Completions" value={`${base}/chat/completions`} />
      <CopyRow label="Models" value={`${base}/models`} />
      <CopyRow label="Image Generations" value={`${base}/images/generations`} />
    </div>
  );
}