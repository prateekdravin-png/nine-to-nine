// sim.js — run every simulated player over many seeds and print how the rules treat each one.
// Usage: npm run sim   (optional: node sim.js 500 for a different number of runs)
const { STRATEGIES, FAVOUR_STRATEGIES, KEYWORD_STRATEGIES, DECIDE_STRATEGIES, PHASES, evaluate, evaluateHuman } = require('./bots');
const { ROLES, ROLE_ORDER, LEVELS, LEVEL_ORDER, DAYS } = require('./content');
const { TUNING } = require('./core');

const runs = Number(process.argv[2]) || 300;
const seeds = Array.from({ length: runs }, (_, i) => i + 1);
const pct = (v) => `${(v * 100).toFixed(0)}%`.padStart(5);
// Sections 1-3 hold the kind of morning still, so each measures the thing it is about rather than which
// day type the seeds happened to draw. Day types have section 7 and the work week section 8.
const PLAIN = 'normal';

console.log(`\n9 to 9 — Deep Work balance check (${runs} runs each)`);

console.log('\n1) JUDGMENT — instant bots, time taken out of the picture (reaction 0.8s)');
console.log('   Held to an ordinary morning, so this measures judgment and not which kind of day a seed picked');
console.log('   (day types have their own section). These never read message text, so every role reads the same.\n');
console.log('strategy                            ship  gold   PIP   avg progress  avg rep  avg score');
console.log('─'.repeat(89));
const rows = Object.keys(STRATEGIES)
  .filter((name) => !FAVOUR_STRATEGIES.has(name) && !KEYWORD_STRATEGIES.has(name) && !DECIDE_STRATEGIES.has(name))
  .map((name) => evaluate(name, seeds, { day: PLAIN }));
rows.push(Object.assign(evaluate('90% accurate reader', seeds, { headphonesAt: 30, day: PLAIN }), { strategy: '90% accurate + headphones at 30s' }));
for (const r of rows) {
  console.log(
    r.strategy.padEnd(34) +
      pct(r.shipRate) + ' ' + pct(r.goldRate) + ' ' + pct(r.pipRate) +
      `${r.avgProgress.toFixed(0)}%`.padStart(14) +
      r.avgRep.toFixed(0).padStart(9) +
      r.avgScore.toFixed(0).padStart(11)
  );
}

const phaseHeads = PHASES.map((p) => p.name.padStart(7)).join('');
console.log('\n2) TIME — a first-time junior reading one message at a time, in every role\n');
console.log(`role               judgment  ship  gold  msgs |  LOST before read: all${phaseHeads} |  2+ WAITING:${phaseHeads}`);
console.log('─'.repeat(121));
for (const role of ROLE_ORDER) {
  for (const accuracy of [1, 0.85]) {
    const r = evaluateHuman('First-time player', seeds, { accuracy, role, day: PLAIN });
    console.log(
      `${ROLES[role].emoji} ${ROLES[role].label}`.padEnd(18) + pct(accuracy).padStart(9) + ' ' + pct(r.shipRate) + ' ' + pct(r.goldRate) +
        r.messagesPerRound.toFixed(0).padStart(6) + ' |' +
        pct(r.lostPct).padStart(23) + r.lostByPhasePct.map((v) => pct(v).padStart(7)).join('') + ' |' +
        ' '.repeat(12) + r.backlogByPhasePct.map((v) => pct(v).padStart(7)).join('')
    );
  }
}

console.log('\n3) FAVOURS — does being a decent colleague pay, without beating good judgment?\n');
console.log('player                                        ship  gold  avg score   banked  used  on urgent');
console.log('─'.repeat(95));
const favourRow = (label, r) => console.log(
  label.padEnd(44) + pct(r.shipRate) + ' ' + pct(r.goldRate) + r.avgScore.toFixed(0).padStart(11) +
    r.favoursBanked.toFixed(1).padStart(9) + r.favoursUsed.toFixed(1).padStart(6) + r.urgentDelegated.toFixed(1).padStart(11)
);
for (const name of ['Perfect reader', 'Perfect reader + favours', 'Perfect reader + favours when stuck', '90% accurate reader', '90% accurate + favours']) {
  favourRow(`instant: ${name}`, evaluate(name, seeds, { day: PLAIN }));
}
for (const accuracy of [1, 0.85]) {
  for (const favours of [false, true]) {
    favourRow(`first-timer, ${pct(accuracy).trim()} judgment${favours ? ' + favours' : ''}`, evaluateHuman('First-time player', seeds, { accuracy, favours, day: PLAIN }));
  }
}

