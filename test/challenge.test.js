// What a challenge link has to guarantee: the recipient plays the same morning the sender played, the
// link survives a chat app, a mangled link is refused rather than quietly played as something else,
// and nothing in it identifies anybody.
const test = require('node:test');
const assert = require('node:assert');
const Challenge = require('../challenge');
const Core = require('../core');
const Content = require('../content');
const { playBot } = require('../bots');
const Daily = require('../daily');
const { cleanEvent } = require('../server');

const sample = {
  seed: 3735928559,
  role: 'tester',
  level: 'senior',
  variant: false,
  score: 812,
  rating: 'gold'
};

test('a challenge survives the round trip through a link', () => {
  const url = Challenge.linkFor('http://192.168.1.7:8910/', sample);
  assert.match(url, /^http:\/\/192\.168\.1\.7:8910\/#c=/);
  assert.deepStrictEqual(Challenge.decode(Challenge.codeFromUrl(url)), sample);
});

test('every role, level and rating encodes', () => {
  for (const role of Content.ROLE_ORDER) {
    for (const level of Content.LEVEL_ORDER) {
      for (const rating of Object.keys(Core.RATINGS)) {
        const c = { seed: 1, role, level, variant: true, score: 0, rating };
        assert.deepStrictEqual(Challenge.decode(Challenge.encode(c)), c, `${role}/${level}/${rating}`);
      }
    }
  }
});

test('the code stays short enough to paste anywhere', () => {
  const worst = Challenge.encode({ seed: 0xffffffff, role: Content.ROLE_ORDER[0], level: 'lead', variant: true, score: 999999, rating: 'gold' });
  assert.ok(worst.length <= 32, `code is ${worst.length} characters: ${worst}`);
});

test('a link a chat app has chewed on is refused, not played as something else', () => {
  const code = Challenge.encode(sample);
  const broken = [
    code.slice(0, -1),                                   // truncated
    code.slice(1),                                       // a leading character eaten
    code.replace(/\.(\w+)$/, '.zzz'),                    // checksum replaced
    code.split('.').slice(0, 6).join('.'),               // a field lost
    code.replace('1.', '2.'),                            // a version this page doesn't know
    '', 'hello', '....', null, undefined, 42
  ];
  for (const bad of broken) assert.strictEqual(Challenge.decode(bad), null, `accepted ${bad}`);
  // One flipped character anywhere in the payload has to fail the checksum.
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '.') continue;
    const flipped = code.slice(0, i) + (code[i] === 'a' ? 'b' : 'a') + code.slice(i + 1);
    if (flipped !== code) assert.strictEqual(Challenge.decode(flipped), null, `accepted a flip at ${i}`);
  }
});

test('trailing punctuation from a chat message is trimmed off', () => {
  const code = Challenge.encode(sample);
  assert.strictEqual(Challenge.codeFromUrl(`http://host/game#c=${code}.`), code);
  assert.strictEqual(Challenge.codeFromUrl(`http://host/game#c=${code}`), code);
  assert.strictEqual(Challenge.codeFromUrl('http://host/game'), null);
  assert.strictEqual(Challenge.codeFromUrl('http://host/game#c='), null);
});

test('the link carries nothing about the person who sent it', () => {
  const decoded = Challenge.decode(Challenge.encode(sample));
  assert.deepStrictEqual(Object.keys(decoded).sort(), ['level', 'rating', 'role', 'score', 'seed', 'variant']);
});

// The point of the whole feature: both players get the same morning, so the two scores mean something.
test('both players get the same morning from the same link', () => {
  const c = Challenge.decode(Challenge.encode(sample));
  const opts = { role: c.role, level: c.level, seed: c.seed, peekVariant: c.variant };
  const sender = Core.createGame(opts);
  const recipient = Core.createGame(opts);
  assert.strictEqual(recipient.boss, sender.boss);
  assert.deepStrictEqual(recipient.events.map((e) => [e.id, e.at]), sender.events.map((e) => [e.id, e.at]));
  assert.deepStrictEqual(
    recipient.schedule.map((m) => [m.at, m.type, m.msgIndex]),
    sender.schedule.map((m) => [m.at, m.type, m.msgIndex])
  );
  // And playing it the same way lands on the same score, which is what a challenge compares.
  const bot = { role: c.role, level: c.level };
  assert.strictEqual(playBot(c.seed, '80% accurate reader', bot).score, playBot(c.seed, '80% accurate reader', bot).score);
});

// The senders' and recipients' message histories differ, and must not make one morning harder.
test('a different message history changes the wording, never the morning', () => {
  const c = Challenge.decode(Challenge.encode(sample));
  const base = { role: c.role, level: c.level, seed: c.seed, peekVariant: c.variant };
  const fresh = Core.createGame(base);
  // The recipient has just seen every message this morning deals, so the dealer moves them to the back.
  const pools = Content.ROLES[c.role].byLevel[c.level];
  const seen = fresh.schedule.filter((m) => !m.colleague).map((m) => pools[m.type][m.msgIndex].text);
  const seenPlenty = Core.createGame(Object.assign({ recent: seen }, base));
  assert.deepStrictEqual(
    seenPlenty.schedule.map((m) => [m.at, m.type]),
    fresh.schedule.map((m) => [m.at, m.type]),
    'arrival times and message types have to be identical for the scores to compare'
  );
  assert.notDeepStrictEqual(
    seenPlenty.schedule.map((m) => m.msgIndex),
    fresh.schedule.map((m) => m.msgIndex),
    'the wording should move, or this test is proving nothing'
  );
});

// The stats endpoint has to accept the two halves of the loop and keep rejecting anything else.
test('the server records a challenge and nothing it cannot check', () => {
  const player = '0123456789abcdef';
  const day = Daily.morningNumber(Date.now());
  const done = { player, day, kind: 'challenge', role: 'tester', level: 'senior', rating: 'gold', score: 812, deepWork: 41.2, beat: true };
  for (const kind of ['invite', 'accept']) {
    assert.strictEqual(cleanEvent(JSON.stringify({ player, day, kind })).kind, kind);
  }
  assert.strictEqual(cleanEvent(JSON.stringify(done)).beat, true);
  assert.strictEqual(cleanEvent(JSON.stringify(Object.assign({}, done, { beat: undefined }))), null);
  assert.strictEqual(cleanEvent(JSON.stringify(Object.assign({}, done, { beat: 'yes' }))), null);
  assert.strictEqual(cleanEvent(JSON.stringify(Object.assign({}, done, { role: 'ceo' }))), null);
  assert.strictEqual(cleanEvent(JSON.stringify({ player, day, kind: 'rematch' })), null);
  // The link itself is never sent, so a code in the body is not a field the server knows.
  assert.strictEqual(cleanEvent(JSON.stringify(Object.assign({}, done, { code: Challenge.encode(sample) }))).code, undefined);
});
