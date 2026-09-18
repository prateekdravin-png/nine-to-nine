// Run with: npm test
// Achievements and the desk objects they unlock. They are cosmetic by design, so these tests pin the
// conditions, that every award unlocks its own object, and that nothing is handed out twice.
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core');
const Awards = require('../awards');
const { ROLE_ORDER } = require('../content');

// A finished round, with everything at zero unless the test says otherwise.
function round(context) {
  const stats = Object.assign({
    urgentHandled: 0, urgentMissed: 0, trapsTaken: 0, trapsDodged: 0, trivialAnswered: 0, trivialIgnored: 0,
    peeks: 0, cardsSeen: 20, headphonesUsed: 0, favoursBanked: 0, favoursUsed: 0, urgentDelegated: 0,
    followUps: 0, escalations: 0, walkbyPassed: 0, walkbyCaught: 0, rescues: 0,
    busyTime: 0, deepWorkTime: 0, codingTime: 0, peakFlow: 0
  }, context.stats);
  return Object.assign({
    finished: false, rating: 'silver', mode: 'practice', role: 'developer', events: [],
    rounds: 1, rolesFinished: ['developer'], streak: 0
  }, context, { stats });
}
const earns = (context, already) => Awards.earnedBy(round(context), already);

test('every award is complete and unlocks an object of its own', () => {
  const ids = Awards.AWARDS.map((a) => a.id);
  const props = Awards.AWARDS.map((a) => a.prop);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.equal(new Set(props).size, props.length, 'each award unlocks a different object');
  assert.ok(ids.length >= 8, `a deck worth collecting (${ids.length})`);
  for (const a of Awards.AWARDS) {
    assert.ok(a.emoji && a.name && a.hint && a.unlocks, a.id);
    assert.equal(typeof a.earned, 'function', a.id);
  }
});

test('each achievement is earned by what it says, and nothing else', () => {
  assert.deepEqual(earns({ rounds: 1 }), ['first'], 'finishing a first morning');
  assert.ok(earns({ rounds: 3, stats: { trapsDodged: 6 } }).includes('firewall'));
  assert.ok(!earns({ rounds: 3, stats: { trapsDodged: 5 } }).includes('firewall'));
  assert.ok(earns({ rounds: 3, finished: true }).includes('spotless'));
  assert.ok(!earns({ rounds: 3, finished: true, stats: { urgentMissed: 1 } }).includes('spotless'), 'one missed emergency is enough to lose it');
  assert.ok(!earns({ rounds: 3, finished: false }).includes('spotless'), 'the work has to be finished');
  assert.ok(earns({ rounds: 3, stats: { deepWorkTime: 40 } }).includes('deepdiver'));
  assert.ok(earns({ rounds: 3, stats: { rescues: 1 } }).includes('rescue'));
  assert.ok(earns({ rounds: 3, rolesFinished: ROLE_ORDER.slice() }).includes('allroles'));
  assert.ok(!earns({ rounds: 3, rolesFinished: ROLE_ORDER.slice(0, 4) }).includes('allroles'));
  assert.ok(earns({ rounds: 3, streak: 3 }).includes('streak3'));
  assert.ok(earns({ rounds: 10 }).includes('regular'));
  assert.ok(earns({ rounds: 3, mode: 'daily', rating: 'gold' }).includes('goldendaily'));
  assert.ok(!earns({ rounds: 3, mode: 'practice', rating: 'gold' }).includes('goldendaily'), 'practice rounds do not count');
  assert.ok(earns({ rounds: 3, events: ['drill', 'outage'] }).includes('survivor'));
  assert.ok(!earns({ rounds: 3, events: ['drill'] }).includes('survivor'));
});

test('an award is only handed out once', () => {
  const first = earns({ rounds: 1 });
  assert.deepEqual(first, ['first']);
  assert.deepEqual(earns({ rounds: 2 }, first), [], 'already unlocked');
});

test('unlocked awards map to the objects the office draws', () => {
  assert.deepEqual(Awards.propsFor(['first', 'firewall']), ['notes', 'plant']);
  assert.deepEqual(Awards.propsFor([]), []);
  assert.deepEqual(Awards.propsFor(['nonsense']), []);
});

test('every object an award unlocks is drawn in the office', () => {
  const scene = require('fs').readFileSync(require('path').join(__dirname, '..', 'scene.js'), 'utf8');
  for (const a of Awards.AWARDS) assert.ok(scene.includes(`prop prop-${a.prop}"`), `scene.js has no ${a.prop} for ${a.id}`);
});

test('star milestones count campaign stars, climb in order, and end at every star there is', () => {
  const Campaign = require('../campaign');
  const Rewards = require('../rewards');
  const max = Campaign.LEVELS.length * Rewards.MAX_STARS;
  const needs = Awards.MILESTONES.map((a) => (a.stars === 'all' ? max : a.stars));
  assert.deepEqual(needs.slice().sort((x, y) => x - y), needs, 'listed in the order they are reached');
  assert.equal(new Set(needs).size, needs.length);
  assert.ok(needs[needs.length - 2] < max, 'every numbered milestone is reachable before the last one');
  assert.equal(Awards.MILESTONES[Awards.MILESTONES.length - 1].stars, 'all');

  assert.deepEqual(Awards.earnedByStars(19, max), []);
  assert.deepEqual(Awards.earnedByStars(20, max), ['stars20']);
  assert.deepEqual(Awards.earnedByStars(max, max), ['stars20', 'stars40', 'allstars']);
  assert.deepEqual(Awards.earnedByStars(max, max, ['stars20']), ['stars40', 'allstars'], 'never twice');
  assert.deepEqual(Awards.earnedByStars(max - 1, max), ['stars20', 'stars40'], 'one short of every star is not every star');
  // A finished round sees them too, so a morning that tips the count over hands the object out then.
  assert.ok(earns({ rounds: 3, stars: 40, maxStars: max }).includes('stars40'));
  assert.ok(!earns({ rounds: 3 }).some((id) => id.startsWith('stars')), 'no stars known, no milestone');

  assert.deepEqual([Awards.nextMilestone(0, max).award.id, Awards.nextMilestone(0, max).need], ['stars20', 20]);
  assert.deepEqual([Awards.nextMilestone(25, max).award.id, Awards.nextMilestone(25, max).need], ['stars40', 40]);
  assert.equal(Awards.nextMilestone(41, max).need, max);
  assert.equal(Awards.nextMilestone(max, max), null);
});

test('rescuing an emergency mid-call is counted by the rules', () => {
  const s = Core.createGame({ seed: 1 });
  s.schedule = [];
  s.events = [];
  s.favours = ['Kiran', 'Swathi'];
  Core.act(s, Core.spawnCard(s, 'trap', 0).id, 'respond'); // now stuck on a pointless call
  assert.ok(Core.isBusy(s));
  Core.act(s, Core.spawnCard(s, 'urgent', 0).id, 'delegate');
  assert.equal(s.stats.rescues, 1);
  s.busyUntil = 0;
  Core.act(s, Core.spawnCard(s, 'urgent', 1).id, 'delegate'); // free to answer: not a rescue
  assert.equal(s.stats.rescues, 1);
  assert.equal(s.stats.urgentDelegated, 2);
});