console.log('\n4) CAREER LEVELS — does each promotion break the shortcut that worked before?');
console.log('   Gold rate at each level. Keyword readers judge urgent-vs-trap from words alone.\n');
console.log('player                                       ' + LEVEL_ORDER.map((id) => `${LEVELS[id].emoji} ${LEVELS[id].label}`.padEnd(12)).join(''));
console.log('─'.repeat(45 + 12 * LEVEL_ORDER.length));
for (const name of ['Perfect reader', 'Keyword reader: "quick" means trap', 'Keyword reader: alarm words mean urgent', 'Respond to everything', 'Ignore everything']) {
  console.log(name.padEnd(45) + LEVEL_ORDER.map((level) => pct(evaluate(name, seeds, { level }).goldRate).padEnd(12)).join(''));
}
console.log('first-timer: messages lost before read'.padEnd(45) + LEVEL_ORDER.map((level) => pct(evaluateHuman('First-time player', seeds, { level }).lostPct).padEnd(12)).join(''));

console.log('\n5) BOSSES AND EVENTS — does every kind of morning stay fair?');
console.log('   Mornings grouped by their boss and by each office event they include.\n');
console.log('kind of morning           mornings | first-timer: LOST before read   gold | perfect reader gold   avg score');
console.log('─'.repeat(104));
{
  const Core = require('./core');
  const { BOSSES, EVENTS } = require('./content');
  const groups = {};
  for (let seed = 1; seed <= runs * 3; seed++) {
    const plan = Core.planMorning(seed);
    for (const key of [`boss:${plan.boss}`, ...plan.events.map((e) => `event:${e.id}`)]) (groups[key] = groups[key] || []).push(seed);
  }
  const rowsOf = [...Core.BOSS_ORDER.map((id) => [`boss:${id}`, `${BOSSES[id].emoji} ${BOSSES[id].label}`]), ...Core.EVENT_ORDER.map((id) => [`event:${id}`, `${EVENTS[id].emoji} ${EVENTS[id].title.replace(/!$/, '')}`])];
  for (const [key, label] of rowsOf) {
    const group = groups[key].slice(0, runs);
    const human = evaluateHuman('First-time player', group);
    const perfect = evaluate('Perfect reader', group);
    console.log(label.padEnd(25) + String(group.length).padStart(9) + ' |' + pct(human.lostPct).padStart(31) + pct(human.goldRate).padStart(7) + ' |' + pct(perfect.goldRate).padStart(20) + perfect.avgScore.toFixed(0).padStart(12));
  }
}

console.log('\n6) SAYING NO — is there a real decision left when you cannot read the message?\n');
console.log('   Instant bots are never unsure, so the verb is also measured on the people who are.\n');
console.log('player                                                ship  gold  avg rep  avg score   said no');
console.log('─'.repeat(100));
const verbRow = (name, label) => {
  const r = evaluate(name, seeds);
  console.log(
    (label || name).padEnd(52) + pct(r.shipRate) + ' ' + pct(r.goldRate) + r.avgRep.toFixed(0).padStart(9) +
      r.avgScore.toFixed(0).padStart(11) + r.declined.toFixed(1).padStart(10)
  );
};
for (const name of ['Perfect reader', 'Coin flip on urgent-vs-trap, guesses', 'Coin flip on urgent-vs-trap, says no', 'Say no to everything']) verbRow(name);
for (const accuracy of [1, 0.95, 0.8]) {
  for (const verbs of [null, 'hedge']) {
    const r = evaluateHuman('First-time player', seeds, { accuracy, verbs });
    console.log(
      `first-timer, ${pct(accuracy).trim()} judgment${verbs ? ', says no when unsure' : ''}`.padEnd(52) +
        pct(r.shipRate) + ' ' + pct(r.goldRate) + r.avgRep.toFixed(0).padStart(9) + r.avgScore.toFixed(0).padStart(11) + r.declined.toFixed(1).padStart(10)
    );
  }
}

