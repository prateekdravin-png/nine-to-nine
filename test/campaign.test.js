// The campaign is the curriculum, so two things have to stay true of every level for ever: a player who
// has learned its lesson can clear it, and a player who has not cannot. A level that nobody can pass is
// a wall; a level that falls to a naive strategy teaches nothing. Both are easy to create by accident
// with a tuning change somewhere else, which is what this file is for.
const test = require('node:test');
const assert = require('node:assert');
const Core = require('../core');
const Campaign = require('../campaign');
const Content = require('../content');
const { playBot } = require('../bots');
const Week = require('../week');

// How a player who has learned the level would approach it.
const APPROACH = {
  first: { strategy: 'Perfect reader' },
  read: { strategy: 'Perfect reader' },
  'never-quick': { strategy: 'Perfect reader' },
  'deep-end': { strategy: 'Perfect reader' },
  headphones: { strategy: 'Perfect reader', headphonesAt: 30 },
  colleague: { strategy: 'Perfect reader + favours' },
  'cannot-tell': { strategy: 'Coin flip on urgent-vs-trap, says no' },
  appraisal: { strategy: 'Sociable reader: answers all but traps' },
  backlog: { strategy: 'Perfect reader' },
  release: { strategy: 'Perfect reader' },
  'on-a-roll': { strategy: 'Perfect reader' },
  lead: { strategy: 'Perfect reader' },
  // The lead's own mornings: the weather changes, so the way through each is still to read them.
  'quiet-house': { strategy: 'Perfect reader' },
  micromanager: { strategy: 'Perfect reader' },
  'all-polite': { strategy: 'Perfect reader' },
  noon: { strategy: 'Perfect reader' },
  // The last level is a whole week, so its approach is a habit rather than a strategy for one morning:
  // pace yourself and answer the people outside work.
  'the-week': { strategy: 'Perfect reader + answers home', pace: true },
  // After the week: single mornings again.
  'come-back': { strategy: 'Perfect reader' },
  'everything-down': { strategy: 'Perfect reader + favours' },
  'head-of': { strategy: 'Perfect reader' },
  'still-a-person': { strategy: 'Perfect reader + answers home' },
  'loud-and-real': { strategy: 'Perfect reader' },
  'release-top': { strategy: 'Perfect reader' },
  'long-day-top': { strategy: 'Perfect reader' },
  'pass-it-on': { strategy: 'Perfect reader + favours' }
};

// And one who has not. Level 1 has none: it only asks you to hold the button.
const NAIVE = {
  read: 'Ignore everything',
  'never-quick': 'Respond to everything',
  'deep-end': 'Respond to everything',
  headphones: 'Respond to everything',
  colleague: 'Perfect reader',                               // never answers anyone, so banks nothing
  'cannot-tell': 'Coin flip on urgent-vs-trap, guesses',     // same uncertainty, no hedge
  appraisal: 'Perfect reader',                               // ignores small talk, which is the trap here
  backlog: 'Respond to everything',
  release: 'Respond to everything',
  'on-a-roll': '80% accurate reader',
  lead: 'Keyword reader: alarm words mean urgent',
  'quiet-house': 'Respond to everything',                    // the quiet is the point, and this one answers through all of it
  micromanager: 'Say no to everything',                      // hedging works when you cannot tell; today the alarms are real
  'all-polite': 'Respond to everything',                     // nothing sounds like a trap, so this one takes them all
  noon: 'Ignore everything',                                 // survives the quiet start and drowns at noon
  'the-week': 'Perfect reader',   // delivers every morning by emptying itself, which is the whole lesson
  'come-back': 'Perfect reader, lets traps run out',   // never takes a trap, never turns one down either
  'everything-down': 'Perfect reader',                // right about everything, and alone when it all breaks at once
  'head-of': 'Keyword reader: calm means urgent',      // learned lead as a rule, so every calm trap looks real
  'still-a-person': 'Perfect reader',                  // right about work, and silent at home
  'loud-and-real': 'Head reader, distrusts shouting',  // has the head tell, and still takes loud for a trap
  'release-top': 'Keyword reader: calm means urgent',  // takes "next release" for today's
  'long-day-top': 'Keyword reader: calm means urgent', // picks up every calm "not now"
  'pass-it-on': 'Perfect reader'                       // right about everything, and alone in the outage
};

const play = (level, role, strategy, opts) =>
  playBot(level.setup.seed, strategy, Object.assign({ role, day: level.setup.day, level: level.setup.level }, opts));

// A week level is judged on a finished week, in the same shape game.js hands to Campaign.check.
function playWeek(seed, role, strategy, pace) {
  let week = Week.newWeek(seed);
  const plan = Week.dayPlan(seed, Core.DAY_ORDER);
  while (!week.over) {
    const i = week.index;
    week = Week.afterMorning(week, playBot(Week.seedForMorning(seed, i), strategy, {
      role, day: plan[i], carry: Week.carryFor(week), stopAtTarget: !!pace
    }));
  }
  const v = Week.verdict(week);
  return { shipped: v.shipped, energy: week.energy, home: week.home, golds: v.golds, played: v.played };
}

