import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Base44 internal models and their external names
const MODELS = [
  { id: 'gpt-5.5', internal: 'gpt_5_5', owned_by: 'openai' },
  { id: 'gpt-5.4', internal: 'gpt_5_4', owned_by: 'openai' },
  { id: 'gpt-5-mini', internal: 'gpt_5_mini', owned_by: 'openai' },
  { id: 'claude-sonnet-4.6', internal: 'claude_sonnet_4_6', owned_by: 'anthropic' },
  { id: 'claude-opus-4.6', internal: 'claude_opus_4_6', owned_by: 'anthropic' },
  { id: 'claude-opus-4.7', internal: 'claude_opus_4_7', owned_by: 'anthropic' },
  { id: 'gemini-3-flash', internal: 'gemini_3_flash', owned_by: 'google' },
  { id: 'gemini-3.1-pro', internal: 'gemini_3_1_pro', owned_by: 'google' },
  { id: 'automatic', internal: 'automatic', owned_by: 'base44' },
];

// Compatibility aliases
const ALIASES = [
  { id: 'gpt-4o', internal: 'gpt_5_mini', owned_by: 'openai' },
  { id: 'gpt-4o-mini', internal: 'gpt_5_mini', owned_by: 'openai' },
  { id: 'gpt-4', internal: 'gpt_5_4', owned_by: 'openai' },
  { id: 'gpt-5', internal: 'gpt_5_5', owned_by: 'openai' },
  { id: 'o3', internal: 'gpt_5_5', owned_by: 'openai' },
  { id: 'o3-mini', internal: 'gpt_5_mini', owned_by: 'openai' },
  { id: 'claude-3.5-sonnet', internal: 'claude_sonnet_4_6', owned_by: 'anthropic' },
  { id: 'claude-3-opus', internal: 'claude_opus_4_6', owned_by: 'anthropic' },
  { id: 'gemini-pro', internal: 'gemini_3_1_pro', owned_by: 'google' },
  { id: 'gemini-flash', internal: 'gemini_3_flash', owned_by: 'google' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const base44 = createClientFromRequest(req);

  // Validate API Key
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: { message: 'Missing API key', type: 'invalid_request_error' } }), {
      status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = authHeader.slice(7);
  const keys = await base44.asServiceRole.entities.APIKey.filter({ key: apiKey, enabled: true });
  if (keys.length === 0) {
    return new Response(JSON.stringify({ error: { message: 'Invalid API key', type: 'invalid_request_error' } }), {
      status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const allModels = [...MODELS, ...ALIASES];
  const data = allModels.map(m => ({
    id: m.id,
    object: 'model',
    created: 1700000000,
    owned_by: m.owned_by,
  }));

  return new Response(JSON.stringify({ object: 'list', data }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});