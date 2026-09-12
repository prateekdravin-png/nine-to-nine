// A week only justifies itself if it puts a price on the thing a single morning can't: spending
// everything you have. These check that the price is real, that it lands on the right choices, and
// that a week can never quietly rewrite the rules of a morning.
const test = require('node:test');
const assert = require('node:assert');
const Core = require('../core');
const Week = require('../week');
const Content = require('../content');
const { playBot } = require('../bots');

// Play a whole week with one habit, the way game.js does.
function playWeek(seed, habit) {
  let week = Week.newWeek(seed);
  const plan = Week.dayPlan(seed, Core.DAY_ORDER);
  const played = [];
  while (!week.over) {
    const i = week.index;
    const summary = playBot(Week.seedForMorning(seed, i), habit.strategy, {
      day: plan[i], carry: Week.carryFor(week), stopAtTarget: !!habit.pace
    });
    played.push(summary.day);
    week = Week.afterMorning(week, summary);
  }
  return { week, plan, played };
}

const PUSH = { strategy: 'Perfect reader' };
const PUSH_HOME = { strategy: 'Perfect reader + answers home' };
const PACE_HOME = { strategy: 'Perfect reader + answers home', pace: true };
const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const average = (list) => list.reduce((a, b) => a + b, 0) / list.length;

test('a week is five mornings, one of each kind, and Monday is always an ordinary one', () => {
  assert.strictEqual(Week.LENGTH, Content.WEEKDAYS.length);
  for (const seed of [1, 99, 40000]) {
    const plan = Week.dayPlan(seed, Core.DAY_ORDER);
    assert.strictEqual(plan.length, Week.LENGTH);
    assert.strictEqual(plan[0], 'normal', 'the first morning should teach the rhythm');
    assert.deepStrictEqual(plan.slice().sort(), Core.DAY_ORDER.slice().sort(), 'a week should be a tour of them all');
  }
  const orders = new Set([1, 2, 3, 4, 5, 6].map((s) => Week.dayPlan(s, Core.DAY_ORDER).join()));
  assert.ok(orders.size > 1, 'the order has to vary, or every week is the same week');
});

test('the mornings actually played are the ones the week planned', () => {
  const { plan, played } = playWeek(3, PUSH);
  assert.deepStrictEqual(played, plan);
});

test('the same week seed gives the same five mornings to anyone', () => {
  const a = playWeek(21, PUSH).week;
  const b = playWeek(21, PUSH).week;
  assert.deepStrictEqual(a.mornings.map((m) => m.day), b.mornings.map((m) => m.day));
  assert.strictEqual(a.energy, b.energy);
  assert.strictEqual(a.home, b.home);
});

// The claim the whole mode rests on.
test('a week spent flat out ends worse than a week that was paced', () => {
  const pushed = seeds.map((s) => playWeek(s, PUSH_HOME).week);
  const paced = seeds.map((s) => playWeek(s, PACE_HOME).week);
  const pushedEnergy = average(pushed.map((w) => w.energy));
  const pacedEnergy = average(paced.map((w) => w.energy));
  assert.ok(pacedEnergy > pushedEnergy + 10,
    `pacing should leave you visibly better off by Friday (${pacedEnergy.toFixed(0)} against ${pushedEnergy.toFixed(0)})`);
});

test('ignoring the people outside work is what empties the home meter', () => {
  const ignoring = average(seeds.map((s) => playWeek(s, PUSH).week.home));
  const answering = average(seeds.map((s) => playWeek(s, PUSH_HOME).week.home));
  assert.ok(answering > ignoring + 30, `answering home should matter (${answering.toFixed(0)} against ${ignoring.toFixed(0)})`);
  assert.ok(ignoring < 45, 'a week of ignoring everyone at home should end badly');
});

test('and it costs working time, so it is a real trade and not a free win', () => {
  const ignoring = average(seeds.map((s) => Week.verdict(playWeek(s, PUSH).week).shipped));
  const answering = average(seeds.map((s) => Week.verdict(playWeek(s, PUSH_HOME).week).shipped));
  assert.ok(answering < ignoring, `keeping a life has to cost deliveries (${answering.toFixed(2)} against ${ignoring.toFixed(2)})`);
  assert.ok(Core.TUNING.PERSONAL_BUSY > Core.TUNING.RESPOND.trivial.busy, 'a call home is a bigger interruption than office chat');
});

test('the two habits reach different verdicts, which is the point of having two meters', () => {
  const keyFor = (habit) => {
    const counts = {};
    for (const seed of seeds) {
      const k = Week.verdict(playWeek(seed, habit).week).key;
      counts[k] = (counts[k] || 0) + 1;
    }
    return Object.keys(counts).reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  };
  assert.strictEqual(keyFor(PUSH), 'burnt', 'delivering while ignoring everyone should read as burning out');
  assert.strictEqual(keyFor(PACE_HOME), 'hero', 'delivering while keeping a life should be the best week');
});

