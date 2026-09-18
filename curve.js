// curve.js — how hard each campaign level actually is, measured rather than guessed.
// Usage: node curve.js [trials]      (default 400 per accuracy step)
//
// The campaign test answers a yes/no question per level: does the competent approach clear it, and does
// the naive one fail? That is the right bar for shipping a level, but it says nothing about how MUCH room
// a level leaves, so it cannot say whether the ladder climbs smoothly or where a new level should sit.
//
// This plays each level's own proven approach (the same one test/campaign.test.js uses) and degrades it
// two ways, because a level can be hard in two different ways:
//
//   JUDGEMENT  With probability 1 - accuracy the player misreads what a message IS (urgent <-> trap, and
//              small talk taken for work) and then acts sensibly on that misreading. This is the same
//              definition bots.js already uses for its "80% accurate reader", so numbers stay comparable.
//              The player's mistakes are seeded apart from the pinned morning (bots.js rollSeed), which is
//              what makes a pinned level sampleable at all.
//   TIME       Perfect judgement, slower reading. Uses playHuman, which reads ONE message at a time
//              (oldest-expiring first) the way a person does. The instant bot is no use here: it notices
//              every card in parallel, so its only limit is spotting a card before it expires (5.4-7.2s),
//              the same cliff on every level, which says nothing about the level.
//
// Role is fixed to developer: a role changes only the wording, and none of these approaches read text.
const { STRATEGIES, FAVOUR_STRATEGIES, HUMAN_PROFILES, playBot, playHuman } = require('./bots');
const Campaign = require('./campaign');
const Week = require('./week');
const Core = require('./core');

const TRIALS = Number(process.argv[2]) || 400;
const ACCURACIES = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7];
// Reading-speed multipliers for the time axis (1 = a first-time player as bots.js defines one).
const SPEEDS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];
const FIRST = HUMAN_PROFILES['First-time player'];
const PRACTISED = HUMAN_PROFILES['Practised player'];
const secsFor8 = (p) => p.notice + 8 * p.perWord + p.decide; // one typical eight-word message
const MSG_SECS = secsFor8(FIRST);

// Kept in step with APPROACH in test/campaign.test.js. A level missing here stops the run rather than
// being skipped, so adding level 18 cannot quietly leave it off the curve.
const APPROACH = {
  first: { strategy: 'Perfect reader' },
  read: { strategy: 'Perfect reader' },
  'never-quick': { strategy: 'Perfect reader' },
  'deep-end': { strategy: 'Perfect reader' },
  headphones: { strategy: 'Perfect reader', headphonesAt: 30 },
  colleague: { strategy: 'Perfect reader + favours' },
  'cannot-tell': { strategy: 'Coin flip on urgent-vs-trap, says no' },
  appraisal: { strategy: 'Sociable reader: answers all but traps' },
  backlog: { strategy: 'Perfect reader' },
  release: { strategy: 'Perfect reader' },
  'on-a-roll': { strategy: 'Perfect reader' },
  lead: { strategy: 'Perfect reader' },
  'quiet-house': { strategy: 'Perfect reader' },
  micromanager: { strategy: 'Perfect reader' },
  'all-polite': { strategy: 'Perfect reader' },
  noon: { strategy: 'Perfect reader' },
  'the-week': { strategy: 'Perfect reader + answers home', pace: true },
  'come-back': { strategy: 'Perfect reader' },
  'everything-down': { strategy: 'Perfect reader + favours' }
};

// Misreading changes only what the strategy SEES; playBot still acts on the real card id.
const misread = (card) => Object.assign({}, card, { type: card.type === 'urgent' ? 'trap' : 'urgent' });

