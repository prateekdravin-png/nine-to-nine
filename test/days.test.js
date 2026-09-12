// Day types earn their place only if the best way to play actually changes with them. A morning that
// looks different in the header and plays identically is decoration, and this file is what stops that
// from happening quietly.
const test = require('node:test');
const assert = require('node:assert');
const Core = require('../core');
const Content = require('../content');
const { evaluate, evaluateHuman } = require('../bots');

const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
const READING = 'Perfect reader';                            // answers what is urgent, ignores the rest
const SOCIABLE = 'Sociable reader: answers all but traps';   // answers everyone, dodges traps
const gold = (strategy, day) => evaluate(strategy, seeds, { day }).goldRate;

test('every day type is described to the player before they play it', () => {
  for (const id of Core.DAY_ORDER) {
    const day = Content.DAYS[id];
    assert.ok(day, `${id} has no description`);
    for (const field of ['label', 'emoji', 'summary', 'goal']) {
      assert.ok(day[field] && String(day[field]).trim(), `${id} is missing its ${field}`);
    }
  }
  assert.deepStrictEqual(Object.keys(Content.DAYS).sort(), Core.DAY_ORDER.slice().sort(),
    'the rules and the wording have to describe the same set of days');
});

test('the kind of morning comes from the seed, so a daily morning is the same for everyone', () => {
  for (const seed of [1, 17, 250, 9999]) {
    const day = Core.planMorning(seed).day;
    assert.ok(Core.DAY_ORDER.includes(day));
    for (const role of Content.ROLE_ORDER) {
      for (const level of Content.LEVEL_ORDER) {
        assert.strictEqual(Core.createGame({ seed, role, level }).day, day,
          `seed ${seed} gave a different kind of morning to a ${level} ${role}`);
      }
    }
  }
});

test('over many mornings every kind turns up, and ordinary ones are the most common', () => {
  const counts = {};
  for (let seed = 1; seed <= 3000; seed++) {
    const day = Core.planMorning(seed).day;
    counts[day] = (counts[day] || 0) + 1;
  }
  for (const id of Core.DAY_ORDER) assert.ok(counts[id] > 100, `${id} almost never happens (${counts[id] || 0} in 3000)`);
  const most = Object.keys(counts).reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  assert.strictEqual(most, 'normal', 'most mornings should be ordinary, or the odd ones stop feeling odd');
});

// The claim the whole feature rests on.
test('the best way to play changes with the kind of morning', () => {
  const normalReading = gold(READING, 'normal');
  const normalSociable = gold(SOCIABLE, 'normal');
  const appraisalReading = gold(READING, 'appraisal');
  const appraisalSociable = gold(SOCIABLE, 'appraisal');
  assert.ok(normalReading > normalSociable + 0.2,
    `on an ordinary morning, reading (${normalReading}) must beat answering everyone (${normalSociable})`);
  assert.ok(appraisalSociable > appraisalReading + 0.2,
    `on an appraisal morning it must be the other way round (${appraisalSociable} vs ${appraisalReading})`);
});

test('a person who adapts to the day does better than one who plays every morning the same', () => {
  const sameAsAlways = evaluateHuman('First-time player', seeds, { accuracy: 0.85, day: 'appraisal' });
  const adapting = evaluateHuman('First-time player', seeds, { accuracy: 0.85, day: 'appraisal', style: 'sociable' });
  assert.ok(adapting.goldRate > sameAsAlways.goldRate,
    `adapting (${adapting.goldRate}) should beat playing it the usual way (${sameAsAlways.goldRate})`);
});

test('no kind of morning is unwinnable, and none is a free pass', () => {
  for (const day of Core.DAY_ORDER) {
    const best = Math.max(gold(READING, day), gold(SOCIABLE, day));
    assert.ok(best >= 0.75, `${day} tops out at ${best} gold even played the right way`);
    const human = evaluateHuman('First-time player', seeds, { accuracy: 0.85, day });
    assert.ok(human.shipRate > 0.4, `a first-time player finishes only ${human.shipRate} of ${day} mornings`);
    assert.ok(human.lostPct < 0.08, `${day} loses ${human.lostPct} of messages before they can be read`);
  }
});

