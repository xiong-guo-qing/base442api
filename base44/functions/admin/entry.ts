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
      const rawCaches = await base44.asServiceRole.entities.ResponseCache.list('-created_date', 500);
      const rawStats = await base44.asServiceRole.entities.UsageStats.list('-created_date', 500);
      const rawKeys = await base44.asServiceRole.entities.APIKey.list('-created_date', 200);
      const unwrap = (record) => ({ ...record, ...(record.data || {}) });
      const caches = (rawCaches || []).map(unwrap).sort((a, b) => (b.hits || 0) - (a.hits || 0));
      const stats = (rawStats || []).map(unwrap);
      const keys = (rawKeys || []).map(unwrap);

      const totalEntries = caches.length;
      const totalHits = caches.reduce((s, c) => s + (c.hits || 0), 0);
      const totalRequests = stats.length;
      const hitRate = totalRequests > 0 ? totalHits / (totalHits + totalRequests) : 0;
      const savedTokens = caches.reduce((s, c) => s + (c.total_tokens || 0) * (c.hits || 0), 0);

      // Hits by model
      const byModel = {};
      for (const c of caches) {
        if (!c.hits) continue;
        byModel[c.model || 'unknown'] = (byModel[c.model || 'unknown'] || 0) + c.hits;
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

    case 'cachetrends': {
      const { days = 7 } = body;
      const since = new Date(Date.now() - days * 24 * 3600 * 1000);
      const sinceIso = since.toISOString();

      const caches = await base44.asServiceRole.entities.ResponseCache.list('-created_date', 500);
      const stats = await base44.asServiceRole.entities.UsageStats.list('-created_date', 500);

      // Daily series: cache entries created per day, requests per day, hit-rate per day
      const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
      const days_arr = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 3600 * 1000);
        days_arr.push(dayKey(d));
      }

      const cacheByDay = {};
      const requestByDay = {};
      const hitsByDay = {};
      for (const d of days_arr) {
        cacheByDay[d] = 0;
        requestByDay[d] = 0;
        hitsByDay[d] = 0;
      }

      for (const c of caches) {
        if (!c.created_date) continue;
        if (new Date(c.created_date) < since) continue;
        const k = dayKey(c.created_date);
        if (k in cacheByDay) {
          cacheByDay[k]++;
          hitsByDay[k] += (c.hits || 0);
        }
      }
      for (const s of stats) {
        if (!s.created_date) continue;
        if (new Date(s.created_date) < since) continue;
        const k = dayKey(s.created_date);
        if (k in requestByDay) requestByDay[k]++;
      }

      const daily = days_arr.map(d => {
        const newCache = cacheByDay[d];
        const requests = requestByDay[d];
        const hits = hitsByDay[d];
        const total = hits + requests;
        const hitRate = total > 0 ? hits / total : 0;
        return {
          date: d.slice(5), // MM-DD
          newCache,
          requests,
          hits,
          hitRate: Number((hitRate * 100).toFixed(1)),
        };
      });

      // Storage by model: total content size (chars) per model
      const sizeByModel = {};
      const entriesByModel = {};
      for (const c of caches) {
        const m = c.model || 'unknown';
        const size = (c.content || '').length;
        sizeByModel[m] = (sizeByModel[m] || 0) + size;
        entriesByModel[m] = (entriesByModel[m] || 0) + 1;
      }
      const storage = Object.entries(sizeByModel).map(([model, bytes]) => ({
        model,
        bytes,
        kb: Number((bytes / 1024).toFixed(2)),
        entries: entriesByModel[model],
      })).sort((a, b) => b.bytes - a.bytes);

      return jsonRes({ daily, storage, sinceIso, days });
    }

    case 'cachedetail': {
      const { cacheId } = body;
      if (!cacheId) return errRes('cacheId is required');
      const all = await base44.asServiceRole.entities.ResponseCache.filter({ id: cacheId });
      const entry = all && all[0];
      if (!entry) return errRes('Cache entry not found', 404);
      const now = new Date();
      const expiresAt = entry.expires_at ? new Date(entry.expires_at) : null;
      const isExpired = expiresAt ? expiresAt <= now : false;
      const ttlSeconds = expiresAt ? Math.floor((expiresAt - now) / 1000) : null;
      const embeddingSummary = Array.isArray(entry.embedding) ? {
        dim: entry.embedding.length,
        nonZero: entry.embedding.filter(v => v !== 0).length,
        preview: entry.embedding.slice(0, 8),
      } : null;
      return jsonRes({
        entry: {
          id: entry.id,
          cache_key: entry.cache_key,
          model: entry.model,
          content: entry.content,
          prompt_tokens: entry.prompt_tokens || 0,
          completion_tokens: entry.completion_tokens || 0,
          total_tokens: entry.total_tokens || 0,
          hits: entry.hits || 0,
          is_single_turn: !!entry.is_single_turn,
          last_user_text: entry.last_user_text || null,
          embedding_summary: embeddingSummary,
          created_date: entry.created_date,
          updated_date: entry.updated_date,
          expires_at: entry.expires_at || null,
          is_expired: isExpired,
          ttl_seconds: ttlSeconds,
          content_length: (entry.content || '').length,
        }
      });
    }

    case 'warmuplist': {
      const items = await base44.asServiceRole.entities.CacheWarmupTemplate.list('-updated_date', 200);
      return jsonRes({ items });
    }

    case 'warmupcreate': {
      const { name, prompt, model, system, ttl_hours, enabled } = body;
      if (!name || !prompt) return errRes('name and prompt are required');
      const item = await base44.asServiceRole.entities.CacheWarmupTemplate.create({
        name,
        prompt,
        model: model || 'gpt_5_mini',
        system: system || '',
        ttl_hours: ttl_hours ?? 1,
        enabled: enabled !== false,
        total_runs: 0,
      });
      return jsonRes({ item });
    }

    case 'warmupupdate': {
      const { templateId, ...updates } = body;
      if (!templateId) return errRes('templateId required');
      delete updates.action; delete updates.adminToken;
      const item = await base44.asServiceRole.entities.CacheWarmupTemplate.update(templateId, updates);
      return jsonRes({ item });
    }

    case 'warmupdelete': {
      const { templateId } = body;
      if (!templateId) return errRes('templateId required');
      await base44.asServiceRole.entities.CacheWarmupTemplate.delete(templateId);
      return jsonRes({ success: true });
    }

    case 'warmuprun': {
      const { templateId } = body;
      const res = await fetch(`${new URL(req.url).origin}/functions/warmupCache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.get('Authorization') || '' },
        body: JSON.stringify(templateId ? { templateId } : {}),
      });
      const json = await res.json();
      return jsonRes(json);
    }

    case 'cachemodels': {
      const all = await base44.asServiceRole.entities.ResponseCache.list('-created_date', 500);
      const models = [...new Set(all.map(c => c.model).filter(Boolean))];
      return jsonRes({ models });
    }

    case 'filterclearcache': {
      const { model, createdAfter, createdBefore, minHits, maxHits, dryRun } = body;
      const all = await base44.asServiceRole.entities.ResponseCache.list('-created_date', 500);
      const matched = all.filter(c => {
        if (model && c.model !== model) return false;
        if (createdAfter && new Date(c.created_date) < new Date(createdAfter)) return false;
        if (createdBefore && new Date(c.created_date) > new Date(createdBefore)) return false;
        const hits = c.hits || 0;
        if (minHits !== undefined && minHits !== null && minHits !== '' && hits < Number(minHits)) return false;
        if (maxHits !== undefined && maxHits !== null && maxHits !== '' && hits > Number(maxHits)) return false;
        return true;
      });
      if (dryRun) {
        return jsonRes({ count: matched.length, preview: matched.slice(0, 5).map(c => ({ id: c.id, model: c.model, hits: c.hits || 0, created: c.created_date })) });
      }
      for (const c of matched) {
        await base44.asServiceRole.entities.ResponseCache.delete(c.id);
      }
      return jsonRes({ success: true, deleted: matched.length });
    }

    default:
      return errRes(`Unknown action: ${action}`);
  }
});