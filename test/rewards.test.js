// Rewards for clearing the campaign: stars, which change nothing about play, and perks, which do.
//
// The perks are the dangerous half. The first idea was more headphones as the levels went on, and the
// simulated players showed four pairs taking the player who answers everything without reading from 6%
// gold to 80%: headphones block exactly the traps a non-reader would fall into. So the rule was written
// down before any perk was tuned, and every perk has to pass it —
//
//   a perk may help anyone, but it may not close the gap between reading the messages and not reading
//   them by more than a few points, at any career level, and no campaign level may fall to the player
//   who has not learned it just because that player is carrying a perk.
const test = require('node:test');
const assert = require('node:assert');
const Core = require('../core');
const Campaign = require('../campaign');
const Rewards = require('../rewards');
const Bots = require('../bots');
const { playBot, evaluate } = Bots;

const levelById = (id) => Campaign.LEVELS.find((l) => l.id === id);
const run = (rating, trapsTaken, urgentMissed) => ({ rating: { key: rating }, stats: { trapsTaken, urgentMissed } });

// ---- stars ----

test('stars start with clearing the level, and each one needs the one before it', () => {
  const level = levelById('never-quick');
  assert.strictEqual(Rewards.starsFor(level, run('gold', 0, 0), false).stars, 0, 'no stars without clearing, however well it went');
  assert.strictEqual(Rewards.starsFor(level, run('silver', 0, 0), true).stars, 1);
  assert.strictEqual(Rewards.starsFor(level, run('gold', 1, 0), true).stars, 2);
  assert.strictEqual(Rewards.starsFor(level, run('gold', 0, 1), true).stars, 2);
  assert.strictEqual(Rewards.starsFor(level, run('gold', 0, 0), true).stars, 3);
  // A clean silver is not a third star: the third asks for the second as well.
  assert.strictEqual(Rewards.starsFor(level, run('silver', 0, 0), true).stars, 1);
  const rows = Rewards.starsFor(level, run('gold', 1, 0), true).rows;
  assert.deepStrictEqual(rows.map((r) => r.done), [true, true, false], 'the card should show every star, met or not');
});

test('the week is starred on the week', () => {
  const week = Campaign.LEVELS.find(Campaign.isWeek);
  const w = (shipped, energy) => ({ shipped, energy, home: 80 });
  assert.strictEqual(Rewards.starsFor(week, w(3, 90), true).stars, 1);
  assert.strictEqual(Rewards.starsFor(week, w(4, 10), true).stars, 2);
  assert.strictEqual(Rewards.starsFor(week, w(5, 59), true).stars, 2);
  assert.strictEqual(Rewards.starsFor(week, w(5, 60), true).stars, 3);
});

test('stars never go down, and whatever is in storage is read forgivingly', () => {
  let best = Rewards.withBest({}, 'first', 2);
  best = Rewards.withBest(best, 'first', 1);
  assert.strictEqual(best.first, 2, 'a worse replay must not take a star away');
  assert.strictEqual(Rewards.withBest({}, 'first', 99).first, Rewards.MAX_STARS);

  const known = Campaign.LEVELS.map((l) => l.id);
  const cleaned = Rewards.cleanStars({ first: 3, read: 'lots', nope: 2, 'deep-end': -1 }, known, ['first', 'never-quick']);
  assert.deepStrictEqual(cleaned, { first: 3, 'never-quick': 1 },
    'unknown levels and nonsense are dropped, and a level cleared before stars existed is worth one');
  assert.deepStrictEqual(Rewards.cleanStars('garbage', known, []), {});
  assert.strictEqual(Rewards.totalStars({ first: 3, read: 2 }), 5);
});

