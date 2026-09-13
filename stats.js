// stats.js — do people come back, and do they pass the game on? Reads the anonymous events and prints,
// for each morning, how many players showed up, how many finished it and how many came back the next
// morning, then the challenge funnel: links made, links opened, challenges played.
//
//   npm run stats                                         the local server's data/events.jsonl
//   npm run stats -- --from https://<site> --token <tok>   a hosted copy (functions/api/events.js)
//
// The two are the same events in the same shape, so everything below this line cannot tell which it
// was given — the playtest reads the same whether it ran on your laptop or on the internet.
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
  // The challenge loop, one player counted once per stage: sending a link is the ask, opening one is
  // the answer, and a finished challenge is the only stage that proves the link actually worked.
  const challenge = { sent: new Set(), opened: new Set(), played: new Set(), runs: 0, beaten: 0 };
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
    if (e.kind === 'invite') challenge.sent.add(e.player);
    if (e.kind === 'accept') challenge.opened.add(e.player);
    if (e.kind === 'challenge') {
      challenge.played.add(e.player);
      challenge.runs++;
      if (e.beat) challenge.beaten++;
    }
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

  return {
    players: firstSeen.size,
    days,
    nextDay: { eligible, returned },
    daysPlayed,
    roles,
    challenge: {
      sent: challenge.sent.size,
      opened: challenge.opened.size,
      played: challenge.played.size,
      runs: challenge.runs,
      beaten: challenge.beaten
    }
  };
}

// Pull the whole log out of the hosted endpoint, a page at a time, following its cursor.
async function fetchEvents(base, token) {
  const all = [];
  let cursor = null;
  do {
    const url = new URL('/api/events', base);
    url.searchParams.set('token', token);
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url.origin} said ${response.status} ${response.statusText}`);
    const page = await response.json();
    all.push(...page.events);
    cursor = page.cursor;
  } while (cursor);
  return all;
}

function argOf(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? null : process.argv[at + 1];
}

async function main() {
  const from = argOf('from');
  const token = argOf('token');
  if (from && !token) {
    console.log('\n--from needs --token as well: the hosted endpoint will not hand the events to anyone else.\n');
    return;
  }
  const events = from ? await fetchEvents(from, token) : readEvents(EVENTS_FILE);
  const today = Daily.morningNumber(Date.now());
  console.log(`\n9 to 9 — daily morning: do people come back?   (today is Morning #${today}, ${Daily.morningDate(today)})\n`);
  if (!events.length) {
    console.log(from
      ? `No plays recorded yet at ${from}. They land in KV when someone opens the hosted game.\n`
      : 'No plays recorded yet. They land in data/events.jsonl when someone opens the game served by `npm start`.\n');
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
  const c = r.challenge;
  console.log(c.sent || c.opened || c.runs
    ? `\nChallenges: ${players(c.sent)} sent a link · ${players(c.opened)} opened one · ${players(c.played)} played it ` +
      `(${c.runs} round${c.runs === 1 ? '' : 's'}, ${c.beaten} beat the score)`
    : '\nChallenges: none sent yet. The button is on the result screen of a practice round.');
  console.log('');
}

if (require.main === module) main().catch((err) => { console.error(`\nCould not read the stats: ${err.message}\n`); process.exitCode = 1; });

module.exports = { EVENTS_FILE, readEvents, fetchEvents, summarise };
