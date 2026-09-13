// The hosted stats endpoint validates the same things server.js does, but it cannot share the code: a
// Cloudflare Worker has no require() and cannot load the game's UMD modules, so its constants are copied.
// A copy that drifts is the whole risk, and it would drift silently — the local server would keep
// accepting an event the hosted one rejected, or worse the other way round.
//
// So the two are held against each other here: the same payloads through both, and the same answer
// required from both, every time.
const test = require('node:test');
const assert = require('node:assert');
const Core = require('../core');
const Content = require('../content');
const Daily = require('../daily');
const local = require('../server');

let hosted;
test.before(async () => { hosted = await import('../functions/api/event.js'); });

const player = '0123456789abcdef';
const today = Daily.morningNumber(Date.now());

// Every kind of event the game sends, and a spread of ways they can be wrong.
const PAYLOADS = [
  { player, day: today, kind: 'visit' },
  { player, day: today, kind: 'invite' },
  { player, day: today, kind: 'accept' },
  { player, day: today, kind: 'daily', role: 'developer', level: 'junior', rating: 'gold', score: 1800, deepWork: 31.4 },
  { player, day: today, kind: 'daily', role: 'manager', level: 'lead', rating: 'dropped', score: 900, deepWork: 0 },
  { player, day: today, kind: 'challenge', role: 'tester', level: 'senior', rating: 'silver', score: 1200, deepWork: 20, beat: true },
  { player, day: today, kind: 'challenge', role: 'tester', level: 'senior', rating: 'silver', score: 1200, deepWork: 20 }, // no beat
  { player, day: today, kind: 'daily', role: 'developer', rating: 'gold', score: 1800, deepWork: 31.4 },                   // level omitted
  { player, day: today, kind: 'rematch' },
  { player, day: today, kind: 'daily', role: 'ceo', level: 'junior', rating: 'gold', score: 10, deepWork: 1 },
  { player, day: today, kind: 'daily', role: 'developer', level: 'intern', rating: 'gold', score: 10, deepWork: 1 },
  { player, day: today, kind: 'daily', role: 'developer', level: 'junior', rating: 'legendary', score: 10, deepWork: 1 },
  { player, day: today, kind: 'daily', role: 'developer', level: 'junior', rating: 'gold', score: -1, deepWork: 1 },
  { player, day: today, kind: 'daily', role: 'developer', level: 'junior', rating: 'gold', score: 1.5, deepWork: 1 },
  { player, day: today, kind: 'daily', role: 'developer', level: 'junior', rating: 'gold', score: 10, deepWork: 9999 },
  { player, day: today + 5, kind: 'visit' },
  { player, day: 0, kind: 'visit' },
  { player, day: today, kind: 'visit', extra: 'should be dropped' },
  { player: 'NOTHEX', day: today, kind: 'visit' },
  { player: '0123', day: today, kind: 'visit' },
  { day: today, kind: 'visit' }
];

const RAW = ['', 'null', '[]', '"a string"', '{', '{"player":"0123456789abcdef"}'];

test('the hosted endpoint accepts and rejects exactly what the local server does', () => {
  for (const body of PAYLOADS.map((p) => JSON.stringify(p)).concat(RAW)) {
    const a = local.cleanEvent(body);
    const b = hosted.cleanEvent(body);
    assert.strictEqual(!!b, !!a, `they disagree on whether to store: ${body}`);
    if (!a) continue;
    // Timestamps are taken independently, so compare everything else.
    const strip = (e) => Object.assign({}, e, { ts: undefined });
    assert.deepStrictEqual(strip(b), strip(a), `they store different things for: ${body}`);
  }
});

test('the copied constants still match the game', async () => {
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'functions', 'api', 'event.js'), 'utf8');
  const listIn = (name) => {
    const found = source.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
    assert.ok(found, `the endpoint no longer declares ${name}`);
    return found[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  };
  assert.deepStrictEqual(listIn('ROLES').sort(), Content.ROLE_ORDER.slice().sort());
  assert.deepStrictEqual(listIn('LEVELS').sort(), Content.LEVEL_ORDER.slice().sort());
  assert.deepStrictEqual(listIn('RATINGS').sort(), Object.keys(Core.RATINGS).sort());

  const duration = source.match(/const DURATION = ([0-9.]+)/);
  assert.ok(duration, 'the endpoint no longer declares DURATION');
  assert.strictEqual(Number(duration[1]), Core.TUNING.DURATION);

  const first = source.match(/const FIRST_MORNING = Date\.UTC\((\d+), (\d+), (\d+)\)/);
  assert.ok(first, 'the endpoint no longer declares FIRST_MORNING');
  assert.strictEqual(Date.UTC(+first[1], +first[2], +first[3]), Daily.FIRST_MORNING);
});

