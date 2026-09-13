// Run with: npm test
// The rules of the Deep Work session. Two kinds of test live here: ordinary rule checks, and design
// checks — "the decisions actually matter", "a first-time player has time to read", "the countdown
// can't give away the answer", "the tells are consistent" — which fail if a tuning or content change
// quietly breaks what makes it a game. Content checks run for every role, so adding a role or a
// message can't slip past them.
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core');
const Content = require('../content');
const { evaluate, evaluateHuman, playBot } = require('../bots');
const T = Core.TUNING;
const { ROLES, ROLE_ORDER } = Content;

// A session with no random notifications, so a test controls exactly what arrives — and an ordinary
// morning, so a rule check measures the rule and not which kind of day the seed happened to pick.
// A test about a particular day type passes { day }.
function quiet(opts) {
  const s = Core.createGame(Object.assign({ seed: 1, day: 'normal' }, opts));
  s.schedule = [];
  s.events = []; // no boss surprises either
  return s;
}
function advance(s, seconds, holding) {
  const events = [];
  const end = s.t + seconds;
  while (!s.over && s.t < end - 1e-9) events.push(...Core.step(s, Math.min(0.05, end - s.t), { holding: holding !== false }));
  return events;
}

test('holding the work button builds flow and progress; letting go does neither', () => {
  const s = quiet();
  advance(s, 2, true);
  assert.ok(s.flow > 0 && s.progress > 0);
  const progress = s.progress, flow = s.flow;
  advance(s, 1, false);
  assert.equal(s.progress, progress);
  assert.ok(s.flow < flow);
});

test('DEEP WORK works exactly 3x faster than warming up', () => {
  const deep = quiet(); deep.flow = 100;
  const cold = quiet(); cold.flow = 0;
  Core.step(deep, 0.01, { holding: true });
  Core.step(cold, 0.01, { holding: true });
  assert.ok(Math.abs(deep.progress / cold.progress - 3) < 1e-9);
});

test('too many unread notifications halve how fast focus builds', () => {
  const calm = quiet(); calm.flow = 10;
  const crowded = quiet(); crowded.flow = 10;
  for (let i = 0; i < T.DISTRACTED_AT; i++) Core.spawnCard(crowded, 'trivial', i);
  Core.step(calm, 0.1, { holding: true });
  Core.step(crowded, 0.1, { holding: true });
  assert.ok(Math.abs((calm.flow - 10) - 2 * (crowded.flow - 10)) < 1e-9);
});

test('ignoring something urgent costs reputation; ignoring a trap or small talk does not', () => {
  const s = quiet();
  const urgent = Core.spawnCard(s, 'urgent', 0);
  const trap = Core.spawnCard(s, 'trap', 0);
  const chat = Core.spawnCard(s, 'trivial', 0);
  const rep = s.rep;
  Core.act(s, trap.id, 'ignore');
  Core.act(s, chat.id, 'ignore');
  assert.equal(s.rep, rep);
  Core.act(s, urgent.id, 'ignore');
  assert.equal(s.rep, rep + T.IGNORE.urgent.rep);
  assert.deepEqual([s.stats.trapsDodged, s.stats.trivialIgnored, s.stats.urgentMissed], [1, 1, 1]);
});

test('taking the bait on a trap wipes your focus and stalls you the longest', () => {
  const s = quiet();
  advance(s, 4, true);
  assert.ok(s.flow > 50);
  const trap = Core.spawnCard(s, 'trap', 0);
  Core.act(s, trap.id, 'respond');
  assert.equal(s.flow, 0);
  assert.ok(Math.abs((s.busyUntil - s.t) - T.RESPOND.trap.busy) < 1e-9);
  assert.ok(T.RESPOND.trap.busy > T.RESPOND.urgent.busy && T.RESPOND.trap.busy > T.RESPOND.trivial.busy);
  const progress = s.progress;
  advance(s, 1, true);
  assert.equal(s.progress, progress, 'no work while stuck on the call');
  assert.equal(s.stats.aftermaths.length, 1);
});