// Weeks are the player's own, not a pinned seed, so a week level has to hold across many of them.
const WEEK_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const attempt = (level, role, strategy, opts) => (Campaign.isWeek(level)
  ? WEEK_SEEDS.map((seed) => playWeek(seed, role, strategy, opts && opts.pace))
  : [play(level, role, strategy, opts)]);

test('every level is described well enough to attempt', () => {
  const ids = new Set();
  Campaign.LEVELS.forEach((level, i) => {
    assert.strictEqual(level.n, i + 1, 'levels should be numbered in order with no gaps');
    assert.ok(!ids.has(level.id), `two levels share the id ${level.id}`);
    ids.add(level.id);
    for (const key of ['title', 'emoji', 'brief', 'teaches']) assert.ok(level[key], `level ${level.n} needs ${key}`);
    assert.ok(level.goals.length >= 1, `level ${level.n} asks for nothing`);
    for (const g of level.goals) assert.ok(g.id && g.label && typeof g.test === 'function', `level ${level.n} has a malformed goal`);
    assert.ok(Content.DAYS[level.setup.day], `level ${level.n} wants a day type that does not exist`);
    assert.ok(Content.LEVELS[level.setup.level], `level ${level.n} wants a career level that does not exist`);
    assert.ok(Number.isInteger(level.setup.seed), `level ${level.n} needs a pinned seed`);
  });
});

test('every level can be cleared, in every role', () => {
  for (const level of Campaign.LEVELS) {
    const approach = APPROACH[level.id];
    assert.ok(approach, `level ${level.n} (${level.id}) has no known way through`);
    for (const role of Content.ROLE_ORDER) {
      const results = attempt(level, role, approach.strategy, { headphonesAt: approach.headphonesAt, pace: approach.pace });
      // A pinned morning has to clear every time; a week is the player's own, so most of them is the bar.
      const clears = results.filter((r) => Campaign.cleared(Campaign.check(level, r))).length;
      const need = Campaign.isWeek(level) ? Math.ceil(results.length * 0.75) : results.length;
      assert.ok(clears >= need,
        `level ${level.n} (${level.id}) as ${role}: cleared ${clears} of ${results.length}, ` +
        `missing ${Campaign.check(level, results[0]).filter((g) => !g.done).map((g) => g.label).join(', ')}`);
    }
  }
});

test('no level falls to a player who has not learned it', () => {
  for (const level of Campaign.LEVELS) {
    if (!NAIVE[level.id]) continue;
    const results = attempt(level, 'developer', NAIVE[level.id]);
    const clears = results.filter((r) => Campaign.cleared(Campaign.check(level, r))).length;
    assert.ok(clears === 0,
      `level ${level.n} (${level.id}) was cleared ${clears} time(s) by "${NAIVE[level.id]}", so it does not test its own lesson`);
  }
});

test('a level is only open once the one before it is done', () => {
  const first = Campaign.LEVELS[0];
  const second = Campaign.LEVELS[1];
  const third = Campaign.LEVELS[2];
  assert.ok(Campaign.isOpen(first, []), 'the first level has to be open to everyone');
  assert.ok(!Campaign.isOpen(second, []));
  assert.ok(Campaign.isOpen(second, [first.id]));
  assert.ok(!Campaign.isOpen(third, [first.id]));
  assert.ok(Campaign.isOpen(third, [first.id, second.id]));
});

test('every level says what to actually do about it', () => {
  // The help button shows this mid-morning, when the question has already come up, so it has to be the
  // tactic rather than the theme: what to press, and what not to. `teaches` is the lesson; `hint` is how.
  for (const level of Campaign.LEVELS) {
    assert.ok(level.hint, `level ${level.n} needs a hint`);
    assert.ok(level.hint.length >= 80, `level ${level.n}'s hint is too thin to help`);
    assert.ok(level.hint.endsWith('.'), `level ${level.n}'s hint should read as sentences`);
    assert.notStrictEqual(level.hint, level.teaches, `level ${level.n} repeats its lesson instead of saying how`);
  }
});

test('the next level is the first one not yet done', () => {
  assert.strictEqual(Campaign.nextFor([]).n, 1);
  assert.strictEqual(Campaign.nextFor(['first']).n, 2);
  assert.strictEqual(Campaign.nextFor(Campaign.LEVELS.map((l) => l.id)), null, 'the ladder should end');
});

