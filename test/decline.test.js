// Saying no is the third option for a message you cannot read in time. What it has to be worth is
// narrow: cheaper than getting an urgent one wrong, dearer than getting it right, and identical for
// every type of message — the moment it costs more for one kind than another, it stops being a
// decision and becomes a way to ask the game what a message is.
const test = require('node:test');
const assert = require('node:assert');
const Core = require('../core');
const Content = require('../content');
const { evaluateHuman } = require('../bots');

const T = Core.TUNING;
const seeds = Array.from({ length: 120 }, (_, i) => i + 1);

function gameWith(type) {
  const s = Core.createGame({ seed: 42, day: 'normal' });
  s.schedule = []; // nothing arrives on its own; the test places the one message it cares about
  const card = Core.spawnCard(s, type, 0);
  return { s, card };
}

test('saying no costs the same whatever the message was', () => {
  const costs = ['urgent', 'trivial', 'trap'].map((type) => {
    const { s, card } = gameWith(type);
    const before = s.rep;
    Core.act(s, card.id, 'decline');
    return { type, rep: before - s.rep, busy: s.busyUntil - s.t, text: s.busyText };
  });
  const [first] = costs;
  for (const c of costs) {
    assert.strictEqual(c.rep, first.rep, `${c.type} costs a different amount of reputation`);
    assert.ok(Math.abs(c.busy - first.busy) < 1e-9, `${c.type} takes a different amount of time`);
    assert.strictEqual(c.text, first.text, `${c.type} shows different wording while you write the no`);
  }
  assert.strictEqual(first.rep, -T.DECLINE.rep, 'the cost should be the one in TUNING');
});

test('it is cheaper than getting an urgent one wrong and dearer than getting it right', () => {
  assert.ok(T.DECLINE.rep > T.IGNORE.urgent.rep, 'saying no must beat ignoring a real emergency');
  assert.ok(T.DECLINE.rep < T.RESPOND.urgent.rep, 'saying no must never beat actually handling it');
  assert.ok(T.DECLINE.rep < T.IGNORE.trap.rep, 'saying no must never beat spotting a trap');
});

test('the message is closed for good: nothing follows it up', () => {
  for (const type of ['urgent', 'trap']) {
    const { s, card } = gameWith(type);
    Core.act(s, card.id, 'decline');
    assert.strictEqual(s.pending.length, 0, `a declined ${type} came back`);
    assert.strictEqual(s.cards.length, 0);
  }
});

test('a declined urgent is not counted as one you missed', () => {
  const { s, card } = gameWith('urgent');
  Core.act(s, card.id, 'decline');
  assert.strictEqual(s.stats.urgentMissed, 0, 'you answered, just not the way they wanted');
  assert.strictEqual(s.stats.urgentHandled, 0, 'and you did not handle it either');
  assert.strictEqual(s.stats.declined, 1);
});

test('the share grid never marks saying no as right or as a disaster', () => {
  for (const type of ['urgent', 'trivial', 'trap']) {
    const { s, card } = gameWith(type);
    Core.act(s, card.id, 'decline');
    assert.strictEqual(s.stats.decisions[0].outcome, 'meh', `${type} produced the wrong square`);
  }
});

test('saying no to a whole morning never works, on any kind of morning', () => {
  for (const day of Core.DAY_ORDER) {
    const results = [1, 2, 3, 4, 5].map((seed) => {
      const s = Core.createGame({ seed, day });
      while (!s.over) {
        for (const card of s.cards.slice()) if (Core.canAct(s, 'decline')) Core.act(s, card.id, 'decline');
        Core.step(s, 0.05, { holding: true });
      }
      return Core.summary(s);
    });
    assert.ok(results.every((r) => r.rating.key !== 'gold'), `refusing everything reached gold on a ${day} morning`);
    assert.ok(results.some((r) => r.endReason === 'pip'), `refusing everything never ended in a PIP on a ${day} morning`);
  }
});

test('you cannot say no while stuck on a call or out on a fire drill', () => {
  const { s, card } = gameWith('trap');
  const other = Core.spawnCard(s, 'urgent', 0);
  Core.act(s, card.id, 'respond');           // now on a long call
  assert.ok(Core.isBusy(s));
  assert.strictEqual(Core.canAct(s, 'decline'), false);
  const before = s.rep;
  const events = Core.act(s, other.id, 'decline');
  assert.strictEqual(events[0].type, 'rejected');
  assert.strictEqual(s.rep, before, 'the refusal must not cost anything');
});

// The whole point of the verb, and the only claim that matters: knowing that you cannot tell has to be
// worth more than guessing, and still worth less than being able to read the message.
test('knowing you cannot tell beats guessing, and still loses to reading it', () => {
  const guessing = evaluateHuman('First-time player', seeds, { accuracy: 0.8, day: 'normal' });
  const sayingNo = evaluateHuman('First-time player', seeds, { accuracy: 0.8, verbs: 'hedge', day: 'normal' });
  const reading = evaluateHuman('First-time player', seeds, { accuracy: 1, day: 'normal' });
  assert.ok(sayingNo.goldRate > guessing.goldRate + 0.1,
    `saying no when unsure (${sayingNo.goldRate}) should clearly beat guessing (${guessing.goldRate})`);
  assert.ok(sayingNo.goldRate < reading.goldRate,
    `saying no (${sayingNo.goldRate}) must not reach a reader who is never unsure (${reading.goldRate})`);
});

test('a reader who is never unsure never needs it', () => {
  const reading = evaluateHuman('First-time player', seeds, { accuracy: 1, verbs: 'hedge', day: 'normal' });
  assert.strictEqual(reading.declined, 0, 'it should be worth nothing to someone who can read every message');
});

test('the busy line while you write a no says nothing about the message', () => {
  const line = Content.BUSY_TEXT.decline;
  assert.ok(line, 'there has to be one');
  for (const type of ['urgent', 'trivial', 'trap']) {
    assert.notStrictEqual(line, Content.BUSY_TEXT[type], `it must not reuse the ${type} line`);
  }
});
