// Run with: npm test
// The daily morning: everyone gets the same morning however they play it, the shared result can't
// spoil it, and the numbers used to judge "do people come back?" are counted correctly.
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core');
const Daily = require('../daily');
const { ROLE_ORDER } = require('../content');
const { summarise } = require('../stats');
const { cleanEvent } = require('../server');

const at = (iso) => Date.parse(iso);

test('mornings turn over at midnight India time, the same moment for everyone', () => {
  assert.equal(Daily.morningNumber(at('2026-09-11T00:00:00+05:30')), 1);
  assert.equal(Daily.morningNumber(at('2026-09-11T23:59:59+05:30')), 1);
  assert.equal(Daily.morningNumber(at('2026-09-12T00:00:00+05:30')), 2);
  // 1 PM in New York on 11 Sep is 10:30 PM in India: still Morning #1. By 3 PM it's Morning #2.
  assert.equal(Daily.morningNumber(at('2026-09-11T13:00:00-04:00')), 1);
  assert.equal(Daily.morningNumber(at('2026-09-11T15:00:00-04:00')), 2);
  assert.equal(Daily.morningDate(2), '2026-09-12');
  assert.equal(Daily.msUntilNextMorning(at('2026-09-11T23:30:00+05:30')), 30 * 60 * 1000);
  assert.equal(Daily.countdown(30 * 60 * 1000), '30m');
  assert.equal(Daily.countdown((7 * 60 + 5) * 60 * 1000), '7h 05m');
});

test('each morning has its own seed, and a morning always has the same one', () => {
  assert.equal(Daily.seedFor(7), Daily.seedFor(7));
  assert.equal(new Set(Array.from({ length: 365 }, (_, i) => Daily.seedFor(i + 1))).size, 365);
});

// Plays a morning in one of three styles and records every message that arrives.
function play(seed, style) {
  const s = Core.createGame({ seed });
  const got = new Map();
  let blocked = 0, fullInbox = false;
  while (!s.over) {
    if (style === 'headphones' && s.t > 5) Core.useHeadphones(s);
    for (const ev of Core.step(s, 0.05, { holding: true })) {
      if (ev.type === 'blocked') blocked++;
      // Follow-ups exist because of how someone played, so only the scheduled arrivals are compared.
      if (ev.type === 'spawn' && !ev.card.followUp) got.set(ev.card.spawnedAt.toFixed(2), { type: ev.card.type, text: ev.card.text });
    }
    if (s.cards.length === Core.TUNING.MAX_CARDS) fullInbox = true;
    if (style !== 'hoard') for (const c of s.cards.slice()) Core.act(s, c.id, style === 'headphones' ? 'ignore' : 'respond');
  }
  return { s, got, blocked, fullInbox };
}

test('a daily morning is the same for everyone, however they play it', () => {
  let compared = 0, blocked = 0, fullInbox = 0;
  for (let n = 1; n <= 10; n++) {
    const seed = Daily.seedFor(n);
    // Answer everything; use headphones early and ignore everything; answer nothing so the inbox fills.
    const runs = ['respond', 'headphones', 'hoard'].map((style) => play(seed, style));
    const first = new Map();
    for (const run of runs) {
      for (const [time, msg] of run.got) {
        if (first.has(time)) { assert.deepEqual(msg, first.get(time), `Morning #${n}: message at ${time}s differs between players`); compared++; }
        else first.set(time, msg);
      }
      blocked += run.blocked;
      if (run.fullInbox) fullInbox++;
    }
  }
  // The run that answers nothing ends early on a PIP — earlier still now that missed urgent messages are
  // escalated — so it overlaps the others for less of the morning.
  assert.ok(compared > 110, `should compare plenty of arrivals (${compared})`);
  // Prove the risky cases really happened: these are what used to shift every later message.
  assert.ok(blocked > 0 && fullInbox > 0, `headphones blocked ${blocked}, inbox filled up in ${fullInbox} runs`);
});

test('on the same morning every role gets the same rhythm; only the words change', () => {
  const seed = Daily.seedFor(12);
  const rhythm = (role) => Core.createGame({ seed, role }).schedule.map((a) => [a.at, a.type, a.life]);
  for (const role of ROLE_ORDER) assert.deepEqual(rhythm(role), rhythm('developer'), role);
});

test('decisions are recorded as verdicts only, so a shared grid cannot spoil the traps', () => {
  const s = Core.createGame({ seed: 1 });
  s.schedule = [];
  const decide = (type, action) => { Core.act(s, Core.spawnCard(s, type, 0).id, action); s.busyUntil = 0; };
  decide('urgent', 'respond');
  decide('trap', 'respond');
  decide('trivial', 'respond');
  decide('urgent', 'ignore');
  decide('trap', 'ignore');
  decide('trivial', 'ignore');
  Core.spawnCard(s, 'urgent', 0, 1);
  while (s.cards.length) Core.step(s, 0.05, { holding: true }); // left to expire
  assert.deepEqual(s.stats.decisions.map((d) => d.outcome), ['good', 'bad', 'meh', 'bad', 'good', 'good', 'bad']);
  for (const d of Core.summary(s).stats.decisions) assert.deepEqual(Object.keys(d).sort(), ['at', 'outcome']);
});

const decisions = [
  { at: 25, outcome: 'bad' }, { at: 5, outcome: 'good' }, { at: 45, outcome: 'meh' },
  { at: 12, outcome: 'good' }, { at: 50, outcome: 'good' }
];

