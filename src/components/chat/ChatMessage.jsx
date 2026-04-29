import React from 'react';

export default function ChatMessage({ role, content }) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
        isUser
          ? 'bg-blue-600 text-white rounded-br-md'
          : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-md'
      }`}>
        {content || (isUser ? '' : <span className="text-slate-500">正在思考...</span>)}
      </div>
    </div>
  );
}