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

    const durationMs = Date.now() - startedAt;
    console.log(`[cleanupExpiredCache] scanned=${scanned} deleted=${deleted} duration=${durationMs}ms status=${status}`);

    try {
      await base44.asServiceRole.entities.CacheCleanupLog.create({
        ran_at: ranAtIso, scanned, deleted, duration_ms: durationMs, status,
      });
    } catch (logErr) {
      console.error('[cleanupExpiredCache] failed to write log:', logErr.message);
    }

    return Response.json({ success: true, scanned, deleted, duration_ms: durationMs, status, ran_at: ranAtIso });
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