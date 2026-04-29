import React from 'react';
import { Send, Loader2 } from 'lucide-react';

export default function ChatComposer({ value, onChange, onSubmit, disabled }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息，按 Enter 发送..."
        rows={2}
        disabled={disabled}
        className="min-h-[52px] flex-1 resize-none bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none disabled:opacity-60"
      />
      <button
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        className="self-end rounded-xl bg-blue-600 p-3 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </button>
    </div>
  );
}