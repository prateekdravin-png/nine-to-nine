// A run of right calls banks seconds, and the bank comes off your next interruptions. Time is the
// biggest currency in this game, so what these hold is mostly what the reward must NOT be able to do:
// pay off a trap, reach a player who is falling for traps, or make handling an emergency yourself as
// cheap as having a colleague take it.
const test = require('node:test');
const assert = require('node:assert');
const Core = require('../core');
const { evaluate, playBot } = require('../bots');

const B = Core.TUNING.TIME_BONUS;
const seeds = Array.from({ length: 150 }, (_, i) => i + 1);

function quiet() {
  const s = Core.createGame({ seed: 1, day: 'normal' });
  s.schedule = [];
  s.events = [];
  return s;
}

// Answer `n` messages of a type correctly, the way a player would.
function rightCalls(s, n, type) {
  for (let i = 0; i < n; i++) {
    const card = Core.spawnCard(s, type || 'trap', i % 3);
    Core.act(s, card.id, type === 'urgent' ? 'respond' : 'ignore');
    s.busyUntil = 0; // step past the call without advancing the clock
  }
}

test('a run of right calls banks seconds, and a shorter run banks nothing', () => {
  const short = quiet();
  rightCalls(short, B.run - 1);
  assert.strictEqual(short.timeBank, 0, 'the run should not pay out early');

  const full = quiet();
  rightCalls(full, B.run);
  assert.strictEqual(full.timeBank, B.seconds);
  assert.strictEqual(full.stats.timeWon, B.seconds);
  assert.strictEqual(full.run, 0, 'the run starts again after it pays out');
});

test('one wrong call ends the run', () => {
  const s = quiet();
  rightCalls(s, B.run - 1);
  const trap = Core.spawnCard(s, 'trap', 0);
  Core.act(s, trap.id, 'respond'); // took the bait
  s.busyUntil = 0;
  assert.strictEqual(s.run, 0);
  rightCalls(s, B.run - 1);
  assert.strictEqual(s.timeBank, 0, 'the run should have had to start over');
});

test('hedging or stopping for small talk does not carry a run', () => {
  for (const [type, action] of [['trap', 'decline'], ['trivial', 'respond']]) {
    const s = quiet();
    rightCalls(s, B.run - 1);
    const card = Core.spawnCard(s, type, 0);
    Core.act(s, card.id, action);
    s.busyUntil = 0;
    assert.strictEqual(s.run, 0, `${action} on ${type} should end the run, not carry it`);
  }
});

test('a message left to run out never builds a run, but a missed emergency still ends one', () => {
  const s = quiet();
  rightCalls(s, B.run - 1);
  const trivial = Core.spawnCard(s, 'trivial', 0, 0.1);
  Core.step(s, 0.2, { holding: true });
  assert.strictEqual(s.cards.indexOf(trivial), -1, 'it should have expired');
  assert.strictEqual(s.timeBank, 0, 'walking away must not collect a payout');

  const urgent = Core.spawnCard(s, 'urgent', 0, 0.1);
  Core.step(s, 0.2, { holding: true });
  assert.strictEqual(s.cards.indexOf(urgent), -1);
  assert.strictEqual(s.run, 0, 'missing something urgent is still a miss');
});

test('the bank is spent automatically, and only down to the floor', () => {
  const s = quiet();
  s.timeBank = B.seconds;
  const card = Core.spawnCard(s, 'urgent', 0);
  const events = Core.act(s, card.id, 'respond');
  const respond = events.find((e) => e.type === 'respond');
  const full = Core.TUNING.RESPOND.urgent.busy;
  assert.ok(respond.busy < full, 'the call should have been shorter');
  assert.ok(respond.busy >= B.minBusy - 1e-9, 'but never shorter than the floor');
  assert.strictEqual(Math.round((s.timeBank + respond.saved) * 100) / 100, B.seconds, 'what was saved should come out of the bank');
});

test('the bank never pays for a trap', () => {
  const s = quiet();
  s.timeBank = B.seconds;
  const card = Core.spawnCard(s, 'trap', 0);
  const events = Core.act(s, card.id, 'respond');
  const respond = events.find((e) => e.type === 'respond');
  assert.strictEqual(respond.saved, 0, 'falling for a trap has to cost full price');
  assert.strictEqual(s.timeBank, B.seconds, 'and must not drain the bank');
});

test('a morning can never bank more than its ceiling', () => {
  const s = quiet();
  for (let i = 0; i < B.run * 6; i++) {
    const card = Core.spawnCard(s, 'trap', i % 3);
    Core.act(s, card.id, 'ignore');
  }
  assert.strictEqual(s.stats.timeWon, B.maxPerRound);
});

// The two claims that decide whether the reward is worth having at all.
test('it does not reach a player who is falling for traps', () => {
  const QUICK = 'Keyword reader: "quick" means trap'; // at senior, this bot takes every trap
  const gold = evaluate(QUICK, seeds, { level: 'senior', day: 'normal' }).goldRate;
  assert.ok(gold <= 0.1, `a reader who falls for every trap reached gold ${gold} of the time`);
});

// The margin for reading well is a career ladder: a junior is asked for most of the work and forgiven a
// few mistakes, so the two ways of playing sit closer together; a lead is asked for all of it and
// forgiven almost nothing, so they come apart. What must never happen is the margin closing at the top,
// or narrowing as you are promoted.
test('reading the messages beats answering everyone, by more the further up you go', () => {
  const margin = (level) => {
    const reading = evaluate('Perfect reader', seeds, { day: 'normal', level }).goldRate;
    const answering = evaluate('Sociable reader: answers all but traps', seeds, { day: 'normal', level }).goldRate;
    return reading - answering;
  };
  const junior = margin('junior');
  const senior = margin('senior');
  const lead = margin('lead');
  assert.ok(junior >= 0.2, `even a junior morning should reward reading (${junior.toFixed(2)})`);
  assert.ok(senior > junior, `senior should separate them further (${senior.toFixed(2)} against ${junior.toFixed(2)})`);
  assert.ok(lead > senior, `and lead further still (${lead.toFixed(2)} against ${senior.toFixed(2)})`);
  assert.ok(lead >= 0.4, `at the top the margin should be wide (${lead.toFixed(2)})`);
});

test('the seconds are worth something to a player who earns them', () => {
  let banked = 0;
  let spent = 0;
  for (const seed of seeds.slice(0, 60)) {
    const r = playBot(seed, 'Perfect reader', { day: 'normal' });
    banked += r.stats.timeWon;
    spent += r.stats.timeSaved;
  }
  assert.ok(banked / 60 >= B.seconds * 0.9, `a morning read well should earn it (${(banked / 60).toFixed(1)}s)`);
  assert.ok(spent / 60 >= 1, `and actually get to spend it (${(spent / 60).toFixed(1)}s)`);
});
