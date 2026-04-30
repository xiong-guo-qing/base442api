import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta',
};

function createInternalClient(req) {
  const headers = new Headers(req.headers);
  const apiKey = headers.get('x-api-key') || (headers.get('Authorization') || '').replace('Bearer ', '').trim();
  headers.set('x-api-key', apiKey || '');
  return createClientFromRequest(new Request(req.url, { method: req.method, headers }));
}

const MODEL_MAP = {
  'claude-sonnet-4.6': 'claude_sonnet_4_6',
  'claude-opus-4.6': 'claude_opus_4_6',
  'claude-opus-4.7': 'claude_opus_4_7',
  'claude-3-5-sonnet': 'claude_sonnet_4_6',
  'claude-3-5-sonnet-20241022': 'claude_sonnet_4_6',
  'claude-3-7-sonnet': 'claude_sonnet_4_6',
  'claude-3-opus': 'claude_opus_4_7',
  'claude-opus': 'claude_opus_4_7',
  'gpt-4o': 'gpt_5_mini',
  'gpt-4o-mini': 'gpt_5_mini',
  'gpt-4': 'gpt_5_4',
  'gpt-5': 'gpt_5_5',
  'gpt-5.5': 'gpt_5_5',
  'gpt-5.4': 'gpt_5_4',
  'gpt-5-mini': 'gpt_5_mini',
  'gemini-pro': 'gemini_3_1_pro',
  'gemini-flash': 'gemini_3_flash',
  'gemini-3-flash': 'gemini_3_flash',
  'gemini-3.1-pro': 'gemini_3_1_pro',
  'automatic': 'automatic',
};

