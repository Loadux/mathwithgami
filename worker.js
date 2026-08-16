// Sync endpoint for Math with Gami.
//
// Everything except /api/sync/* falls through to the static assets, so the
// site behaves exactly as it did before this file existed.
//
// One KV record per synced group, keyed by a random groupId the devices
// generate at pairing. Nothing is written until a pair exists, so solo
// users never touch KV at all.
//
// TTL is 30 days, refreshed on every write. An active group never expires;
// an abandoned one deletes itself and we run no cleanup.

const TTL = 60 * 60 * 24 * 30;      // 30 days
const MAX_BYTES = 2 * 1024 * 1024;  // generous: heaviest realistic save is ~41 KB

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, If-Match"
};

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors, ...extra }
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // not a sync call -> serve the site
    if (!url.pathname.startsWith("/api/sync/")) {
      return env.ASSETS.fetch(request);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const groupId = url.pathname.slice("/api/sync/".length);
    // groupIds are client-generated; keep them sane so nobody uses this as free storage
    if (!/^g_[A-Za-z0-9_-]{16,64}$/.test(groupId)) {
      return json({ error: "bad group id" }, 400);
    }

    // ---- read ----------------------------------------------------------
    if (request.method === "GET") {
      const rec = await env.SYNC.get(groupId);
      if (rec === null) {
        // expired or never existed: the client treats this as "sync ended,
        // keep local data, clear the pairing"
        return json({ error: "expired" }, 404);
      }
      return new Response(rec, {
        headers: { "Content-Type": "application/json", ...cors }
      });
    }

    // ---- write ---------------------------------------------------------
    if (request.method === "PUT") {
      const body = await request.text();
      if (body.length > MAX_BYTES) return json({ error: "too large" }, 413);

      let incoming;
      try { incoming = JSON.parse(body); }
      catch { return json({ error: "not json" }, 400); }

      // Optimistic concurrency: the client sends the version it last read.
      // If the stored version moved on, someone else wrote first and the
      // client must re-read and resolve before overwriting.
      const existingRaw = await env.SYNC.get(groupId);
      if (existingRaw) {
        const existing = JSON.parse(existingRaw);
        const expected = request.headers.get("If-Match");
        if (expected !== null && String(existing.version) !== expected) {
          return json({ error: "conflict", current: existing }, 409);
        }
        incoming.version = (existing.version || 0) + 1;
      } else {
        incoming.version = 1;
      }

      incoming.lastModified = Date.now();
      // writing refreshes the 30 day window
      await env.SYNC.put(groupId, JSON.stringify(incoming), { expirationTtl: TTL });
      return json({ ok: true, version: incoming.version, lastModified: incoming.lastModified });
    }

    // ---- teardown ------------------------------------------------------
    // called when the last device unsyncs
    if (request.method === "DELETE") {
      await env.SYNC.delete(groupId);
      return json({ ok: true });
    }

    return json({ error: "method not allowed" }, 405);
  }
};
