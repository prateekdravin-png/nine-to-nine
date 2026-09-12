// Run with: npm test
// Work personalities: every round gets exactly one, it describes what the player actually did, and
// real play earns a spread of them (a label everyone gets is not worth sharing).
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core');
const { ROLES, ROLE_ORDER } = require('../content');
const { PERSONAS, personaFor } = require('../persona');
const { playBot, playHuman } = require('../bots');

// A finished round with the given stats (everything else zero).
function round(stats, opts) {
  const o = Object.assign({ shipped: true, endReason: 'time' }, opts);
  const base = {
    urgentHandled: 0, urgentMissed: 0, trapsTaken: 0, trapsDodged: 0, trivialAnswered: 0, trivialIgnored: 0,
    peeks: 0, cardsSeen: 20, headphonesUsed: 0, favoursBanked: 0, favoursUsed: 0, urgentDelegated: 0, busyTime: 0, deepWorkTime: 0, codingTime: 0, peakFlow: 0, aftermaths: [], decisions: []
  };
  return { shipped: o.shipped, endReason: o.endReason, role: 'developer', stats: Object.assign(base, stats) };
}
const idFor = (stats, opts) => personaFor(round(stats, opts), ROLES.developer).id;

test('personalities are well formed, and the last one catches every round', () => {
  assert.equal(new Set(PERSONAS.map((p) => p.id)).size, PERSONAS.length, 'ids are unique');
  assert.equal(new Set(PERSONAS.map((p) => p.name)).size, PERSONAS.length, 'names are unique');
  assert.equal(PERSONAS[PERSONAS.length - 1].earned({}), true);
  for (const role of ROLE_ORDER) {
    for (const p of PERSONAS) {
      const blurb = p.blurb(ROLES[role]);
      assert.ok(p.emoji && p.name && blurb && !/undefined/.test(blurb), `${p.id} as ${role}`);
    }
  }
});

test('each personality describes what the player actually did', () => {
  assert.equal(idFor({ urgentMissed: 6, trapsDodged: 6 }, { endReason: 'pip' }), 'ghost', 'a PIP outranks everything');
  assert.equal(idFor({ urgentHandled: 6, trapsDodged: 6, trivialIgnored: 8 }), 'zen');
  assert.equal(idFor({ urgentHandled: 6, trapsDodged: 6, trivialIgnored: 8 }, { shipped: false }), 'firewall', 'no zen without finishing');
  assert.equal(idFor({ trapsTaken: 3, urgentHandled: 5 }), 'martyr');
  assert.equal(idFor({ trapsTaken: 3, urgentHandled: 5 }, { shipped: false }), 'yes');
  assert.equal(idFor({ urgentDelegated: 2, urgentHandled: 5, trivialAnswered: 3 }), 'banker', 'cashing in favours outranks the small talk that earned them');
  assert.equal(idFor({ trapsTaken: 1, urgentHandled: 5 }), 'lastline');
  assert.equal(idFor({ trapsTaken: 1, urgentMissed: 1, trivialAnswered: 4 }), 'chai');
  assert.equal(idFor({ trapsTaken: 1, urgentMissed: 1, headphonesUsed: 1, deepWorkTime: 26 }), 'hermit');
  assert.equal(idFor({ trapsTaken: 1, urgentMissed: 1, deepWorkTime: 31 }), 'diver');
  assert.equal(idFor({ trapsTaken: 1, urgentMissed: 1, deepWorkTime: 10 }), 'juggler');

  const martyr = personaFor(round({ trapsTaken: 4 }), ROLES.tester);
  assert.match(martyr.blurb, /test cycle signed off/, 'wording follows the role');
  assert.equal(martyr.because, '4 traps taken, and still finished');
  assert.equal(personaFor(round({ trapsDodged: 1, urgentHandled: 1, cardsSeen: 1 }, { shipped: false }), ROLES.developer).because, '1 message juggled');
});

test('headphone use is counted, so the headphones personality can be earned', () => {
  const s = Core.createGame({ seed: 1 });
  Core.useHeadphones(s);
  Core.useHeadphones(s); // only one charge
  assert.equal(Core.summary(s).stats.headphonesUsed, 1);
});

test('design: naive play earns the satirical personalities, and real play earns a spread', () => {
  const seeds = Array.from({ length: 150 }, (_, i) => i + 1);
  const share = (summaries) => {
    const counts = {};
    for (const r of summaries) {
      const id = personaFor(r, ROLES[r.role]).id;
      counts[id] = (counts[id] || 0) + 1;
    }
    for (const id of Object.keys(counts)) counts[id] /= summaries.length;
    return counts;
  };
  assert.ok(share(seeds.map((s) => playBot(s, 'Respond to everything'))).yes > 0.8, 'answering everything makes you The Yes Machine');
  assert.ok(share(seeds.map((s) => playBot(s, 'Ignore everything'))).ghost > 0.8, 'ignoring everything makes you The Ghost');
  assert.ok(share(seeds.map((s) => playBot(s, 'Perfect reader'))).zen > 0.8, 'flawless play makes you The Zen Master');

  // A typical first-time player: mostly right, sometimes not.
  const typical = share(seeds.map((s) => playHuman(s, 'First-time player', { accuracy: 0.85 }).summary));
  const common = Object.values(typical).filter((v) => v >= 0.02).length;
  assert.ok(common >= 6, `a typical player should earn at least 6 different personalities (${JSON.stringify(typical)})`);
  assert.ok(Math.max(...Object.values(typical)) <= 0.45, `no single personality should dominate (${JSON.stringify(typical)})`);
});
