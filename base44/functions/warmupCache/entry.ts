import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function estimateTokens(text) { return Math.ceil((text || '').length / 4); }

const EMBED_DIM = 256;
const STOPWORDS = new Set(['the','a','an','is','are','was','were','of','to','in','on','at','for','and','or','but','i','you','it','this','that']);
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

// Build the same cache key shape used by /v1/messages so warmup hits get reused.
async function buildCacheKey({ model, system, prompt }) {
  const messages = [{ role: 'user', content: prompt }];
  return await sha256(JSON.stringify({ model, system: system || null, messages }));
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  try {
    const base44 = createClientFromRequest(req);

    let body = {};
    try { body = await req.json(); } catch { /* allow empty for scheduled runs */ }
    const { templateId } = body;

    // Optional admin auth: if Authorization is provided we accept either an admin password
    // or a recognized bearer; otherwise we allow internal scheduled runs (no auth header).
    // For manual front-end calls we route via /functions/admin instead.

    const filter = templateId ? { id: templateId } : { enabled: true };
    const templates = await base44.asServiceRole.entities.CacheWarmupTemplate.filter(filter, '-updated_date', 100);

    const results = [];
    for (const tpl of templates) {
      const tplStart = Date.now();
      try {
        const model = tpl.model || 'gpt_5_mini';
        const cacheKey = await buildCacheKey({ model, system: tpl.system, prompt: tpl.prompt });

        // If a non-expired entry already exists, skip generation.
        const existing = await base44.asServiceRole.entities.ResponseCache.filter({ cache_key: cacheKey });
        const now = new Date();
        const fresh = existing.find(c => c.expires_at && new Date(c.expires_at) > now);
        if (fresh) {
          await base44.asServiceRole.entities.CacheWarmupTemplate.update(tpl.id, {
            last_run_at: new Date().toISOString(),
            last_run_status: 'skipped',
            last_error: null,
            total_runs: (tpl.total_runs || 0) + 1,
          });
          results.push({ id: tpl.id, name: tpl.name, status: 'skipped', reason: 'fresh cache exists', duration_ms: Date.now() - tplStart });
          continue;
        }

        // Generate
        const fullPrompt = tpl.system
          ? `SYSTEM: ${tpl.system}\n\nHUMAN: ${tpl.prompt}`
          : `HUMAN: ${tpl.prompt}`;
        const result = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt: fullPrompt, model });
        const content = typeof result === 'string' ? result : JSON.stringify(result);

        const promptTokens = estimateTokens(fullPrompt);
        const completionTokens = estimateTokens(content);
        const ttlMs = (tpl.ttl_hours || 1) * 3600 * 1000;
        const expiresAt = new Date(Date.now() + ttlMs).toISOString();

        // Replace any stale entries with the same key.
        for (const old of existing) {
          try { await base44.asServiceRole.entities.ResponseCache.delete(old.id); } catch (_) {}
        }

        await base44.asServiceRole.entities.ResponseCache.create({
          cache_key: cacheKey,
          model,
          content,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
          hits: 0,
          expires_at: expiresAt,
          embedding: embedText(tpl.prompt),
          last_user_text: tpl.prompt.slice(0, 500),
          is_single_turn: true,
        });

        await base44.asServiceRole.entities.CacheWarmupTemplate.update(tpl.id, {
          last_run_at: new Date().toISOString(),
          last_run_status: 'success',
          last_error: null,
          total_runs: (tpl.total_runs || 0) + 1,
        });

        results.push({ id: tpl.id, name: tpl.name, status: 'success', tokens: promptTokens + completionTokens, duration_ms: Date.now() - tplStart });
      } catch (err) {
        await base44.asServiceRole.entities.CacheWarmupTemplate.update(tpl.id, {
          last_run_at: new Date().toISOString(),
          last_run_status: 'error',
          last_error: err.message,
          total_runs: (tpl.total_runs || 0) + 1,
        });
        results.push({ id: tpl.id, name: tpl.name, status: 'error', error: err.message, duration_ms: Date.now() - tplStart });
      }
    }

    const totalDuration = Date.now() - startedAt;
    console.log(`[warmupCache] processed=${results.length} duration=${totalDuration}ms`);
    return Response.json({ success: true, processed: results.length, duration_ms: totalDuration, results });
  } catch (error) {
    console.error('[warmupCache] error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});