// sim.js — run every simulated player over many seeds and print how the rules treat each one.
// Usage: npm run sim   (optional: node sim.js 500 for a different number of runs)
const { STRATEGIES, FAVOUR_STRATEGIES, KEYWORD_STRATEGIES, PHASES, evaluate, evaluateHuman } = require('./bots');
const { ROLES, ROLE_ORDER, LEVELS, LEVEL_ORDER } = require('./content');
const { TUNING } = require('./core');

const runs = Number(process.argv[2]) || 300;
const seeds = Array.from({ length: runs }, (_, i) => i + 1);
const pct = (v) => `${(v * 100).toFixed(0)}%`.padStart(5);

console.log(`\n9 to 9 — Deep Work balance check (${runs} runs each)`);

console.log('\n1) JUDGMENT — instant bots, time taken out of the picture (reaction 0.8s)');
console.log('   These never read message text, so the result is the same for every role and level.\n');
console.log('strategy                            ship  gold   PIP   avg progress  avg rep  avg score');
console.log('─'.repeat(89));
const rows = Object.keys(STRATEGIES)
  .filter((name) => !FAVOUR_STRATEGIES.has(name) && !KEYWORD_STRATEGIES.has(name))
  .map((name) => evaluate(name, seeds));
rows.push(Object.assign(evaluate('90% accurate reader', seeds, { headphonesAt: 30 }), { strategy: '90% accurate + headphones at 30s' }));
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
    const r = evaluateHuman('First-time player', seeds, { accuracy, role });
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
  favourRow(`instant: ${name}`, evaluate(name, seeds));
}
for (const accuracy of [1, 0.85]) {
  for (const favours of [false, true]) {
    favourRow(`first-timer, ${pct(accuracy).trim()} judgment${favours ? ' + favours' : ''}`, evaluateHuman('First-time player', seeds, { accuracy, favours }));
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

console.log('\nWhat healthy looks like:');
console.log('  1) both naive strategies fail, perfect play ships reliably, and every drop in accuracy costs something.');
console.log('  2) in EVERY role, a first-time player loses almost nothing before they can read it (the frustrating kind');
console.log('     of pressure), while messages pile up toward the finish (the good kind: a real choice of what comes first).');
console.log('  3) using favours scores higher than ignoring all small talk, but a better reader without favours still beats');
console.log('     a worse reader with them: favours reward being a decent colleague, not replace reading messages well.');
console.log('  4) understanding the messages works at every level, "quick means trap" works only at junior, and trusting');
console.log('     alarm words fails at lead. How much harder levels feel to real people is for playtesting to show.');
console.log(`Knobs live in TUNING in core.js (arrivals every ${TUNING.SPAWN_START_S}s easing to ${TUNING.SPAWN_END_S}s, messages last ${TUNING.EXPIRY_RANGE_S.join('-')}s, favours up to ${TUNING.FAVOURS.max}).\n`);
