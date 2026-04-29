import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function errRes(message, status = 400) {
  return jsonRes({ error: { message, type: 'invalid_request_error' } }, status);
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const DEFAULT_PASS_HASH = null; // Will be computed on first use

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const base44 = createClientFromRequest(req);
  let body;
  try {
    body = await req.json();
  } catch {
    return errRes('Invalid JSON body');
  }

  const { action, adminToken } = body;

  // Get token from body or Authorization header
  let token = adminToken;
  if (!token) {
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    return errRes('Admin token required', 401);
  }

  // Verify admin password
  const configs = await base44.asServiceRole.entities.Config.filter({ type: 'admin_pass' });
  const adminConfig = configs[0];

  const defaultHash = await sha256('admin2024');

  if (adminConfig) {
    // Compare hash - token could be plaintext or already hashed
    const tokenHash = token.length === 64 ? token : await sha256(token);
    if (tokenHash !== adminConfig.value) {
      return errRes('Invalid admin password', 401);
    }
  } else {
    // First time - accept default password
    const tokenHash = token.length === 64 ? token : await sha256(token);
    if (tokenHash !== defaultHash && token !== 'admin2024') {
      return errRes('Invalid admin password', 401);
    }
    // Store default hash
    await base44.asServiceRole.entities.Config.create({
      type: 'admin_pass',
      value: defaultHash,
      updated_at: new Date().toISOString(),
    });
  }

  // Handle actions
  switch (action) {
    case 'list': {
      const keys = await base44.asServiceRole.entities.APIKey.list('-created_date', 100);
      return jsonRes({ keys });
    }

    case 'create': {
      const { key, name } = body;
      if (!key) return errRes('Key is required');
      // Check for duplicates
      const existing = await base44.asServiceRole.entities.APIKey.filter({ key });
      if (existing.length > 0) return errRes('Key already exists');
      const newKey = await base44.asServiceRole.entities.APIKey.create({
        key,
        name: name || '',
        enabled: true,
      });
      return jsonRes({ key: newKey });
    }

    case 'delete': {
      const { keyId } = body;
      if (!keyId) return errRes('keyId is required');
      await base44.asServiceRole.entities.APIKey.delete(keyId);
      return jsonRes({ success: true });
    }

    case 'toggle': {
      const { keyId: toggleId, enabled } = body;
      if (!toggleId) return errRes('keyId is required');
      await base44.asServiceRole.entities.APIKey.update(toggleId, { enabled });
      return jsonRes({ success: true });
    }

    case 'stats': {
      const stats = await base44.asServiceRole.entities.UsageStats.list('-created_date', 200);
      return jsonRes({ stats });
    }

    case 'changepass': {
      const { oldPassHash, newPassHash } = body;
      if (!oldPassHash || !newPassHash) return errRes('Both old and new password hashes required');
      
      const currentConfig = (await base44.asServiceRole.entities.Config.filter({ type: 'admin_pass' }))[0];
      const currentHash = currentConfig ? currentConfig.value : defaultHash;
      
      if (oldPassHash !== currentHash) {
        return errRes('Old password is incorrect', 401);
      }

      if (currentConfig) {
        await base44.asServiceRole.entities.Config.update(currentConfig.id, {
          value: newPassHash,
          updated_at: new Date().toISOString(),
        });
      } else {
        await base44.asServiceRole.entities.Config.create({
          type: 'admin_pass',
          value: newPassHash,
          updated_at: new Date().toISOString(),
        });
      }
      return jsonRes({ success: true });
    }

    case 'setupstream': {
      const { endpoint, apiKey: upApiKey, model, enabled } = body;
      const upConfigs = await base44.asServiceRole.entities.Config.filter({ type: 'upstream' });
      const upConfig = upConfigs[0];
      
      const data = {
        type: 'upstream',
        endpoint: endpoint || '',
        apiKey: upApiKey || '',
        model: model || '',
        enabled: enabled !== undefined ? enabled : true,
        updated_at: new Date().toISOString(),
      };

      if (upConfig) {
        await base44.asServiceRole.entities.Config.update(upConfig.id, data);
      } else {
        await base44.asServiceRole.entities.Config.create(data);
      }
      return jsonRes({ success: true });
    }

    case 'getupstream': {
      const upConfigs = await base44.asServiceRole.entities.Config.filter({ type: 'upstream' });
      const up = upConfigs[0] || { endpoint: '', apiKey: '', model: '', enabled: false };
      return jsonRes({ upstream: { endpoint: up.endpoint, apiKey: up.apiKey, model: up.model, enabled: up.enabled } });
    }

    case 'cachestats': {
      const caches = await base44.asServiceRole.entities.ResponseCache.list('-created_date', 500);
      const totalHits = caches.reduce((sum, c) => sum + (c.hits || 0), 0);
      const savedTokens = caches.reduce((sum, c) => sum + (c.total_tokens || 0) * (c.hits || 0), 0);
      return jsonRes({ count: caches.length, totalHits, savedTokens });
    }

    case 'cachedashboard': {
      // Aggregate data for the cache dashboard
      const caches = await base44.asServiceRole.entities.ResponseCache.list('-hits', 500);
      const stats = await base44.asServiceRole.entities.UsageStats.list('-created_date', 500);
      const keys = await base44.asServiceRole.entities.APIKey.list('-created_date', 200);

      const totalEntries = caches.length;
      const totalHits = caches.reduce((s, c) => s + (c.hits || 0), 0);
      const totalRequests = stats.length;
      const hitRate = totalRequests > 0 ? totalHits / (totalHits + totalRequests) : 0;
      const savedTokens = caches.reduce((s, c) => s + (c.total_tokens || 0) * (c.hits || 0), 0);

      // Hits by model
      const byModel = {};
      for (const c of caches) {
        if (!c.hits) continue;
        byModel[c.model] = (byModel[c.model] || 0) + c.hits;
      }
      const modelData = Object.entries(byModel).map(([model, hits]) => ({ model, hits }));

      // Top 10 hottest cache entries
      const top10 = caches.slice(0, 10).map(c => ({
        id: c.id,
        model: c.model,
        hits: c.hits || 0,
        tokens: c.total_tokens || 0,
        preview: (c.content || '').slice(0, 80),
        created: c.created_date,
      }));

      // Hits by API Key (proxy: count usage records per key, since cache hits aren't tracked per-key)
      const keyMap = Object.fromEntries(keys.map(k => [k.id, k.name || k.key.slice(0, 12) + '...']));
      const byKey = {};
      for (const s of stats) {
        const name = keyMap[s.api_key_id] || '未知';
        byKey[name] = (byKey[name] || 0) + 1;
      }
      const keyData = Object.entries(byKey).map(([name, requests]) => ({ name, requests })).sort((a, b) => b.requests - a.requests).slice(0, 10);

      return jsonRes({
        summary: { totalEntries, totalHits, totalRequests, hitRate, savedTokens },
        byModel: modelData,
        byKey: keyData,
        top10,
      });
    }

    case 'clearcache': {
      const allCaches = await base44.asServiceRole.entities.ResponseCache.list('-created_date', 500);
      for (const c of allCaches) {
        await base44.asServiceRole.entities.ResponseCache.delete(c.id);
      }
      return jsonRes({ success: true, deleted: allCaches.length });
    }

    default:
      return errRes(`Unknown action: ${action}`);
  }
});