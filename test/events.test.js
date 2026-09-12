// Run with: npm test
// What keeps rounds from feeling the same: the boss of the day, office events and follow-ups. These pin
// the rules, check the new lines follow every level's tell, and check no boss or event makes the game
// unfair to a first-time player.
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core');
const { LEVEL_ORDER, TELLS, BOSSES, EVENTS, FOLLOW_UPS } = require('../content');
const { evaluate, evaluateHuman } = require('../bots');
// Bosses and events are checked on an ordinary morning; day types get their own check (days.test.js).
const DAY = 'normal';
const T = Core.TUNING;

// A game with a hand-picked morning: no scheduled messages, and exactly the events given.
function morning(events, opts) {
  const s = Core.createGame(Object.assign({ seed: 1 }, opts));
  s.schedule = [];
  s.events = events.map((e) => Object.assign({ started: false, done: false, work: 0, until: e.at + T.EVENTS[e.id].duration }, e));
  return s;
}
function run(s, until, input) {
  const events = [];
  while (!s.over && s.t < until - 1e-9) events.push(...Core.step(s, 0.05, input || { holding: true }));
  return events;
}
const words = (text) => text.split(/\s+/).filter(Boolean).length;

test('every morning has a boss and one or two office events, from the seed alone', () => {
  const bosses = new Set();
  const kinds = new Set();
  let twoEvents = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const plan = Core.planMorning(seed);
    assert.deepEqual(plan, Core.planMorning(seed));
    bosses.add(plan.boss);
    plan.events.forEach((e) => kinds.add(e.id));
    assert.ok(plan.events.length === 1 || plan.events.length === 2);
    const [first, second] = plan.events;
    assert.ok(first.at >= T.EVENTS.windows[0][0] && first.at <= T.EVENTS.windows[0][1], 'never in the opening seconds');
    if (second) {
      twoEvents++;
      assert.ok(second.at >= first.until, 'events never overlap');
      assert.notEqual(second.id, first.id);
    }
    if (seed <= 30) {
      for (const level of LEVEL_ORDER) {
        const s = Core.createGame({ seed, role: 'support', level });
        assert.equal(s.boss, plan.boss, 'the same boss for every role and level');
        assert.deepEqual(s.events.map((e) => [e.id, e.at]), plan.events.map((e) => [e.id, e.at]));
      }
    }
  }
  assert.deepEqual([...bosses].sort(), Core.BOSS_ORDER.slice().sort(), 'every boss turns up');
  assert.deepEqual([...kinds].sort(), Core.EVENT_ORDER.slice().sort(), 'every event turns up');
  assert.ok(twoEvents > 120 && twoEvents < 240, `about 60% of mornings have two events (${twoEvents} of 300)`);
  for (const id of Core.BOSS_ORDER) assert.ok(BOSSES[id].label && BOSSES[id].short && BOSSES[id].emoji && BOSSES[id].summary, id);
  for (const id of Core.EVENT_ORDER) assert.ok(EVENTS[id].title && EVENTS[id].emoji && EVENTS[id].hint, id);
});

test('each boss changes the mix of the morning', () => {
  const mix = (boss) => {
    const counts = { urgent: 0, trivial: 0, trap: 0, early: 0, late: 0, all: 0 };
    for (let seed = 1; seed <= 200; seed++) {
      for (const a of Core.buildSchedule(seed, 'developer', 'junior', [], { boss, events: [] })) {
        if (a.at >= T.DURATION) continue;
        counts[a.type]++;
        counts.all++;
        if (a.at < 20) counts.early++;
        if (a.at >= 40) counts.late++;
      }
    }
    return counts;
  };
  const normal = mix('reasonable');
  const micro = mix('micromanager');
  const nice = mix('nicetrap');
  const late = mix('lastminute');
  assert.ok(micro.urgent / micro.all > normal.urgent / normal.all + 0.02, 'the Micromanager sends more urgent messages');
  assert.ok(nice.trap / nice.all > normal.trap / normal.all + 0.05, 'the Nice Trap sends more traps');
  assert.ok(late.early < normal.early && late.late > normal.late, 'the Last-Minute Boss is quiet early and busy late');
});

test('fire drill: no work and no actions, message timers wait, but focus drains', () => {
  const drill = T.EVENTS.drill;
  const s = morning([{ id: 'drill', at: 2 }]);
  s.flow = 100;
  run(s, 1.9);
  const card = Core.spawnCard(s, 'urgent', 0, 2.5); // would expire in the middle of the drill
  run(s, 2.5);
  const progress = s.progress;
  const flow = s.flow;
  assert.deepEqual(Core.act(s, card.id, 'respond').map((e) => e.reason), ['event']);
  assert.equal(Core.canAct(s, 'delegate'), false);
  run(s, 2 + drill.duration - 0.1);
  assert.equal(s.progress, progress, 'no work during the drill');
  assert.ok(s.cards.includes(card), "messages don't expire while everyone is outside");
  assert.ok(s.flow < flow - 20, 'focus drains while you stand in the car park');
  assert.ok(s.flow > 0, 'but more slowly than it would at your desk');
  run(s, 2 + drill.duration + 0.2);
  assert.ok(Core.canAct(s, 'respond'));
});