test('it numbers mornings the same way the game does', async () => {
  // A day either side of the rollover, and a long way out, all through the endpoint's own arithmetic.
  for (const at of [Daily.FIRST_MORNING, Daily.FIRST_MORNING + Daily.DAY_MS * 30, Date.now()]) {
    for (const nudge of [-1000, 0, 1000]) {
      const when = at + nudge;
      const body = JSON.stringify({ player, day: Daily.morningNumber(when), kind: 'visit' });
      assert.ok(hosted.cleanEvent(body, when), `the endpoint rejected its own morning number at ${new Date(when).toISOString()}`);
    }
  }
});

test('it stores nothing it was not asked to store', () => {
  const body = JSON.stringify({ player, day: today, kind: 'daily', role: 'developer', level: 'junior', rating: 'gold', score: 10, deepWork: 1, ip: '1.2.3.4', name: 'Prateek', code: 'secret' });
  const stored = hosted.cleanEvent(body);
  assert.deepStrictEqual(Object.keys(stored).sort(), ['day', 'deepWork', 'kind', 'level', 'player', 'rating', 'role', 'score', 'ts'],
    'the endpoint kept a field nobody agreed to send');
});

// Cloudflare hosts this two ways and the dashboard steers you to whichever it prefers this month, so the
// repo supports both: Pages reads functions/api/*.js by convention, Workers reads wrangler.toml and runs
// worker.js. What must never happen is the two growing separate copies of the endpoint.
test('the Workers entry routes to the very same handlers, and serves everything else from the assets', async () => {
  const worker = await import('../worker.js');
  const asked = [];
  const env = { ASSETS: { fetch: (req) => { asked.push(new URL(req.url).pathname); return new Response('asset'); } } };
  const call = (path, method) => worker.default.fetch(new Request(`https://example.test${path}`, { method }), env, {});

  await call('/', 'GET');
  await call('/game.js', 'GET');
  assert.deepStrictEqual(asked, ['/', '/game.js'], 'the game itself has to come from the static assets');

  assert.strictEqual((await call('/api/event', 'GET')).status, 405, 'the write endpoint is POST only');
  assert.strictEqual((await call('/api/events', 'POST')).status, 405, 'the read endpoint is GET only');

  // 415 rather than 404 proves the shared handler ran: that is its answer to a post with no JSON type.
  assert.strictEqual((await call('/api/event', 'POST')).status, 415, 'POST /api/event should reach the real handler');
  assert.strictEqual(asked.length, 2, 'and no api request should have fallen through to the assets');
});

test('both hosting shapes exist, and point at the same code', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..');
  assert.ok(fs.existsSync(path.join(root, 'functions', 'api', 'event.js')), 'the Pages convention');
  assert.ok(fs.existsSync(path.join(root, 'worker.js')), 'the Workers entry');
  const wrangler = fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8');
  assert.match(wrangler, /main = "worker\.js"/);
  assert.match(wrangler, /directory = "\.\/dist"/, 'Workers must serve what npm run build assembles');
  // A KV binding added in the dashboard is wiped by the next deploy, so this file has to declare it;
  // without it every write answers 503 and the stats quietly stop being collected.
  assert.match(wrangler, /binding = "STATS"/, 'the config must bind a KV namespace for the events to land in');
  assert.match(wrangler, /^id = "[0-9a-f]{32}"$/m, 'and name which namespace');
  const entry = fs.readFileSync(path.join(root, 'worker.js'), 'utf8');
  assert.match(entry, /from '\.\/functions\/api\/event\.js'/, 'the worker must reuse the Pages handler, not copy it');
  assert.match(entry, /from '\.\/functions\/api\/events\.js'/);
});