test('naive play fails on every kind of morning', () => {
  for (const day of Core.DAY_ORDER) {
    assert.ok(evaluate('Ignore everything', seeds, { day }).goldRate < 0.05, `ignoring everything works on a ${day} morning`);
    assert.ok(evaluate('Respond to everything', seeds, { day }).goldRate < 0.1, `answering everything blindly works on a ${day} morning`);
  }
});

test('a day type only ever changes the knobs, never adds a rule of its own', () => {
  const allowed = ['day', 'target', 'goldRep', 'tiers', 'progressPerS', 'flowGain', 'flowDecayIdle', 'flowDecayBusy', 'spawnScale', 'weights', 'respond', 'ignore'];
  for (const id of Core.DAY_ORDER) {
    assert.deepStrictEqual(Object.keys(Core.rulesFor(id)).sort(), allowed.slice().sort(),
      `${id} resolved to a different shape of rules`);
  }
  assert.strictEqual(Core.rulesFor('nonsense').day, Core.DEFAULT_DAY, 'an unknown day falls back to an ordinary one');
});

test('a backlog morning has no deep end, and says so in its own words', () => {
  const backlog = Core.createGame({ seed: 1, day: 'backlog' });
  assert.strictEqual(backlog.rules.tiers.length, 1, 'there should be nothing to build toward');
  assert.strictEqual(Core.topTier(backlog.rules).mult, 1, 'and no multiplier for getting into it');
  backlog.flow = 100;
  backlog.progress = 200;
  backlog.over = true;
  backlog.rep = 90;
  assert.match(Core.summary(backlog).rating.title, /[Cc]leared/, 'the result should talk about the backlog, not a feature');

  const normal = Core.createGame({ seed: 1, day: 'normal' });
  assert.ok(Core.topTier(normal.rules).mult > 1, 'an ordinary morning still has a deep end');
});

test('deep work time is only counted on mornings that have a deep end', () => {
  for (const day of Core.DAY_ORDER) {
    const s = Core.createGame({ seed: 1, day });
    s.schedule = [];
    s.events = [];
    s.flow = 100;
    for (let i = 0; i < 40; i++) Core.step(s, 0.05, { holding: true });
    const hasDeepEnd = Core.topTier(s.rules).mult > 1;
    assert.strictEqual(s.stats.deepWorkTime > 0, hasDeepEnd,
      `${day}: deep work time was ${hasDeepEnd ? 'not ' : ''}counted when it should ${hasDeepEnd ? '' : 'not '}have been`);
  }
});

test('working from home really is quieter, and really is harder to focus in', () => {
  const wfh = Core.createGame({ seed: 3, day: 'wfh' });
  const normal = Core.createGame({ seed: 3, day: 'normal' });
  assert.ok(wfh.schedule.length < normal.schedule.length * 0.85,
    `wfh had ${wfh.schedule.length} messages against an ordinary ${normal.schedule.length}`);
  assert.ok(wfh.rules.flowGain < normal.rules.flowGain);
  assert.ok(wfh.rules.flowDecayIdle > normal.rules.flowDecayIdle);
});

test('a release morning really is mostly emergencies', () => {
  const count = (day) => {
    const s = Core.createGame({ seed: 11, day });
    return s.schedule.filter((m) => m.type === 'urgent').length / s.schedule.length;
  };
  assert.ok(count('release') > count('normal') * 1.3, 'release day should be visibly more urgent than an ordinary one');
});

// A day type and a boss both lean on the mix of messages; neither may silently cancel the other out.
test('a boss and a day type both still count when they land together', () => {
  const share = (plan) => {
    const schedule = Core.buildSchedule(5, 'developer', 'junior', undefined, plan);
    return schedule.filter((m) => m.type === 'urgent').length / schedule.length;
  };
  const events = Core.planMorning(5).events;
  const plain = share({ day: 'normal', boss: 'reasonable', events });
  const dayOnly = share({ day: 'release', boss: 'reasonable', events });
  const bossOnly = share({ day: 'normal', boss: 'micromanager', events });
  const both = share({ day: 'release', boss: 'micromanager', events });
  assert.ok(dayOnly > plain && bossOnly > plain, 'each should raise the share of emergencies on its own');
  assert.ok(both >= Math.max(dayOnly, bossOnly), 'together they should be at least as urgent as either alone');
});
