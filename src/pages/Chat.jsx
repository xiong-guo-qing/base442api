import React, { useRef, useState } from 'react';
import { KeyRound, Sparkles } from 'lucide-react';
import ChatMessage from '../components/chat/ChatMessage';
import ChatComposer from '../components/chat/ChatComposer';

function parseSseChunk(buffer, onText) {
  const events = buffer.split('\n\n');
  const rest = events.pop() || '';

  for (const event of events) {
    const dataLine = event.split('\n').find(line => line.startsWith('data: '));
    if (!dataLine) continue;

    const raw = dataLine.slice(6).trim();
    if (!raw || raw === '[DONE]') continue;

    const payload = JSON.parse(raw);
    const delta = payload.delta;
    if (delta?.type === 'text_delta' && delta.text) onText(delta.text);
  }

  return rest;
}

export default function Chat() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('chat_api_key') || '');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef(null);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming || !apiKey.trim()) return;

    localStorage.setItem('chat_api_key', apiKey.trim());
    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages([...nextMessages, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const res = await fetch('/functions/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4.6',
        max_tokens: 1024,
        stream: true,
        messages: nextMessages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      const errorText = await res.text();
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: `请求失败：${errorText}` } : m));
      setStreaming(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = parseSseChunk(buffer, (deltaText) => {
        setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: m.content + deltaText } : m));
      });
    }

    setStreaming(false);
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-6 font-inter text-foreground">
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600/20 text-blue-300">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-100">Streaming Chat</h1>
              <p className="text-sm text-slate-500">实时对接 /v1/messages，AI 回复会逐字显示。</p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2">
            <KeyRound className="h-4 w-4 text-slate-500" />
            <input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="请输入 API Key"
              type="password"
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none"
            />
          </div>
        </div>

        <div className="flex min-h-[520px] flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl bg-slate-950/40 p-3">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                输入 API Key 后开始对话。
              </div>
            ) : (
              messages.map((message, index) => <ChatMessage key={index} {...message} />)
            )}
          </div>

          {streaming && (
            <button onClick={stopStreaming} className="self-center rounded-full border border-slate-700 px-4 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
              停止生成
            </button>
          )}

          <ChatComposer value={input} onChange={setInput} onSubmit={sendMessage} disabled={streaming || !apiKey.trim()} />
        </div>
      </div>
    </div>
  );
}