test('career levels are campaign rewards, and arrive in order', () => {
  assert.strictEqual(Campaign.careerFrom([]), 'junior');
  const unlockers = Campaign.LEVELS.filter((l) => l.unlocks);
  assert.deepStrictEqual(unlockers.map((l) => l.unlocks), ['senior', 'lead', 'head'],
    'the ladder should hand out senior, then lead, then head');
  // The lock on each rung names the level that opens it, so the two cannot drift apart.
  for (const level of unlockers) {
    const text = Content.LEVELS[level.unlocks].unlockText;
    assert.ok(text.includes(`level ${level.n}, ${level.title},`), `${level.unlocks} says "${text}", but level ${level.n} (${level.title}) unlocks it`);
  }
  for (const level of unlockers) {
    const upTo = Campaign.LEVELS.filter((l) => l.n <= level.n).map((l) => l.id);
    assert.strictEqual(Campaign.careerFrom(upTo), level.unlocks, `clearing level ${level.n} should promote you`);
  }
  // And a level is played at the career level it teaches, not one you have not met yet.
  for (const level of Campaign.LEVELS) {
    const openedBy = Campaign.careerFrom(Campaign.LEVELS.filter((l) => l.n < level.n).map((l) => l.id));
    const order = Content.LEVEL_ORDER;
    assert.ok(order.indexOf(level.setup.level) <= order.indexOf(openedBy) + 1,
      `level ${level.n} is played at ${level.setup.level} before the campaign has got there`);
  }
});

test('each role walks its own ladder', () => {
  const asDeveloper = {};
  for (const l of Campaign.LEVELS) asDeveloper[l.id] = ['developer'];
  assert.strictEqual(Campaign.clearedFor(asDeveloper, 'developer').length, Campaign.LEVELS.length);
  assert.deepStrictEqual(Campaign.clearedFor(asDeveloper, 'tester'), [], 'a tester has cleared nothing yet');
  // Which is the whole point: the tester is offered level 1, not the developer's next one.
  assert.strictEqual(Campaign.nextFor(Campaign.clearedFor(asDeveloper, 'tester')).n, 1);
  assert.strictEqual(Campaign.nextFor(Campaign.clearedFor(asDeveloper, 'developer')), null);
  // Two roles, two positions on the ladder, from one store.
  const mixed = { first: ['developer', 'tester'], read: ['developer'], 'never-quick': ['developer'] };
  assert.strictEqual(Campaign.nextFor(Campaign.clearedFor(mixed, 'tester')).n, 2);
  assert.strictEqual(Campaign.nextFor(Campaign.clearedFor(mixed, 'developer')).n, 4);
  // A level saved before roles were recorded counts for everyone: nobody is sent back down a ladder.
  const legacy = { first: [], read: [] };
  for (const roleId of Content.ROLE_ORDER) assert.strictEqual(Campaign.clearedFor(legacy, roleId).length, 2);
  assert.deepStrictEqual(Campaign.clearedFor(null, 'developer'), []);
});

test('a promotion belongs to the role that earned it', () => {
  const unlockers = Campaign.LEVELS.filter((l) => l.unlocks);
  // Cleared by a developer all the way down the ladder: the developer is a head, everyone else a junior.
  const asDeveloper = {};
  for (const l of Campaign.LEVELS) asDeveloper[l.id] = ['developer'];
  assert.strictEqual(Campaign.careerForRole(asDeveloper, 'developer'), 'head');
  for (const role of Content.ROLE_ORDER.filter((r) => r !== 'developer')) {
    assert.strictEqual(Campaign.careerForRole(asDeveloper, role), 'junior',
      `a ${role} should not inherit the developer's promotions`);
  }
  // Playing the same levels again as a tester earns the tester its own, without taking the developer's away.
  const both = {};
  for (const l of Campaign.LEVELS) both[l.id] = l.n <= unlockers[0].n ? ['developer', 'tester'] : ['developer'];
  assert.strictEqual(Campaign.careerForRole(both, 'tester'), 'senior', 'the tester has cleared as far as senior');
  assert.strictEqual(Campaign.careerForRole(both, 'developer'), 'head');
  // Nothing cleared, or cleared before roles were recorded, still starts at junior.
  assert.strictEqual(Campaign.careerForRole({}, 'developer'), 'junior');
  assert.strictEqual(Campaign.careerForRole({ [Campaign.LAST.id]: [] }, 'developer'), 'junior');
});

test('a goal only ever asks for something the rules already measure', () => {
  const summary = Core.summary(Core.createGame({ seed: 1, day: 'normal' }));
  for (const level of Campaign.LEVELS) {
    if (Campaign.isWeek(level)) continue; // judged on a week, checked above
    for (const g of level.goals) {
      assert.doesNotThrow(() => g.test(summary), `level ${level.n} goal "${g.label}" reads something that is not there`);
    }
  }
});

test('checking a run reports every goal, met or not', () => {
  const level = Campaign.byNumber[2];
  const failed = Core.summary(Core.createGame({ seed: level.setup.seed, day: level.setup.day }));
  const card = Campaign.check(level, failed);
  assert.strictEqual(card.length, level.goals.length, 'the card should show the whole level, not only the misses');
  assert.ok(!Campaign.cleared(card), 'a run that did nothing cannot have cleared anything');
});