// Registers "<approach> @ <accuracy>" as a strategy bots.js can play. Favour players are flagged as such,
// or playBot would never let them pass a message on while busy.
function degraded(baseName, accuracy) {
  const name = `${baseName} @ ${accuracy}`;
  if (!STRATEGIES[name]) {
    const base = STRATEGIES[baseName];
    STRATEGIES[name] = (s, card, roll) => base(s, roll < accuracy ? card : misread(card), roll);
    if (FAVOUR_STRATEGIES.has(baseName)) FAVOUR_STRATEGIES.add(name);
  }
  return name;
}

// Same shape test/campaign.test.js hands to Campaign.check. A real player's week is never pinned, so each
// trial also draws a fresh week.
function playWeek(weekSeed, strategy, opts, rollBase) {
  let week = Week.newWeek(weekSeed);
  const plan = Week.dayPlan(weekSeed, Core.DAY_ORDER);
  while (!week.over) {
    const i = week.index;
    week = Week.afterMorning(week, playBot(Week.seedForMorning(weekSeed, i), strategy, {
      role: 'developer', day: plan[i], carry: Week.carryFor(week), stopAtTarget: !!opts.pace,
      rollSeed: rollBase * 16 + i
    }));
  }
  const v = Week.verdict(week);
  return { shipped: v.shipped, energy: week.energy, home: week.home, golds: v.golds, played: v.played };
}

function clears(level, strategy, opts, trial) {
  const result = Campaign.isWeek(level)
    ? playWeek(trial + 1, strategy, opts, trial + 1)
    : playBot(level.setup.seed, strategy, {
      role: 'developer', day: level.setup.day, level: level.setup.level,
      headphonesAt: opts.headphonesAt, rollSeed: trial + 1
    });
  return Campaign.cleared(Campaign.check(level, result));
}

// How each approach reads as a person who works one message at a time. Null where playHuman cannot play
// the level as intended: it has no headphones, no week, and no player who knowingly declines everything
// it cannot place — approximating those would measure a different level.
function humanOpts(level, a) {
  if (Campaign.isWeek(level) || a.headphonesAt != null) return null;
  if (a.strategy === 'Perfect reader') return {};
  if (a.strategy === 'Perfect reader + favours') return { favours: true };
  if (a.strategy === 'Sociable reader: answers all but traps') return { style: 'sociable' };
  return null;
}

function clearRate(level, strategy, opts, trials) {
  let n = 0;
  for (let t = 0; t < trials; t++) if (clears(level, strategy, opts, t)) n++;
  return n / trials;
}

// Accuracy at which the clear rate crosses 50%, read off the sweep by linear interpolation. The lower
// it is, the more misreading a level forgives. Null if it never drops below half in the tested range.
function a50(rates) {
  for (let i = 1; i < ACCURACIES.length; i++) {
    const [ra, rb] = [rates[i - 1], rates[i]];
    if (ra >= 0.5 && rb < 0.5) {
      const [aa, ab] = [ACCURACIES[i - 1], ACCURACIES[i]];
      return aa + (ab - aa) * ((ra - 0.5) / (ra - rb));
    }
  }
  return rates[rates.length - 1] >= 0.5 ? null : ACCURACIES[0];
}

const pct = (v) => `${Math.round(v * 100)}%`.padStart(5);
const tierOf = (level) => (Campaign.isWeek(level) ? 'week' : level.setup.level);
const label = (level) => `${level.emoji} ${level.title}`.padEnd(26);

const missing = Campaign.LEVELS.filter((l) => !APPROACH[l.id]).map((l) => `${l.n} (${l.id})`);
if (missing.length) {
  console.error(`No approach for level ${missing.join(', ')} — add it to APPROACH, matching test/campaign.test.js.`);
  process.exit(1);
}

