// functions/api/event.js — the anonymous play stats, as a Cloudflare Pages Function.
//
// This is the hosted twin of recordEvent in server.js: the same endpoint, the same strict validation,
// the same refusal to store anything it cannot check. The only difference is where a clean event lands —
// a line in data/events.jsonl locally, a key in KV here.
//
// What gets stored, and nothing more: a random player ID made by the browser, the morning number, and
// for a finished morning or challenge the role, career level, rating, score and seconds of deep work.
// No names, no IP addresses, no browser details. A challenge link never reaches here at all: it lives in
// the URL fragment, which browsers do not send.
//
// Setting it up (Cloudflare dashboard → your Pages project):
//   1. Workers & Pages → KV → Create a namespace called  nine-to-nine-stats
//   2. Your Pages project → Settings → Functions → KV namespace bindings → add
//        Variable name: STATS      KV namespace: nine-to-nine-stats
//   3. Settings → Environment variables → add  STATS_TOKEN  (any long random string, kept secret).
//      It is what lets `npm run stats` read the events back; without it nothing can.
//
// The validation constants are duplicated from content.js and core.js because a Worker cannot load the
// game's UMD modules. test/stats-endpoint.test.js feeds the same payloads to this and to server.js and
// fails if the two ever disagree, so the copy cannot drift without someone noticing.

const ROLES = ['developer', 'tester', 'analyst', 'support', 'manager'];
const LEVELS = ['junior', 'senior', 'lead'];
const RATINGS = ['pip', 'missed', 'dropped', 'gold', 'silver', 'bronze'];
const DURATION = 60;                                   // TUNING.DURATION
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const FIRST_MORNING = Date.UTC(2026, 8, 11);           // daily.js

const morningNumber = (now) => Math.max(1, Math.floor((now + IST_OFFSET_MS - FIRST_MORNING) / DAY_MS) + 1);

const MAX_BODY_BYTES = 1024;

// Returns the event to store, or null. Exported so the tests can hold it against server.js.
export function cleanEvent(body, now) {
  let e;
  try { e = JSON.parse(body); } catch (err) { return null; }
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  if (typeof e.player !== 'string' || !/^[0-9a-f]{16}$/.test(e.player)) return null;
  const today = morningNumber(now == null ? Date.now() : now);
  if (!Number.isInteger(e.day) || e.day < 1 || e.day > today + 1) return null; // +1 allows for clock skew
  const event = { ts: new Date(now == null ? Date.now() : now).toISOString(), player: e.player, kind: e.kind, day: e.day };

  // Openings, and the two halves of the challenge loop: a link made, a link opened.
  if (e.kind === 'visit' || e.kind === 'invite' || e.kind === 'accept') return event;
  if (e.kind !== 'daily' && e.kind !== 'challenge') return null;
  if (ROLES.indexOf(e.role) === -1 || RATINGS.indexOf(e.rating) === -1) return null;
  if (e.level !== undefined && LEVELS.indexOf(e.level) === -1) return null; // optional: older pages omit it
  if (!Number.isInteger(e.score) || e.score < 0 || e.score > 100000) return null;
  if (typeof e.deepWork !== 'number' || !(e.deepWork >= 0 && e.deepWork <= DURATION)) return null;
  if (e.kind === 'challenge') {
    if (typeof e.beat !== 'boolean') return null; // did they beat the score in the link?
    event.beat = e.beat;
  }
  return Object.assign(event, {
    role: e.role,
    level: e.level || 'junior',
    rating: e.rating,
    score: e.score,
    deepWork: Math.round(e.deepWork * 10) / 10
  });
}

const text = (status, body) => new Response(body, {
  status,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
});

export async function onRequestPost({ request, env }) {
  // Requiring a JSON content type means a page on another site cannot post here: the browser would need
  // a CORS preflight first, and nothing here ever approves one.
  if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) return text(415, 'Expected JSON');

  const body = await request.text();
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) return text(413, 'Too large');

  const event = cleanEvent(body);
  if (!event) return text(400, 'Invalid event');
  if (!env.STATS) return text(503, 'No stats store bound');

  // One key per event, so two players finishing at the same moment cannot overwrite each other the way
  // a read-modify-write on a shared key would. The key sorts by morning and then by time.
  const key = `ev:${String(event.day).padStart(6, '0')}:${event.ts}:${crypto.randomUUID().slice(0, 8)}`;
  await env.STATS.put(key, JSON.stringify(event));

  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

// Only POST is exported on purpose: Pages answers anything else with a 405 by itself, and exporting a
// catch-all onRequest alongside a method handler makes which one runs ambiguous.