test("Wi-Fi down: nothing arrives, then the held messages land; nothing is lost", () => {
  const plain = Core.buildSchedule(3, 'developer', 'junior', [], { boss: 'reasonable', events: [] });
  const wifi = Core.buildSchedule(3, 'developer', 'junior', [], { boss: 'reasonable', events: [{ id: 'wifi', at: 20, until: 28 }] });
  assert.ok(plain.some((a) => a.at >= 20 && a.at < 28), 'this morning had messages due during the outage');
  assert.ok(!wifi.some((a) => a.at >= 20 && a.at < 28), 'nothing arrives while the Wi-Fi is down');
  assert.equal(wifi.length, plain.length, 'held messages still arrive');
  assert.deepEqual(wifi.map((a) => a.type).sort(), plain.map((a) => a.type).sort());
});

test('boss walking by: keep working, or handle a real emergency, to look busy', () => {
  const cfg = T.EVENTS.walkby;
  const end = 1 + cfg.duration + 0.2;
  const start = T.START_REP;

  const working = morning([{ id: 'walkby', at: 1 }]);
  const events = run(working, end);
  assert.equal(working.rep, start + cfg.rep);
  assert.ok(events.some((e) => e.type === 'event-end' && e.outcome === 'looked-busy'));

  const idle = morning([{ id: 'walkby', at: 1 }]);
  run(idle, end, { holding: false });
  assert.equal(idle.rep, start + cfg.penalty);
  assert.equal(idle.stats.walkbyCaught, 1);

  const onTrap = morning([{ id: 'walkby', at: 1 }]);
  run(onTrap, 0.9);
  Core.act(onTrap, Core.spawnCard(onTrap, 'trap', 0).id, 'respond');
  run(onTrap, end);
  assert.equal(onTrap.rep, start + cfg.penalty, 'a pointless call does not look busy');

  const onUrgent = morning([{ id: 'walkby', at: 1 }]);
  run(onUrgent, 0.9);
  Core.act(onUrgent, Core.spawnCard(onUrgent, 'urgent', 0).id, 'respond');
  run(onUrgent, end);
  assert.equal(onUrgent.rep, start + T.RESPOND.urgent.rep + cfg.rep, 'handling a real emergency counts');
});

test('an outage turns the next messages into emergencies; lunch turns them into chatty colleagues', () => {
  const plan = (events) => ({ boss: 'reasonable', events });
  const plain = Core.buildSchedule(5, 'tester', 'junior', [], plan([]));

  const outage = Core.buildSchedule(5, 'tester', 'junior', [], plan([{ id: 'outage', at: 30, until: 34 }]));
  assert.equal(outage.length, plain.length, 'no extra messages, so the pace stays readable');
  assert.deepEqual(outage.map((a) => a.at), plain.map((a) => a.at), 'and nothing moves');
  const emergencies = outage.filter((a) => a.at >= 30).slice(0, T.EVENTS.outage.burst);
  assert.ok(emergencies.every((a) => a.type === 'urgent'));
  assert.ok(plain.filter((a) => a.at >= 30).slice(0, T.EVENTS.outage.burst).some((a) => a.type !== 'urgent'), 'the outage changed something');

  const lunch = Core.buildSchedule(5, 'tester', 'junior', [], plan([{ id: 'lunch', at: 20, until: 24 }]));
  assert.equal(lunch.length, plain.length);
  const pool = require('../content').ROLES.tester.messages.trivial;
  const chatty = lunch.filter((a) => a.colleague);
  assert.equal(chatty.length, T.EVENTS.lunch.burst);
  for (const a of chatty) assert.ok(pool[a.msgIndex].favour, `"${pool[a.msgIndex].text}" should be from a colleague`);
});

test('a trap left unanswered asks again once, pushier, from the same sender', () => {
  const s = morning([]);
  const trap = Core.spawnCard(s, 'trap', 0, 1); // left to expire, with no reply
  const again = run(s, 7).filter((e) => e.type === 'spawn').map((e) => e.card)[0];
  assert.ok(again, 'it comes back');
  assert.deepEqual([again.type, again.followUp, again.from], ['trap', true, trap.from]);
  assert.ok(FOLLOW_UPS.junior.trap.some((m) => m.text === again.text));
  Core.act(s, again.id, 'ignore');
  run(s, 16);
  assert.equal(s.cards.length, 0, 'a follow-up is never followed up');
  assert.equal(s.stats.followUps, 1);
});

test('a trap you decline is closed: people follow up when you do not reply', () => {
  const s = morning([]);
  Core.act(s, Core.spawnCard(s, 'trap', 0).id, 'ignore');
  const spawned = run(s, 8).filter((e) => e.type === 'spawn');
  assert.equal(spawned.length, 0, 'saying no ends it');
  assert.equal(s.stats.followUps, 0);
});

