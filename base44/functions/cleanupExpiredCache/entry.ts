import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const nowIso = now.toISOString();

    let deleted = 0;
    let scanned = 0;
    const BATCH = 500;
    const MAX_BATCHES = 20; // safety cap: up to 10k records per run

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
        } catch (_) { /* ignore individual delete errors */ }
      }

      if (batch.length < BATCH) break;
    }

    console.log(`[cleanupExpiredCache] scanned=${scanned} deleted=${deleted} at=${nowIso}`);
    return Response.json({ success: true, scanned, deleted, at: nowIso });
  } catch (error) {
    console.error('[cleanupExpiredCache] error:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});