test('being tired is the only thing a week changes about a morning', () => {
  const fresh = Core.rulesFor('normal', Week.carryFor(Week.newWeek(1)));
  const spent = Core.rulesFor('normal', Week.carryFor(Object.assign(Week.newWeek(1), { energy: 5 })));
  assert.deepStrictEqual(Object.keys(fresh).sort(), Object.keys(spent).sort());
  for (const key of ['target', 'goldRep', 'progressPerS', 'spawnScale']) {
    assert.deepStrictEqual(spent[key], fresh[key], `a week must not change ${key}`);
  }
  assert.ok(spent.flowGain < fresh.flowGain, 'tired people build focus slower');
  assert.ok(spent.flowDecayIdle > fresh.flowDecayIdle, 'and lose it faster');
});

test('past a point deep work is simply out of reach', () => {
  const fresh = Core.createGame({ seed: 1, day: 'normal', carry: Week.carryFor(Week.newWeek(1)) });
  const spent = Core.createGame({ seed: 1, day: 'normal', carry: Week.carryFor(Object.assign(Week.newWeek(1), { energy: 5 })) });
  assert.ok(Core.topTier(fresh.rules).mult > Core.topTier(spent.rules).mult,
    'an empty tank should put the top gear beyond you');
  assert.ok(Core.topTier(spent.rules).mult >= 1, 'but there is always something left to hold the button for');
  fresh.flow = spent.flow = 100;
  fresh.schedule = spent.schedule = [];
  for (let i = 0; i < 20; i++) { Core.step(fresh, 0.05, { holding: true }); Core.step(spent, 0.05, { holding: true }); }
  assert.ok(spent.progress < fresh.progress, 'and it should show in what you get done');
});

test('a night never fully covers a hard morning, and a neglected home makes it worse', () => {
  assert.ok(Week.TUNING.NIGHT.energy < 100, 'sleeping it off completely would make the week meaningless');
  const rested = Week.afterMorning(Object.assign(Week.newWeek(1), { energy: 40, home: 90 }), fakeMorning());
  const frayed = Week.afterMorning(Object.assign(Week.newWeek(1), { energy: 40, home: 20 }), fakeMorning());
  assert.ok(rested.energy > frayed.energy, 'a home life you are not tending should stop the night helping');
});

test('every morning of the week is written down with what it cost', () => {
  const { week } = playWeek(5, PUSH);
  assert.strictEqual(week.mornings.length, Week.LENGTH);
  assert.ok(week.over);
  week.mornings.forEach((m, i) => {
    assert.strictEqual(m.index, i);
    assert.strictEqual(m.weekday, Content.WEEKDAYS[i]);
    assert.ok(m.items.length, `${m.weekday} recorded no costs at all`);
    for (const item of m.items) assert.ok(item.meter === 'energy' || item.meter === 'home', 'a cost has to land on one of the two meters');
  });
  const v = Week.verdict(week);
  assert.ok(Content.VERDICTS[v.key], 'the verdict needs wording to go with it');
  assert.ok(v.played === Week.LENGTH);
});

test('the meters never leave their range, however the week goes', () => {
  for (const habit of [PUSH, PUSH_HOME, PACE_HOME]) {
    for (const seed of seeds) {
      const { week } = playWeek(seed, habit);
      for (const m of week.mornings) {
        assert.ok(m.after.energy >= 0 && m.after.energy <= 100, `energy left its range: ${m.after.energy}`);
        assert.ok(m.after.home >= 0 && m.after.home <= 100, `home left its range: ${m.after.home}`);
      }
    }
  }
});

test('a shared week says how it went and nothing about the messages', () => {
  const { week } = playWeek(9, PUSH_HOME);
  const text = Week.shareText(week, { who: '💻 Senior Developer', url: 'http://example.test/' });
  assert.match(text, /9 to 9/);
  assert.match(text, /Mon/);
  assert.match(text, /http:\/\/example\.test\//);
  const said = new Set();
  for (const morning of week.mornings) said.add(morning.day);
  for (const line of text.split('\n')) {
    assert.ok(!/urgent|trap|quick/i.test(line), `the share text hints at what a message was: "${line}"`);
  }
});

function fakeMorning() {
  return {
    shipped: true,
    endReason: 'time',
    day: 'normal',
    role: 'developer',
    rating: { key: 'gold', emoji: '🥇' },
    score: 1000,
    stats: { deepWorkTime: 20, busyTime: 5, trapsTaken: 0, personalIgnored: 0, personalAnswered: 0 }
  };
}