const started = Date.now();
const rows = Campaign.LEVELS.map((level) => {
  const a = APPROACH[level.id];
  // Weeks are the player's own, so even perfect judgement is a rate there; a pinned morning at 100% is
  // deterministic and one run says everything.
  const rates = ACCURACIES.map((acc) => {
    const trials = acc === 1 && !Campaign.isWeek(level) ? 1 : TRIALS;
    return clearRate(level, degraded(a.strategy, acc), a, trials);
  });

  // Time axis: perfect judgement makes playHuman deterministic on a pinned morning, so one run per speed.
  const human = humanOpts(level, a);
  let times = null;
  let maxSecs = null;
  if (human) {
    times = SPEEDS.map((speed) => {
      const r = playHuman(level.setup.seed, 'First-time player', Object.assign({
        role: 'developer', day: level.setup.day, level: level.setup.level, accuracy: 1, speed, rollSeed: 1
      }, human));
      return Campaign.cleared(Campaign.check(level, r.summary));
    });
    // Contiguous from the fast end: the slowest speed reached without an earlier failure, so a lucky
    // clear at some slower speed can't overstate how much time a level gives you.
    for (let i = 0; i < SPEEDS.length && times[i]; i++) maxSecs = SPEEDS[i] * MSG_SECS;
  }
  return { level, tier: tierOf(level), rates, a50: a50(rates), times, maxSecs };
});

console.log(`\n9 to 9 — campaign difficulty curve (${TRIALS} trials per accuracy step, developer)\n`);
console.log('1) JUDGEMENT — clear rate as the player misreads more messages (instant reactions)');
console.log('   A50 = the accuracy where clearing becomes a coin flip. Higher A50 = less forgiving.\n');
console.log('lvl  level                       tier    ' + ACCURACIES.map((acc) => pct(acc)).join('') + '     A50');
console.log('─'.repeat(40 + 5 * ACCURACIES.length + 8));
for (const r of rows) {
  console.log(
    String(r.level.n).padStart(3) + '  ' + label(r.level) + '  ' + r.tier.padEnd(7) +
    r.rates.map(pct).join('') + (r.a50 == null ? '    <70%' : pct(r.a50).padStart(8))
  );
}

console.log('\n2) TIME — perfect judgement, reading one message at a time, slower and slower');
console.log(`   Speed 1 = a first-time player (${MSG_SECS.toFixed(1)}s per eight-word message); a practised one takes ${secsFor8(PRACTISED).toFixed(1)}s.`);
console.log('   Max = the slowest reader who still clears. Lower = more time pressure.\n');
console.log('lvl  level                       tier   ' + SPEEDS.map((sp) => `${sp}x`.padStart(6)).join('') + '      max');
console.log('─'.repeat(39 + 6 * SPEEDS.length + 10));
for (const r of rows) {
  let cells;
  let max = '';
  if (!r.times) {
    cells = '   n/a: the reading model cannot play this approach'.padEnd(6 * SPEEDS.length);
  } else {
    cells = r.times.map((ok) => (ok ? '  pass' : '     ·')).join('');
    max = r.maxSecs == null ? `  <${(SPEEDS[0] * MSG_SECS).toFixed(1)}s` : `${r.maxSecs.toFixed(1)}s`.padStart(9);
  }
  console.log(String(r.level.n).padStart(3) + '  ' + label(r.level) + '  ' + r.tier.padEnd(7) + cells + max);
}

// Where the ladder dips: a level that forgives MORE misreading than the one before it. Not automatically
// wrong — a new lesson can reset the difficulty on purpose — but every dip should be a choice.
console.log('\n3) SHAPE — where the ladder gets easier instead of harder (judgement)\n');
const dips = [];
for (let i = 1; i < rows.length; i++) {
  const [prev, cur] = [rows[i - 1], rows[i]];
  const pa = prev.a50 == null ? 0.7 : prev.a50;
  const ca = cur.a50 == null ? 0.7 : cur.a50;
  if (ca < pa - 0.02) dips.push(`   ${prev.level.n} -> ${cur.level.n}: forgives more (A50 ${pct(pa).trim()} -> ${pct(ca).trim()})`);
}
console.log(dips.length ? dips.join('\n') : '   none: every level forgives no more misreading than the one before it');
console.log(`\n(${((Date.now() - started) / 1000).toFixed(1)}s)`);
