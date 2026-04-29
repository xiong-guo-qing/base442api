import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta',
};

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

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

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

  try {
    const base44 = createClientFromRequest(req);
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

    if (thinking?.type === 'enabled' || thinking?.budget_tokens > 0) {
      if (internalModel.startsWith('claude')) {
        internalModel = 'claude_opus_4_7';
      }
    }

    // If tools are present, try upstream first, otherwise emulate via Base44 LLM
    const hasFunctionCallingTools = Array.isArray(tools) && tools.length > 0;
    if (hasFunctionCallingTools) {
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
        return new Response(upstreamBody, { status: upstreamRes.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
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

              controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: outputTokens } })}\n\n`));
              controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
              controller.close();
            }
          });
          return new Response(readable, { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
        }

        return Response.json({
          id: msgId, type: 'message', role: 'assistant',
          content: blocks, model: requestedModel,
          stop_reason: 'tool_use', stop_sequence: null,
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        }, { headers: CORS });
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
            controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: outputTokens } })}\n\n`));
            controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
            controller.close();
          }
        });
        return new Response(readable, { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
      }

      return Response.json({
        id: msgId, type: 'message', role: 'assistant',
        content: [{ type: 'text', text: finalText }],
        model: requestedModel, stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      }, { headers: CORS });
    }

    const prompt = buildPrompt(system, messages);

    // Prefix cache lookup: try the exact request first, then progressively shorter prefixes
    // Hit means: at some past time, an identical conversation prefix was answered with the same content.
    const sysKey = system || null;
    async function keyFor(prefixMessages) {
      return await sha256(JSON.stringify({ model: internalModel, system: sysKey, messages: prefixMessages }));
    }

    const cacheKey = await keyFor(messages);
    const found = await base44.asServiceRole.entities.ResponseCache.filter({ cache_key: cacheKey });
    const cacheEntry = (found && found.length > 0 && (!found[0].expires_at || new Date(found[0].expires_at) > new Date())) ? found[0] : null;

    if (cacheEntry) {
      const entry = cacheEntry;
      {
        await base44.asServiceRole.entities.ResponseCache.update(entry.id, { hits: (entry.hits || 0) + 1 });
        const cachedContent = entry.content;
        const cachedIn = entry.prompt_tokens || 0;
        const cachedOut = entry.completion_tokens || 0;
        const cMsgId = makeId('msg');

        if (stream) {
          const encoder = new TextEncoder();
          const chars = Array.from(cachedContent);
          const chunkSize = Math.max(5, Math.ceil(chars.length / 20));
          const readable = new ReadableStream({
            async start(controller) {
              controller.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { id: cMsgId, type: 'message', role: 'assistant', content: [], model: requestedModel, stop_reason: null, stop_sequence: null, usage: { input_tokens: cachedIn, output_tokens: 0 } } })}\n\n`));
              controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`));
              for (let i = 0; i < chars.length; i += chunkSize) {
                const chunk = chars.slice(i, i + chunkSize).join('');
                controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk } })}\n\n`));
                await new Promise(r => setTimeout(r, 25));
              }
              controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`));
              controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: cachedOut } })}\n\n`));
              controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
              controller.close();
            }
          });
          return new Response(readable, { headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
        }

        return Response.json({
          id: cMsgId, type: 'message', role: 'assistant',
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
      });
    } catch (_) {}

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
      const encoder = new TextEncoder();
      const chars = Array.from(content);
      const chunkSize = Math.max(3, Math.ceil(chars.length / 80));

      const readable = new ReadableStream({
        async start(controller) {
          controller.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify({
            type: 'message_start',
            message: { id: msgId, type: 'message', role: 'assistant', content: [], model: requestedModel, stop_reason: null, stop_sequence: null, usage: { input_tokens: inputTokens, output_tokens: 0 } }
          })}\n\n`));

          controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })}\n\n`));
          controller.enqueue(encoder.encode(`event: ping\ndata: ${JSON.stringify({ type: 'ping' })}\n\n`));

          for (let i = 0; i < chars.length; i += chunkSize) {
            const chunk = chars.slice(i, i + chunkSize).join('');
            controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: chunk } })}\n\n`));
            await new Promise(r => setTimeout(r, 10));
          }

          controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`));
          controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: outputTokens } })}\n\n`));
          controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
          controller.close();
        }
      });

      return new Response(readable, {
        headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
      });
    }

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
    return Response.json(
      { type: 'error', error: { type: 'api_error', message: error.message } },
      { status: 500, headers: CORS }
    );
  }
});