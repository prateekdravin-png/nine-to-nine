// stats.js — do people come back? Reads the anonymous events the server records for the daily morning
// (data/events.jsonl) and prints, for each morning, how many players showed up, how many finished it,
// and how many came back the next morning. Usage: npm run stats
const fs = require('fs');
const path = require('path');
const Daily = require('./daily');
const { ROLES } = require('./content');

const EVENTS_FILE = path.join(__dirname, 'data', 'events.jsonl');

function readEvents(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch (e) { return null; } })
    .filter(Boolean);
}

// `today` is the current morning number: a morning only has a "came back" figure once the next one
// has started.
function summarise(events, today) {
  const seen = new Map();      // morning -> players who opened the game (finishing counts too)
  const finished = new Map();  // morning -> players who finished that morning
  const firstSeen = new Map(); // player -> their first morning
  const roles = {};
  const add = (map, key, player) => {
    if (!map.has(key)) map.set(key, new Set());
    const set = map.get(key);
    const isNew = !set.has(player);
    set.add(player);
    return isNew;
  };
  for (const e of events) {
    add(seen, e.day, e.player);
    if (e.kind === 'daily' && add(finished, e.day, e.player)) roles[e.role] = (roles[e.role] || 0) + 1;
    if (!firstSeen.has(e.player) || e.day < firstSeen.get(e.player)) firstSeen.set(e.player, e.day);
  }
  const none = new Set();

  const days = [...seen.keys()].sort((a, b) => a - b).map((day) => {
    const players = seen.get(day);
    const next = seen.get(day + 1) || none;
    return {
      day,
      date: Daily.morningDate(day),
      players: players.size,
      finished: (finished.get(day) || none).size,
      cameBack: day < today ? [...players].filter((p) => next.has(p)).length : null,
      stillOpen: day + 1 === today // the next morning isn't over, so cameBack can still rise
    };
  });

  // The headline number: of the players whose first morning is over, how many played the one after.
  let eligible = 0;
  let returned = 0;
  for (const [player, first] of firstSeen) {
    if (first >= today) continue;
    eligible++;
    if ((seen.get(first + 1) || none).has(player)) returned++;
  }

  const perPlayer = new Map();
  for (const players of seen.values()) for (const p of players) perPlayer.set(p, (perPlayer.get(p) || 0) + 1);
  const daysPlayed = { 1: 0, 2: 0, '3+': 0 };
  for (const n of perPlayer.values()) daysPlayed[n >= 3 ? '3+' : n]++;

  return { players: firstSeen.size, days, nextDay: { eligible, returned }, daysPlayed, roles };
}

function main() {
  const events = readEvents(EVENTS_FILE);
  const today = Daily.morningNumber(Date.now());
  console.log(`\n9 to 9 — daily morning: do people come back?   (today is Morning #${today}, ${Daily.morningDate(today)})\n`);
  if (!events.length) {
    console.log('No plays recorded yet. They land in data/events.jsonl when someone opens the game served by `npm start`.\n');
    return;
  }
  const r = summarise(events, today);
  const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '-');

  console.log('morning  date        players  finished  came back next morning');
  console.log('─'.repeat(66));
  for (const d of r.days) {
    const back = d.cameBack == null ? '—' : `${d.cameBack} of ${d.players} (${pct(d.cameBack, d.players)})${d.stillOpen ? ' so far' : ''}`;
    console.log(`#${d.day}`.padEnd(9) + d.date.padEnd(12) + String(d.players).padStart(7) + String(d.finished).padStart(10) + '  ' + back);
  }
  const { eligible, returned } = r.nextDay;
  const players = (n) => `${n} player${n === 1 ? '' : 's'}`;
  console.log(eligible
    ? `\nNext-morning return: ${returned} of ${players(eligible)} (${pct(returned, eligible)}) played again the morning after their first.`
    : '\nNext-morning return: not known yet. It shows up once the players\' first morning is over.');
  console.log(`Mornings played per player: 1 → ${r.daysPlayed[1]} · 2 → ${r.daysPlayed[2]} · 3+ → ${r.daysPlayed['3+']}   (${players(r.players)} in total)`);
  const roleLine = Object.entries(r.roles)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${ROLES[id] ? `${ROLES[id].emoji} ${ROLES[id].label}` : id} ${n}`)
    .join(' · ');
  if (roleLine) console.log(`Finished mornings by role: ${roleLine}`);
  console.log('');
}

if (require.main === module) main();

module.exports = { EVENTS_FILE, readEvents, summarise };