test('a perfect reader can take all three stars on every single morning', () => {
  // Level 7 asks you to say no twice; a perfect reader does that to the first two traps and ignores the rest.
  Bots.STRATEGIES['Perfect reader, says no to two traps'] = (s, card) =>
    card.type === 'urgent' ? 'respond' : card.type === 'trap' && s.stats.declined < 2 ? 'decline' : 'ignore';
  const WAY = {
    headphones: { strategy: 'Perfect reader', headphonesAt: 30 },
    colleague: { strategy: 'Perfect reader + favours' },
    'cannot-tell': { strategy: 'Perfect reader, says no to two traps' },
    appraisal: { strategy: 'Sociable reader: answers all but traps' },
    'everything-down': { strategy: 'Perfect reader + favours' },
    'still-a-person': { strategy: 'Perfect reader + answers home' },
    'pass-it-on': { strategy: 'Perfect reader + favours' }
  };
  for (const level of Campaign.LEVELS) {
    if (Campaign.isWeek(level)) continue;
    const way = WAY[level.id] || { strategy: 'Perfect reader' };
    const r = playBot(level.setup.seed, way.strategy, { role: 'developer', day: level.setup.day, level: level.setup.level, headphonesAt: way.headphonesAt });
    const got = Rewards.starsFor(level, r, Campaign.cleared(Campaign.check(level, r)));
    assert.strictEqual(got.stars, 3, `level ${level.n} (${level.id}) gave a perfect reader ${got.stars} stars: ` +
      got.rows.filter((row) => !row.done).map((row) => row.label).join(', '));
  }
});

// ---- perks: the catalogue ----

test('every perk exists in the rules, is unlocked by a real level, and they arrive in ladder order', () => {
  assert.deepStrictEqual(Rewards.PERKS.map((p) => p.id).sort(), Object.keys(Core.TUNING.PERKS).sort(),
    'rewards.js and core.js must describe the same perks');
  let lastLevel = 0;
  for (const perk of Rewards.PERKS) {
    for (const key of ['emoji', 'title', 'blurb']) assert.ok(perk[key], `${perk.id} needs ${key}`);
    const by = levelById(perk.unlockedBy);
    assert.ok(by, `${perk.id} is unlocked by a level that does not exist`);
    assert.ok(!Campaign.isWeek(by), `${perk.id} cannot be unlocked by the week, which comes after every morning it would help`);
    assert.ok(by.n > lastLevel, 'perks should be listed in the order the ladder hands them out');
    lastLevel = by.n;
  }
});

test('the words on a perk match what it does', () => {
  const P = Core.TUNING.PERKS;
  assert.ok(Rewards.byId.coffee.blurb.includes(`first ${P.coffee.urgentCalls} emergencies`), 'coffee says how many emergencies it covers');
  assert.strictEqual(Core.TUNING.HEADPHONES.charges + P.headphones.extraCharges, 2);
  const phones = Rewards.byId.headphones.blurb;
  assert.ok(phones.startsWith('Two'), 'the spare headphones say how many goes you get');
  assert.ok(phones.includes(`${P.headphones.spareDuration}-second`), 'and how long the spare lasts');
  assert.ok(phones.includes(`${P.headphones.cooldown} seconds`), 'and how long it has to wait');
  assert.strictEqual(P.cover.traps, 1);
  assert.ok(Rewards.byId.cover.blurb.includes('first trap'), 'the cover says it is only the first trap');
  assert.ok(Rewards.byId.politeexit.blurb.includes(`first ${P.politeexit.declines} polite noes`), 'the polite exit says how many noes are free');
  assert.strictEqual(P.secondchance.urgents, 1);
  assert.ok(Rewards.byId.secondchance.blurb.includes('first emergency'), 'the second chance says it is only the first one');
  assert.ok(Rewards.byId.secondchance.blurb.includes('comes back'), 'and that the message still returns');
  assert.ok(Rewards.byId.snooze.blurb.includes(`first ${P.snooze.traps} traps`), 'snooze says how many traps it keeps away');
  assert.strictEqual(P.oncall.favours, 1);
  assert.ok(Rewards.byId.oncall.blurb.includes(`${P.oncall.helper} already owing you a favour`), 'the rota names who owes you one');
});

test('a perk is only taken where it is allowed, and only once it is earned', () => {
  const morning = levelById('deep-end');
  const week = Campaign.LEVELS.find(Campaign.isWeek);
  const all = Campaign.LEVELS.map((l) => l.id);
  assert.strictEqual(Rewards.perkFor(morning, 'coffee', []), null, 'not before its level is cleared');
  assert.strictEqual(Rewards.perkFor(morning, 'coffee', ['first', 'read']), 'coffee');
  assert.strictEqual(Rewards.perkFor(morning, 'cover', ['first', 'read']), null, 'owning one perk does not unlock another');
  assert.strictEqual(Rewards.perkFor(week, 'coffee', all), null, 'a week is taken as it comes');
  assert.strictEqual(Rewards.perkFor(morning, 'jetpack', all), null);
  assert.deepStrictEqual(Rewards.perksFrom(all), Rewards.PERKS.map((p) => p.id));
  assert.deepStrictEqual(Rewards.unlockedBy('read'), ['coffee']);
});

