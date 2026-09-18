// bots.js — simulated players for balancing. There are two kinds, and balance is only trusted when
// both agree.
//
// INSTANT bots read a message's hidden type directly and act on every waiting message in the same
// moment. With time taken out of the picture, they measure what good judgment is worth — if a naive
// strategy ("answer everything", "ignore everything") ever matches a careful one, the decisions don't
// matter and the core loop is broken however good it looks. Most never read message text, so the role
// and level a game is played in make no difference to them. The KEYWORD bots are the exception: they
// judge urgent-vs-trap from words alone, which is how career levels are checked — each promotion must
// break the shortcut that worked at the level before.
//
// HUMAN bots read ONE message at a time and need real time to get through the words, which is what
// an actual person does. The first version of this file had only instant bots. They reported the
// timing as perfectly comfortable — a perfect reader needing 3.5s per message still shipped 97% of
// the time — while a real first-time player was losing about a quarter of all messages to the clock.
// Instant bots clear a whole queue in one tick; people can't. Because humans do read, each role's
// wording is checked separately.
const Core = require('./core');
const { TELLS } = require('./content');

function lcg(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const correct = (card) => (card.type === 'urgent' ? 'respond' : 'ignore');
const flip = (a) => (a === 'respond' ? 'ignore' : 'respond');

// Playing as a decent colleague: answer colleagues' small talk while they owe you fewer than the
// maximum, and pass whatever looks urgent to whoever owes you. `onlyWhenStuck` saves favours for when
// you're on a call and can't answer it yourself.
function withFavours(s, card, looksUrgent, onlyWhenStuck) {
  if (looksUrgent) return s.favours.length && (!onlyWhenStuck || Core.isBusy(s)) ? 'delegate' : 'respond';
  return card.favour && s.favours.length < Core.TUNING.FAVOURS.max ? 'respond' : 'ignore';
}

// A keyword reader spots small talk fine, but decides urgent-vs-trap from words alone.
const byKeyword = (card, looksUrgent) => (card.type === 'trivial' ? 'ignore' : looksUrgent ? 'respond' : 'ignore');

// An unsure reader can tell small talk from work but cannot separate urgent from trap — the coin flip
// at the centre of the game. The pair below differ only in what they do about it, which is the cleanest
// measure of whether saying no is a third option worth having: it should beat guessing, and still lose
// clearly to actually reading the message.
const unsure = (card, whenUnsure, roll) =>
  (card.type === 'trivial' ? 'ignore' : whenUnsure === 'guess' ? (roll < 0.5 ? 'respond' : 'ignore') : whenUnsure);


// ---- instant bots ----

// Each strategy returns 'respond' | 'ignore' | 'delegate' | null (not yet). It is asked again every
// tick once the bot has noticed the card (after its reaction time), with the same private random roll
// for that card each time, so a bot judges each message once, as a person would, while still reacting
// to how many favours it has left.
const STRATEGIES = {
  'Respond to everything': () => 'respond',
  'Ignore everything': () => 'ignore',
  'Perfect reader': (s, card) => correct(card),
  'Perfect reader, lets urgent ring': (s, card) =>
    card.type === 'urgent' ? (card.expiresAt - s.t <= 0.8 ? 'respond' : null) : 'ignore',
  '90% accurate reader': (s, card, roll) => (roll < 0.9 ? correct(card) : flip(correct(card))),
  '80% accurate reader': (s, card, roll) => (roll < 0.8 ? correct(card) : flip(correct(card))),
  'Perfect reader + favours': (s, card) => withFavours(s, card, card.type === 'urgent', false),
  'Perfect reader + favours when stuck': (s, card) => withFavours(s, card, card.type === 'urgent', true),
  '90% accurate + favours': (s, card, roll) => withFavours(s, card, roll < 0.9 ? card.type === 'urgent' : card.type !== 'urgent', false),
  'Keyword reader: "quick" means trap': (s, card) => byKeyword(card, !TELLS.minimising.test(card.text)),
  'Keyword reader: alarm words mean urgent': (s, card) => byKeyword(card, TELLS.alarm.test(card.text)),
  'Coin flip on urgent-vs-trap, guesses': (s, card, roll) => unsure(card, 'guess', roll),
  'Coin flip on urgent-vs-trap, says no': (s, card) => unsure(card, 'decline'),
  'Say no to everything': () => 'decline',
  // Answers everything that isn't a trap. On an ordinary morning that is a waste of a perfectly good
  // focus; on a morning where silence is what costs you, it is the right way to play. Having both here
  // is how the day types are checked: if the same strategy wins every kind of day, the day types are
  // decoration.
  'Sociable reader: answers all but traps': (s, card) => (card.type === 'trap' ? 'ignore' : 'respond'),
  // Keeps a life as well as a job: answers the people outside work, ignores everything else that isn't
  // on fire. Costs a little focus every morning and only pays back across a week (week.js).
  'Perfect reader + answers home': (s, card) => (card.type === 'urgent' || card.personal ? 'respond' : 'ignore'),
  // Reads every message right and never takes a trap, but never gets round to turning one down either —
  // it just lets it run out. A dismissed trap stays gone; an expired one comes back pushier (core.js
  // queueFollowUp), so this is the player level 18 is for.
  'Perfect reader, lets traps run out': (s, card) => (card.type === 'urgent' ? 'respond' : card.type === 'trap' ? null : 'ignore'),
  // The player Snooze is for: reads four in five right, and never gets round to turning a trap down.
  '80% reader, lets traps run out': (s, card, roll) => {
    const seen = roll < 0.8 ? card.type : card.type === 'urgent' ? 'trap' : card.type === 'trap' ? 'urgent' : card.type;
    return seen === 'urgent' ? 'respond' : seen === 'trap' ? null : 'ignore';
  }
};
const DECIDE_STRATEGIES = new Set(['Coin flip on urgent-vs-trap, guesses', 'Coin flip on urgent-vs-trap, says no', 'Say no to everything', 'Sociable reader: answers all but traps', 'Perfect reader + answers home']);
const FAVOUR_STRATEGIES = new Set(Object.keys(STRATEGIES).filter((name) => name.includes('favours')));
const KEYWORD_STRATEGIES = new Set(Object.keys(STRATEGIES).filter((name) => name.startsWith('Keyword')));

function playBot(seed, strategyName, opts) {
  const o = opts || {};
  const strategy = STRATEGIES[strategyName];
  if (!strategy) throw new Error(`Unknown strategy: ${strategyName}`);
  const reaction = o.reaction != null ? o.reaction : 0.8;
  const dt = 0.05;
  const s = Core.createGame({ seed, role: o.role, level: o.level, day: o.day, carry: o.carry, perk: o.perk });
  // rollSeed separates the player's own randomness from the morning's. By default they share a seed, so
  // a pinned campaign morning plays out identically every time — right for the campaign test, which
  // needs one repeatable answer, but it means a pinned level can only ever be sampled ONCE: an 80%
  // reader makes the same three mistakes on every run. curve.js varies this to measure how hard a level
  // actually is. Omitting it leaves every existing result unchanged.
  const rng = lcg((o.rollSeed != null ? o.rollSeed : seed) + 7919);
  const rolls = new Map(); // card id -> the bot's private random roll for that message
  const usesFavours = FAVOUR_STRATEGIES.has(strategyName);
  const hpTimes = o.headphonesAt == null ? [] : [].concat(o.headphonesAt);
  let hpNext = 0;

  while (!s.over) {
    // headphonesAt: one time (put them on then, and again whenever they can be) or a list of times, one go each.
    if (hpTimes.length === 1 ? s.t >= hpTimes[0] : hpNext < hpTimes.length && s.t >= hpTimes[hpNext]) {
      if (Core.useHeadphones(s).length) hpNext++;
    }
    const busy = Core.isBusy(s);
    // While on a call only passing a message on is possible, so only favour players look.
    if (Core.canAct(s, 'respond') || (usesFavours && Core.canAct(s, 'delegate'))) {
      for (const card of s.cards.slice()) {
        if (s.t - card.spawnedAt < reaction) continue;
        if (!rolls.has(card.id)) rolls.set(card.id, rng());
        const decision = strategy(s, card, rolls.get(card.id));
        if (!decision || !Core.canAct(s, decision)) continue;
        Core.act(s, card.id, decision);
        if (!busy && Core.isBusy(s)) break;
      }
    }
    Core.step(s, dt, { holding: o.stopAtTarget ? s.progress < s.rules.target : true });
  }
  return Core.summary(s);
}

function evaluate(strategyName, seeds, opts) {
  let ship = 0, gold = 0, pip = 0, progress = 0, rep = 0, score = 0, banked = 0, used = 0, delegated = 0;
  let declined = 0;
  for (const seed of seeds) {
    const r = playBot(seed, strategyName, opts);
    if (r.shipped && r.endReason !== 'pip') ship++;
    if (r.rating.key === 'gold') gold++;
    if (r.endReason === 'pip') pip++;
    progress += r.progress;
    rep += r.rep;
    score += r.score;
    banked += r.stats.favoursBanked;
    used += r.stats.favoursUsed;
    delegated += r.stats.urgentDelegated;
    declined += r.stats.declined;
  }
  const n = seeds.length;
  return {
    strategy: strategyName, level: (opts && opts.level) || Core.DEFAULT_LEVEL, day: (opts && opts.day) || null, runs: n,
    shipRate: ship / n, goldRate: gold / n, pipRate: pip / n,
    avgProgress: progress / n, avgRep: rep / n, avgScore: score / n,
    favoursBanked: banked / n, favoursUsed: used / n, urgentDelegated: delegated / n,
    declined: declined / n
  };
}

// ---- human bots ----

// Seconds to notice a message, per word to read it, and to decide and click. A newcomer reads
// unfamiliar notification text at roughly the pace of ordinary silent reading (~0.22s a word); once
// the tells are familiar, skimming is faster. These are estimates — real playtesting is the ground
// truth — but they are in the right range, and they are what exposed the original timing problem.
const HUMAN_PROFILES = {
  'First-time player': { notice: 0.7, perWord: 0.22, decide: 0.4 },
  'Practised player': { notice: 0.4, perWord: 0.15, decide: 0.3 }
};

// Session phases: the opening, the middle, and the busy finish.
const PHASES = [{ name: '0-20s', until: 20 }, { name: '20-40s', until: 40 }, { name: '40-60s', until: Infinity }];
const phaseOf = (t) => PHASES.findIndex((p) => t < p.until);

// Two kinds of time pressure are measured, and they are not equally good. Messages LOST to the clock
// before they could be read is the frustrating kind — a player can't do anything about it — so it
// should stay near zero. BACKLOG (two or more messages waiting at once) is the good kind: it forces a
// choice about what to handle first, and it's where the finish should get its intensity from.
// opts.favours plays as a decent colleague (see withFavours). opts.verbs = 'hedge' says no when the
// reader knows it cannot tell urgent from trap, instead of guessing — which is the only honest way to
// measure that verb, since an instant bot is never unsure about anything.
function playHuman(seed, profileName, opts) {
  const o = opts || {};
  const prof = HUMAN_PROFILES[profileName];
  if (!prof) throw new Error(`Unknown human profile: ${profileName}`);
  const accuracy = o.accuracy != null ? o.accuracy : 1;
  const hedging = o.verbs === 'hedge';
  // A person who has read the day's card and changed how they play: on a morning where silence is what
  // costs you, they answer everything they don't take for a trap.
  const sociable = o.style === 'sociable';
  const s = Core.createGame({ seed, role: o.role, level: o.level, day: o.day });
  // rollSeed: as in playBot, lets a pinned morning be sampled more than once. speed scales the whole time
  // this player spends on one message (1 = the profile as written, 1.5 = half as fast again), which is how
  // curve.js finds the slowest reader each level still lets through. Both default to today's behaviour.
  const rng = lcg((o.rollSeed != null ? o.rollSeed : seed) + 104729);
  const speed = o.speed != null ? o.speed : 1;
  const seen = PHASES.map(() => 0);
  const lost = PHASES.map(() => 0);
  const ticks = PHASES.map(() => 0);
  const backlog = PHASES.map(() => 0);
  const distracted = PHASES.map(() => 0);
  let lostUrgent = 0;
  let reading = null; // { id, looksUrgent, doneAt } — the one message this player is dealing with

  while (!s.over) {
    if (reading) {
      const card = s.cards.find((c) => c.id === reading.id);
      if (!card) reading = null; // it expired while being read
      else if (s.t >= reading.doneAt) {
        // Knowing that you cannot tell is different from getting it wrong, and it is the whole case for
        // having a third option: this reader spends a small, known cost instead of taking the coin flip.
        const hedge = hedging && !reading.sure && card.type !== 'trivial';
        const decision = hedge ? 'decline'
          : o.favours ? withFavours(s, card, reading.looksUrgent, false)
          : sociable ? (reading.looksTrap ? 'ignore' : 'respond')
          : (reading.looksUrgent ? 'respond' : 'ignore');
        // Reading carries on while stuck on a call or outside for a fire drill; only the click has to
        // wait (a pass to a colleague works mid-call).
        if (Core.canAct(s, decision)) {
          Core.act(s, card.id, decision);
          reading = null;
        }
      }
    }
    if (!reading && s.cards.length) {
      const card = s.cards.reduce((a, b) => (b.expiresAt < a.expiresAt ? b : a));
      const words = card.text.split(/\s+/).filter(Boolean).length;
      const sure = rng() < accuracy;
      reading = {
        id: card.id,
        sure,
        looksUrgent: sure ? card.type === 'urgent' : card.type !== 'urgent',
        looksTrap: sure ? card.type === 'trap' : card.type !== 'trap',
        doneAt: s.t + (prof.notice + words * prof.perWord + prof.decide) * speed
      };
    }
    for (const ev of Core.step(s, 0.05, { holding: true })) {
      if (ev.type === 'spawn') seen[phaseOf(ev.card.spawnedAt)]++;
      if (ev.type === 'expire') {
        lost[phaseOf(ev.card.spawnedAt)]++;
        if (ev.card.type === 'urgent') lostUrgent++;
      }
    }
    const p = phaseOf(s.t);
    ticks[p]++;
    if (s.cards.length >= 2) backlog[p]++;
    if (s.cards.length >= Core.TUNING.DISTRACTED_AT) distracted[p]++;
  }
  return { summary: Core.summary(s), seen, lost, lostUrgent, ticks, backlog, distracted };
}

function evaluateHuman(profileName, seeds, opts) {
  let ship = 0, gold = 0, pip = 0, lostUrgent = 0, messages = 0, score = 0, banked = 0, used = 0, delegated = 0;
  let rep = 0, declined = 0;
  const totals = { seen: PHASES.map(() => 0), lost: PHASES.map(() => 0), ticks: PHASES.map(() => 0), backlog: PHASES.map(() => 0), distracted: PHASES.map(() => 0) };
  for (const seed of seeds) {
    const r = playHuman(seed, profileName, opts);
    if (r.summary.shipped && r.summary.endReason !== 'pip') ship++;
    if (r.summary.rating.key === 'gold') gold++;
    if (r.summary.endReason === 'pip') pip++;
    lostUrgent += r.lostUrgent;
    messages += r.summary.stats.cardsSeen;
    score += r.summary.score;
    banked += r.summary.stats.favoursBanked;
    used += r.summary.stats.favoursUsed;
    delegated += r.summary.stats.urgentDelegated;
    rep += r.summary.rep;
    declined += r.summary.stats.declined;
    for (const key of Object.keys(totals)) r[key].forEach((v, i) => { totals[key][i] += v; });
  }
  const n = seeds.length;
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const share = (part, whole) => part.map((v, i) => (whole[i] ? v / whole[i] : 0));
  return {
    profile: profileName,
    role: (opts && opts.role) || Core.DEFAULT_ROLE,
    level: (opts && opts.level) || Core.DEFAULT_LEVEL,
    day: (opts && opts.day) || null,
    accuracy: (opts && opts.accuracy != null) ? opts.accuracy : 1,
    favours: !!(opts && opts.favours),
    runs: n,
    shipRate: ship / n,
    goldRate: gold / n,
    pipRate: pip / n,
    avgScore: score / n,
    messagesPerRound: messages / n,
    lostPct: sum(totals.seen) ? sum(totals.lost) / sum(totals.seen) : 0, // share of all messages that expired unread
    lostByPhasePct: share(totals.lost, totals.seen),
    backlogByPhasePct: share(totals.backlog, totals.ticks),                // share of time with 2+ messages waiting
    distractedByPhasePct: share(totals.distracted, totals.ticks),          // share of time with the distracted penalty on
    urgentLostPerRound: lostUrgent / n,
    favoursBanked: banked / n,
    favoursUsed: used / n,
    urgentDelegated: delegated / n,
    avgRep: rep / n,
    declined: declined / n
  };
}

module.exports = { STRATEGIES, FAVOUR_STRATEGIES, KEYWORD_STRATEGIES, DECIDE_STRATEGIES, HUMAN_PROFILES, PHASES, playBot, evaluate, playHuman, evaluateHuman };
