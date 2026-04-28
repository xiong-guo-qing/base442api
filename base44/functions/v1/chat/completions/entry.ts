import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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

function buildPrompt(messages) {
  return messages.map(m => {
    const role = (m.role || 'user').toUpperCase();
    const content = typeof m.content === 'string' ? m.content :
      Array.isArray(m.content) ? m.content.map(c => c.text || '').join('\n') : String(m.content || '');
    return `${role}: ${content}`;
  }).join('\n\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const base44 = createClientFromRequest(req);
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

    const webSearchEnabled = web_search || enable_search || searchSuffix ||
      (Array.isArray(tools) && tools.some(t =>
        t.type === 'web_search' || t.type === 'web_search_preview' || t.type === 'google_search' ||
        (t.function && (t.function.name === 'web_search' || t.function.name === 'google_search'))
      ));

    if (webSearchEnabled && !internalModel.startsWith('gemini')) {
      internalModel = 'gemini_3_flash';
    }

    const skipCache = no_cache || cache === false ||
      (temperature !== undefined && temperature > 0.3) ||
      (top_p !== undefined && top_p < 0.9);

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
      try {
        await base44.asServiceRole.entities.ResponseCache.create({
          cache_key: cacheKey, model: internalModel, content,
          prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens,
          hits: 0, expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        });
      } catch (_) {}
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