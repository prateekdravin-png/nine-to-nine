// functions/api/events.js — reading the play stats back out, for `npm run stats`.
//
// The events are anonymous, but they are still the only record of what the playtest did, and an open
// endpoint is an endpoint that gets scraped and spammed. It is behind a token: set STATS_TOKEN in the
// Pages project's environment variables and pass the same value here. With no token configured the
// endpoint refuses everything rather than defaulting to open.
//
// Returns JSON Lines — one event per line, the same shape as data/events.jsonl locally, so stats.js can
// read either without caring which it got. KV lists a page at a time, so a big log comes back over
// several requests: follow the `cursor` in the response until it is null.

const text = (status, body) => new Response(body, {
  status,
  headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
});

// Compared without short-circuiting, so the time it takes says nothing about how much of the token was
// right. Overkill for anonymous play counts, and the correct habit anyway.
function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function onRequestGet({ request, env }) {
  if (!env.STATS) return text(503, 'No stats store bound');
  if (!env.STATS_TOKEN) return text(503, 'No STATS_TOKEN set, so nothing can read this');

  const url = new URL(request.url);
  const given = url.searchParams.get('token') || (request.headers.get('authorization') || '').replace(/^Bearer /i, '');
  if (!sameToken(given, env.STATS_TOKEN)) return text(401, 'Not for you');

  const listed = await env.STATS.list({ prefix: 'ev:', limit: 1000, cursor: url.searchParams.get('cursor') || undefined });
  const values = await Promise.all(listed.keys.map((k) => env.STATS.get(k.name)));

  return new Response(JSON.stringify({
    events: values.filter(Boolean).map((v) => JSON.parse(v)),
    cursor: listed.list_complete ? null : listed.cursor
  }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