// ---- perks: what they do ----

test('a morning without a perk is exactly the morning it was', () => {
  const plain = Core.createGame({ seed: 7, day: 'normal' });
  assert.strictEqual(plain.perk, null);
  assert.strictEqual(plain.headphones.charges, Core.TUNING.HEADPHONES.charges);
  assert.strictEqual(plain.perkLeft, 0);
  assert.throws(() => Core.createGame({ seed: 7, perk: 'jetpack' }), /Unknown perk/);
  const a = playBot(11, '90% accurate reader', { day: 'normal' });
  const b = playBot(11, '90% accurate reader', { day: 'normal', perk: undefined });
  assert.deepStrictEqual([a.score, a.rep, a.progress], [b.score, b.rep, b.progress]);
});

test('each perk is used the number of times it says, and no more', () => {
  const P = Core.TUNING.PERKS;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const coffee = playBot(seed, 'Perfect reader', { day: 'normal', perk: 'coffee' });
    assert.ok(coffee.stats.perkUsed <= P.coffee.urgentCalls);
    assert.ok(coffee.stats.perkUsed <= coffee.stats.urgentHandled, 'coffee is only ever spent on an emergency');
    const cover = playBot(seed, 'Respond to everything', { day: 'normal', perk: 'cover' });
    assert.ok(cover.stats.perkUsed <= P.cover.traps);
    const phones = playBot(seed, 'Respond to everything', { day: 'normal', perk: 'headphones', headphonesAt: 20 });
    assert.ok(phones.stats.headphonesUsed <= 2);
  }
  const reader = playBot(1, 'Perfect reader', { day: 'normal', perk: 'cover' });
  assert.strictEqual(reader.stats.perkUsed, 0, 'a player who takes no traps never spends the cover');
});

test('the polite exit makes the first two noes free, and the third cost what it always did', () => {
  const s = Core.createGame({ seed: 4, day: 'normal', perk: 'politeexit' });
  const cost = [];
  for (let i = 0; i < 3; i++) {
    const before = s.rep;
    Core.act(s, Core.spawnCard(s, 'trivial', 0, 30).id, 'decline');
    cost.push(s.rep - before);
    // Writing the no takes half a second, and nothing else can be done while it is being written.
    while (Core.isBusy(s)) Core.step(s, 0.05, { holding: false });
  }
  assert.deepStrictEqual(cost, [0, 0, Core.TUNING.DECLINE.rep], 'two free, then the usual price');
  assert.strictEqual(s.stats.perkUsed, Core.TUNING.PERKS.politeexit.declines);
  // Saying no still takes the time it takes, perk or not, so a morning of them still delivers nothing.
  assert.ok(s.stats.declined === 3 && s.busyUntil > 0);
  const plain = Core.createGame({ seed: 4, day: 'normal' });
  const was = plain.rep;
  Core.act(plain, Core.spawnCard(plain, 'trivial', 0, 30).id, 'decline');
  assert.strictEqual(plain.rep - was, Core.TUNING.DECLINE.rep, 'without the perk the first no costs as it always did');
});

test('the second chance waives the first missed emergency, and only the first', () => {
  const s = Core.createGame({ seed: 4, day: 'normal', perk: 'secondchance' });
  const miss = () => { const before = s.rep; Core.act(s, Core.spawnCard(s, 'urgent', 0, 30).id, 'ignore'); return s.rep - before; };
  assert.strictEqual(miss(), 0, 'the first one costs nothing');
  assert.strictEqual(miss(), s.rules.ignore.urgent, 'the second costs what missing one costs');
  assert.strictEqual(s.stats.perkUsed, 1);
  assert.strictEqual(s.stats.urgentMissed, 2, 'it is still a miss, and still counted as one');
  // The escalation is what makes it a second chance rather than forgiveness: the message comes back.
  assert.ok(s.pending.some((p) => p.type === 'urgent'), 'the emergency still follows itself up');
  // A trap ignored is not an emergency missed, so the perk is still in hand.
  const t = Core.createGame({ seed: 4, day: 'normal', perk: 'secondchance' });
  Core.act(t, Core.spawnCard(t, 'trap', 0, 30).id, 'ignore');
  assert.strictEqual(t.stats.perkUsed, 0);
});

