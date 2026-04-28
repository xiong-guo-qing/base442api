import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const base44 = createClientFromRequest(req);

  // Validate API Key
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return Response.json(
      { error: { message: 'Missing API key', type: 'invalid_request_error' } },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  const apiKey = authHeader.slice(7);
  const keys = await base44.asServiceRole.entities.APIKey.filter({ key: apiKey, enabled: true });
  if (keys.length === 0) {
    return Response.json(
      { error: { message: 'Invalid API key', type: 'invalid_request_error' } },
      { status: 401, headers: CORS_HEADERS }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: { message: 'Invalid JSON body', type: 'invalid_request_error' } },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { prompt, n = 1 } = body;
  if (!prompt) {
    return Response.json(
      { error: { message: 'Prompt is required', type: 'invalid_request_error' } },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const count = Math.min(Math.max(1, n), 4);
  const results = [];

  for (let i = 0; i < count; i++) {
    try {
      const result = await base44.asServiceRole.integrations.Core.GenerateImage({ prompt });
      results.push({ url: result.url });
    } catch (err) {
      return Response.json(
        { error: { message: `Image generation failed: ${err.message}`, type: 'server_error' } },
        { status: 502, headers: CORS_HEADERS }
      );
    }
  }

  return Response.json({
    created: Math.floor(Date.now() / 1000),
    data: results,
  }, { headers: CORS_HEADERS });
});