test('you cannot act while busy, and notifications keep expiring behind you', () => {
  const s = quiet();
  const trap = Core.spawnCard(s, 'trap', 0);
  const urgent = Core.spawnCard(s, 'urgent', 0);
  Core.act(s, trap.id, 'respond');
  const events = Core.act(s, urgent.id, 'respond');
  assert.deepEqual(events.map(e => e.type), ['rejected']);
  assert.ok(s.cards.some(c => c.id === urgent.id));
  const rep = s.rep;
  advance(s, T.EXPIRY_RANGE_S[1] + 0.1, true);
  assert.ok(!s.cards.some(c => c.id === urgent.id));
  assert.equal(s.rep, rep + T.IGNORE.urgent.rep);
  assert.equal(s.stats.urgentMissed, 1);
});

test('headphones block non-urgent pings but never urgent ones', () => {
  let blocked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = Core.createGame({ seed });
    Core.useHeadphones(s);
    const until = s.headphones.activeUntil;
    while (!s.over && s.t < until) {
      for (const ev of Core.step(s, 0.05, { holding: true })) {
        if (ev.type === 'blocked') blocked++;
        if (ev.type === 'spawn' && s.t < until) assert.equal(ev.card.type, 'urgent');
      }
    }
  }
  assert.ok(blocked > 0, 'headphones should have blocked something across 40 runs');
});

test('headphones work once per round', () => {
  const s = quiet();
  assert.equal(Core.useHeadphones(s).length, 1);
  advance(s, T.HEADPHONES.duration + 0.1);
  assert.equal(Core.useHeadphones(s).length, 0);
});

test('variant B hides a message until peeked, and peeking costs focus only once', () => {
  const b = quiet({ peekVariant: true });
  const card = Core.spawnCard(b, 'trap', 0);
  assert.equal(card.peeked, false);
  b.flow = 50;
  Core.act(b, card.id, 'peek');
  assert.equal(card.peeked, true);
  assert.equal(b.flow, 50 - T.PEEK_FLOW_COST);
  Core.act(b, card.id, 'peek');
  assert.equal(b.flow, 50 - T.PEEK_FLOW_COST);
  assert.equal(Core.spawnCard(quiet(), 'trap', 0).peeked, true, 'variant A shows everything');
});

test('reputation hitting zero ends the run on a PIP', () => {
  const s = quiet();
  s.rep = 10;
  const urgent = Core.spawnCard(s, 'urgent', 0);
  const events = Core.act(s, urgent.id, 'ignore');
  assert.equal(s.over, true);
  assert.equal(s.endReason, 'pip');
  assert.ok(events.some(e => e.type === 'end' && e.reason === 'pip'));
  assert.equal(Core.summary(s).rating.key, 'pip');
});

test('the session ends at the time limit', () => {
  const s = quiet();
  advance(s, T.DURATION + 1, true);
  assert.equal(s.over, true);
  assert.equal(s.endReason, 'time');
});

test('ratings follow the work, then the rest of the job, then reputation', () => {
  const at = (progress, rep, stats) => Object.assign(quiet(), { progress, rep, over: true, endReason: 'time' },
    stats ? { stats: Object.assign(quiet().stats, stats) } : {});
  assert.equal(Core.summary(at(120, 80)).rating.key, 'gold');
  assert.equal(Core.summary(at(120, 50)).rating.key, 'silver');
  assert.equal(Core.summary(at(120, 20)).rating.key, 'bronze');
  assert.equal(Core.summary(at(50, 95)).rating.key, 'missed', 'not enough of the work is still a miss');
  // A junior is asked for most of the work, not all of it.
  const junior = Core.createGame({ seed: 1, day: 'normal', level: 'junior' });
  assert.ok(junior.rules.target < 100, `a junior should not be asked for the whole feature (${junior.rules.target}%)`);
  assert.equal(Core.rulesFor('normal', null, 'lead').target, 100, 'a lead is');
  // Landing the work while dropping the rest of the job is its own result, not a silver.
  const dropped = Core.summary(at(120, 80, { trapsTaken: 99 }));
  assert.equal(dropped.rating.key, 'dropped');
  assert.ok(dropped.delivered, 'the work itself did land');
  assert.ok(!dropped.shipped, 'but the morning does not count as finished');
  assert.deepEqual(dropped.slipped, ['trapsTaken'], 'and it should say what slipped');
});