test('the share grid has one square per message, in arrival order, a row per in-game hour', () => {
  assert.equal(Daily.grid(decisions, 60), '🟩🟩\n🟥\n🟨🟩');
  assert.equal(Daily.grid([{ at: 50, outcome: 'good' }], 60), '🟩', 'empty hours are left out');
});

test('the shared result tells the story of the morning without spoilers', () => {
  const base = { morning: 4, who: '🧪 Senior Tester', rating: { emoji: '🥇', title: 'Signed off & respected' }, score: 1840, decisions, duration: 60, deepWork: 31.4 };
  assert.equal(
    Daily.shareText(Object.assign({}, base, { streak: 3, url: 'http://example.test/' })),
    '9 to 9 · Morning #4 · 🧪 Senior Tester\n🥇 Signed off & respected · 1840\n🟩🟩\n🟥\n🟨🟩\n⚡ 31s deep work · 🔥 3-day streak\nhttp://example.test/'
  );
  assert.equal(
    Daily.shareText(Object.assign({}, base, { streak: 1, persona: { emoji: '🛡️', name: 'The Human Firewall', because: '6 traps dodged, none taken' } })),
    '9 to 9 · Morning #4 · 🧪 Senior Tester\n🥇 Signed off & respected · 1840\n🛡️ The Human Firewall\n🟩🟩\n🟥\n🟨🟩\n⚡ 31s deep work',
    'the personality is shared by name only; its reason would hint at the day\'s messages'
  );
  const plain = Daily.shareText(Object.assign({}, base, { streak: 1 }));
  assert.doesNotMatch(plain, /streak/, 'a one-day streak is not worth mentioning');
  assert.doesNotMatch(plain, /🚨|🪤|💬|urgent|trap/i, 'nothing may say what a message was');
});

test('streaks count consecutive mornings, and stay alive until today is over', () => {
  assert.equal(Daily.streak([1, 2, 3], 3), 3);
  assert.equal(Daily.streak([1, 2, 3], 4), 3, "today isn't played yet");
  assert.equal(Daily.streak([1, 2, 3], 5), 0, 'yesterday was missed');
  assert.equal(Daily.streak([1, 3, 4], 4), 2);
  assert.equal(Daily.streak([], 1), 0);
});

test('stats: who came back the next morning is counted per morning and per player', () => {
  const ev = (player, day, kind, role) => ({ player, day, kind: kind || 'visit', role });
  const events = [
    ev('a', 1), ev('a', 1, 'daily', 'tester'), ev('a', 2), ev('a', 2, 'daily', 'tester'), ev('a', 2, 'daily', 'tester'),
    ev('b', 1), ev('b', 3),
    ev('c', 2), ev('c', 2, 'daily', 'developer'), ev('c', 3),
    ev('d', 3)
  ];
  const r = summarise(events, 3);
  assert.equal(r.players, 4);
  assert.deepEqual(r.days.map((d) => [d.day, d.players, d.finished, d.cameBack]), [[1, 2, 1, 1], [2, 2, 2, 1], [3, 3, 0, null]]);
  assert.deepEqual(r.nextDay, { eligible: 3, returned: 2 }, 'a and c came back the morning after their first; b skipped a day; d only started today');
  assert.deepEqual(r.daysPlayed, { 1: 1, 2: 3, '3+': 0 });
  assert.deepEqual(r.roles, { tester: 2, developer: 1 }, 'a duplicate finish is counted once');
});

test('server: only well-formed, anonymous events are recorded', () => {
  const today = Daily.morningNumber(Date.now());
  const player = '0123456789abcdef';
  const ok = cleanEvent(JSON.stringify({ player, kind: 'daily', day: today, role: 'tester', rating: 'gold', score: 1840, deepWork: 31.44, name: 'Priya' }));
  assert.deepEqual(Object.keys(ok).sort(), ['day', 'deepWork', 'kind', 'level', 'player', 'rating', 'role', 'score', 'ts'], 'unknown fields are dropped');
  assert.equal(ok.deepWork, 31.4);
  assert.ok(cleanEvent(JSON.stringify({ player, kind: 'visit', day: today })));

  const daily = { player, kind: 'daily', day: today, role: 'tester', rating: 'gold', score: 1, deepWork: 1 };
  const bad = [
    'not json', '[]', 'null', '"text"',
    { player: 'Priya', kind: 'visit', day: today },
    { player, kind: 'visit', day: today + 5 },
    { player, kind: 'visit', day: 0 },
    { player, kind: 'anything', day: today },
    Object.assign({}, daily, { role: '__proto__' }),
    Object.assign({}, daily, { rating: 'toString' }),
    Object.assign({}, daily, { score: -1 }),
    Object.assign({}, daily, { score: 1.5 }),
    Object.assign({}, daily, { deepWork: 999 }),
    Object.assign({}, daily, { deepWork: '10' }),
    Object.assign({}, daily, { level: 'intern' }),
    Object.assign({}, daily, { level: 'constructor' })
  ];
  assert.equal(cleanEvent(JSON.stringify(Object.assign({}, daily, { level: 'lead' }))).level, 'lead');
  assert.equal(cleanEvent(JSON.stringify(daily)).level, 'junior', 'pages from before career levels were juniors');
  for (const b of bad) {
    const body = typeof b === 'string' ? b : JSON.stringify(b);
    assert.equal(cleanEvent(body), null, `should reject ${body}`);
  }
});
