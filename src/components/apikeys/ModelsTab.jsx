export default function ModelsTab() {
  const groups = [
    {
      vendor: 'OpenAI',
      color: 'from-green-600 to-emerald-600',
      models: [
        { id: 'gpt-5.5', note: '最强', internal: 'gpt_5_5' },
        { id: 'gpt-5.4', note: '强力', internal: 'gpt_5_4' },
        { id: 'gpt-5-mini', note: '快速', internal: 'gpt_5_mini' },
      ],
      aliases: ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-5', 'o3', 'o4-mini'],
    },
    {
      vendor: 'Anthropic',
      color: 'from-orange-600 to-red-600',
      models: [
        { id: 'claude-sonnet-4.6', note: '均衡', internal: 'claude_sonnet_4_6' },
        { id: 'claude-opus-4.6', note: '强力', internal: 'claude_opus_4_6' },
        { id: 'claude-opus-4.7', note: '思考', internal: 'claude_opus_4_7' },
      ],
      aliases: ['claude-3-5-sonnet', 'claude-3-7-sonnet', 'claude-opus'],
    },
    {
      vendor: 'Google',
      color: 'from-blue-600 to-cyan-600',
      models: [
        { id: 'gemini-3-flash', note: '快速+联网', internal: 'gemini_3_flash' },
        { id: 'gemini-3.1-pro', note: '强力+联网', internal: 'gemini_3_1_pro' },
      ],
      aliases: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-pro'],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Model groups */}
      <div className="grid md:grid-cols-3 gap-4">
        {groups.map(g => (
          <div key={g.vendor} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className={`inline-block text-xs font-bold px-3 py-1 rounded-full bg-gradient-to-r ${g.color} text-white mb-4`}>
              {g.vendor}
            </div>
            <div className="space-y-2 mb-4">
              {g.models.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-2">
                  <code className="text-sm text-blue-300 font-mono">{m.id}</code>
                  <span className="text-xs text-slate-500 shrink-0">{m.note}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-800 pt-3">
              <div className="text-xs text-slate-500 mb-2">兼容别名</div>
              <div className="flex flex-wrap gap-1">
                {g.aliases.map(a => (
                  <code key={a} className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">{a}</code>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Capabilities */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🧠</span>
            <h3 className="font-semibold text-slate-200">深度思考</h3>
          </div>
          <p className="text-sm text-slate-400 mb-3">支持 reasoning_effort / thinking 参数，自动切换到思考模型</p>
          <pre className="bg-slate-800 rounded-xl p-3 text-xs text-slate-300 overflow-x-auto">{`{
  "model": "claude-opus-4.7",
  "messages": [...],
  "reasoning_effort": "high"
  // or: "enable_thinking": true
  // or: "thinking": {"type":"enabled"}
}`}</pre>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🌐</span>
            <h3 className="font-semibold text-slate-200">联网搜索</h3>
          </div>
          <p className="text-sm text-slate-400 mb-3">自动切换到 Gemini 并启用 add_context_from_internet</p>
          <pre className="bg-slate-800 rounded-xl p-3 text-xs text-slate-300 overflow-x-auto">{`{
  "model": "gemini-3-flash",
  "messages": [...],
  "web_search": true
  // or: "enable_search": true
  // or suffix: "gemini-3-flash-search"
  // or tools: [{type:"web_search"}]
}`}</pre>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚡</span>
            <h3 className="font-semibold text-slate-200">响应缓存</h3>
          </div>
          <p className="text-sm text-slate-400 mb-3">相同请求命中缓存直接返回，节省 token，默认 1 小时 TTL</p>
          <pre className="bg-slate-800 rounded-xl p-3 text-xs text-slate-300 overflow-x-auto">{`{
  "model": "gpt-4o",
  "messages": [...],
  // 跳过缓存:
  "no_cache": true
  // temperature>0.3 自动跳过
}`}</pre>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🖼️</span>
            <h3 className="font-semibold text-slate-200">图像生成</h3>
          </div>
          <p className="text-sm text-slate-400 mb-3">兼容 OpenAI images/generations 接口，支持 n=1-4</p>
          <pre className="bg-slate-800 rounded-xl p-3 text-xs text-slate-300 overflow-x-auto">{`POST /functions/v1/images/generations
{
  "prompt": "a cat on the moon",
  "n": 2
}`}</pre>
        </div>
      </div>
    </div>
  );
}