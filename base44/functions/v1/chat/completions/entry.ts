import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function createInternalClient(req) {
  const headers = new Headers(req.headers);
  headers.delete('Authorization');
  headers.delete('x-api-key');
  return createClientFromRequest(new Request(req.url, { method: req.method, headers }));
}

const MODEL_MAP = {
  'gpt-5.5': 'gpt_5_5',
  'gpt-5.4': 'gpt_5_4',
  'gpt-5-mini': 'gpt_5_mini',
  'claude-sonnet-4.6': 'claude_sonnet_4_6',
  'claude-opus-4.6': 'claude_opus_4_6',
  'claude-opus-4.7': 'claude_opus_4_7',
  'gemini-3-flash': 'gemini_3_flash',
  'gemini-3.1-pro': 'gemini_3_1_pro',
  'automatic': 'automatic',
  'gpt-4o': 'gpt_5_mini',
  'gpt-4o-mini': 'gpt_5_mini',
  'gpt-4': 'gpt_5_4',
  'gpt-4-turbo': 'gpt_5_4',
  'gpt-3.5-turbo': 'gpt_5_mini',
  'gpt-5': 'gpt_5_5',
  'o1': 'gpt_5_5',
  'o1-mini': 'gpt_5_mini',
  'o3': 'gpt_5_5',
  'o4-mini': 'gpt_5_mini',
  'claude-3-5-sonnet': 'claude_sonnet_4_6',
  'claude-3-5-sonnet-20241022': 'claude_sonnet_4_6',
  'claude-3-7-sonnet': 'claude_sonnet_4_6',
  'claude-opus': 'claude_opus_4_7',
  'claude-3-opus': 'claude_opus_4_7',
  'gemini-2.0-flash': 'gemini_3_flash',
  'gemini-2.5-pro': 'gemini_3_1_pro',
  'gemini-pro': 'gemini_3_1_pro',
  'gemini-flash': 'gemini_3_flash',
};

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function makeId(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

// --- Lightweight semantic embedding (local, deterministic) ---
// Builds a 256-dim sparse vector from char n-grams (n=3) + token unigrams,
// with simple stopword filtering. Good enough for "is this paraphrase?" matching.
const EMBED_DIM = 256;
const STOPWORDS = new Set(['the','a','an','is','are','was','were','of','to','in','on','at','for','and','or','but','i','you','it','this','that','please','can','could','would','will','do','does','did','have','has','had','be','been','am','my','your','我','你','的','了','是','吗','啊','请','帮','给','把','一','在','和','或','也','都','就','要','要','不','没','有','吧']);
function embedText(text) {
  const v = new Float32Array(EMBED_DIM);
  if (!text) return Array.from(v);
  const lower = text.toLowerCase().replace(/\s+/g, ' ').trim();
  // Token unigrams
  for (const tok of lower.split(/[^a-z0-9\u4e00-\u9fff]+/)) {
    if (!tok || STOPWORDS.has(tok) || tok.length < 2) continue;
    let h = 5381;
    for (let i = 0; i < tok.length; i++) h = ((h << 5) + h + tok.charCodeAt(i)) | 0;
    v[Math.abs(h) % EMBED_DIM] += 1;
  }
  // Char trigrams
  const s = ' ' + lower + ' ';
  for (let i = 0; i < s.length - 2; i++) {
    const tri = s.slice(i, i + 3);
    let h = 5381;
    for (let j = 0; j < 3; j++) h = ((h << 5) + h + tri.charCodeAt(j)) | 0;
    v[Math.abs(h) % EMBED_DIM] += 0.5;
  }
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < EMBED_DIM; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Array(EMBED_DIM);
  for (let i = 0; i < EMBED_DIM; i++) out[i] = v[i] / norm;
  return out;
}
function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) return m.content.map(c => c.text || '').join('\n');
  }
  return '';
}
const SEMANTIC_THRESHOLD = 0.92;

