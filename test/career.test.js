// Run with: npm test
// Career levels: traps hide better as your career grows, while the rules stay the same. These check
// that every level's messages follow that level's tell, and — with keyword-only readers — that each
// promotion really does break the shortcut that worked at the level before.
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core');
const { ROLES, ROLE_ORDER, LEVELS, LEVEL_ORDER, TELLS } = require('../content');
const { evaluate, evaluateHuman } = require('../bots');
// Levels are about how well traps hide, so these hold the kind of morning still and vary only the level.
const DAY = 'normal';

const words = (text) => text.split(/\s+/).filter(Boolean).length;

test('levels run junior → senior → lead, and each explains itself', () => {
  assert.deepEqual(LEVEL_ORDER, ['junior', 'senior', 'lead']);
  assert.deepEqual(Object.keys(LEVELS).sort(), LEVEL_ORDER.slice().sort());
  for (const [i, id] of LEVEL_ORDER.entries()) {
    const l = LEVELS[id];
    for (const key of ['label', 'emoji', 'summary', 'tell', 'trapPop']) assert.ok(l[key], `${id} needs ${key}`);
    if (i > 0) assert.ok(l.unlockText, `${id} needs to say how it unlocks`);
    // The career is climbed per role, so the lock has to name the role you are picking, not just the level.
    if (i > 0) assert.match(l.unlockText, /{role}/, `${id} should say which role has to clear it`);
  }
});

test('a game defaults to junior and refuses a level that does not exist', () => {
  assert.equal(Core.createGame({ seed: 1 }).level, 'junior');
  assert.throws(() => Core.createGame({ seed: 1, level: 'intern' }), /Unknown level/);
  assert.equal(Core.summary(Core.createGame({ seed: 1, level: 'lead' })).level, 'lead');
});

test('every role has a complete, readable message set at every level', () => {
  for (const role of ROLE_ORDER) {
    for (const level of LEVEL_ORDER) {
      const { urgent, trivial, trap } = ROLES[role].byLevel[level];
      assert.ok(urgent.length >= 12 && trap.length >= 12, `${role}/${level} needs at least 12 urgent and 12 traps (has ${urgent.length}/${trap.length})`);
      assert.equal(trivial, ROLES[role].messages.trivial, 'small talk (and favours) are the same at every level');
      for (const m of [...urgent, ...trap]) {
        assert.ok(words(m.text) <= 7, `${role}/${level}: "${m.text}" is ${words(m.text)} words, max 7`);
        assert.ok(m.busyText, `${role}/${level}: "${m.text}" needs busy text`);
        assert.equal(m.favour, undefined, 'only small talk gives favours');
      }
      for (const m of trap) assert.ok(m.aftermath, `${role}/${level}: trap "${m.text}" needs an aftermath`);
    }
  }
});

test('each level holds to its own tell', () => {
  const { minimising, alarm } = TELLS;
  for (const role of ROLE_ORDER) {
    const junior = ROLES[role].byLevel.junior;
    const senior = ROLES[role].byLevel.senior;
    const lead = ROLES[role].byLevel.lead;
    for (const m of junior.trap) assert.match(m.text, minimising, `junior traps minimise: "${m.text}"`);
    for (const m of junior.urgent) assert.doesNotMatch(m.text, minimising, `junior urgent never minimises: "${m.text}"`);

    assert.equal(senior.urgent, junior.urgent, 'senior urgent messages are the junior ones');
    for (const m of senior.trap) {
      assert.doesNotMatch(m.text, minimising, `senior traps never say "quick": "${m.text}"`);
      assert.doesNotMatch(m.text, alarm, `senior traps are polite, not alarming: "${m.text}"`);
    }

    for (const m of lead.trap) {
      assert.match(m.text, alarm, `lead traps shout: "${m.text}"`);
      assert.doesNotMatch(m.text, minimising, `lead traps never say "quick": "${m.text}"`);
    }
    for (const m of lead.urgent) {
      assert.doesNotMatch(m.text, alarm, `lead emergencies stay calm: "${m.text}"`);
      assert.doesNotMatch(m.text, minimising, `lead emergencies never minimise: "${m.text}"`);
    }
  }
});

