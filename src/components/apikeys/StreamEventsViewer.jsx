import { Radio, Type, Zap } from 'lucide-react';

function parseEvents(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function StreamEventsViewer({ log }) {
  const events = parseEvents(log?.stream_events);
  if (!log?.is_stream) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <Radio className="w-4 h-4 text-blue-400" /> 流式响应片段
        </div>
        <span className="text-xs text-slate-500">{log.stream_event_count || events.length} 个数据包</span>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
          <Type className="w-3.5 h-3.5" /> 已拼接完整输出
        </div>
        <pre className="text-xs text-slate-200 whitespace-pre-wrap max-h-56 overflow-auto">{log.stream_text || '暂无文本片段'}</pre>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {events.length === 0 ? (
          <div className="p-4 text-xs text-slate-500">暂无已解析的数据包</div>
        ) : (
          <div className="divide-y divide-slate-800 max-h-80 overflow-auto">
            {events.map((event, index) => (
              <div key={index} className="p-3 hover:bg-slate-800/40 transition-colors">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2 text-xs font-mono text-blue-300">
                    <Zap className="w-3.5 h-3.5" /> {event.event || event.type || 'packet'}
                  </div>
                  <span className="text-[11px] text-slate-500">#{index + 1}</span>
                </div>
                {event.text && <div className="text-xs text-slate-200 whitespace-pre-wrap">{event.text}</div>}
                {!event.text && <pre className="text-xs text-slate-500 whitespace-pre-wrap">{JSON.stringify(event.data || event, null, 2)}</pre>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}