function buildPrompt(messages) {
  return messages.map(m => {
    const role = (m.role || 'user').toUpperCase();
    let content = '';
    if (typeof m.content === 'string') {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content.map(c => c.text || '').join('\n');
    } else {
      content = String(m.content || '');
    }
    // Render tool_calls (assistant) and tool results (tool role)
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const calls = m.tool_calls.map(tc =>
        `[tool_call id=${tc.id} name=${tc.function?.name} args=${tc.function?.arguments || '{}'}]`
      ).join('\n');
      content = (content ? content + '\n' : '') + calls;
    }
    if (m.role === 'tool') {
      content = `[tool_result id=${m.tool_call_id || ''}]\n${content}`;
    }
    return `${role}: ${content}`;
  }).join('\n\n');
}

function buildToolsSystemPrompt(tools) {
  const list = tools.map(t => {
    const f = t.function || t;
    return `- ${f.name}: ${f.description || ''}\n  parameters: ${JSON.stringify(f.parameters || {})}`;
  }).join('\n');
  return `You have access to the following tools. To call a tool, respond with JSON matching the response schema with action="tool_calls" and a list of calls. Otherwise use action="message" with your final answer.\n\nAvailable tools:\n${list}`;
}

const TOOL_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['message', 'tool_calls'] },
    content: { type: 'string', description: 'Final answer text when action=message' },
    tool_calls: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          arguments: { type: 'object', description: 'Arguments object for the tool' }
        },
        required: ['name', 'arguments']
      }
    }
  },
  required: ['action']
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const base44 = createInternalClient(req);
    const authHeader = req.headers.get('Authorization') || '';
    const apiKey = authHeader.replace('Bearer ', '').trim();

    if (!apiKey) {
      return Response.json({ error: { message: 'Missing API key', type: 'auth_error' } }, { status: 401, headers: CORS });
    }

    const keys = await base44.asServiceRole.entities.APIKey.filter({ key: apiKey, enabled: true });
    if (!keys || keys.length === 0) {
      return Response.json({ error: { message: 'Invalid or disabled API key', type: 'auth_error' } }, { status: 401, headers: CORS });
    }
    const keyRecord = keys[0];

    const body = await req.json();
    const {
      model: requestedModel = 'automatic',
      messages = [],
      temperature,
      top_p,
      max_tokens,
      stream = false,
      stream_options,
      response_format,
      reasoning_effort,
      reasoning,
      thinking,
      enable_thinking,
      web_search,
      enable_search,
      tools,
      cache,
      no_cache,
    } = body;

    let modelKey = requestedModel;
    const searchSuffix = modelKey.endsWith('-search') || modelKey.endsWith(':online');
    if (searchSuffix) modelKey = modelKey.replace(/-search$/, '').replace(/:online$/, '');

    let internalModel = MODEL_MAP[modelKey] || MODEL_MAP[requestedModel] || 'gpt_5_mini';

    const effortRaw = reasoning_effort || reasoning?.effort;
    const thinkingEnabled = enable_thinking ||
      (thinking && (thinking.type === 'enabled' || thinking.budget_tokens > 0)) ||
      effortRaw;

    if (thinkingEnabled) {
      const effort = (effortRaw || 'high').toLowerCase();
      if (internalModel.startsWith('claude')) {
        internalModel = effort === 'medium' ? 'claude_opus_4_6' : 'claude_opus_4_7';
      } else if (internalModel.startsWith('gemini')) {
        internalModel = 'gemini_3_1_pro';
      } else {
        internalModel = effort === 'medium' ? 'gpt_5_4' : 'gpt_5_5';
      }
    }

    // Detect real function calling tools (not web search tools)
    const webSearchToolNames = new Set(['web_search', 'google_search', 'bing_search']);
    const hasFunctionCallingTools = Array.isArray(tools) && tools.some(t =>
      t.type === 'function' && t.function?.name && !webSearchToolNames.has(t.function.name)
    );

    // If request has real tools — first try upstream, otherwise emulate via Base44 LLM
    if (hasFunctionCallingTools) {
      const upstreams = await base44.asServiceRole.entities.Config.filter({ type: 'upstream', enabled: true });
      const upstream = upstreams[0];
      if (upstream && upstream.endpoint && upstream.apiKey) {
        const upstreamRes = await fetch(`${upstream.endpoint.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${upstream.apiKey}` },
          body: JSON.stringify({ ...body, model: upstream.model || body.model }),
        });
        const upstreamBody = await upstreamRes.text();
        return new Response(upstreamBody, { status: upstreamRes.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }

      // Emulate function calling via Base44 LLM with structured JSON output
      const realTools = tools.filter(t => t.type === 'function' && t.function?.name && !webSearchToolNames.has(t.function.name));
      const sysPrompt = buildToolsSystemPrompt(realTools);
      const convo = buildPrompt(messages);
      const fullPrompt = `${sysPrompt}\n\n---\n\n${convo}\n\nASSISTANT:`;

      let parsed;
      try {
        const r = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: fullPrompt,
          model: internalModel,
          response_json_schema: TOOL_RESPONSE_SCHEMA,
        });
        parsed = typeof r === 'string' ? JSON.parse(r) : r;
      } catch (err) {
        return Response.json({ error: { message: `Tool emulation failed: ${err.message}`, type: 'server_error' } }, { status: 500, headers: CORS });
      }

      const completionId = makeId('chatcmpl');
      const promptTokens = estimateTokens(fullPrompt);

      if (parsed.action === 'tool_calls' && Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
        const toolCalls = parsed.tool_calls.map((tc, i) => ({
          id: `call_${makeId('id').slice(3)}_${i}`,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) },
        }));
        const completionTokens = estimateTokens(JSON.stringify(toolCalls));

        try {
          await base44.asServiceRole.entities.UsageStats.create({
            api_key_id: keyRecord.id, model: internalModel,
            prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens,
            timestamp: new Date().toISOString(),
          });
        } catch (_) {}

        if (stream) {
          const encoder = new TextEncoder();
          const readable = new ReadableStream({
            async start(controller) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model: requestedModel, choices: [{ index: 0, delta: { role: 'assistant', content: null, tool_calls: toolCalls.map((tc, i) => ({ index: i, id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } })) }, finish_reason: null }] })}\n\n`));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model: requestedModel, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }
          });
          return new Response(readable, { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
        }

        return Response.json({
          id: completionId, object: 'chat.completion', created: Math.floor(Date.now()/1000), model: requestedModel,
          choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: toolCalls }, finish_reason: 'tool_calls' }],
          usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
        }, { headers: CORS });
      }

      // action === 'message'
      const finalText = parsed.content || '';
      const completionTokens = estimateTokens(finalText);
      try {
        await base44.asServiceRole.entities.UsageStats.create({
          api_key_id: keyRecord.id, model: internalModel,
          prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens,
          timestamp: new Date().toISOString(),
        });
      } catch (_) {}

      if (stream) {
        const encoder = new TextEncoder();
        const chars = Array.from(finalText);
        const chunkSize = Math.max(3, Math.ceil(chars.length / 60) || 1);
        const readable = new ReadableStream({
          async start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model: requestedModel, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })}\n\n`));
            for (let i = 0; i < chars.length; i += chunkSize) {
              const chunk = chars.slice(i, i + chunkSize).join('');
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model: requestedModel, choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }] })}\n\n`));
              await new Promise(r => setTimeout(r, 10));
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model: requestedModel, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          }
        });
        return new Response(readable, { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
      }

      return Response.json({
        id: completionId, object: 'chat.completion', created: Math.floor(Date.now()/1000), model: requestedModel,
        choices: [{ index: 0, message: { role: 'assistant', content: finalText }, finish_reason: 'stop' }],
        usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
      }, { headers: CORS });
    }

    const webSearchEnabled = web_search || enable_search || searchSuffix ||
      (Array.isArray(tools) && tools.some(t =>
        t.type === 'web_search' || t.type === 'web_search_preview' || t.type === 'google_search' ||
        (t.function && (t.function.name === 'web_search' || t.function.name === 'google_search'))
      ));

    if (webSearchEnabled && !internalModel.startsWith('gemini')) {
      internalModel = 'gemini_3_flash';
    }

    const skipCache = no_cache || cache === false ||
      (temperature !== undefined && temperature > 0.8) ||
      (top_p !== undefined && top_p < 0.5);

    let cacheKey = null;
    if (!skipCache) {
      const cacheInput = JSON.stringify({ model: internalModel, messages, temperature: temperature ?? null, top_p: top_p ?? null, max_tokens: max_tokens ?? null, response_format: response_format ?? null, reasoning: thinkingEnabled ? (effortRaw || 'high') : null, web_search: webSearchEnabled });
      cacheKey = await sha256(cacheInput);

      const now = new Date();
      const cached = await base44.asServiceRole.entities.ResponseCache.filter({ cache_key: cacheKey });
      if (cached && cached.length > 0) {
        const entry = cached[0];
        if (!entry.expires_at || new Date(entry.expires_at) > now) {
          await base44.asServiceRole.entities.ResponseCache.update(entry.id, { hits: (entry.hits || 0) + 1 });
          const completionId = makeId('chatcmpl');
          const cachedContent = entry.content;

          if (stream) {
            const chars = Array.from(cachedContent);
            const chunkSize = Math.max(5, Math.ceil(chars.length / 20));
            const encoder = new TextEncoder();
            const readable = new ReadableStream({
              async start(controller) {
                for (let i = 0; i < chars.length; i += chunkSize) {
                  const chunk = chars.slice(i, i + chunkSize).join('');
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: requestedModel, choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }], cached: true })}\n\n`));
                  await new Promise(r => setTimeout(r, 25));
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: requestedModel, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], cached: true })}\n\n`));
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                controller.close();
              }
            });
            return new Response(readable, { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
          }

          return Response.json({
            id: completionId, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: requestedModel, cached: true,
            choices: [{ index: 0, message: { role: 'assistant', content: cachedContent }, finish_reason: 'stop' }],
            usage: { prompt_tokens: entry.prompt_tokens || 0, completion_tokens: entry.completion_tokens || 0, total_tokens: entry.total_tokens || 0 },
          }, { headers: CORS });
        }
      }
    }

    // --- Semantic cache lookup (single-turn user requests, no tools) ---
    const userMsgsCount = messages.filter(m => m.role === 'user').length;
    const isSingleTurn = userMsgsCount === 1 && !hasFunctionCallingTools;
    const userText = lastUserText(messages);
    let queryEmbedding = null;
    if (!skipCache && isSingleTurn && userText && userText.length >= 4) {
      queryEmbedding = embedText(userText);
      const candidates = await base44.asServiceRole.entities.ResponseCache.filter({ model: internalModel, is_single_turn: true }, '-created_date', 200);
      let best = null;
      let bestScore = 0;
      const now = new Date();
      for (const c of candidates) {
        if (c.expires_at && new Date(c.expires_at) <= now) continue;
        if (!Array.isArray(c.embedding) || c.embedding.length !== EMBED_DIM) continue;
        const score = cosineSim(queryEmbedding, c.embedding);
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (best && bestScore >= SEMANTIC_THRESHOLD) {
        await base44.asServiceRole.entities.ResponseCache.update(best.id, { hits: (best.hits || 0) + 1 });
        const completionId = makeId('chatcmpl');
        const cachedContent = best.content;
        if (stream) {
          const chars = Array.from(cachedContent);
          const chunkSize = Math.max(5, Math.ceil(chars.length / 20));
          const encoder = new TextEncoder();
          const readable = new ReadableStream({
            async start(controller) {
              for (let i = 0; i < chars.length; i += chunkSize) {
                const chunk = chars.slice(i, i + chunkSize).join('');
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model: requestedModel, choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }], cached: 'semantic', similarity: bestScore })}\n\n`));
                await new Promise(r => setTimeout(r, 20));
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model: requestedModel, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], cached: 'semantic' })}\n\n`));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            }
          });
          return new Response(readable, { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
        }
        return Response.json({
          id: completionId, object: 'chat.completion', created: Math.floor(Date.now()/1000), model: requestedModel,
          cached: 'semantic', similarity: Number(bestScore.toFixed(4)),
          choices: [{ index: 0, message: { role: 'assistant', content: cachedContent }, finish_reason: 'stop' }],
          usage: { prompt_tokens: best.prompt_tokens || 0, completion_tokens: best.completion_tokens || 0, total_tokens: best.total_tokens || 0 },
        }, { headers: CORS });
      }
    }

    const prompt = buildPrompt(messages);
    let content = '';
    let llmError = null;

    try {
      const llmParams = { prompt, model: internalModel };
      if (webSearchEnabled) llmParams.add_context_from_internet = true;
      if (response_format?.type === 'json_object' || response_format?.type === 'json_schema') {
        llmParams.response_json_schema = response_format.json_schema?.schema || { type: 'object' };
      }
      const result = await base44.asServiceRole.integrations.Core.InvokeLLM(llmParams);
      content = typeof result === 'string' ? result : JSON.stringify(result);
    } catch (err) {
      llmError = err;
    }

    if (llmError) {
      const upstreams = await base44.asServiceRole.entities.Config.filter({ type: 'upstream', enabled: true });
      const upstream = upstreams[0];
      if (upstream && upstream.endpoint && upstream.apiKey) {
        const upstreamRes = await fetch(`${upstream.endpoint.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${upstream.apiKey}` },
          body: JSON.stringify({ ...body, model: upstream.model || body.model }),
        });
        const upstreamData = await upstreamRes.json();
        return Response.json(upstreamData, { status: upstreamRes.status, headers: CORS });
      }
      throw llmError;
    }

    const promptTokens = estimateTokens(prompt);
    const completionTokens = estimateTokens(content);
    const totalTokens = promptTokens + completionTokens;
    const reasoningTokens = thinkingEnabled ? Math.floor(completionTokens * 0.3) : 0;

    if (!skipCache && cacheKey) {
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
      try {
        await base44.asServiceRole.entities.ResponseCache.create({
          cache_key: cacheKey, model: internalModel, content,
          prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens,
          hits: 0, expires_at: expiresAt,
          embedding: isSingleTurn ? (queryEmbedding || embedText(userText)) : undefined,
          last_user_text: isSingleTurn ? userText.slice(0, 500) : undefined,
          is_single_turn: isSingleTurn,
        });
      } catch (_) {}

      // Prefix backfill: for each assistant message in the history, cache (prefix → that assistant reply).
      // Re-runs and rollbacks of any past turn will hit instantly.
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m.role !== 'assistant') continue;
        let aText = '';
        if (typeof m.content === 'string') aText = m.content;
        else if (Array.isArray(m.content)) aText = m.content.map(c => c.text || '').join('\n');
        if (!aText) continue;
        const prefix = messages.slice(0, i);
        if (prefix.length === 0) continue;
        const prefixCacheInput = JSON.stringify({ model: internalModel, messages: prefix, temperature: temperature ?? null, top_p: top_p ?? null, max_tokens: max_tokens ?? null, response_format: response_format ?? null, reasoning: thinkingEnabled ? (effortRaw || 'high') : null, web_search: webSearchEnabled });
        const k = await sha256(prefixCacheInput);
        try {
          const exists = await base44.asServiceRole.entities.ResponseCache.filter({ cache_key: k });
          if (exists && exists.length > 0) continue;
          const partialPrompt = buildPrompt(prefix);
          const aTokens = estimateTokens(aText);
          await base44.asServiceRole.entities.ResponseCache.create({
            cache_key: k, model: internalModel, content: aText,
            prompt_tokens: estimateTokens(partialPrompt),
            completion_tokens: aTokens,
            total_tokens: estimateTokens(partialPrompt) + aTokens,
            hits: 0, expires_at: expiresAt,
          });
        } catch (_) {}
      }
    }

    try {
      await base44.asServiceRole.entities.UsageStats.create({
        api_key_id: keyRecord.id, model: internalModel,
        prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens,
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}

    const completionId = makeId('chatcmpl');

    if (stream) {
      const chars = Array.from(content);
      const chunkSize = Math.max(3, Math.ceil(chars.length / 80));
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: requestedModel, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] })}\n\n`));
          for (let i = 0; i < chars.length; i += chunkSize) {
            const chunk = chars.slice(i, i + chunkSize).join('');
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: requestedModel, choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }] })}\n\n`));
            await new Promise(r => setTimeout(r, 10));
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: requestedModel, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`));
          if (stream_options?.include_usage) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: completionId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: requestedModel, choices: [], usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens, ...(reasoningTokens > 0 ? { completion_tokens_details: { reasoning_tokens: reasoningTokens } } : {}) } })}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      });
      return new Response(readable, { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
    }

    return Response.json({
      id: completionId, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: requestedModel,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens, ...(reasoningTokens > 0 ? { completion_tokens_details: { reasoning_tokens: reasoningTokens } } : {}) },
    }, { headers: CORS });

  } catch (error) {
    return Response.json({ error: { message: error.message, type: 'server_error' } }, { status: 500, headers: CORS });
  }
});