test("a role's own urgent and trap messages are unique across every role and level", () => {
  const Content = require('../content');
  // The pools that reach everybody are identical in every role by design, so they are excluded: the
  // thing this guards is a role's OWN work turning up in someone else's inbox.
  const shared = new Set([...Content.SHARED_URGENT, ...Content.SHARED_LEAD_URGENT,
    ...Content.SHARED_TRAP.junior, ...Content.SHARED_TRAP.senior, ...Content.SHARED_TRAP.lead].map((m) => m.text));
  const seen = new Map();
  for (const role of ROLE_ORDER) {
    for (const level of LEVEL_ORDER) {
      const { urgent, trap } = ROLES[role].byLevel[level];
      const all = level === 'senior' ? trap : [...urgent, ...trap]; // senior reuses junior urgent messages
      const own = all.filter((m) => !shared.has(m.text));
      for (const m of own) {
        const where = `${role}/${level}`;
        assert.ok(!seen.has(m.text) || seen.get(m.text) === where, `"${m.text}" appears in ${seen.get(m.text)} and ${where}`);
        seen.set(m.text, where);
      }
    }
  }
});

test("a game only sends its level's messages, on the same rhythm as every other level", () => {
  for (const level of LEVEL_ORDER) {
    const pools = ROLES.tester.byLevel[level];
    const allowed = new Set([...pools.urgent, ...pools.trivial, ...pools.trap].map((m) => m.text));
    for (let seed = 1; seed <= 10; seed++) {
      const s = Core.createGame({ seed, role: 'tester', level });
      while (!s.over) {
        for (const ev of Core.step(s, 0.05, { holding: true })) {
          if (ev.type === 'spawn' && !ev.card.followUp) assert.ok(allowed.has(ev.card.text), `${level} got "${ev.card.text}"`);
        }
        for (const c of s.cards.slice()) Core.act(s, c.id, c.type === 'urgent' ? 'respond' : 'ignore');
      }
    }
  }
  const rhythm = (level) => Core.createGame({ seed: 99, level }).schedule.map((a) => [a.at, a.type, a.life]);
  assert.deepEqual(rhythm('senior'), rhythm('junior'));
  assert.deepEqual(rhythm('lead'), rhythm('junior'));
});

test('responding to a senior trap uses its own busy text and aftermath', () => {
  const s = Core.createGame({ seed: 1, role: 'analyst', level: 'senior' });
  s.schedule = [];
  Core.act(s, Core.spawnCard(s, 'trap', 0).id, 'respond');
  assert.equal(s.busyText, ROLES.analyst.byLevel.senior.trap[0].busyText);
  assert.deepEqual(s.stats.aftermaths, [ROLES.analyst.byLevel.senior.trap[0].aftermath]);
});

// The point of levels: a reader who relies on a keyword shortcut is found out by the next promotion,
// while a reader who understands the messages does just as well at every level (the rules don't change).
test('design: each promotion breaks the shortcut that worked before', () => {
  const seeds = Array.from({ length: 120 }, (_, i) => i + 1);
  const gold = (strategy, level) => evaluate(strategy, seeds, { level, day: DAY }).goldRate;
  const QUICK = 'Keyword reader: "quick" means trap';
  const ALARM = 'Keyword reader: alarm words mean urgent';

  for (const level of LEVEL_ORDER) assert.ok(gold('Perfect reader', level) >= 0.9, `understanding the messages works at ${level}`);

  assert.ok(gold(QUICK, 'junior') >= 0.9, 'at junior, "quick means trap" is all you need');
  assert.ok(gold(QUICK, 'senior') <= 0.1, 'at senior, "quick means trap" falls for every trap');
  assert.ok(gold(QUICK, 'lead') <= 0.1, 'and it stays broken at lead');

  assert.ok(evaluate(ALARM, seeds, { level: 'lead', day: DAY }).pipRate >= 0.6, 'at lead, trusting alarm words gets you put on a PIP');
});

test('design: at every level and in every role, a first-time player still has time to read', () => {
  const seeds = Array.from({ length: 150 }, (_, i) => i + 1);
  for (const level of ['senior', 'lead']) { // junior is covered in core.test.js
    for (const role of ROLE_ORDER) {
      const r = evaluateHuman('First-time player', seeds, { role, level, day: DAY });
      assert.ok(r.lostPct <= 0.03, `${role}/${level}: lost ${(r.lostPct * 100).toFixed(1)}% of messages before reading them`);
      assert.ok(r.lostByPhasePct[0] <= 0.01, `${role}/${level}: the opening should stay calm`);
    }
  }
});