test('arrivals stay calm through the opening and tighten toward the finish', () => {
  assert.ok(Math.abs(Core.spawnGap(0) - T.SPAWN_START_S) < 1e-9);
  assert.ok(Math.abs(Core.spawnGap(1) - T.SPAWN_END_S) < 1e-9);
  for (let f = 0; f < 1; f += 0.05) assert.ok(Core.spawnGap(f + 0.05) <= Core.spawnGap(f) + 1e-9, 'gaps never widen as time goes on');
  // A third of the way in, the gap should still be much closer to the calm opening than to the finish.
  const third = Core.spawnGap(1 / 3);
  assert.ok(third - T.SPAWN_END_S > (T.SPAWN_START_S - T.SPAWN_END_S) * 0.75);
});

test('state stays in bounds whatever the player does', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    for (const style of ['respond', 'ignore', 'peek-then-respond']) {
      const s = Core.createGame({ seed, peekVariant: style === 'peek-then-respond' });
      let lastProgress = 0;
      while (!s.over) {
        for (const c of s.cards.slice()) {
          if (style === 'peek-then-respond' && !c.peeked) Core.act(s, c.id, 'peek');
          else Core.act(s, c.id, style === 'ignore' ? 'ignore' : 'respond');
        }
        Core.step(s, 0.05, { holding: seed % 2 === 0 });
        assert.ok(s.flow >= 0 && s.flow <= 100);
        assert.ok(s.rep >= 0 && s.rep <= 100);
        assert.ok(s.progress >= lastProgress);
        assert.ok(s.cards.length <= T.MAX_CARDS);
        lastProgress = s.progress;
      }
    }
  }
});

test('the same seed and the same play produce the same run', () => {
  assert.deepEqual(playBot(42, 'Perfect reader'), playBot(42, 'Perfect reader'));
});

// ---- roles ----

test('roles: the game defaults to developer and refuses a role that does not exist', () => {
  assert.equal(Core.createGame({ seed: 1 }).role, 'developer');
  assert.equal(Core.DEFAULT_ROLE, 'developer');
  assert.throws(() => Core.createGame({ seed: 1, role: 'astronaut' }), /Unknown role/);
});

test('roles: every role in the picker is fully defined', () => {
  assert.deepEqual(Object.keys(ROLES).sort(), ROLE_ORDER.slice().sort(), 'ROLE_ORDER must list every role exactly once');
  for (const id of ROLE_ORDER) {
    const r = ROLES[id];
    assert.equal(r.id, id);
    for (const key of ['label', 'emoji', 'tagline', 'goal', 'verb', 'doing', 'progressLabel']) {
      assert.ok(typeof r[key] === 'string' && r[key].length, `${id} needs ${key}`);
    }
    assert.ok(r.deliverable && r.deliverable.noun && r.deliverable.done, `${id} needs a deliverable noun and done-word`);
    assert.ok(r.work && r.work.file && r.work.kind && r.work.text.length > 300, `${id} needs something to work on screen`);
  }
});

test('roles: a game only ever sends messages written for its role', () => {
  // Everything that reaches everybody: small talk, emergencies and traps from HR, IT, facilities and
  // the rest. None of it counts toward a role sounding like its own job.
  const shared = new Set([...Content.SHARED_TRIVIAL, ...Content.SHARED_URGENT, ...Content.SHARED_LEAD_URGENT,
    ...Content.SHARED_TRAP.junior, ...Content.SHARED_TRAP.senior, ...Content.SHARED_TRAP.lead].map(m => m.text));
  for (const id of ROLE_ORDER) {
    const own = new Set(['urgent', 'trivial', 'trap'].flatMap(type => ROLES[id].messages[type].map(m => m.text)));
    let roleSpecific = 0;
    let total = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = Core.createGame({ seed, role: id });
      while (!s.over) {
        for (const ev of Core.step(s, 0.05, { holding: true })) {
          if (ev.type !== 'spawn' || ev.card.followUp) continue; // follow-ups have their own lines (content.js)
          assert.ok(own.has(ev.card.text), `${id} received a message from another role: "${ev.card.text}"`);
          total++;
          if (!shared.has(ev.card.text)) roleSpecific++;
        }
        for (const c of s.cards.slice()) Core.act(s, c.id, 'ignore');
      }
    }
    // A ratio, not a count: this loop ignores every message, so a round ends in a PIP long before noon
    // and how MANY arrive says more about how fast reputation runs out than about the content. What
    // matters is the mix — most of what a role hears should be about its own work, with the rest the
    // things that reach everybody (HR, IT, facilities).
    assert.ok(roleSpecific / total >= 0.5,
      `${id} should mostly hear about its own job (${roleSpecific} of ${total} messages were its own)`);
  }
});