test('snooze keeps the first two traps you let run out from coming back, and only those', () => {
  const s = Core.createGame({ seed: 4, day: 'normal', perk: 'snooze' });
  // Expiry is what brings a trap back, so drive it through the real clock rather than a dismissal.
  const expireOne = () => {
    const card = Core.spawnCard(s, 'trap', 0, 30);
    card.expiresAt = s.t + 0.1;
    const before = s.pending.length;
    while (s.cards.some((c) => c.id === card.id)) Core.step(s, 0.05, { holding: false });
    return s.pending.length - before;
  };
  assert.deepStrictEqual([expireOne(), expireOne(), expireOne()], [0, 0, 1], 'two stay gone, the third asks again');
  assert.strictEqual(s.stats.perkUsed, Core.TUNING.PERKS.snooze.traps);
  // A trap turned down never comes back anyway, so it never spends the snooze.
  const t = Core.createGame({ seed: 4, day: 'normal', perk: 'snooze' });
  Core.act(t, Core.spawnCard(t, 'trap', 0, 30).id, 'ignore');
  assert.strictEqual(t.stats.perkUsed, 0);
});

test('the on-call rota starts you one favour up, and is spent with it', () => {
  const s = Core.createGame({ seed: 4, day: 'normal', perk: 'oncall' });
  assert.deepStrictEqual(s.favours, [Core.TUNING.PERKS.oncall.helper]);
  assert.deepStrictEqual(Core.createGame({ seed: 4, day: 'normal' }).favours, [], 'without it you start owed nothing');
  Core.act(s, Core.spawnCard(s, 'urgent', 0, 30).id, 'delegate');
  assert.strictEqual(s.stats.urgentDelegated, 1);
  assert.strictEqual(s.stats.perkUsed, 1);
  assert.strictEqual(s.perkLeft, 0);
});

test('the spare headphones are shorter, and cannot go straight on after the first pair', () => {
  const P = Core.TUNING.PERKS.headphones;
  const s = Core.createGame({ seed: 3, day: 'normal', perk: 'headphones' });
  assert.strictEqual(s.headphones.charges, 2);
  Core.useHeadphones(s);
  const firstOff = s.headphones.activeUntil;
  assert.strictEqual(firstOff, Core.TUNING.HEADPHONES.duration, 'the first pair is the real thing');
  while (s.t < firstOff + P.cooldown - 0.5) Core.step(s, 0.05, { holding: true });
  assert.strictEqual(Core.useHeadphones(s).length, 0, 'too soon for the spare');
  while (s.t < firstOff + P.cooldown) Core.step(s, 0.05, { holding: true });
  assert.strictEqual(Core.useHeadphones(s).length, 1);
  assert.ok(Math.abs(s.headphones.activeUntil - s.t - P.spareDuration) < 1e-9, 'the spare lasts as long as it says');
});

// ---- perks: the guardrail ----

const SEEDS = Array.from({ length: 80 }, (_, i) => i + 1);
const CAREER = ['junior', 'senior', 'lead', 'head'];
// How far a perk may narrow the gap, in points of gold rate, between a 90% reader and a player who
// answers every message without reading it.
const MAX_GAP_NARROWING = 12;
// Headphone timings to try. Only the spare pair cares, so only it is held against every pattern; the
// others use one ordinary pattern for everyone's single pair.
const PATTERNS = { headphones: [[15, 35], [25, 50], [40, 55]], coffee: [[30]], cover: [[30]], politeexit: [[30]], secondchance: [[30]], snooze: [[30]], oncall: [[30]] };

const goldRate = (strategy, level, perk, headphonesAt) =>
  evaluate(strategy, SEEDS, { day: 'normal', level, perk, headphonesAt }).goldRate * 100;