test('an unanswered urgent message comes back as an escalation from the boss', () => {
  const s = morning([]);
  s.boss = 'micromanager';
  Core.spawnCard(s, 'urgent', 0, 1); // left to expire
  const escalation = run(s, 7).filter((e) => e.type === 'spawn').map((e) => e.card)[0];
  assert.ok(escalation, 'the escalation arrives');
  assert.deepEqual([escalation.type, escalation.followUp, escalation.from], ['urgent', true, 'Boss · Micromanager']);
  assert.ok(FOLLOW_UPS.junior.urgent.some((m) => m.text === escalation.text));
  const rep = s.rep;
  Core.act(s, escalation.id, 'ignore');
  assert.equal(s.rep, rep + T.IGNORE.urgent.rep, 'ignoring an escalation costs the same again');
  assert.equal(s.stats.escalations, 1);
});

test("responding to a follow-up uses the follow-up's own busy text and aftermath", () => {
  const s = morning([], { level: 'senior' });
  Core.spawnCard(s, 'trap', 0, 1); // left to expire
  const again = run(s, 7).filter((e) => e.type === 'spawn')[0].card;
  Core.act(s, again.id, 'respond');
  const line = FOLLOW_UPS.senior.trap.find((m) => m.text === again.text);
  assert.equal(s.busyText, line.busyText);
  assert.deepEqual(s.stats.aftermaths, [line.aftermath]);
});

test('follow-ups wait out a fire drill and a Wi-Fi outage', () => {
  for (const id of ['drill', 'wifi']) {
    const s = morning([{ id, at: 3 }]);
    Core.spawnCard(s, 'trap', 0, 1); // expires at 1s, so its follow-up is due at 5.5s
    const until = 3 + T.EVENTS[id].duration;
    const during = run(s, until - 0.1).filter((e) => e.type === 'spawn');
    assert.equal(during.length, 0, `nothing arrives during the ${id}`);
    // A drill pauses the follow-up's own timer too, so allow for its remaining delay.
    const after = run(s, until + T.FOLLOW_UP.delay).filter((e) => e.type === 'spawn');
    assert.equal(after.length, 1, `the follow-up arrives after the ${id}`);
  }
});

test('follow-ups and escalations follow every level\'s tell', () => {
  const { minimising, alarm } = TELLS;
  for (const level of LEVEL_ORDER) {
    const { trap, urgent } = FOLLOW_UPS[level];
    for (const m of [...trap, ...urgent]) {
      assert.ok(words(m.text) <= 7, `${level}: "${m.text}" is too long`);
      assert.ok(m.busyText, `${level}: "${m.text}" needs busy text`);
    }
    for (const m of trap) {
      assert.ok(m.aftermath, `${level}: "${m.text}" needs an aftermath`);
      if (level === 'junior') assert.match(m.text, minimising, `junior follow-ups minimise: "${m.text}"`);
      if (level === 'senior') {
        assert.doesNotMatch(m.text, minimising, `senior follow-ups never say quick: "${m.text}"`);
        assert.doesNotMatch(m.text, alarm, `senior follow-ups are polite: "${m.text}"`);
      }
      if (level === 'lead') {
        assert.match(m.text, alarm, `lead follow-ups shout: "${m.text}"`);
        assert.doesNotMatch(m.text, minimising, `lead follow-ups never say quick: "${m.text}"`);
      }
    }
    for (const m of urgent) {
      assert.doesNotMatch(m.text, minimising, `escalations never minimise: "${m.text}"`);
      assert.doesNotMatch(m.text, alarm, `escalations stay calm, so they read as urgent at lead too: "${m.text}"`);
    }
  }
});

// No boss or event may make the game unfair: a first-time player still has time to read, and good
// judgment still wins, whatever kind of morning it is.
test('design: every boss and every event stays fair to a first-time player', () => {
  const groups = {};
  for (let seed = 1; seed <= 700; seed++) {
    const plan = Core.planMorning(seed);
    for (const key of [`boss:${plan.boss}`, ...plan.events.map((e) => `event:${e.id}`)]) {
      (groups[key] = groups[key] || []).push(seed);
    }
  }
  for (const [key, all] of Object.entries(groups)) {
    const seeds = all.slice(0, 80);
    const human = evaluateHuman('First-time player', seeds, { day: DAY });
    const perfect = evaluate('Perfect reader', seeds, { day: DAY });
    assert.ok(human.lostPct <= 0.04, `${key}: a first-time player lost ${(human.lostPct * 100).toFixed(1)}% of messages before reading them`);
    assert.ok(human.lostByPhasePct[0] <= 0.01, `${key}: the opening should stay calm`);
    assert.ok(perfect.goldRate >= 0.85, `${key}: good judgment should still earn gold (${perfect.goldRate})`);
  }
});
