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