const readingGap = (level, perk, hp) => goldRate('90% accurate reader', level, perk, hp) - goldRate('Respond to everything', level, perk, hp);

test('no perk closes the gap between reading the messages and not reading them', () => {
  for (const perk of Object.keys(Core.TUNING.PERKS)) {
    for (const level of CAREER) {
      for (const hp of PATTERNS[perk]) {
        const without = readingGap(level, undefined, hp);
        const withIt = readingGap(level, perk, hp);
        assert.ok(without - withIt <= MAX_GAP_NARROWING,
          `${perk} at ${level} (headphones at ${hp.join('/')}) narrowed the reading gap from ${without.toFixed(0)} to ${withIt.toFixed(0)} points`);
      }
    }
  }
});

// Who each perk exists for. Every one has to be worth picking to a real, imperfect player, but not to the
// same one: the polite exit softens the cost of hedging, so a reader who never says no will never notice
// it — the same way a player who takes no traps never spends the manager's cover. Measuring all of them
// against a single bot would only ever prove which mistake that bot happens to make.
const WORTH_FOR = {
  politeexit: 'Coin flip on urgent-vs-trap, says no',
  snooze: '80% reader, lets traps run out',
  oncall: '90% accurate + favours'
};
const IMPERFECT_READER = '80% accurate reader';

test('every perk is worth taking for the player who makes the mistake it softens', () => {
  const hp = [20, 45];
  for (const perk of Object.keys(Core.TUNING.PERKS)) {
    const strategy = WORTH_FOR[perk] || IMPERFECT_READER;
    const without = evaluate(strategy, SEEDS, { day: 'normal', headphonesAt: hp }).avgScore;
    const withIt = evaluate(strategy, SEEDS, { day: 'normal', perk, headphonesAt: hp }).avgScore;
    assert.ok(withIt - without >= 20, `${perk} is not worth picking for a "${strategy}": ${Math.round(withIt - without)} points on average`);
  }
});

test('no campaign level falls to the player who has not learned it, whatever perk they carry', () => {
  // The same naive players test/campaign.test.js holds every level against.
  const NAIVE = {
    read: 'Ignore everything', 'never-quick': 'Respond to everything', 'deep-end': 'Respond to everything',
    headphones: 'Respond to everything', colleague: 'Perfect reader', 'cannot-tell': 'Coin flip on urgent-vs-trap, guesses',
    appraisal: 'Perfect reader', backlog: 'Respond to everything', release: 'Respond to everything',
    'on-a-roll': '80% accurate reader', lead: 'Keyword reader: alarm words mean urgent',
    'quiet-house': 'Respond to everything', micromanager: 'Say no to everything',
    'all-polite': 'Respond to everything', noon: 'Ignore everything',
    'come-back': 'Perfect reader, lets traps run out', 'everything-down': 'Perfect reader',
    'head-of': 'Keyword reader: calm means urgent',
    'still-a-person': 'Perfect reader', 'loud-and-real': 'Head reader, distrusts shouting',
    'release-top': 'Keyword reader: calm means urgent', 'long-day-top': 'Keyword reader: calm means urgent',
    'pass-it-on': 'Perfect reader'
  };
  // Every sensible way to time two pairs of headphones, including both back to back over the finish.
  const pairs = [undefined, [15], [30], [45]];
  for (const a of [10, 20, 30, 40, 45, 50]) for (const b of [a + 10, a + 20, 55]) if (b <= 58 && b > a) pairs.push([a, b]);
  // A level is the same morning in every role, so two roles are enough to catch wording-dependent strategies.
  for (const level of Campaign.LEVELS) {
    if (!NAIVE[level.id]) continue;
    for (const perk of Object.keys(Core.TUNING.PERKS)) {
      for (const role of ['developer', 'manager']) {
        for (const headphonesAt of perk === 'headphones' ? pairs : [undefined, [30]]) {
          const r = playBot(level.setup.seed, NAIVE[level.id], { role, day: level.setup.day, level: level.setup.level, perk, headphonesAt });
          assert.ok(!Campaign.cleared(Campaign.check(level, r)),
            `level ${level.n} (${level.id}) fell to "${NAIVE[level.id]}" carrying ${perk}, as ${role}, headphones at ${headphonesAt}`);
        }
      }
    }
  }
});