console.log('\n7) DAY TYPES — does the best way to play actually change with the kind of morning?');
console.log('   Gold rate. READING answers what is urgent and ignores the rest; ANSWERING replies to everyone but traps.\n');
{
  const CoreDays = require('./core').DAY_ORDER;
  const head = CoreDays.map((id) => `${DAYS[id].emoji} ${DAYS[id].label}`.padEnd(22)).join('');
  console.log('player'.padEnd(40) + head);
  console.log('─'.repeat(40 + 22 * CoreDays.length));
  const dayRow = (label, fn) => console.log(label.padEnd(40) + CoreDays.map((day) => pct(fn(day)).padEnd(22)).join(''));
  dayRow('instant: READING the messages', (day) => evaluate('Perfect reader', seeds, { day }).goldRate);
  dayRow('instant: ANSWERING everyone but traps', (day) => evaluate('Sociable reader: answers all but traps', seeds, { day }).goldRate);
  dayRow('instant: respond to everything', (day) => evaluate('Respond to everything', seeds, { day }).goldRate);
  dayRow('instant: ignore everything', (day) => evaluate('Ignore everything', seeds, { day }).goldRate);
  dayRow('first-timer 85%, plays every day alike', (day) => evaluateHuman('First-time player', seeds, { accuracy: 0.85, day }).goldRate);
  dayRow('first-timer 85%, answers everyone', (day) => evaluateHuman('First-time player', seeds, { accuracy: 0.85, day, style: 'sociable' }).goldRate);
  dayRow('first-timer: finished the morning', (day) => evaluateHuman('First-time player', seeds, { accuracy: 0.85, day }).shipRate);
  dayRow('first-timer: LOST before read', (day) => evaluateHuman('First-time player', seeds, { accuracy: 0.85, day }).lostPct);
  console.log('\ntarget and the reputation a gold needs, per day:');
  console.log('  ' + CoreDays.map((day) => `${DAYS[day].label}: ${TUNING.DAYS[day].target}% / ${TUNING.DAYS[day].goldRep} rep`).join(' · '));
}

console.log('\n8) THE WORK WEEK — does spending everything you have actually cost you by Friday?');
console.log('   Five mornings on one set of meters (week.js). Habits differ only in how hard they push and whether\n   they answer the people outside work.\n');
{
  const Week = require('./week');
  const { playBot } = require('./bots');
  const CoreDays = require('./core').DAY_ORDER;
  const weekSeeds = seeds.slice(0, Math.min(120, seeds.length));
  const playWeek = (seed, habit) => {
    let week = Week.newWeek(seed);
    const plan = Week.dayPlan(seed, CoreDays);
    while (!week.over) {
      const i = week.index;
      week = Week.afterMorning(week, playBot(Week.seedForMorning(seed, i), habit.strategy, {
        day: plan[i], carry: Week.carryFor(week), stopAtTarget: !!habit.pace
      }));
    }
    return week;
  };
  const HABITS = [
    { name: 'Push flat out, ignore home', strategy: 'Perfect reader' },
    { name: 'Push flat out, answer home', strategy: 'Perfect reader + answers home' },
    { name: 'Pace it, ignore home', strategy: 'Perfect reader', pace: true },
    { name: 'Pace it, answer home', strategy: 'Perfect reader + answers home', pace: true }
  ];
  console.log('habit'.padEnd(30) + 'Fri energy  Fri home  delivered   points   most common verdict');
  console.log('\u2500'.repeat(96));
  for (const habit of HABITS) {
    let energy = 0, home = 0, shipped = 0, score = 0;
    const verdicts = {};
    for (const seed of weekSeeds) {
      const week = playWeek(seed, habit);
      const v = Week.verdict(week);
      energy += week.energy; home += week.home; shipped += v.shipped; score += v.score;
      verdicts[v.key] = (verdicts[v.key] || 0) + 1;
    }
    const n = weekSeeds.length;
    const top = Object.entries(verdicts).sort((a, b) => b[1] - a[1])[0];
    console.log(
      habit.name.padEnd(30) + (energy / n).toFixed(0).padStart(10) + (home / n).toFixed(0).padStart(10) +
        `${(shipped / n).toFixed(1)}/5`.padStart(11) + (score / n).toFixed(0).padStart(9) + '   ' +
        `${top[0]} ${Math.round((top[1] / n) * 100)}%`
    );
  }
}

