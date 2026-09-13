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
  lead: { strategy: 'Perfect reader' }
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
  lead: 'Keyword reader: alarm words mean urgent'
};

const play = (level, role, strategy, opts) =>
  playBot(level.setup.seed, strategy, Object.assign({ role, day: level.setup.day, level: level.setup.level }, opts));

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
      const result = play(level, role, approach.strategy, { headphonesAt: approach.headphonesAt });
      const card = Campaign.check(level, result);
      assert.ok(Campaign.cleared(card),
        `level ${level.n} (${level.id}) as ${role}: ${card.filter((g) => !g.done).map((g) => g.label).join(', ')}`);
    }
  }
});

test('no level falls to a player who has not learned it', () => {
  for (const level of Campaign.LEVELS) {
    if (!NAIVE[level.id]) continue;
    const result = play(level, 'developer', NAIVE[level.id]);
    assert.ok(!Campaign.cleared(Campaign.check(level, result)),
      `level ${level.n} (${level.id}) was cleared by "${NAIVE[level.id]}", so it does not test its own lesson`);
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

test('the next level is the first one not yet done', () => {
  assert.strictEqual(Campaign.nextFor([]).n, 1);
  assert.strictEqual(Campaign.nextFor(['first']).n, 2);
  assert.strictEqual(Campaign.nextFor(Campaign.LEVELS.map((l) => l.id)), null, 'the ladder should end');
});

test('career levels are campaign rewards, and arrive in order', () => {
  assert.strictEqual(Campaign.careerFrom([]), 'junior');
  const unlockers = Campaign.LEVELS.filter((l) => l.unlocks);
  assert.deepStrictEqual(unlockers.map((l) => l.unlocks), ['senior', 'lead'],
    'the ladder should hand out senior before lead');
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

test('a goal only ever asks for something the rules already measure', () => {
  const summary = Core.summary(Core.createGame({ seed: 1, day: 'normal' }));
  for (const level of Campaign.LEVELS) {
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