test('roles: getting pulled in uses that role\'s own busy text and aftermath', () => {
  for (const id of ROLE_ORDER) {
    const s = quiet({ role: id });
    const trap = Core.spawnCard(s, 'trap', 0);
    Core.act(s, trap.id, 'respond');
    assert.equal(s.busyText, ROLES[id].messages.trap[0].busyText);
    assert.deepEqual(s.stats.aftermaths, [ROLES[id].messages.trap[0].aftermath]);
  }
});

test('roles: the result speaks about that role\'s own deliverable', () => {
  const at = (role, progress, rep) => Core.summary(Object.assign(quiet({ role }), { progress, rep, over: true, endReason: 'time' }));
  assert.equal(at('developer', 120, 80).rating.title, 'Shipped & respected');
  assert.equal(at('tester', 120, 80).rating.title, 'Signed off & respected');
  assert.equal(at('manager', 120, 50).rating.title, 'Approved');
  assert.match(at('analyst', 50, 80).rating.blurb, /report/);
  assert.equal(at('support', 120, 80).role, 'support');
  for (const id of ROLE_ORDER) assert.equal(at(id, 120, 80).rating.key, 'gold', 'roles change wording, never the rules');
});

// ---- design checks ----

test('design: the countdown bar cannot give away what a message is', () => {
  const [lo, hi] = T.EXPIRY_RANGE_S;
  const range = { urgent: [Infinity, -Infinity], trivial: [Infinity, -Infinity], trap: [Infinity, -Infinity] };
  for (let seed = 1; seed <= 200; seed++) {
    for (const a of Core.createGame({ seed }).schedule) {
      range[a.type][0] = Math.min(range[a.type][0], a.life);
      range[a.type][1] = Math.max(range[a.type][1], a.life);
    }
  }
  for (const [type, [min, max]] of Object.entries(range)) {
    assert.ok(min >= lo && max <= hi, `${type} lifetimes must sit inside the shared range`);
    assert.ok(min < lo + 0.2 && max > hi - 0.2, `${type} should span the whole shared range`);
  }
});

test('design: in every role the tells are consistent, so reading is a skill and not a guess', () => {
  const MINIMISING = /\b(quick|quickly|just|small|tiny|only|sec|minor)\b/i;
  for (const id of ROLE_ORDER) {
    const { urgent, trap } = ROLES[id].messages;
    for (const m of trap) {
      assert.match(m.text, MINIMISING, `${id}: a trap must minimise: "${m.text}"`);
      assert.ok(m.aftermath && m.busyText, `${id}: a trap needs its aftermath and busy text: "${m.text}"`);
    }
    for (const m of urgent) {
      assert.doesNotMatch(m.text, MINIMISING, `${id}: an urgent message must never minimise: "${m.text}"`);
      assert.ok(m.busyText, `${id}: an urgent message needs busy text: "${m.text}"`);
    }
  }
});

test('design: in every role, messages stay short enough to read under pressure', () => {
  const MAX_WORDS = 7;
  for (const id of ROLE_ORDER) {
    for (const type of ['urgent', 'trivial', 'trap']) {
      for (const m of ROLES[id].messages[type]) {
        const words = m.text.split(/\s+/).filter(Boolean).length;
        assert.ok(words <= MAX_WORDS, `${id} ${type} message is ${words} words, max ${MAX_WORDS}: "${m.text}"`);
      }
    }
  }
});

