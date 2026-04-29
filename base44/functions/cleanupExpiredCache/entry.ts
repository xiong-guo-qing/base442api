import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const ranAtIso = new Date(startedAt).toISOString();
  let scanned = 0;
  let deleted = 0;
  let status = 'success';
  let errorMessage = null;

  try {
    const base44 = createClientFromRequest(req);
    const nowIso = new Date().toISOString();

    const BATCH = 500;
    const MAX_BATCHES = 20; // up to 10k records per run
    const CACHE_SIZE_THRESHOLD_BYTES = 5 * 1024 * 1024;
    const SMART_DELETE_LIMIT = 100;
    const SOON_EXPIRE_HOURS = 24;
    let smartDeleted = 0;
    let estimatedCacheBytes = 0;
    const cleanupReasons = ['expired'];

    for (let i = 0; i < MAX_BATCHES; i++) {
      const batch = await base44.asServiceRole.entities.ResponseCache.filter(
        { expires_at: { $lt: nowIso } },
        '-created_date',
        BATCH
      );
      if (!batch || batch.length === 0) break;
      scanned += batch.length;

      for (const c of batch) {
        try {
          await base44.asServiceRole.entities.ResponseCache.delete(c.id);
          deleted++;
        } catch (err) {
          status = 'partial';
          console.warn(`[cleanupExpiredCache] failed to delete ${c.id}: ${err.message}`);
        }
      }

      if (batch.length < BATCH) break;
    }

    const remainingCaches = await base44.asServiceRole.entities.ResponseCache.list('-updated_date', 5000);
    estimatedCacheBytes = (remainingCaches || []).reduce((sum, cache) => sum + (cache.content || '').length, 0);

    if (estimatedCacheBytes > CACHE_SIZE_THRESHOLD_BYTES) {
      cleanupReasons.push('low-hit-near-expiry');
      const soonExpireMs = SOON_EXPIRE_HOURS * 60 * 60 * 1000;
      const now = Date.now();
      const smartCandidates = (remainingCaches || [])
        .filter(cache => cache.expires_at && new Date(cache.expires_at).getTime() - now <= soonExpireMs)
        .sort((a, b) => {
          const hitDiff = (a.hits || 0) - (b.hits || 0);
          if (hitDiff !== 0) return hitDiff;
          return new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime();
        })
        .slice(0, SMART_DELETE_LIMIT);

      for (const c of smartCandidates) {
        try {
          await base44.asServiceRole.entities.ResponseCache.delete(c.id);
          smartDeleted++;
          deleted++;
        } catch (err) {
          status = 'partial';
          console.warn(`[cleanupExpiredCache] smart delete failed ${c.id}: ${err.message}`);
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(`[cleanupExpiredCache] scanned=${scanned} deleted=${deleted} smartDeleted=${smartDeleted} estimatedBytes=${estimatedCacheBytes} duration=${durationMs}ms status=${status}`);

    try {
      await base44.asServiceRole.entities.CacheCleanupLog.create({
        ran_at: ranAtIso,
        scanned,
        deleted,
        duration_ms: durationMs,
        status,
        cleanup_reason: cleanupReasons.join(','),
        estimated_cache_bytes: estimatedCacheBytes,
        smart_deleted: smartDeleted,
      });
    } catch (logErr) {
      console.error('[cleanupExpiredCache] failed to write log:', logErr.message);
    }

    return Response.json({ success: true, scanned, deleted, smart_deleted: smartDeleted, estimated_cache_bytes: estimatedCacheBytes, duration_ms: durationMs, status, ran_at: ranAtIso });
  } catch (error) {
    status = 'error';
    errorMessage = error.message;
    const durationMs = Date.now() - startedAt;
    console.error('[cleanupExpiredCache] error:', errorMessage);

    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.CacheCleanupLog.create({
        ran_at: ranAtIso, scanned, deleted, duration_ms: durationMs, status, error_message: errorMessage,
      });
    } catch (_) {}

    return Response.json({ success: false, error: errorMessage, scanned, deleted }, { status: 500 });
  }
});