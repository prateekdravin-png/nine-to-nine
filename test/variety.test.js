// Run with: npm test
// Message variety: rounds should not feel like the same short list. Messages are dealt from shuffled
// decks (core.js), so a round never repeats one while unseen ones remain, and practice rounds put
// recently seen messages last. The daily morning passes no history, so it stays the same for everyone.
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core');
const { ROLES, ROLE_ORDER, LEVEL_ORDER } = require('../content');

const TYPES = ['urgent', 'trivial', 'trap'];
const textsOf = (s, type) => s.schedule.filter((a) => a.type === type).map((a) => ROLES[s.role].byLevel[s.level][type][a.msgIndex].text);

test('a round never repeats a message while unseen ones remain', () => {
  for (const role of ROLE_ORDER) {
    for (const level of LEVEL_ORDER) {
      for (let seed = 1; seed <= 40; seed++) {
        const s = Core.createGame({ seed, role, level });
        for (const type of TYPES) {
          const texts = textsOf(s, type);
          const poolSize = ROLES[role].byLevel[level][type].length;
          const beforeReshuffle = texts.slice(0, poolSize);
          assert.equal(new Set(beforeReshuffle).size, beforeReshuffle.length, `${role}/${level} seed ${seed}: a ${type} message repeated`);
        }
      }
    }
  }
});

test('different rounds deal different messages, and over a few rounds you see most of them', () => {
  const pool = ROLES.tester.messages.urgent;
  const seen = new Set();
  const firstMessages = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const texts = textsOf(Core.createGame({ seed, role: 'tester' }), 'urgent');
    texts.forEach((t) => seen.add(t));
    firstMessages.add(texts[0]);
  }
  assert.ok(seen.size >= pool.length - 1, `12 rounds should show nearly every urgent message (saw ${seen.size} of ${pool.length})`);
  assert.ok(firstMessages.size >= 6, `rounds should not all open the same way (${firstMessages.size} different first messages)`);
});

test('practice rounds deal recently seen messages last', () => {
  for (const role of ROLE_ORDER) {
    const first = Core.createGame({ seed: 7, role });
    const recent = TYPES.flatMap((type) => textsOf(first, type));
    const next = Core.createGame({ seed: 8, role, recent });
    for (const type of TYPES) {
      const pool = ROLES[role].messages[type];
      const unseen = pool.filter((m) => !recent.includes(m.text)).length;
      const texts = textsOf(next, type).slice(0, unseen);
      for (const t of texts) assert.ok(!recent.includes(t), `${role}: "${t}" was seen last round but dealt before unseen ${type} messages`);
    }
  }
});

test('history changes which messages appear, never when they arrive; the daily morning ignores it', () => {
  const plain = Core.createGame({ seed: 21, role: 'manager' });
  const withHistory = Core.createGame({ seed: 21, role: 'manager', recent: TYPES.flatMap((type) => textsOf(plain, type)) });
  const rhythm = (s) => s.schedule.map((a) => [a.at, a.type, a.life]);
  assert.deepEqual(rhythm(withHistory), rhythm(plain));
  assert.notDeepEqual(withHistory.schedule.map((a) => a.msgIndex), plain.schedule.map((a) => a.msgIndex));
  assert.deepEqual(Core.createGame({ seed: 21, role: 'manager', recent: [] }).schedule, plain.schedule, 'no history = the shared morning');
});
