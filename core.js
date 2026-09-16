// core.js — the rules of the Deep Work session, with no DOM, no timers and no sound. Everything
// here is a pure function of state plus explicit input, advanced in fixed steps, so the same seed and
// the same inputs always produce the same run. That is what makes it possible to test the rules and
// to balance them with simulated players (sim.js) rather than by feel alone.
//
// The design question this prototype exists to answer: is triaging interruptions while protecting
// your focus actually fun, and does it stay fun? The rules are built around one idea — in real IT
// work the doing isn't the hard part, the interruptions are — so the cost of an interruption scales
// with how deep in focus you were when it arrived.
//
// The player picks a role and a career level (content.js). A role changes what the messages say and
// what the game calls the work; a level changes how well traps hide. Neither changes these rules, so
// results compare fairly and one balance check covers all of them. What does change from morning to
// morning is the boss of the day and the office events (planMorning), so rounds don't feel the same.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./content'));
  else root.NineCore = factory(root.NineContent);
})(typeof self !== 'undefined' ? self : this, function (Content) {
  'use strict';

  // Every balance knob in one place. sim.js reports how each change moves the outcomes.
  const TUNING = {
    DURATION: 60,              // seconds of real time; shown in game as 10:00 AM to 1:00 PM
    START_REP: 60,
    FLOW_GAIN_PER_S: 26,       // ~4s of uninterrupted work to reach DEEP WORK from nothing
    FLOW_DECAY_IDLE_PER_S: 30,
    FLOW_DECAY_BUSY_PER_S: 45, // being pulled into something drains focus faster than pausing
    DISTRACTED_AT: 3,          // open notifications at or above this halve flow gain
    DISTRACTED_FACTOR: 0.5,
    BASE_PROGRESS_PER_S: 1.0,  // deliverable % per second at ×1
    TIERS: [
      { min: 0, mult: 1, name: 'Warming up' },
      { min: 25, mult: 1.5, name: 'Focused' },
      { min: 50, mult: 2, name: 'In flow' },
      { min: 75, mult: 3, name: 'DEEP WORK' }
    ],
    // Arrival pacing follows an eased curve, not a straight line: the gap between messages stays
    // near SPAWN_START_S through the opening, while a player is still learning to read the tells,
    // then tightens toward SPAWN_END_S for a busy finish. The first version ramped linearly to a new
    // message every 1.7s, with shorter lifetimes and longer wording, and a first-time player was
    // losing about a quarter of all messages to the clock before they could even read them.
    //
    // Pressure at the finish now comes from messages PILING UP — a backlog to prioritise, plus the
    // distracted penalty — not from messages vanishing unread, which is the frustrating kind of
    // pressure playtesting flagged. Tuned against the human players in bots.js: a first-time player
    // loses nothing to the clock, and has 2+ messages waiting about a quarter of the final 20 seconds
    // but never in the opening. (The only tuning that forced some unread losses at the finish did it
    // by shortening lifetimes again, which would have reintroduced the original problem.)
    FIRST_SPAWN_S: 3.0,
    SPAWN_START_S: 4.2,
    SPAWN_END_S: 1.2,
    SPAWN_EASE: 2,             // 1 = linear; higher keeps the opening calmer for longer
    SPAWN_JITTER: 0.35,
    MAX_CARDS: 5,
    TYPE_WEIGHTS: { urgent: 0.3, trivial: 0.4, trap: 0.3 },
    // One shared range for every type. If urgent messages expired faster, the speed of the countdown
    // bar would give away what a message is, and players would learn to watch the bar instead of
    // reading — which is exactly the skill the game is supposed to be about. Longer than the original
    // 4.2–6.0s, which was half of the "too narrow to read and respond" problem.
    EXPIRY_RANGE_S: [5.4, 7.2],
    RESPOND: {
      urgent: { busy: 1.6, rep: 8 },
      trivial: { busy: 1.2, rep: 2 },
      trap: { busy: 4.5, rep: 0, flowToZero: true }
    },
    IGNORE: {
      urgent: { rep: -15 },
      trivial: { rep: 0 },
      trap: { rep: 0 }
    },
    // Saying no. A reply rather than a dismissal: it closes the message for good, with no follow-up,
    // at one fixed cost whatever the message turned out to be. It is never the best play — a good
    // reader responds to what is urgent and ignores the rest — but it is much the cheapest way to be
    // WRONG, and that is the point. Before it, a message you could not read was a coin flip between
    // -15 and 0; now it is a decision, and knowing that you do not know is worth something.
    //
    // Two small costs rather than one large one. Reputation alone had to be steep enough that saying no
    // to a whole morning ended in a PIP, and at that size it was also too steep to use as the hedge it
    // is meant to be. A short pause as well — you still have to write the no — means a morning of them
    // wrecks your focus too, so the blanket strategy fails on its own without making one polite no
    // expensive. Both costs are identical for every type of message, so neither says what it was.
    DECLINE: { rep: -4, busy: 0.5 },
    // What finishing means, by career level. Asking a junior for the same hundred per cent as a lead was
    // never realistic — nobody delivers a whole feature in a morning full of interruptions, and at the
    // start of a career nobody expects you to. What grows with the career is both halves of the job: the
    // share of the work you are expected to land, and whether anything else is allowed to slip while you
    // land it. A junior who gets most of it done has had a good morning. A lead is expected to get all of
    // it done AND to have dropped nothing on the way, which is the actual difference between the two.
    //
    // `share` multiplies the day type's number, so a backlog day still asks for more than an ordinary one
    // at every level. `also` is the rest of the job: limits that have to hold before the work counts as
    // finished at all.
    LEVEL_DEMAND: {
      junior: { share: 0.85, also: { trapsTaken: 3 } },
      senior: { share: 0.9,  also: { trapsTaken: 2, urgentMissed: 2 } },
      lead:   { share: 1.0,  also: { trapsTaken: 1, urgentMissed: 0 } }
    },
    // Day types. The rules never change; what changes is what the morning is FOR, and that turns out
    // to be enough to change how you play it. A normal morning rewards protecting your focus. On an
    // appraisal day nothing you build matters next to who saw you ignore them. On a backlog day there
    // is no deep end to get into, so interruptions are cheap and traps are the only real danger.
    // Working from home hands you the quiet you always said you wanted and makes it harder to use.
    // A release day makes every urgent message matter twice, both ways.
    //
    // Each is a short list of overrides on the knobs above, resolved once into s.rules when a game
    // starts (see rulesFor). Nothing in the loop asks which kind of day it is, so a day type can never
    // grow into a special case, and one balance check covers all of them (npm run sim, section 7).
    DAYS: {
      normal:    { weight: 3, target: 100, goldRep: 70 },
      // The free move is gone: small talk you can't be bothered with is now worth saying no to rather
      // than leaving unanswered, and there is barely a deliverable to hide behind.
      appraisal: { weight: 2, target: 80, goldRep: 88, ignore: { urgent: -20, trivial: -5, trap: 0 } },
      // A pile of small unrelated tickets. Flow multipliers are gone and the work pays a flat, faster
      // rate, so the only thing that hurts is time spent not working.
      backlog:   { weight: 2, target: 105, goldRep: 70, tiers: [{ min: 0, mult: 1, name: 'Chipping away' }], progressPerS: 2.4 },
      // Half the office can't reach you, and it turns out the interruptions were never the hard part.
      // It asks for MORE than an ordinary morning, not less: you have been given the quiet, so the day
      // expects you to use it. At the old, gentler number, answering every message blindly was a viable
      // way to spend a quiet morning, which is the one thing no day type is allowed to reward.
      wfh:       { weight: 2, target: 105, goldRep: 70, spawnScale: 1.45, flowGain: 0.7, flowDecayIdle: 1.35 },
      // Ship day: most of what lands really is on fire.
      release:   { weight: 1, target: 95, goldRep: 70, weights: { urgent: 0.45, trivial: 0.2, trap: 0.35 }, respond: { urgent: { busy: 1.6, rep: 11 } }, ignore: { urgent: -20, trivial: 0, trap: 0 } }
    },
    // Answering someone at home is not the same size of interruption as answering a colleague's chat,
    // and across a week that difference is the whole decision: keeping a life costs working time.
    // Time bought back. Reading well has only ever been rewarded by what it SAVES you — no reputation
    // lost, no call taken — and avoiding a loss is a much weaker feeling than being handed something.
    // A run of right calls in a row banks seconds, and the bank is spent automatically on the next
    // thing that pulls you away: you are on top of your inbox, so you get off the call faster.
    //
    // The obvious version of this was to add the seconds to the end of the morning, and the simulated
    // players killed it. A longer morning means the backlog you were carrying at noon now expires
    // instead of being saved by the bell: messages lost before they could be read went from 3% to 14%,
    // and a first-timer's gold rate FELL from 62% to 52% the more time they won. A reward that punishes
    // you for earning it is worse than no reward. Spending the seconds on interruptions instead cannot
    // cost anyone a message, gives the time back as the thing players actually want (working time), and
    // is worth most to the player who is getting interrupted most.
    //
    // Only decisions you actually make count. A message that expires never builds a run, or a player
    // could walk away and collect one; an urgent one expiring still breaks it, because that is a miss.
    //
    // Neither the size of the gift nor the length of the run is a matter of taste; both were swept
    // against the simulated players. Seconds are the biggest unit in this game — an urgent call is 1.6
    // of them and a trap 4.5, out of a morning that is only sixty — so five is a large gift, and behind
    // a short run it went to everybody: answering every message blindly went from 43% gold to 88%, and a
    // reader who fell for every trap at senior went from 7% to 21%. Giving back working time pays off
    // exactly the mistake the game is about.
    //
    // The fix was not to shrink the gift but to put it out of reach of anyone making that mistake. A
    // trap taken breaks the run, so a long run excludes those players while leaving a good reader
    // untouched: at twelve, the margin between reading the messages and not reading them is wider than
    // with no bonus at all (55 points against 52), and the keyword reader is back to 8%. A morning at
    // full marks earns it every time, a strong reader two mornings in three, a shaky one about a quarter.
    TIME_BONUS: { run: 12, seconds: 5, maxPerRound: 5, minBusy: 1.1 },
    PERSONAL_BUSY: 1.8,
    PEEK_FLOW_COST: 18,        // variant B only: reading a collapsed message costs focus
    HEADPHONES: { charges: 1, duration: 10 },
    // Perks: one small edge a campaign morning can be started with (rewards.js names them and says which
    // level unlocks each). Every one is checked against the player who answers without reading, since
    // anything that softens a mistake is a candidate for paying people to stop reading.
    //   coffee      the first few emergencies you take yourself do not drain your focus while you are on them
    //   headphones  one extra go with the headphones
    //   cover       the first trap you take is over sooner and does not reset your focus. The one place a
    //               trap is ever softened, and exactly once, so it forgives a slip and not a habit
    //
    // The rule, in test/rewards.test.js: a perk may narrow the gold-rate gap between a 90% reader and a
    // player who answers everything unread by at most 12 points at any career level, must be worth at least
    // 20 points to an 80% reader, and no campaign level may fall to its naive player carrying it. Where
    // these numbers came from:
    //   coffee      3 calls let "respond to everything" clear Release day; 2 does not, and is worth +43.
    //   cover       over at the 1.1s floor it also cleared Release day for that player; keeping only your
    //               focus was safe but worth +13. At 3s: gap -2, worth +35, nothing falls.
    //   headphones  a second full pair narrowed the gap by 23 points at junior, and two back to back over
    //               the finish cleared Appraisal for a player who ignores every colleague. A 6s spare that
    //               cannot go on for 15s after the first comes off: worst case -6, worth +24, nothing falls
    //               however the two are timed. A 10s spare with the same wait still narrowed it by 14.
    PERKS: {
      coffee: { urgentCalls: 2 },
      headphones: { extraCharges: 1, spareDuration: 6, cooldown: 15 },
      cover: { traps: 1, busy: 3 }
    },
    // Colleague favours. Answering small talk from a colleague (a person, not a bot, a group chat or
    // family) banks a favour from them; passing a message on spends the oldest one. On something
    // genuinely urgent they handle it: no call, no lost focus, a little credit, and it works even while
    // you're stuck on a call. On anything else the favour is simply wasted. Before favours, the right
    // move for small talk was always "ignore"; now it's a real trade of a little focus now for a rescue
    // later — worth it, but never worth more than reading messages well (see sim.js and the tests).
    //
    // Tuned with the simulated players. At first a colleague's reply took as long as any other small talk
    // (1.2s), and replying cost almost exactly the focus a favour later saved: a perfect reader gained
    // 0.3% from using favours, so nobody would ever notice they mattered. A quick 0.8s reply makes them
    // pay (about +3% for a perfect reader, +4% for a typical first-timer) while a 90% reader using
    // favours still scores clearly below a perfect reader who ignores them. At 0.4–0.6s that gap closed,
    // and favours started to replace reading well.
    FAVOURS: { max: 3, urgentRep: 5, replyBusy: 0.8 },
    // Boss of the day: one per morning, and it changes the mix. Whatever isn't set uses the defaults above.
    // The Last-Minute Boss first slowed the pacing curve instead, which only delayed the rush without
    // making noon any busier; stretching the same arrival times toward noon does both.
    BOSSES: {
      reasonable: {},
      micromanager: { weights: { urgent: 0.34, trivial: 0.38, trap: 0.28 } }, // more urgent messages
      lastminute: { warp: 0.75 },                                              // the same messages, pushed toward noon
      nicetrap: { weights: { urgent: 0.26, trivial: 0.34, trap: 0.4 } }        // more traps
    },
    // Office events: one or two a morning, each starting inside its own window so they never overlap,
    // and never in the opening seconds while a player is still finding their feet.
    //
    // Tuned with the simulated players, like everything else here. The first version ADDED messages
    // (an outage brought three extra emergencies, lunch three extra colleagues) and released held
    // messages 0.7s apart; together with trap follow-ups, a first-time player lost 17% of messages
    // before reading them — the original "too narrow" problem back again. Now outage and lunch change
    // what the next messages are rather than adding more, held messages land 1.6s apart, and a first-time
    // player loses about 1%. A 5s fire drill with a full focus drain still cost perfect play too much
    // (gold on 80% of drill mornings, against 93% on ordinary ones); 3.5s at half drain keeps it a real
    // interruption without making those mornings unfair. The Micromanager at 38% urgent had the same
    // problem (80% gold) for the same reason: the extra calls ate the time needed to finish.
    EVENTS: {
      windows: [[14, 26], [34, 46]],
      secondChance: 0.6,                                            // chance of a second event
      drill: { duration: 3.5, stagger: 1.6, focusDrain: 0.5 },     // everyone out: work and timers pause, focus drains
      wifi: { duration: 6, stagger: 1.6 },                          // no messages; then they land, one after another
      walkby: { duration: 4, workShare: 0.6, rep: 3, penalty: -6 }, // look busy: keep working, stay off pointless calls
      outage: { duration: 4, burst: 3 },                            // the next few messages are all real emergencies
      lunch: { duration: 4, burst: 3 }                              // the next few messages are chatty colleagues
    },
    // Follow-ups: an unanswered urgent message comes back once as an escalation from the boss, and a trap
    // left unanswered asks again once, pushier. At first declined traps came back too, but a good player
    // declines about six traps a round, so rounds grew from 20 to 26 messages; people follow up when
    // you don't reply, not when you've said no. (trapOnIgnore: true brings that back.)
    FOLLOW_UP: { delay: 4.5, trapOnIgnore: false }
  };

  const DEFAULT_ROLE = 'developer';
  const DEFAULT_LEVEL = 'junior';
  const BOSS_ORDER = Object.keys(TUNING.BOSSES);
  const DAY_ORDER = Object.keys(TUNING.DAYS);
  const DEFAULT_DAY = 'normal';
  const EVENT_ORDER = ['drill', 'wifi', 'walkby', 'outage', 'lunch'];

  // How each decision reads on the daily share grid. Only the verdict is recorded, never the message
  // type, so a shared result can't spoil which of the day's messages were traps.
  const OUTCOME = {
    respond: { urgent: 'good', trivial: 'meh', trap: 'bad' },
    ignore: { urgent: 'bad', trivial: 'good', trap: 'good' },
    delegate: { urgent: 'good', trivial: 'meh', trap: 'meh' },
    // Saying no is never right and never a disaster, whatever the message was.
    decline: { urgent: 'meh', trivial: 'meh', trap: 'meh' }
  };

  // Small, fast, seedable PRNG (mulberry32).
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Everything the loop needs to know about the kind of morning it is, in one flat object, so step()
  // and act() read s.rules and never ask which day type they are on.
  // carry: what a run of mornings brings with it (week.js) — being tired changes how focus behaves and
  // nothing else, so a week can never quietly rewrite the rules of a morning.
  function rulesFor(dayId, carry, career) {
    const day = TUNING.DAYS[dayId] || TUNING.DAYS[DEFAULT_DAY];
    const c = carry || {};
    const demand = TUNING.LEVEL_DEMAND[career] || TUNING.LEVEL_DEMAND[DEFAULT_LEVEL];
    const perType = (base, over) => {
      const out = {};
      for (const type of Object.keys(base)) out[type] = Object.assign({}, base[type], (over || {})[type]);
      return out;
    };
    return {
      day: TUNING.DAYS[dayId] ? dayId : DEFAULT_DAY,
      target: Math.round(day.target * demand.share),
      fullTarget: day.target, // what the day asks of a lead, for the screens that compare the two
      also: demand.also,
      goldRep: day.goldRep,
      // Being tired doesn't only slow the climb, it puts the top of the ladder out of reach: past a
      // point you cannot get into deep work at all, however long you hold the button. Slower gain
      // alone was not a real cost — the simulated weeks reached the same targets on an empty tank.
      tiers: capTiers(day.tiers || TUNING.TIERS, c.tierCap),
      progressPerS: day.progressPerS != null ? day.progressPerS : TUNING.BASE_PROGRESS_PER_S,
      flowGain: TUNING.FLOW_GAIN_PER_S * (day.flowGain || 1) * (c.flowGain || 1),
      flowDecayIdle: TUNING.FLOW_DECAY_IDLE_PER_S * (day.flowDecayIdle || 1) * (c.flowDecayIdle || 1),
      flowDecayBusy: TUNING.FLOW_DECAY_BUSY_PER_S * (day.flowDecayBusy || 1),
      spawnScale: day.spawnScale || 1,
      weights: day.weights || null,
      respond: perType(TUNING.RESPOND, day.respond),
      ignore: Object.assign({}, { urgent: TUNING.IGNORE.urgent.rep, trivial: TUNING.IGNORE.trivial.rep, trap: TUNING.IGNORE.trap.rep }, day.ignore)
    };
  }

  // Never below one gear, so there is always something to hold the button for.
  const capTiers = (tiers, cap) => (cap ? tiers.slice(0, Math.max(1, cap)) : tiers);

  function tierFor(flow, tiers) {
    const list = tiers || TUNING.TIERS;
    let tier = list[0];
    for (const t of list) if (flow >= t.min) tier = t;
    return tier;
  }

  // The last tier is the one the UI calls deep work; on a day with no deep end there is only one.
  const topTier = (rules) => (rules ? rules.tiers : TUNING.TIERS).slice(-1)[0];

  function pickType(rng, weights) {
    const w = weights || TUNING.TYPE_WEIGHTS;
    const r = rng();
    if (r < w.urgent) return 'urgent';
    if (r < w.urgent + w.trivial) return 'trivial';
    return 'trap';
  }

  // Combine two views of what the morning should be made of. Either may be absent, in which case the
  // other stands alone; with neither, the default mix applies.
  function blendWeights(a, b) {
    if (!a || !b) return a || b || null;
    const mixed = {};
    let total = 0;
    for (const type of Object.keys(TUNING.TYPE_WEIGHTS)) {
      mixed[type] = a[type] * b[type];
      total += mixed[type];
    }
    for (const type of Object.keys(mixed)) mixed[type] /= total;
    return mixed;
  }

  // Gap before the next message, given how far through the session we are.
  function spawnGap(frac) {
    const eased = Math.pow(Math.min(1, Math.max(0, frac)), TUNING.SPAWN_EASE);
    return TUNING.SPAWN_START_S + (TUNING.SPAWN_END_S - TUNING.SPAWN_START_S) * eased;
  }

  // The boss of the day and the office events, from the seed alone (their own random stream), so the
  // daily morning has the same boss and the same events for everyone, whatever their role or level.
  function planMorning(seed) {
    const rng = mulberry32((seed ^ 0x85ebca6b) >>> 0);
    // What kind of morning it is, drawn first and by weight: most mornings are ordinary, so the odd
    // ones stay odd. Like the boss, it comes from the seed alone, so everyone shares it on a daily.
    const day = weightedDay(rng());
    const boss = BOSS_ORDER[Math.floor(rng() * BOSS_ORDER.length)];
    const kinds = EVENT_ORDER.slice();
    const events = [];
    const place = ([lo, hi]) => {
      const id = kinds.splice(Math.floor(rng() * kinds.length), 1)[0];
      const at = Math.round((lo + rng() * (hi - lo)) * 100) / 100;
      events.push({ id, at, until: at + TUNING.EVENTS[id].duration });
    };
    place(TUNING.EVENTS.windows[0]);
    if (rng() < TUNING.EVENTS.secondChance) place(TUNING.EVENTS.windows[1]);
    return { day, boss, events };
  }

  const DAY_TOTAL = DAY_ORDER.reduce((sum, id) => sum + TUNING.DAYS[id].weight, 0);
  function weightedDay(roll) {
    let r = roll * DAY_TOTAL;
    for (const id of DAY_ORDER) {
      r -= TUNING.DAYS[id].weight;
      if (r < 0) return id;
    }
    return DEFAULT_DAY;
  }

  // Which message each arrival shows. Every type is dealt from its own shuffled deck, without
  // replacement, so a round never repeats a message while unseen ones remain. The first version picked
  // each message independently, so with a pool of 8 the same message could turn up twice in one round,
  // and rounds felt like the same short list. Messages in `recent` (seen in the last few rounds) go to
  // the bottom of the deck, so back-to-back practice rounds feel different too; the daily morning passes
  // none, so it stays the same for everyone.
  //
  // It uses its own random stream, separate from the rhythm's: shuffling consumes a draw per message,
  // and sharing the stream would make every role, level and content change alter when messages arrive.
  function dealer(seed, pools, recent) {
    const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    const shuffle = (list) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    };
    const decks = { urgent: [], trivial: [], trap: [] };
    const last = { urgent: -1, trivial: -1, trap: -1 };
    const refill = (type) => {
      const indexes = pools[type].map((_, i) => i);
      const isRecent = (i) => recent.has(pools[type][i].text);
      decks[type] = shuffle(indexes.filter((i) => !isRecent(i))).concat(shuffle(indexes.filter(isRecent)));
      // A fresh deck never starts with the message that ended the last one.
      if (decks[type].length > 1 && decks[type][0] === last[type]) decks[type].push(decks[type].shift());
    };
    const deal = (type) => {
      if (!decks[type].length) refill(type);
      last[type] = decks[type].shift();
      return last[type];
    };
    // The next small talk in the deck carrying a given tag, so a lunch break finds a colleague and a
    // week finds someone at home — still dealt from the deck, so variety works the same way.
    const pickTagged = (tag) => {
      const tagged = (i) => !!pools.trivial[i][tag];
      if (!decks.trivial.length) refill('trivial');
      const k = decks.trivial.findIndex(tagged);
      if (k !== -1) return (last.trivial = decks.trivial.splice(k, 1)[0]);
      const all = pools.trivial.map((_, i) => i).filter(tagged);
      return (last.trivial = all[Math.floor(rng() * all.length)]);
    };
    // The next message from outside work in the deck (for the work week), falling back to any of them.
    deal.personal = () => pickTagged('personal');

    // The next colleague's small talk in the deck (for lunch), falling back to any colleague.
    deal.colleague = () => pickTagged('favour');
    return deal;
  }

  // The whole morning's arrivals are decided up front from the seed: when each message lands, its
  // type, which message it is, and how long it lasts. Nothing the player does can change them. The
  // first version rolled each arrival as it happened, so the random stream shifted whenever headphones
  // blocked a ping or a full inbox skipped one, and two people "playing the same seed" were on
  // different mornings within seconds. Fine for practice; fatal for a daily morning everyone shares.
  // The rhythm (when, which type, how long) has a stream of its own that never looks at the message
  // pools, so on the same seed every role and level gets the same rhythm and only the words differ.
  // (Follow-ups are the one exception by design: they exist because of what a player did.)
  function buildSchedule(seed, role, level, recent, plan, carry) {
    const morning = plan || planMorning(seed);
    const boss = TUNING.BOSSES[morning.boss];
    const rules = rulesFor(morning.day);
    // A day type and a boss can both lean on the mix of messages. Multiplying the two and normalising
    // keeps both: a release day under a micromanager is more urgent than either on its own, instead of
    // one of them quietly winning.
    const weights = blendWeights(rules.weights, boss.weights);
    const rng = mulberry32(seed);
    const [lo, hi] = TUNING.EXPIRY_RANGE_S;
    const arrivals = [];
    let at = TUNING.FIRST_SPAWN_S;
    while (at < TUNING.DURATION) {
      arrivals.push({ at, type: pickType(rng, weights), life: lo + rng() * (hi - lo) });
      at += spawnGap(at / TUNING.DURATION) * rules.spawnScale * (1 + (rng() * 2 - 1) * TUNING.SPAWN_JITTER);
    }
    // The Last-Minute Boss: the same messages, with their arrival times stretched toward noon.
    if (boss.warp) for (const a of arrivals) a.at = TUNING.DURATION * Math.pow(a.at / TUNING.DURATION, boss.warp);
    for (const e of morning.events) {
      const cfg = TUNING.EVENTS[e.id];
      arrivals.sort((a, b) => a.at - b.at);
      if (e.id === 'drill' || e.id === 'wifi') {
        // Nothing arrives while everyone is outside or the Wi-Fi is down: those messages wait, then land
        // one after another.
        arrivals.filter((a) => a.at >= e.at && a.at < e.until)
          .forEach((a, i) => { a.at = e.until + 0.2 + i * (cfg.stagger || 1.2); });
      }
      if (e.id === 'outage' || e.id === 'lunch') {
        // No extra messages, so the pace stays readable: the next few arrivals become real emergencies
        // (outage) or chatty colleagues (lunch).
        arrivals.filter((a) => a.at >= e.at).slice(0, cfg.burst).forEach((a) => {
          if (e.id === 'outage') a.type = 'urgent';
          else { a.type = 'trivial'; a.colleague = true; }
        });
      }
    }
    arrivals.sort((a, b) => a.at - b.at);
    const deal = dealer(seed, Content.ROLES[role].byLevel[level || DEFAULT_LEVEL], new Set(recent || []));
    // A week asks you to keep a life as well as a job, so it makes sure life actually gets in touch:
    // left to the message pools alone, someone from outside work would turn up about every other
    // morning, which is too rare to plan around. The arrivals themselves are untouched — the same
    // small talk at the same moment, from home instead of from the office.
    const wantPersonal = (carry && carry.personal) || 0;
    if (wantPersonal) {
      const spare = arrivals.filter((a) => a.type === 'trivial' && !a.colleague);
      for (let i = 0; i < Math.min(wantPersonal, spare.length); i++) spare[i].personal = true;
    }
    for (const a of arrivals) a.msgIndex = a.personal ? deal.personal() : a.colleague ? deal.colleague() : deal(a.type);
    return arrivals;
  }

  function createGame(opts) {
    const o = opts || {};
    const role = o.role || DEFAULT_ROLE;
    if (!Content.ROLES[role]) throw new Error(`Unknown role: ${role}`);
    const level = o.level || DEFAULT_LEVEL;
    if (!Content.LEVELS[level]) throw new Error(`Unknown level: ${level}`);
    const seed = o.seed != null ? o.seed : (Date.now() >>> 0);
    const plan = planMorning(seed);
    // o.day pins the kind of morning instead of taking the seed's. Play never passes it: a daily morning
    // has to be the same for everyone. The tests and the balance report use it to hold one thing still.
    const rules = rulesFor(o.day || plan.day, o.carry, level);
    if (o.perk && !TUNING.PERKS[o.perk]) throw new Error(`Unknown perk: ${o.perk}`);
    const perk = o.perk || null;
    return {
      seed,
      role,
      level,
      day: rules.day,
      rules,
      boss: plan.boss,
      events: plan.events.map((e) => Object.assign({ started: false, done: false, work: 0 }, e)),
      rng: mulberry32(seed + 1), // for follow-ups and messages placed by hand; arrivals follow the schedule
      peekVariant: !!o.peekVariant,
      t: 0,
      duration: TUNING.DURATION,
      run: 0,       // right calls in a row, toward the next few seconds banked
      timeBank: 0,  // seconds in hand, spent automatically on the next interruption
      over: false,
      endReason: null,
      progress: 0,
      flow: 0,
      rep: TUNING.START_REP,
      busyUntil: 0,
      busyDuration: 0,
      busyText: '',
      busyType: null, // what you're stuck on
      cards: [],
      nextCardId: 1,
      // The schedule follows the day actually being played, pinned or not, so its pacing and mix match.
      schedule: buildSchedule(seed, role, level, o.recent, Object.assign({}, plan, { day: rules.day }), o.carry), // o.recent: texts seen recently
      nextArrival: 0,
      pending: [],    // follow-ups and escalations on their way: { at, type, msg }
      followUpsSent: { trap: 0, urgent: 0 },
      headphones: { charges: TUNING.HEADPHONES.charges + (perk === 'headphones' ? TUNING.PERKS.headphones.extraCharges : 0), activeUntil: 0 },
      perk,
      perkLeft: perk === 'coffee' ? TUNING.PERKS.coffee.urgentCalls : perk === 'cover' ? TUNING.PERKS.cover.traps : 0,
      flowHeldUntil: 0, // a perk can keep your focus from draining while you are on one particular call
      favours: [], // names of colleagues who owe you one, oldest first
      shipped: false,
      tierName: rules.tiers[0].name,
      stats: {
        urgentHandled: 0, urgentMissed: 0,
        trapsTaken: 0, trapsDodged: 0,
        trivialAnswered: 0, trivialIgnored: 0,
        peeks: 0, cardsSeen: 0, headphonesUsed: 0, perkUsed: 0,
        favoursBanked: 0, favoursUsed: 0, urgentDelegated: 0,
        followUps: 0, escalations: 0, walkbyPassed: 0, walkbyCaught: 0, rescues: 0,
        declined: 0, personalAnswered: 0, personalIgnored: 0, timeWon: 0, timeSaved: 0, bestRun: 0,
        busyTime: 0, deepWorkTime: 0, codingTime: 0, peakFlow: 0,
        aftermaths: [],
        decisions: [], // { at: when the message arrived, outcome: 'good' | 'meh' | 'bad' }
        // The wrong calls, kept with enough of the message to explain themselves afterwards (review.js
        // turns these into "what you misread" on the result screen). Deliberately NOT part of
        // decisions above: that list is what a shared grid is built from, and it must never carry
        // message text, or sharing a morning would spoil its traps for everyone who reads it.
        misreads: [] // { at, type, action: 'respond' | 'ignore' | 'expired' | 'decline', from, text }
      }
    };
  }

  const messagesFor = (s, type) => Content.ROLES[s.role].byLevel[s.level][type];

  function isBusy(s) { return s.t < s.busyUntil; }

  const activeEvent = (s) => s.events.find((e) => s.t >= e.at && s.t < e.until) || null;
  const inDrill = (s) => { const e = activeEvent(s); return !!e && e.id === 'drill'; };

  // Whether an action is possible right now: nothing while everyone is outside for a fire drill, and
  // only passing a message on while you're stuck on a call.
  function canAct(s, action) {
    return !s.over && !inDrill(s) && (!isBusy(s) || action === 'delegate');
  }

  function clampRep(s) { s.rep = Math.max(0, Math.min(100, s.rep)); }

  function spawnMessage(s, type, msg, life, extra) {
    const [lo, hi] = TUNING.EXPIRY_RANGE_S;
    const lifetime = life != null ? life : lo + s.rng() * (hi - lo);
    const card = Object.assign({
      id: s.nextCardId++,
      type,                       // hidden information: the UI must never display this before the player decides
      msg,
      from: msg.from,
      avatar: msg.avatar,
      text: msg.text,
      favour: msg.favour || null, // the colleague who'd owe you for a reply; visible, like the sender
      personal: !!msg.personal,   // from outside work; matters across a week, never within one morning
      spawnedAt: s.t,
      expiresAt: s.t + lifetime,
      peeked: !s.peekVariant
    }, extra);
    s.cards.push(card);
    s.stats.cardsSeen++;
    return card;
  }

  // Normal play places messages from the schedule; tests can also place a specific one by hand.
  function spawnCard(s, type, msgIndex, life) {
    const pool = messagesFor(s, type);
    const idx = msgIndex != null ? msgIndex : Math.floor(s.rng() * pool.length);
    return spawnMessage(s, type, pool[idx], life, { msgIndex: idx });
  }

  function removeCard(s, id) {
    const i = s.cards.findIndex(c => c.id === id);
    return i === -1 ? null : s.cards.splice(i, 1)[0];
  }

  // Every decision is recorded for the share grid, and the good ones build toward more morning.
  // `passive` is a message that ran out on its own: it can break a run but never build one.
  function decide(s, card, action, events, passive) {
    const outcome = OUTCOME[action][card.type];
    s.stats.decisions.push({ at: Math.round(card.spawnedAt * 100) / 100, outcome });
    // A run means right calls, not merely the absence of wrong ones. Letting 'meh' carry a run through
    // handed the bonus to the strategy of answering everything — that player never makes a bad call, so
    // they cruised to it as easily as someone actually reading. Hedging with a polite no, or stopping to
    // answer small talk, is a fine thing to do and is simply not what this rewards.
    // A wrong call, and the two kinds are not the same mistake: 'bad' is a trap taken or an emergency
    // left, while a polite no to a real emergency is only 'meh' by the rules and still worth showing.
    if (outcome === 'bad' || (outcome === 'meh' && card.type === 'urgent')) {
      s.stats.misreads.push({
        at: Math.round(card.spawnedAt * 100) / 100,
        type: card.type,
        action: passive ? 'expired' : action,
        from: card.from,
        text: card.text
      });
    }
    if (outcome !== 'good') s.run = 0;
    if (outcome === 'good' && !passive) {
      s.run++;
      s.stats.bestRun = Math.max(s.stats.bestRun, s.run);
      const B = TUNING.TIME_BONUS;
      // The ceiling is on what a morning can earn in total, not on what is in hand: capping the bank
      // alone let it refill all morning, and the simulated readers spent twenty-odd seconds a round.
      if (s.run >= B.run && s.stats.timeWon < B.maxPerRound) {
        const won = Math.min(B.seconds, B.maxPerRound - s.stats.timeWon);
        s.run = 0;
        s.timeBank += won;
        s.stats.timeWon += won;
        if (events) events.push({ type: 'time-won', seconds: won, bank: s.timeBank });
      }
    }
  }

  function checkPip(s, events) {
    if (!s.over && s.rep <= 0) {
      s.over = true;
      s.endReason = 'pip';
      events.push({ type: 'end', reason: 'pip' });
    }
  }

  // An unanswered urgent message comes back once as an escalation from the boss; a trap asks again once,
  // pushier, in a way that still follows the level's tell (see FOLLOW_UP). A follow-up never follows
  // itself up.
  function queueFollowUp(s, card, expired) {
    if (card.followUp || (card.type !== 'trap' && card.type !== 'urgent')) return;
    if (card.type === 'trap' && !expired && !TUNING.FOLLOW_UP.trapOnIgnore) return;
    const at = s.t + TUNING.FOLLOW_UP.delay;
    if (at >= s.duration) return;
    const lines = Content.FOLLOW_UPS[s.level][card.type];
    const line = lines[s.followUpsSent[card.type]++ % lines.length];
    const sender = card.type === 'trap'
      ? { from: card.from, avatar: card.avatar }
      : { from: `Boss · ${Content.BOSSES[s.boss].short}`, avatar: '👔' };
    s.pending.push({ at, type: card.type, msg: Object.assign(sender, line) });
  }

  function applyIgnore(s, card, events, expired) {
    const eff = { rep: s.rules.ignore[card.type] };
    s.rep += eff.rep;
    clampRep(s);
    if (card.type === 'urgent') s.stats.urgentMissed++;
    else if (card.type === 'trap') s.stats.trapsDodged++;
    else {
      s.stats.trivialIgnored++;
      if (card.personal) s.stats.personalIgnored++; // nobody notices once; a week notices
    }
    decide(s, card, 'ignore', events, expired);
    queueFollowUp(s, card, expired);
    events.push({ type: expired ? 'expire' : 'ignore', card, rep: eff.rep });
    checkPip(s, events);
  }

  function finishEvent(s, e, events) {
    const cfg = TUNING.EVENTS[e.id];
    let rep = 0;
    let outcome = null;
    if (e.id === 'walkby') {
      const lookedBusy = e.work >= cfg.duration * cfg.workShare - 1e-9;
      rep = lookedBusy ? cfg.rep : cfg.penalty;
      s.rep += rep;
      clampRep(s);
      if (lookedBusy) s.stats.walkbyPassed++;
      else s.stats.walkbyCaught++;
      outcome = lookedBusy ? 'looked-busy' : 'caught';
    }
    events.push({ type: 'event-end', event: e, rep, outcome });
    checkPip(s, events);
  }

  // Advance the session by dt seconds. input.holding = the player is holding the work button.
  // Returns the events that happened, in order, for the UI to animate.
  function step(s, dt, input) {
    const events = [];
    if (s.over) return events;
    dt = Math.max(0, Math.min(dt, 0.1));
    s.t += dt;

    for (const e of s.events) {
      if (!e.started && s.t >= e.at) {
        e.started = true;
        events.push({ type: 'event-start', event: e });
      }
      if (e.started && !e.done && s.t >= e.until) {
        e.done = true;
        finishEvent(s, e, events);
        if (s.over) return events;
      }
    }
    const current = activeEvent(s);
    const drill = !!current && current.id === 'drill';
    if (drill) {
      // Everything waits while everyone is outside — except your focus, which drains.
      for (const card of s.cards) card.expiresAt += dt;
      for (const p of s.pending) p.at += dt;
      if (s.busyUntil > s.t - dt) s.busyUntil += dt;
    }

    const busy = isBusy(s);
    const coding = !drill && !!(input && input.holding) && !busy;

    if (coding) {
      const distracted = s.cards.length >= TUNING.DISTRACTED_AT;
      s.flow = Math.min(100, s.flow + s.rules.flowGain * dt * (distracted ? TUNING.DISTRACTED_FACTOR : 1));
    } else {
      const held = busy && s.t < s.flowHeldUntil;
      const decay = held ? 0 : (busy ? s.rules.flowDecayBusy : s.rules.flowDecayIdle) * (drill ? TUNING.EVENTS.drill.focusDrain : 1);
      s.flow = Math.max(0, s.flow - decay * dt);
    }
    s.stats.peakFlow = Math.max(s.stats.peakFlow, s.flow);
    // The boss counts working, or handling a real emergency, as looking busy. A pointless call isn't.
    if (current && current.id === 'walkby' && (coding || (busy && s.busyType === 'urgent'))) current.work += dt;

    const tier = tierFor(s.flow, s.rules.tiers);
    if (tier.name !== s.tierName) {
      s.tierName = tier.name;
      events.push({ type: 'tier', tier });
    }

    if (coding) {
      s.progress += s.rules.progressPerS * tier.mult * dt;
      s.stats.codingTime += dt;
      if (tier === topTier(s.rules) && tier.mult > 1) s.stats.deepWorkTime += dt;
      if (!s.shipped && s.progress >= s.rules.target) {
        s.shipped = true;
        events.push({ type: 'shipped' });
      }
    }
    if (busy) s.stats.busyTime += dt;

    // Unanswered notifications expire as if ignored. This keeps happening while you are busy, which
    // is the real cost of a trap: whatever was genuinely urgent goes unanswered behind it.
    for (const card of s.cards.slice()) {
      if (s.t >= card.expiresAt) {
        removeCard(s, card.id);
        applyIgnore(s, card, events, true);
        if (s.over) return events;
      }
    }

    // Arrivals follow the morning's fixed schedule. One that finds the inbox full, or that the
    // headphones block, is skipped rather than postponed, so everything after it stays on time.
    const headphonesOn = s.t < s.headphones.activeUntil;
    while (s.nextArrival < s.schedule.length && s.t >= s.schedule[s.nextArrival].at) {
      const a = s.schedule[s.nextArrival++];
      if (s.cards.length >= TUNING.MAX_CARDS) continue;
      if (headphonesOn && a.type !== 'urgent') events.push({ type: 'blocked' });
      else events.push({ type: 'spawn', card: spawnCard(s, a.type, a.msgIndex, a.life) });
    }

    // Follow-ups and escalations wait out a fire drill or a Wi-Fi outage, and for room in the inbox.
    const quiet = !!current && (current.id === 'drill' || current.id === 'wifi');
    if (!quiet) {
      for (const p of s.pending.slice()) {
        if (s.t < p.at || s.cards.length >= TUNING.MAX_CARDS) continue;
        s.pending.splice(s.pending.indexOf(p), 1);
        if (headphonesOn && p.type !== 'urgent') { events.push({ type: 'blocked' }); continue; }
        if (p.type === 'trap') s.stats.followUps++;
        else s.stats.escalations++;
        events.push({ type: 'spawn', card: spawnMessage(s, p.type, p.msg, null, { followUp: true }) });
      }
    }

    if (s.t >= s.duration) {
      s.over = true;
      s.endReason = 'time';
      events.push({ type: 'end', reason: 'time' });
    }
    return events;
  }

  // Pass a message to the colleague who has owed you a favour the longest.
  function delegate(s, card, events) {
    if (!s.favours.length) {
      events.push({ type: 'rejected', reason: 'no-favour' });
      return events;
    }
    const helper = s.favours.shift();
    removeCard(s, card.id);
    s.stats.favoursUsed++;
    let rep = 0;
    if (card.type === 'urgent') {
      rep = TUNING.FAVOURS.urgentRep;
      s.rep += rep;
      clampRep(s);
      s.stats.urgentHandled++;
      s.stats.urgentDelegated++;
      if (isBusy(s)) s.stats.rescues++; // handled for you while you were stuck on a call
    } else if (card.type === 'trap') {
      s.stats.trapsDodged++;
      s.stats.aftermaths.push(`${helper} took your "quick" one. ${helper} will remember this.`);
    }
    decide(s, card, 'delegate', events);
    events.push({ type: 'delegate', card, helper, rep });
    return events;
  }

  // Say no. It costs the same whatever the message was, takes no time at all, and the person accepts
  // it, so nothing comes back. Against an unreadable message that is a third option between a call you
  // may not be able to afford and a silence that may cost you fifteen points of reputation.
  function decline(s, card, events) {
    removeCard(s, card.id);
    const rep = TUNING.DECLINE.rep;
    s.rep += rep;
    clampRep(s);
    // The same wording whatever it was: a busy line per type would hand back the answer to the very
    // question the player just decided without knowing.
    s.busyUntil = s.t + TUNING.DECLINE.busy;
    s.busyDuration = TUNING.DECLINE.busy;
    s.busyText = Content.BUSY_TEXT.decline;
    s.busyType = 'decline'; // and a polite no is not what the boss counts as looking busy
    s.stats.declined++;
    if (card.type === 'trap') s.stats.trapsDodged++; // you didn't take the call, which is the whole trap
    decide(s, card, 'decline', events);
    events.push({ type: 'decline', card, rep, busy: TUNING.DECLINE.busy });
    checkPip(s, events);
    return events;
  }

  // action: 'respond' | 'ignore' | 'decline' | 'peek' | 'delegate'. While you're busy (on a
  // call) you can't do anything yourself — but you can still pass a message to a colleague who owes you
  // a favour. During a fire drill you can't do anything at all.
  function act(s, cardId, action) {
    const events = [];
    if (s.over) return events;
    if (inDrill(s)) {
      events.push({ type: 'rejected', reason: 'event' });
      return events;
    }
    if (isBusy(s) && action !== 'delegate') {
      events.push({ type: 'rejected', reason: 'busy' });
      return events;
    }
    const card = s.cards.find(c => c.id === cardId);
    if (!card) return events;

    if (action === 'peek') {
      if (card.peeked) return events;
      card.peeked = true;
      s.flow = Math.max(0, s.flow - TUNING.PEEK_FLOW_COST);
      s.stats.peeks++;
      events.push({ type: 'peek', card, flowCost: TUNING.PEEK_FLOW_COST });
      return events;
    }

    if (action === 'delegate') return delegate(s, card, events);
    if (action === 'decline') return decline(s, card, events);

    removeCard(s, card.id);
    if (action === 'ignore') {
      applyIgnore(s, card, events, false);
      return events;
    }

    const eff = s.rules.respond[card.type];
    const msg = card.msg;
    s.rep += eff.rep;
    clampRep(s);
    // A quick reply to a colleague's chat takes less time than dealing with anything else.
    const wanted = card.type !== 'trivial' ? eff.busy
      : card.personal ? TUNING.PERSONAL_BUSY
      : msg.favour ? TUNING.FAVOURS.replyBusy
      : eff.busy;
    // Seconds banked by reading well are spent here, automatically, and ONLY on a real emergency: the
    // calls you were right to take cost you less when you are on top of your inbox. Spending them on
    // anything you answered was a version that paid off your mistakes — the simulated players walked
    // straight through it, answering every message blindly and still reaching gold, because a trap that
    // costs nothing is not a trap. It never takes an interruption to nothing either: there is always a
    // moment of being dragged out of what you were doing.
    // minBusy is the floor an interruption can be discounted to, and it exists to keep colleague
    // favours worth having. At a low floor the bank made handling an emergency yourself nearly as cheap
    // as having someone else take it, and being a decent colleague stopped paying at all. It never pays
    // for a trap: that is the mistake the game is about, and a bonus that softened it would be paying
    // players to stop reading.
    const canSpend = card.type !== 'trap';
    const saved = canSpend ? Math.min(s.timeBank, Math.max(0, wanted - TUNING.TIME_BONUS.minBusy)) : 0;
    s.timeBank -= saved;
    s.stats.timeSaved += saved;
    let busy = wanted - saved;
    // A perk, if one was taken into this morning and has uses left. See TUNING.PERKS.
    let perkUsed = null;
    if (s.perkLeft > 0 && ((s.perk === 'coffee' && card.type === 'urgent') || (s.perk === 'cover' && card.type === 'trap'))) {
      s.perkLeft--;
      s.stats.perkUsed++;
      perkUsed = s.perk;
      if (s.perk === 'cover' && TUNING.PERKS.cover.busy != null) busy = Math.min(busy, TUNING.PERKS.cover.busy);
    }
    s.busyUntil = s.t + busy;
    s.flowHeldUntil = perkUsed ? s.busyUntil : 0;
    s.busyDuration = busy;
    s.busyText = msg.busyText || Content.BUSY_TEXT[card.type];
    s.busyType = card.type;
    if (eff.flowToZero && perkUsed !== 'cover') s.flow = 0;
    let favour = null;
    let favourFull = false;
    if (card.type === 'urgent') s.stats.urgentHandled++;
    else if (card.type === 'trap') {
      s.stats.trapsTaken++;
      if (msg.aftermath) s.stats.aftermaths.push(msg.aftermath);
    } else {
      s.stats.trivialAnswered++;
      if (card.personal) s.stats.personalAnswered++;
      if (msg.favour) {
        if (s.favours.length < TUNING.FAVOURS.max) {
          s.favours.push(msg.favour);
          s.stats.favoursBanked++;
          favour = msg.favour;
        } else favourFull = true;
      }
    }
    decide(s, card, 'respond', events);
    events.push({ type: 'respond', card, rep: eff.rep, busy, saved, favour, favourFull, perk: perkUsed });
    return events;
  }

  function useHeadphones(s) {
    const events = [];
    if (s.over || s.headphones.charges <= 0 || s.t < s.headphones.activeUntil) return events;
    // The spare pair cannot go straight on after the first comes off.
    if (s.perk === 'headphones' && s.headphones.activeUntil > 0 && s.t < s.headphones.activeUntil + TUNING.PERKS.headphones.cooldown) return events;
    // With the spare pair, the last go is the spare, and it may be shorter than the real thing.
    const spare = s.perk === 'headphones' && s.headphones.charges <= TUNING.PERKS.headphones.extraCharges;
    s.headphones.charges--;
    s.headphones.activeUntil = s.t + (spare ? TUNING.PERKS.headphones.spareDuration : TUNING.HEADPHONES.duration);
    s.stats.headphonesUsed++;
    events.push({ type: 'headphones', until: s.headphones.activeUntil });
    return events;
  }

  const RATINGS = {
    pip: { key: 'pip', emoji: '📉' },
    missed: { key: 'missed', emoji: '⏰' },
    dropped: { key: 'dropped', emoji: '🧩' },
    gold: { key: 'gold', emoji: '🥇' },
    silver: { key: 'silver', emoji: '🥈' },
    bronze: { key: 'bronze', emoji: '🥉' }
  };

  const capitalise = (str) => str.charAt(0).toUpperCase() + str.slice(1);

  // Result wording follows the role's own deliverable: a tester's cycle is "signed off", an analyst's
  // report "delivered", a manager's plan "approved".
  function ratingFor(key, role, day) {
    // A backlog day isn't shipping a feature, so the result says what the morning was actually for.
    const { noun, done } = (day && day.deliverable) || role.deliverable;
    const text = {
      pip: { title: 'Put on a PIP', blurb: 'Too many urgent messages went unanswered. HR would like a quick call.' },
      missed: { title: 'Missed the deadline', blurb: `The ${noun} didn't make it. There will be a meeting about this.` },
      dropped: { title: 'Delivered, but things slipped', blurb: `The ${noun} is ${done}. Some of the rest of your job is not.` },
      gold: { title: `${capitalise(done)} & respected`, blurb: `${capitalise(noun)} ${done}, and the team still likes you.` },
      silver: { title: capitalise(done), blurb: `${capitalise(noun)} ${done}. A few people are slightly annoyed.` },
      bronze: { title: `${capitalise(done)}, but at what cost`, blurb: `It's ${done}. Your boss has "some feedback".` }
    }[key];
    return Object.assign({}, RATINGS[key], text);
  }

  // Everything the career level asks for besides the work itself, and what fell short.
  function slipped(s) {
    const also = s.rules.also || {};
    return Object.keys(also).filter((key) => s.stats[key] > also[key]);
  }

  function summary(s) {
    const delivered = s.progress >= s.rules.target;
    const missing = slipped(s);
    const shipped = delivered && !missing.length;
    let key;
    if (s.endReason === 'pip') key = 'pip';
    else if (!delivered) key = 'missed';
    else if (missing.length) key = 'dropped'; // the work landed; something else did not
    else if (s.rep >= s.rules.goldRep) key = 'gold';
    else if (s.rep >= 40) key = 'silver';
    else key = 'bronze';
    const score = Math.max(0, Math.round(Math.min(s.progress, 200) * 10 + s.rep * 5 - (s.endReason === 'pip' ? 500 : 0)));
    return {
      rating: ratingFor(key, Content.ROLES[s.role], Content.DAYS[s.day]),
      score,
      shipped,
      role: s.role,
      level: s.level,
      day: s.day,
      perk: s.perk,
      target: s.rules.target,
      boss: s.boss,
      events: s.events.map((e) => e.id),
      progress: s.progress,
      delivered: s.progress >= s.rules.target,
      slipped: slipped(s),
      also: s.rules.also,
      rep: s.rep,
      timeBank: s.timeBank,
      endReason: s.endReason,
      seed: s.seed,
      stats: Object.assign({}, s.stats, {
        aftermaths: s.stats.aftermaths.slice(),
        decisions: s.stats.decisions.map(d => Object.assign({}, d)),
        misreads: s.stats.misreads.map(m => Object.assign({}, m))
      })
    };
  }

  return {
    TUNING, RATINGS, OUTCOME, DEFAULT_ROLE, DEFAULT_LEVEL, DEFAULT_DAY, BOSS_ORDER, EVENT_ORDER, DAY_ORDER,
    createGame, planMorning, buildSchedule, rulesFor, topTier, step, act, canAct, activeEvent, inDrill, useHeadphones, summary,
    tierFor, spawnCard, spawnGap, isBusy
  };
});
