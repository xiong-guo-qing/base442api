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

function buildPrompt(system, messages) {
  const parts = [];
  if (system) parts.push(`SYSTEM: ${system}`);
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'ASSISTANT' : 'HUMAN';
    const content = typeof m.content === 'string' ? m.content :
      Array.isArray(m.content) ? m.content.map(c => c.type === 'text' ? c.text : '').join('\n') : String(m.content || '');
    parts.push(`${role}: ${content}`);
  }
  return parts.join('\n\n');
}

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

    // Detect real function calling tools — forward to upstream if present
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
      return Response.json({ type: 'error', error: { type: 'not_supported_error', message: 'Tool use requires an upstream API to be configured' } }, { status: 501, headers: CORS });
    }

    const prompt = buildPrompt(system, messages);

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt, model: internalModel });
    const content = typeof result === 'string' ? result : JSON.stringify(result);

    const inputTokens = estimateTokens(prompt);
    const outputTokens = estimateTokens(content);

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