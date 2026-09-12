// Run with: npm test
// Colleague favours: answering a colleague's small talk banks a favour, and passing a message on spends
// it. These pin the rules, the content they depend on, and the balance: favours should pay, but never
// more than reading messages well.
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core');
const { ROLES, ROLE_ORDER } = require('../content');
const T = Core.TUNING;

function quiet() {
  const s = Core.createGame({ seed: 1 });
  s.schedule = [];
  return s;
}
const devSmallTalk = ROLES.developer.messages.trivial;
const colleague = devSmallTalk.findIndex((m) => m.favour);
const notColleague = devSmallTalk.findIndex((m) => !m.favour);
const free = (s) => { s.busyUntil = 0; };

test("replying to a colleague's small talk banks a favour; bots, group chats and family don't", () => {
  const s = quiet();
  const events = Core.act(s, Core.spawnCard(s, 'trivial', colleague).id, 'respond');
  assert.deepEqual(s.favours, [devSmallTalk[colleague].favour]);
  assert.equal(events[0].favour, devSmallTalk[colleague].favour);
  assert.ok(Core.isBusy(s), 'replying still takes time');
  free(s);
  Core.act(s, Core.spawnCard(s, 'trivial', notColleague).id, 'respond');
  assert.equal(s.favours.length, 1);
  Core.act(s, Core.spawnCard(s, 'trivial', colleague).id, 'ignore');
  assert.equal(s.favours.length, 1, 'ignoring banks nothing');
  assert.equal(s.stats.favoursBanked, 1);
});

test('you can be owed only so many favours', () => {
  const s = quiet();
  let last;
  for (let i = 0; i < T.FAVOURS.max + 1; i++) {
    last = Core.act(s, Core.spawnCard(s, 'trivial', colleague).id, 'respond');
    free(s);
  }
  assert.equal(s.favours.length, T.FAVOURS.max);
  assert.equal(s.stats.favoursBanked, T.FAVOURS.max);
  assert.equal(last[0].favour, null);
  assert.equal(last[0].favourFull, true);
});

test('a colleague handles something urgent for you: no call, no lost focus, some credit', () => {
  const s = quiet();
  s.favours = ['Kiran'];
  s.flow = 100;
  const rep = s.rep;
  const events = Core.act(s, Core.spawnCard(s, 'urgent', 0).id, 'delegate');
  assert.deepEqual(events.map((e) => [e.type, e.helper, e.rep]), [['delegate', 'Kiran', T.FAVOURS.urgentRep]]);
  assert.equal(Core.isBusy(s), false);
  assert.equal(s.flow, 100);
  assert.equal(s.rep, rep + T.FAVOURS.urgentRep);
  assert.ok(T.FAVOURS.urgentRep < T.RESPOND.urgent.rep, 'handling it yourself earns more credit');
  assert.deepEqual(s.favours, []);
  assert.deepEqual([s.stats.urgentHandled, s.stats.urgentDelegated, s.stats.favoursUsed], [1, 1, 1]);
  assert.equal(s.stats.decisions[0].outcome, 'good');
});

test("a favour works even while you're stuck on a call: the rescue", () => {
  const s = quiet();
  s.favours = ['Swathi'];
  Core.act(s, Core.spawnCard(s, 'trap', 0).id, 'respond');
  assert.ok(Core.isBusy(s));
  const urgent = Core.spawnCard(s, 'urgent', 0);
  const other = Core.spawnCard(s, 'urgent', 1);
  assert.deepEqual(Core.act(s, other.id, 'respond').map((e) => e.reason), ['busy'], 'answering yourself still has to wait');
  assert.equal(Core.act(s, urgent.id, 'delegate')[0].type, 'delegate');
  assert.ok(!s.cards.includes(urgent));
});

test('favours are spent oldest first, and wasted on anything that is not urgent', () => {
  const s = quiet();
  s.favours = ['Kiran', 'Swathi'];
  const trap = Core.act(s, Core.spawnCard(s, 'trap', 0).id, 'delegate')[0];
  const chat = Core.act(s, Core.spawnCard(s, 'trivial', 0).id, 'delegate')[0];
  assert.deepEqual([trap.helper, chat.helper], ['Kiran', 'Swathi']);
  assert.equal(Core.isBusy(s), false, 'you never take the trap yourself');
  assert.match(s.stats.aftermaths[0], /Kiran/);
  assert.deepEqual([s.stats.favoursUsed, s.stats.urgentDelegated, s.stats.trapsDodged], [2, 0, 1]);
  assert.deepEqual(s.stats.decisions.map((d) => d.outcome), ['meh', 'meh']);
});

test('nobody owes you, nobody to pass it to', () => {
  const s = quiet();
  const card = Core.spawnCard(s, 'urgent', 0);
  assert.deepEqual(Core.act(s, card.id, 'delegate').map((e) => [e.type, e.reason]), [['rejected', 'no-favour']]);
  assert.ok(s.cards.includes(card));
});

test('every role has colleagues to befriend, and favours only come from small talk', () => {
  for (const id of ROLE_ORDER) {
    const { urgent, trivial, trap } = ROLES[id].messages;
    const colleagues = trivial.filter((m) => m.favour);
    assert.ok(colleagues.length >= 3, `${id} needs at least 3 colleagues' small talk (has ${colleagues.length})`);
    for (const m of colleagues) assert.ok(typeof m.favour === 'string' && m.favour.trim(), `${id}: "${m.text}" names who owes you`);
    for (const m of [...urgent, ...trap]) assert.equal(m.favour, undefined, `${id}: only small talk gives favours ("${m.text}")`);
  }
});

// Before tuning, replying cost as much focus as a favour later saved, so favours were worth 0.3% to a
// perfect reader: invisible. Faster replies fixed that, but pushed too far they let favours replace
// reading well. These pin both sides.
test('design: favours pay, but never more than reading messages well', () => {
  const { evaluate, evaluateHuman } = require('../bots');
  const seeds = Array.from({ length: 200 }, (_, i) => i + 1);
  const perfect = evaluate('Perfect reader', seeds);
  const perfectFavours = evaluate('Perfect reader + favours', seeds);
  const ninetyFavours = evaluate('90% accurate + favours', seeds);
  const firstTimer = evaluateHuman('First-time player', seeds, { accuracy: 0.85 });
  const firstTimerFavours = evaluateHuman('First-time player', seeds, { accuracy: 0.85, favours: true });

  assert.ok(T.FAVOURS.replyBusy < T.RESPOND.trivial.busy, "a colleague's reply is quicker than other small talk");
  assert.ok(perfectFavours.urgentDelegated >= 1, `favour players should actually use favours (${perfectFavours.urgentDelegated} per round)`);
  assert.ok(perfectFavours.avgScore >= perfect.avgScore * 1.015, `favours should pay a perfect reader (${perfect.avgScore.toFixed(0)} → ${perfectFavours.avgScore.toFixed(0)})`);
  assert.ok(firstTimerFavours.avgScore >= firstTimer.avgScore * 1.02, `favours should pay a typical first-timer (${firstTimer.avgScore.toFixed(0)} → ${firstTimerFavours.avgScore.toFixed(0)})`);
  assert.ok(ninetyFavours.avgScore < perfect.avgScore, `a worse reader with favours (${ninetyFavours.avgScore.toFixed(0)}) must not beat a better reader without (${perfect.avgScore.toFixed(0)})`);
});
