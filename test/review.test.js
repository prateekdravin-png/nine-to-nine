// "What you misread" explains a wrong call by pointing at the words that were on the screen, so two
// things have to hold: it never explains a message you read correctly (that would spoil one you had
// already earned), and the word it quotes is really in the message rather than assumed from the level.
const test = require('node:test');
const assert = require('node:assert');
const Core = require('../core');
const Review = require('../review');

// A finished morning in the shape core.js hands over, without playing one.
const summaryWith = (misreads, level) => ({ level: level || 'junior', stats: { misreads } });
const miss = (over) => Object.assign({ at: 5, type: 'trap', action: 'respond', from: 'Ramesh · Manager', text: 'Quick call?' }, over);

test('only wrong calls are explained, worst first', () => {
  const items = Review.review(summaryWith([
    miss({ at: 9, type: 'trap', action: 'respond', text: 'Just a small favour' }),
    miss({ at: 3, type: 'urgent', action: 'decline', text: 'Payments are failing' }),
    miss({ at: 1, type: 'urgent', action: 'expired', text: 'Prod is down, customers are stuck' })
  ]));
  assert.deepStrictEqual(items.map((i) => i.kind), ['missed', 'trap', 'declined'], 'an emergency left to burn, then an hour lost to a trap, then a polite no to something real');
  assert.strictEqual(items.length, 3);
  for (const item of items) {
    assert.ok(item.title && item.tell.endsWith('.') && item.better.endsWith('.'), `${item.kind} needs a title, a tell and what to do next time`);
    assert.ok(item.text && item.from, 'the message it is about is quoted');
  }
});

test('a second lesson beats a third example of the first', () => {
  // Four emergencies missed and one trap taken is two lessons. Filling all three slots with missed
  // emergencies would repeat one tell three times and drop the other lesson entirely.
  const misreads = [
    miss({ at: 1, type: 'urgent', action: 'expired', text: 'Team is blocked on your API change' }),
    miss({ at: 2, type: 'urgent', action: 'expired', text: 'Login latency tripled' }),
    miss({ at: 3, type: 'urgent', action: 'expired', text: 'Escalated: still not handled' }),
    miss({ at: 4, type: 'urgent', action: 'expired', text: 'Your token leaked' }),
    miss({ at: 5, type: 'trap', action: 'respond', text: 'Quick review of my proposal?' })
  ];
  const kinds = Review.review(summaryWith(misreads)).map((i) => i.kind);
  assert.deepStrictEqual(kinds, ['missed', 'trap', 'missed'], 'the trap taken is shown before a third missed emergency');
});

test('at most three, so a result screen stays a result screen', () => {
  const many = Array.from({ length: 7 }, (_, i) => miss({ at: i }));
  const items = Review.review(summaryWith(many));
  assert.strictEqual(items.length, Review.MAX);
  assert.strictEqual(Review.heading(items, many.length), 'The 3 that cost you most, of 7 wrong calls');
  assert.strictEqual(Review.heading([], 0), null, 'a clean morning says nothing at all');
  assert.strictEqual(Review.heading([items[0]], 1), 'One wrong call');
});

test('the tell is quoted from the message, and changes with your career level', () => {
  const junior = Review.review(summaryWith([miss({ text: 'Quick sync on the pricing thing?' })], 'junior'))[0];
  assert.match(junior.tell, /“Quick”/, 'a junior trap gives itself away with the minimising word it used');

  const senior = Review.review(summaryWith([miss({ text: 'Thoughts on the roadmap whenever you get a moment?' })], 'senior'))[0];
  assert.match(senior.tell, /Nothing was actually broken/);
  assert.ok(!/“/.test(senior.tell), 'a senior trap has no word to point at, so it quotes nothing');

  const lead = Review.review(summaryWith([miss({ text: 'URGENT: need your sign-off on the deck' })], 'lead'))[0];
  assert.match(lead.tell, /“URGENT”/);

  const emergency = Review.review(summaryWith([miss({ type: 'urgent', action: 'ignore', text: 'Checkout is down for everyone' })], 'senior'))[0];
  assert.match(emergency.tell, /broken/);
  assert.strictEqual(emergency.emoji, '🚨');
});

test('a morning read cleanly has nothing to review', () => {
  assert.deepStrictEqual(Review.review(summaryWith([])), []);
  assert.deepStrictEqual(Review.review(null), []);
  assert.deepStrictEqual(Review.review({ level: 'junior', stats: {} }), []);
});

test('a real morning records what it should, and the shared grid still carries no message text', () => {
  const s = Core.createGame({ seed: 7, role: 'developer', level: 'junior', day: 'normal' });
  const events = [];
  // The emergency first: answering the trap puts you on a call, and you cannot act on anything else while stuck.
  const urgent = Core.spawnCard(s, 'urgent', 0, 30);
  Core.act(s, urgent.id, 'ignore', events);
  const trap = Core.spawnCard(s, 'trap', 0, 30);
  Core.act(s, trap.id, 'respond', events);
  const small = Core.spawnCard(s, 'trivial', 0, 30);
  Core.act(s, small.id, 'ignore', events); // read correctly, so it is never reviewed

  const result = Core.summary(s);
  assert.strictEqual(result.stats.misreads.length, 2, 'the trap taken and the emergency left');
  for (const m of result.stats.misreads) assert.ok(m.text && m.from && m.type, 'kept with enough to explain itself');
  for (const d of result.stats.decisions) assert.deepStrictEqual(Object.keys(d).sort(), ['at', 'outcome'], 'the shared grid stays verdicts only');

  const items = Review.review(result);
  assert.deepStrictEqual(items.map((i) => i.kind), ['missed', 'trap']);
  assert.ok(!items.some((i) => i.text === small.text), 'a message you read correctly is never shown');
});
