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

// The complaint this exists to prevent: "I keep seeing the same messages." A single round has never
// repeated one, but that was never the problem — the problem is five rounds in a row, which is exactly
// what the work week asks you to play. A pool only two mornings deep makes the third morning a rerun
// however well any one round is dealt.
test('a whole week of mornings does not feel like the same short list', () => {
  const MORNINGS = 5;
  for (const role of ROLE_ORDER) {
    for (const level of LEVEL_ORDER) {
      for (const start of [1, 500, 9000]) {
        const counts = new Map();
        let dealt = 0;
        let recent = [];
        for (let i = 0; i < MORNINGS; i++) {
          const s = Core.createGame({ seed: start + i * 7919, role, level, recent });
          for (const type of TYPES) {
            for (const text of textsOf(s, type)) {
              counts.set(text, (counts.get(text) || 0) + 1);
              dealt++;
              recent.push(text);
            }
          }
          recent = recent.slice(-120);
        }
        const worst = Math.max(...counts.values());
        const distinct = counts.size;
        // Five mornings deal about 33 urgent messages from a pool of 19, so a third showing is
        // arithmetic, not a content problem. What must not happen is a message becoming a fixture.
        assert.ok(worst <= 4, `${role}/${level} from seed ${start}: one message turned up ${worst} times in ${MORNINGS} mornings`);
        // Over a week you should end up having seen essentially your whole pool rather than a rotating
        // handful of it, which is the ceiling the deck can reach and the thing that was actually wrong.
        const pool = TYPES.reduce((sum, type) => sum + ROLES[role].byLevel[level][type].length, 0);
        assert.ok(distinct >= pool * 0.9,
          `${role}/${level} from seed ${start}: saw ${distinct} of ${pool} messages in ${MORNINGS} mornings (${dealt} dealt)`);
      }
    }
  }
});

// Each pool has to be deep enough that a morning cannot eat most of it.
test('no morning gets through more than a third of any pool', () => {
  for (const role of ROLE_ORDER) {
    for (const level of LEVEL_ORDER) {
      const dealtPerMorning = { urgent: 0, trivial: 0, trap: 0 };
      const rounds = 60;
      for (let seed = 1; seed <= rounds; seed++) {
        const s = Core.createGame({ seed, role, level });
        for (const type of TYPES) dealtPerMorning[type] += textsOf(s, type).length;
      }
      for (const type of TYPES) {
        const perMorning = dealtPerMorning[type] / rounds;
        const pool = ROLES[role].byLevel[level][type].length;
        assert.ok(perMorning / pool <= 0.34,
          `${role}/${level}: a morning deals ${perMorning.toFixed(1)} of ${pool} ${type} messages (${Math.round((perMorning / pool) * 100)}% of the pool)`);
      }
    }
  }
});

// Three mornings is the run of rounds a person actually notices. Across that stretch nothing should
// come round twice — which needs both a deep enough pool and memory carried between the mornings.
test('across three mornings in a row, nothing comes round twice', () => {
  for (const role of ROLE_ORDER) {
    for (const level of LEVEL_ORDER) {
      for (const start of [1, 500, 9000]) {
        const counts = new Map();
        let recent = [];
        for (let i = 0; i < 3; i++) {
          const s = Core.createGame({ seed: start + i * 7919, role, level, recent });
          for (const type of TYPES) {
            for (const text of textsOf(s, type)) {
              counts.set(text, (counts.get(text) || 0) + 1);
              recent.push(text);
            }
          }
          recent = recent.slice(-140);
        }
        const worst = Math.max(...counts.values());
        assert.ok(worst <= 2, `${role}/${level} from seed ${start}: a message turned up ${worst} times in three mornings`);
      }
    }
  }
});