console.log('\n9) BOUGHT TIME — does a run of right calls reward reading, without paying off the mistakes?');
console.log(`   A run of ${TUNING.TIME_BONUS.run} right calls in a row banks ${TUNING.TIME_BONUS.seconds}s, spent automatically on later interruptions.\n`);
{
  const { playBot } = require('./bots');
  console.log('player                                        gold   earns it   banked   spent   (bonus is a 5s gift into a 60s morning)');
  console.log('\u2500'.repeat(108));
  const verbRow2 = (label, name, opts) => {
    const r = evaluate(name, seeds, Object.assign({ day: PLAIN }, opts));
    let won = 0, spent = 0, rounds = 0;
    for (const seed of seeds.slice(0, 80)) {
      const one = playBot(seed, name, Object.assign({ day: PLAIN }, opts));
      won += one.stats.timeWon; spent += one.stats.timeSaved; rounds++;
    }
    console.log(label.padEnd(44) + pct(r.goldRate) + (won / rounds > 0 ? '' : '') + `${((won / rounds) / TUNING.TIME_BONUS.seconds * 100).toFixed(0)}%`.padStart(11) + `${(won / rounds).toFixed(1)}s`.padStart(9) + `${(spent / rounds).toFixed(1)}s`.padStart(8));
  };
  verbRow2('reads the messages', 'Perfect reader');
  verbRow2('answers everyone but traps', 'Sociable reader: answers all but traps');
  verbRow2('falls for every trap (senior keyword reader)', 'Keyword reader: "quick" means trap', { level: 'senior' });
  verbRow2('answers absolutely everything', 'Respond to everything');
}

console.log('\nWhat healthy looks like:');
console.log('  1) both naive strategies fail, perfect play ships reliably, and every drop in accuracy costs something.');
console.log('  2) in EVERY role, a first-time player loses almost nothing before they can read it (the frustrating kind');
console.log('     of pressure), while messages pile up toward the finish (the good kind: a real choice of what comes first).');
console.log('  3) using favours scores higher than ignoring all small talk, but a better reader without favours still beats');
console.log('     a worse reader with them: favours reward being a decent colleague, not replace reading messages well.');
console.log('  4) understanding the messages works at every level, "quick means trap" works only at junior, and trusting');
console.log('     alarm words fails at lead. How much harder levels feel to real people is for playtesting to show.');
console.log('  9) the bonus goes to players who read well and stays out of reach of players who do not: a reader who');
console.log('     falls for every trap should almost never collect it, because a trap taken ends the run. It must never');
console.log('     narrow the margin between reading the messages and not reading them.');
console.log('  8) a week spent flat out ends with the most points and the worst Friday; pacing and answering the people');
console.log('     outside work delivers a little less and ends the week still standing. If one habit won both, the two');
console.log('     meters would be decoration — what you delivered and what it cost have to be able to come apart.');
console.log('  7) no single row wins every column. Reading wins an ordinary morning and a backlog day; answering everyone');
console.log('     wins an appraisal morning and loses badly elsewhere. If one row won everywhere, the day types would be');
console.log('     scenery, and a person who adapts to the day should beat one who plays every morning the same way.');
console.log('  6) a reader who says no when unsure beats the same reader guessing, by a lot, and still loses to one who can');
console.log('     actually read the message. A confident reader barely touches it. Saying no to everything ends in a PIP.');
console.log(`Knobs live in TUNING in core.js (arrivals every ${TUNING.SPAWN_START_S}s easing to ${TUNING.SPAWN_END_S}s, messages last ${TUNING.EXPIRY_RANGE_S.join('-')}s, favours up to ${TUNING.FAVOURS.max}).\n`);