function makeId(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function getSourceIp(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '';
}

function sanitizeParams(body) {
  const safe = { ...body };
  delete safe.api_key;
  if (Array.isArray(safe.messages)) safe.messages = safe.messages.slice(-6);
  const text = JSON.stringify(safe, null, 2);
  return text.length > 6000 ? text.slice(0, 6000) + '\n...已截断' : text;
}

function buildStreamTrace(chunks, meta = {}) {
  const events = [];
  let text = '';
  const push = (event, data) => {
    const item = { event, type: data.type, data };
    const deltaText = data.delta?.text || '';
    if (deltaText) {
      item.text = deltaText;
      text += deltaText;
    }
    events.push(item);
  };
  push('message_start', { type: 'message_start', message: meta.message || {} });
  push('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  push('ping', { type: 'ping' });
  chunks.forEach(chunk => push('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk } }));
  push('content_block_stop', { type: 'content_block_stop', index: 0 });
  push('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: meta.usage || {} });
  push('message_stop', { type: 'message_stop' });
  return {
    stream_events: JSON.stringify(events).slice(0, 18000),
    stream_text: text.slice(0, 12000),
    stream_event_count: events.length,
    is_stream: true,
  };
}

async function writeRequestLog(base44, data) {
  try {
    await base44.asServiceRole.entities.RequestLog.create({
      ...data,
      duration_ms: Date.now() - data.started_at,
      logged_at: new Date().toISOString(),
      started_at: undefined,
    });
  } catch (err) {
    console.error('[requestLog] write failed:', err.message);
  }
}

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

async function recordUsage(base44, keyRecord, model, promptTokens = 0, completionTokens = 0) {
  try {
    await base44.asServiceRole.entities.UsageStats.create({
      api_key_id: keyRecord.id,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      timestamp: new Date().toISOString(),
    });
  } catch (_) {}
}

const EMBED_DIM = 256;
const STOPWORDS = new Set(['the','a','an','is','are','was','were','of','to','in','on','at','for','and','or','but','i','you','it','this','that','please','can','could','would','will','do','does','did','have','has','had','be','been','am','my','your','我','你','的','了','是','吗','啊','请','帮','给','把','一','在','和','或','也','都','就','要','不','没','有','吧']);
function embedText(text) {
  const v = new Float32Array(EMBED_DIM);
  if (!text) return Array.from(v);
  const lower = text.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const tok of lower.split(/[^a-z0-9\u4e00-\u9fff]+/)) {
    if (!tok || STOPWORDS.has(tok) || tok.length < 2) continue;
    let h = 5381;
    for (let i = 0; i < tok.length; i++) h = ((h << 5) + h + tok.charCodeAt(i)) | 0;
    v[Math.abs(h) % EMBED_DIM] += 1;
  }
  const s = ' ' + lower + ' ';
  for (let i = 0; i < s.length - 2; i++) {
    const tri = s.slice(i, i + 3);
    let h = 5381;
    for (let j = 0; j < 3; j++) h = ((h << 5) + h + tri.charCodeAt(j)) | 0;
    v[Math.abs(h) % EMBED_DIM] += 0.5;
  }
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
    if (Array.isArray(m.content)) return m.content.filter(c => c.type === 'text').map(c => c.text || '').join('\n');
  }
  return '';
}

function normalizeCacheText(text) {
  const t = (text || '').replace(/\r\n/g, '\n').trim();
  if (t.length <= 2000) return t;
  const markerMatch = t.match(/(?:USER REQUEST|User request|用户请求|用户问题|Question|问题)[:：]\s*([\s\S]*)$/);
  if (markerMatch?.[1]?.trim()) return markerMatch[1].trim().slice(-1500);
  return t.split('\n').map(line => line.trim()).filter(Boolean).slice(-24).join('\n').slice(-1500);
}
const SEMANTIC_THRESHOLD = 0.92;

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function buildPrompt(system, messages) {
  const parts = [];
  if (system) {
    const sysText = typeof system === 'string' ? system :
      Array.isArray(system) ? system.map(s => s.text || '').join('\n') : String(system);
    parts.push(`SYSTEM: ${sysText}`);
  }
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'ASSISTANT' : 'HUMAN';
    let content = '';
    if (typeof m.content === 'string') {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      content = m.content.map(c => {
        if (c.type === 'text') return c.text || '';
        if (c.type === 'tool_use') return `[tool_call id=${c.id} name=${c.name} args=${JSON.stringify(c.input || {})}]`;
        if (c.type === 'tool_result') {
          const t = typeof c.content === 'string' ? c.content :
            Array.isArray(c.content) ? c.content.map(x => x.text || '').join('\n') : JSON.stringify(c.content || '');
          return `[tool_result id=${c.tool_use_id || ''}]\n${t}`;
        }
        return '';
      }).filter(Boolean).join('\n');
    } else {
      content = String(m.content || '');
    }
    parts.push(`${role}: ${content}`);
  }
  return parts.join('\n\n');
}

function buildToolsSystemPrompt(tools) {
  const list = tools.map(t =>
    `- ${t.name}: ${t.description || ''}\n  parameters: ${JSON.stringify(t.input_schema || {})}`
  ).join('\n');
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
          arguments: { type: 'object' }
        },
        required: ['name', 'arguments']
      }
    }
  },
  required: ['action']
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const startedAt = Date.now();
  const requestId = makeId('req');
  let base44;
  let requestLog = {
    request_id: requestId,
    endpoint: '/v1/messages',
    method: req.method,
    source_ip: getSourceIp(req),
    origin: req.headers.get('origin') || '',
    referer: req.headers.get('referer') || '',
    user_agent: req.headers.get('user-agent') || '',
    status_code: 500,
    cache_status: 'miss',
    started_at: startedAt,
  };

  try {
    base44 = createInternalClient(req);
    const apiKey =
      req.headers.get('x-api-key') ||
      (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();

    if (!apiKey) {
      return Response.json(
        { type: 'error', error: { type: 'authentication_error', message: 'Missing API key' } },
        { status: 401, headers: CORS }
      );
    }

    const keys = await base44.asServiceRole.entities.APIKey.filter({ key: apiKey, enabled: true });
    if (!keys || keys.length === 0) {
      return Response.json(
        { type: 'error', error: { type: 'authentication_error', message: 'Invalid or disabled API key' } },
        { status: 401, headers: CORS }
      );
    }
    const keyRecord = keys[0];

    const body = await req.json();
    requestLog.api_key_id = keyRecord.id;
    requestLog.api_key_name = keyRecord.name || '';
    requestLog.request_params = sanitizeParams(body);
    const {
      model: requestedModel = 'claude-sonnet-4.6',
      messages = [],
      system,
      max_tokens = 1024,
      stream = false,
      thinking,
      tools,
    } = body;

    let internalModel = MODEL_MAP[requestedModel] || 'claude_sonnet_4_6';
    requestLog.requested_model = requestedModel;
    requestLog.model = internalModel;

    if (thinking?.type === 'enabled' || thinking?.budget_tokens > 0) {
      if (internalModel.startsWith('claude')) {
        internalModel = 'claude_opus_4_7';
      }
    }

    // If tools are present, cache deterministic tool-call decisions too.
    const hasFunctionCallingTools = Array.isArray(tools) && tools.length > 0;
    if (hasFunctionCallingTools) {
      const toolCacheKey = await sha256(JSON.stringify({ model: internalModel, system: system || null, last_user_text: normalizeCacheText(lastUserText(messages)), tools }));
      const toolCached = await base44.asServiceRole.entities.ResponseCache.filter({ cache_key: toolCacheKey });
      const toolCacheEntry = (toolCached && toolCached.length > 0 && (!toolCached[0].expires_at || new Date(toolCached[0].expires_at) > new Date())) ? toolCached[0] : null;
      if (toolCacheEntry) {
        await base44.asServiceRole.entities.ResponseCache.update(toolCacheEntry.id, { hits: (toolCacheEntry.hits || 0) + 1 });
        await recordUsage(base44, keyRecord, internalModel, toolCacheEntry.prompt_tokens || 0, toolCacheEntry.completion_tokens || 0);
        requestLog.cache_status = 'hit';
        requestLog.status_code = 200;
        requestLog.response_summary = 'Tool response served from cache';
        await writeRequestLog(base44, requestLog);
        if (stream) {
          const cached = JSON.parse(toolCacheEntry.content);
          const blocks = cached.content || [];
          const encoder = new TextEncoder();
          const readable = new ReadableStream({
            async start(controller) {
              controller.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { ...cached, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: toolCacheEntry.prompt_tokens || 0, output_tokens: 0 } } })}\n\n`));
              for (let idx = 0; idx < blocks.length; idx++) {
                const b = blocks[idx];
                controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: idx, content_block: b.type === 'tool_use' ? { type: 'tool_use', id: b.id, name: b.name, input: {} } : { type: 'text', text: '' } })}\n\n`));
                if (b.type === 'tool_use') {
                  controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: idx, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input || {}) } })}\n\n`));
                } else {
                  controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: idx, delta: { type: 'text_delta', text: b.text || '' } })}\n\n`));
                }
                controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: idx })}\n\n`));
              }
              controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: cached.stop_reason || 'end_turn', stop_sequence: null }, usage: { input_tokens: toolCacheEntry.prompt_tokens || 0, output_tokens: toolCacheEntry.completion_tokens || 0, total_tokens: (toolCacheEntry.prompt_tokens || 0) + (toolCacheEntry.completion_tokens || 0) } })}\n\n`));
              controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
              controller.close();
            }
          });
          return new Response(readable, { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Cache': 'HIT' } });
        }
        return new Response(toolCacheEntry.content, { headers: { ...CORS, 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });
      }
      const upstreams = await base44.asServiceRole.entities.Config.filter({ type: 'upstream', enabled: true });
      const upstream = upstreams[0];
      if (upstream && upstream.endpoint && upstream.apiKey) {
        const upstreamRes = await fetch(`${upstream.endpoint.replace(/\/$/, '')}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': upstream.apiKey,
            'anthropic-version': req.headers.get('anthropic-version') || '2023-06-01',
          },
          body: JSON.stringify({ ...body, model: upstream.model || body.model }),
        });
        const upstreamBody = await upstreamRes.text();
        if (upstreamRes.ok) {
          try {
            await base44.asServiceRole.entities.ResponseCache.create({
              cache_key: toolCacheKey,
              model: internalModel,
              content: upstreamBody,
              prompt_tokens: estimateTokens(JSON.stringify({ system, messages, tools })),
              completion_tokens: estimateTokens(upstreamBody),
              total_tokens: estimateTokens(JSON.stringify({ system, messages, tools })) + estimateTokens(upstreamBody),
              hits: 0,
              expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            });
          } catch (cacheErr) { console.error('[v1/messages] upstream tool cache write failed:', cacheErr.message); }
        }
        return new Response(upstreamBody, { status: upstreamRes.status, headers: { ...CORS, 'Content-Type': 'application/json', 'X-Cache': 'MISS' } });
      }

      // Emulate tool use via Base44 LLM with structured JSON output
      const sysPrompt = buildToolsSystemPrompt(tools);
      const convo = buildPrompt(system, messages);
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
        return Response.json(
          { type: 'error', error: { type: 'api_error', message: `Tool emulation failed: ${err.message}` } },
          { status: 500, headers: CORS }
        );
      }

      const msgId = makeId('msg');
      const inputTokens = estimateTokens(fullPrompt);

      if (parsed.action === 'tool_calls' && Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
        const blocks = parsed.tool_calls.map((tc, i) => ({
          type: 'tool_use',
          id: `toolu_${makeId('id').slice(3)}_${i}`,
          name: tc.name,
          input: tc.arguments || {},
        }));
        const outputTokens = estimateTokens(JSON.stringify(blocks));

        try {
          await base44.asServiceRole.entities.UsageStats.create({
            api_key_id: keyRecord.id, model: internalModel,
            prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens,
            timestamp: new Date().toISOString(),
          });
        } catch (_) {}

        const responseBodyForCache = {
          id: msgId, type: 'message', role: 'assistant',
          content: blocks, model: requestedModel,
          stop_reason: 'tool_use', stop_sequence: null,
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        };
        try {
          await base44.asServiceRole.entities.ResponseCache.create({
            cache_key: toolCacheKey, model: internalModel, content: JSON.stringify(responseBodyForCache),
            prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens,
            hits: 0, expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          });
        } catch (cacheErr) { console.error('[v1/messages] tool cache write failed:', cacheErr.message); }

        if (stream) {
          const encoder = new TextEncoder();
          const readable = new ReadableStream({
            async start(controller) {
              controller.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify({
                type: 'message_start',
                message: { id: msgId, type: 'message', role: 'assistant', content: [], model: requestedModel, stop_reason: null, stop_sequence: null, usage: { input_tokens: inputTokens, output_tokens: 0 } }
              })}\n\n`));

              for (let idx = 0; idx < blocks.length; idx++) {
                const b = blocks[idx];
                controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: idx, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } })}\n\n`));
                controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: idx, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) } })}\n\n`));
                controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: idx })}\n\n`));
              }

              controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens } })}\n\n`));
              controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
              controller.close();
            }
          });
          return new Response(readable, { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
        }

        const responseBody = {
          id: msgId, type: 'message', role: 'assistant',
          content: blocks, model: requestedModel,
          stop_reason: 'tool_use', stop_sequence: null,
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        };
        try {
          await base44.asServiceRole.entities.ResponseCache.create({
            cache_key: toolCacheKey, model: internalModel, content: JSON.stringify(responseBody),
            prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens,
            hits: 0, expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          });
        } catch (cacheErr) { console.error('[v1/messages] tool cache write failed:', cacheErr.message); }
        return Response.json(responseBody, { headers: { ...CORS, 'X-Cache': 'MISS' } });
      }

      // action === 'message'
      const finalText = parsed.content || '';
      const outputTokens = estimateTokens(finalText);
      try {
        await base44.asServiceRole.entities.UsageStats.create({
          api_key_id: keyRecord.id, model: internalModel,
          prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens,
          timestamp: new Date().toISOString(),
        });
      } catch (_) {}

      const responseBodyForCache = {
        id: msgId, type: 'message', role: 'assistant',
        content: [{ type: 'text', text: finalText }],
        model: requestedModel, stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      };
      try {
        await base44.asServiceRole.entities.ResponseCache.create({
          cache_key: toolCacheKey, model: internalModel, content: JSON.stringify(responseBodyForCache),
          prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens,
          hits: 0, expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        });
      } catch (cacheErr) { console.error('[v1/messages] stream tool text cache write failed:', cacheErr.message); }

      if (stream) {
        const encoder = new TextEncoder();
        const chars = Array.from(finalText);
        const chunkSize = Math.max(3, Math.ceil(chars.length / 60) || 1);
        const readable = new ReadableStream({
          async start(controller) {
            controller.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { id: msgId, type: 'message', role: 'assistant', content: [], model: requestedModel, stop_reason: null, stop_sequence: null, usage: { input_tokens: inputTokens, output_tokens: 0 } } })}\n\n`));
            controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`));
            for (let i = 0; i < chars.length; i += chunkSize) {
              const chunk = chars.slice(i, i + chunkSize).join('');
              controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk } })}\n\n`));
              await new Promise(r => setTimeout(r, 10));
            }
            controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`));
            controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens } })}\n\n`));
            controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
            controller.close();
          }
        });
        return new Response(readable, { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
      }

      const responseBody = {
        id: msgId, type: 'message', role: 'assistant',
        content: [{ type: 'text', text: finalText }],
        model: requestedModel, stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      };
      try {
        await base44.asServiceRole.entities.ResponseCache.create({
          cache_key: toolCacheKey, model: internalModel, content: JSON.stringify(responseBody),
          prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens,
          hits: 0, expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        });
      } catch (cacheErr) { console.error('[v1/messages] tool text cache write failed:', cacheErr.message); }
      return Response.json(responseBody, { headers: { ...CORS, 'X-Cache': 'MISS' } });
    }

    const prompt = buildPrompt(system, messages);

    // Prefix cache lookup: try the exact request first, then progressively shorter prefixes
    // Hit means: at some past time, an identical conversation prefix was answered with the same content.
    const sysKey = system || null;
    async function keyFor(prefixMessages) {
      const cacheText = normalizeCacheText(lastUserText(prefixMessages));
      return await sha256(JSON.stringify({ model: internalModel, system: sysKey, last_user_text: cacheText || JSON.stringify(prefixMessages) }));
    }

    const cacheKey = await keyFor(messages);
    const found = await base44.asServiceRole.entities.ResponseCache.filter({ cache_key: cacheKey });
    const cacheEntry = (found && found.length > 0 && (!found[0].expires_at || new Date(found[0].expires_at) > new Date())) ? found[0] : null;

    if (cacheEntry) {
      const entry = cacheEntry;
      {
        await base44.asServiceRole.entities.ResponseCache.update(entry.id, { hits: (entry.hits || 0) + 1 });
        await recordUsage(base44, keyRecord, internalModel, entry.prompt_tokens || 0, entry.completion_tokens || 0);
        requestLog.cache_status = 'hit';
        requestLog.status_code = 200;
        requestLog.response_summary = 'Response served from exact cache';
        const cachedContent = entry.content;
        const cachedIn = entry.prompt_tokens || 0;
        const cachedOut = entry.completion_tokens || 0;
        const cMsgId = makeId('msg');

        if (stream) {
          const encoder = new TextEncoder();
          const chars = Array.from(cachedContent);
          const chunkSize = Math.max(5, Math.ceil(chars.length / 20));
          const chunks = [];
          for (let i = 0; i < chars.length; i += chunkSize) chunks.push(chars.slice(i, i + chunkSize).join(''));
          Object.assign(requestLog, buildStreamTrace(chunks, {
            message: { id: cMsgId, type: 'message', role: 'assistant', content: [], model: requestedModel },
            usage: { input_tokens: cachedIn, output_tokens: cachedOut, total_tokens: cachedIn + cachedOut }
          }));
          await writeRequestLog(base44, requestLog);
          const readable = new ReadableStream({
            async start(controller) {
              controller.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { id: cMsgId, type: 'message', role: 'assistant', content: [], model: requestedModel, stop_reason: null, stop_sequence: null, usage: { input_tokens: cachedIn, output_tokens: 0 } } })}\n\n`));
              controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`));
              for (const chunk of chunks) {
                controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk } })}\n\n`));
                await new Promise(r => setTimeout(r, 25));
              }
              controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`));
              controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { input_tokens: cachedIn, output_tokens: cachedOut, total_tokens: cachedIn + cachedOut } })}\n\n`));
              controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
              controller.close();
            }
          });
          return new Response(readable, { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
        }

        await writeRequestLog(base44, requestLog);
        return Response.json({
          id: cMsgId, type: 'message', role: 'assistant',
          content: [{ type: 'text', text: cachedContent }],
          model: requestedModel, stop_reason: 'end_turn', stop_sequence: null,
          usage: { input_tokens: cachedIn, output_tokens: cachedOut },
        }, { headers: CORS });
      }
    }

    // --- Semantic cache lookup (single-turn, no tools) ---
    const userMsgsCount = messages.filter(m => m.role === 'user').length;
    const isSingleTurn = userMsgsCount === 1;
    const userText = normalizeCacheText(lastUserText(messages));
    let queryEmbedding = null;
    if (isSingleTurn && userText && userText.length >= 4) {
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
        await recordUsage(base44, keyRecord, internalModel, best.prompt_tokens || 0, best.completion_tokens || 0);
        requestLog.cache_status = 'semantic_hit';
        requestLog.status_code = 200;
        requestLog.response_summary = `Response served from semantic cache`;
        const cachedContent = best.content;
        const cachedIn = best.prompt_tokens || 0;
        const cachedOut = best.completion_tokens || 0;
        const sMsgId = makeId('msg');
        if (stream) {
          const encoder = new TextEncoder();
          const chars = Array.from(cachedContent);
          const chunkSize = Math.max(5, Math.ceil(chars.length / 20));
          const chunks = [];
          for (let i = 0; i < chars.length; i += chunkSize) chunks.push(chars.slice(i, i + chunkSize).join(''));
          Object.assign(requestLog, buildStreamTrace(chunks, {
            message: { id: sMsgId, type: 'message', role: 'assistant', content: [], model: requestedModel },
            usage: { input_tokens: cachedIn, output_tokens: cachedOut, total_tokens: cachedIn + cachedOut }
          }));
          await writeRequestLog(base44, requestLog);
          const readable = new ReadableStream({
            async start(controller) {
              controller.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { id: sMsgId, type: 'message', role: 'assistant', content: [], model: requestedModel, stop_reason: null, stop_sequence: null, usage: { input_tokens: cachedIn, output_tokens: 0 } } })}\n\n`));
              controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`));
              for (const chunk of chunks) {
                controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk } })}\n\n`));
                await new Promise(r => setTimeout(r, 20));
              }
              controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`));
              controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { input_tokens: cachedIn, output_tokens: cachedOut, total_tokens: cachedIn + cachedOut } })}\n\n`));
              controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
              controller.close();
            }
          });
          return new Response(readable, { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
        }
        await writeRequestLog(base44, requestLog);
        return Response.json({
          id: sMsgId, type: 'message', role: 'assistant',
          content: [{ type: 'text', text: cachedContent }],
          model: requestedModel, stop_reason: 'end_turn', stop_sequence: null,
          usage: { input_tokens: cachedIn, output_tokens: cachedOut },
        }, { headers: CORS });
      }
    }

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt, model: internalModel });
    const content = typeof result === 'string' ? result : JSON.stringify(result);

    const inputTokens = estimateTokens(prompt);
    const outputTokens = estimateTokens(content);
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    // Write cache for the exact request
    try {
      await base44.asServiceRole.entities.ResponseCache.create({
        cache_key: cacheKey, model: internalModel, content,
        prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens,
        hits: 0, expires_at: expiresAt,
        embedding: isSingleTurn ? (queryEmbedding || embedText(userText)) : undefined,
        last_user_text: isSingleTurn ? userText.slice(0, 500) : undefined,
        is_single_turn: isSingleTurn,
      });
    } catch (cacheErr) { console.error('[v1/messages] cache write failed:', cacheErr.message); }

    // Backfill prefix cache from the request's own conversation history.
    // For every assistant message A at index i, the prefix messages[0..i] was historically
    // answered with A. Cache that mapping so that re-runs / rollbacks hit immediately.
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role !== 'assistant') continue;
      // Extract assistant text content (skip tool_use blocks)
      let aText = '';
      if (typeof m.content === 'string') aText = m.content;
      else if (Array.isArray(m.content)) aText = m.content.filter(c => c.type === 'text').map(c => c.text || '').join('\n');
      if (!aText) continue;
      const prefix = messages.slice(0, i);
      if (prefix.length === 0) continue;
      const k = await keyFor(prefix);
      try {
        const exists = await base44.asServiceRole.entities.ResponseCache.filter({ cache_key: k });
        if (exists && exists.length > 0) continue;
        const partialPrompt = buildPrompt(system, prefix);
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

    try {
      await base44.asServiceRole.entities.UsageStats.create({
        api_key_id: keyRecord.id,
        model: internalModel,
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        timestamp: new Date().toISOString(),
      });
    } catch (_) {}

    const msgId = makeId('msg');

    if (stream) {
      requestLog.cache_status = 'miss';
      requestLog.status_code = 200;
      requestLog.response_summary = `Generated ${outputTokens} output tokens via stream`;

      const encoder = new TextEncoder();
      const chars = Array.from(content);
      const chunkSize = Math.max(3, Math.ceil(chars.length / 80));
      const chunks = [];
      for (let i = 0; i < chars.length; i += chunkSize) chunks.push(chars.slice(i, i + chunkSize).join(''));
      Object.assign(requestLog, buildStreamTrace(chunks, {
        message: { id: msgId, type: 'message', role: 'assistant', content: [], model: requestedModel },
        usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens }
      }));
      await writeRequestLog(base44, requestLog);

      const readable = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify({
            type: 'message_start',
            message: { id: msgId, type: 'message', role: 'assistant', content: [], model: requestedModel, stop_reason: null, stop_sequence: null, usage: { input_tokens: inputTokens, output_tokens: 0 } }
          })}\n\n`));

          controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`));
          controller.enqueue(encoder.encode(`event: ping\ndata: ${JSON.stringify({ type: 'ping' })}\n\n`));

          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk } })}\n\n`));
            await new Promise(r => setTimeout(r, 10));
          }

          controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`));
          controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens } })}\n\n`));
          controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
          controller.close();
        }
      });

      return new Response(readable, {
        headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
      });
    }

    requestLog.cache_status = 'miss';
    requestLog.status_code = 200;
    requestLog.response_summary = `Generated ${outputTokens} output tokens`;
    await writeRequestLog(base44, requestLog);

    return Response.json({
      id: msgId,
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: content }],
      model: requestedModel,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    }, { headers: CORS });

  } catch (error) {
    if (base44) {
      requestLog.cache_status = 'error';
      requestLog.status_code = 500;
      requestLog.error_message = error.message;
      await writeRequestLog(base44, requestLog);
    }
    return Response.json(
      { type: 'error', error: { type: 'api_error', message: error.message } },
      { status: 500, headers: CORS }
    );
  }
});