test('design: every role has enough variety, and its urgent and trap messages are its own', () => {
  const seen = new Map();
  for (const id of ROLE_ORDER) {
    const { urgent, trivial, trap } = ROLES[id].messages;
    // Large pools keep rounds from feeling like the same short list (see the dealer in core.js).
    assert.ok(urgent.length >= 14 && trap.length >= 14 && trivial.length >= 18, `${id} needs at least 14 urgent, 14 traps and 18 small talk (has ${urgent.length}/${trap.length}/${trivial.length})`);
    const texts = [...urgent, ...trivial, ...trap].map(m => m.text);
    assert.equal(new Set(texts).size, texts.length, `${id} repeats a message`);
    // Shared messages are deliberately identical everywhere; what must never repeat is a role's OWN work.
    const sharedHere = new Set([...Content.SHARED_URGENT, ...Content.SHARED_TRAP.junior].map(m => m.text));
    for (const m of [...urgent, ...trap].filter((m) => !sharedHere.has(m.text))) {
      assert.ok(!seen.has(m.text), `"${m.text}" appears in both ${seen.get(m.text)} and ${id}`);
      seen.set(m.text, id);
    }
  }
});

test('design: the decisions matter — naive play loses and reading accuracy pays', () => {
  const seeds = Array.from({ length: 120 }, (_, i) => i + 1);
  const perfect = evaluate('Perfect reader', seeds);
  const answerAll = evaluate('Respond to everything', seeds);
  const ignoreAll = evaluate('Ignore everything', seeds);
  const ninety = evaluate('90% accurate reader', seeds);
  const eighty = evaluate('80% accurate reader', seeds);

  assert.ok(perfect.shipRate >= 0.9, `perfect play should ship reliably (got ${perfect.shipRate})`);
  assert.ok(answerAll.shipRate <= 0.1, `answering everything should almost never ship (got ${answerAll.shipRate})`);
  assert.ok(ignoreAll.pipRate >= 0.6, `ignoring everything should usually end on a PIP (got ${ignoreAll.pipRate})`);
  assert.ok(perfect.avgScore > answerAll.avgScore * 1.5 && perfect.avgScore > ignoreAll.avgScore * 1.5, 'no naive strategy may come close');
  assert.ok(perfect.avgScore > ninety.avgScore && ninety.avgScore > eighty.avgScore, 'each drop in reading accuracy should cost score');
});

// The first playtest reported "the time is too narrow to read and respond". These pin the fix from
// both sides: enough time to read, but not so much that the pressure — and the game — disappears.
// Pressure is measured as BACKLOG (messages piling up), not as messages lost to the clock. An earlier
// version of this check demanded some unread losses at the finish, and the only tuning that could
// satisfy it did so by shortening message lifetimes again — reintroducing the exact problem.
// Human players read the words, so the timing is checked separately for every role's wording.
const humanSeeds = Array.from({ length: 200 }, (_, i) => i + 1);
const firstTimeCache = {};
const firstTime = (role) => firstTimeCache[role] || (firstTimeCache[role] = evaluateHuman('First-time player', humanSeeds, { role }));

test('design: in every role a first-time player has time to read — failures come from judgment, not reading speed', () => {
  for (const role of ROLE_ORDER) {
    const r = firstTime(role);
    assert.ok(r.lostPct <= 0.03, `${role}: a first-time player should almost never lose a message before reading it (lost ${(r.lostPct * 100).toFixed(1)}%)`);
    assert.ok(r.lostByPhasePct[0] <= 0.01, `${role}: the opening should be calm enough to learn the tells (lost ${(r.lostByPhasePct[0] * 100).toFixed(1)}%)`);
  }
});

test('design: in every role the busy finish still has real pressure, as a backlog to prioritise', () => {
  for (const role of ROLE_ORDER) {
    const r = firstTime(role);
    const last = r.backlogByPhasePct.length - 1;
    const finish = r.backlogByPhasePct[last];
    assert.ok(finish >= 0.15, `${role}: messages should pile up at the finish (2+ waiting only ${(finish * 100).toFixed(0)}% of the time)`);
    assert.ok(finish > r.backlogByPhasePct[0] + 0.1, `${role}: pressure should build toward the finish, not sit at the start`);
  }
});

test('design: for a human player, judgment still decides the outcome', () => {
  const perfect = firstTime('developer');
  const shaky = evaluateHuman('First-time player', humanSeeds, { accuracy: 0.85 });
  assert.ok(perfect.goldRate - shaky.goldRate >= 0.1, `85% judgment should clearly cost gold ratings (${perfect.goldRate} vs ${shaky.goldRate})`);
});
