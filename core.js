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
    PEEK_FLOW_COST: 18,        // variant B only: reading a collapsed message costs focus
    HEADPHONES: { charges: 1, duration: 10 },
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

  function tierFor(flow) {
    let tier = TUNING.TIERS[0];
    for (const t of TUNING.TIERS) if (flow >= t.min) tier = t;
    return tier;
  }

  function pickType(rng, weights) {
    const w = weights || TUNING.TYPE_WEIGHTS;
    const r = rng();
    if (r < w.urgent) return 'urgent';
    if (r < w.urgent + w.trivial) return 'trivial';
    return 'trap';
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
    return { boss, events };
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
    // The next colleague's small talk in the deck (for lunch), falling back to any colleague.
    deal.colleague = () => {
      const isColleague = (i) => !!pools.trivial[i].favour;
      if (!decks.trivial.length) refill('trivial');
      const k = decks.trivial.findIndex(isColleague);
      if (k !== -1) return (last.trivial = decks.trivial.splice(k, 1)[0]);
      const all = pools.trivial.map((_, i) => i).filter(isColleague);
      return (last.trivial = all[Math.floor(rng() * all.length)]);
    };
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
  function buildSchedule(seed, role, level, recent, plan) {
    const morning = plan || planMorning(seed);
    const boss = TUNING.BOSSES[morning.boss];
    const rng = mulberry32(seed);
    const [lo, hi] = TUNING.EXPIRY_RANGE_S;
    const arrivals = [];
    let at = TUNING.FIRST_SPAWN_S;
    while (at < TUNING.DURATION) {
      arrivals.push({ at, type: pickType(rng, boss.weights), life: lo + rng() * (hi - lo) });
      at += spawnGap(at / TUNING.DURATION) * (1 + (rng() * 2 - 1) * TUNING.SPAWN_JITTER);
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
    for (const a of arrivals) a.msgIndex = a.colleague ? deal.colleague() : deal(a.type);
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
    return {
      seed,
      role,
      level,
      boss: plan.boss,
      events: plan.events.map((e) => Object.assign({ started: false, done: false, work: 0 }, e)),
      rng: mulberry32(seed + 1), // for follow-ups and messages placed by hand; arrivals follow the schedule
      peekVariant: !!o.peekVariant,
      t: 0,
      duration: TUNING.DURATION,
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
      schedule: buildSchedule(seed, role, level, o.recent, plan), // o.recent: message texts seen in recent rounds
      nextArrival: 0,
      pending: [],    // follow-ups and escalations on their way: { at, type, msg }
      followUpsSent: { trap: 0, urgent: 0 },
      headphones: { charges: TUNING.HEADPHONES.charges, activeUntil: 0 },
      favours: [], // names of colleagues who owe you one, oldest first
      shipped: false,
      tierName: TUNING.TIERS[0].name,
      stats: {
        urgentHandled: 0, urgentMissed: 0,
        trapsTaken: 0, trapsDodged: 0,
        trivialAnswered: 0, trivialIgnored: 0,
        peeks: 0, cardsSeen: 0, headphonesUsed: 0,
        favoursBanked: 0, favoursUsed: 0, urgentDelegated: 0,
        followUps: 0, escalations: 0, walkbyPassed: 0, walkbyCaught: 0, rescues: 0,
        declined: 0,
        busyTime: 0, deepWorkTime: 0, codingTime: 0, peakFlow: 0,
        aftermaths: [],
        decisions: [] // { at: when the message arrived, outcome: 'good' | 'meh' | 'bad' }
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

  function decide(s, card, action) {
    s.stats.decisions.push({ at: Math.round(card.spawnedAt * 100) / 100, outcome: OUTCOME[action][card.type] });
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
    const eff = TUNING.IGNORE[card.type];
    s.rep += eff.rep;
    clampRep(s);
    if (card.type === 'urgent') s.stats.urgentMissed++;
    else if (card.type === 'trap') s.stats.trapsDodged++;
    else s.stats.trivialIgnored++;
    decide(s, card, 'ignore');
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
      s.flow = Math.min(100, s.flow + TUNING.FLOW_GAIN_PER_S * dt * (distracted ? TUNING.DISTRACTED_FACTOR : 1));
    } else {
      const decay = (busy ? TUNING.FLOW_DECAY_BUSY_PER_S : TUNING.FLOW_DECAY_IDLE_PER_S) * (drill ? TUNING.EVENTS.drill.focusDrain : 1);
      s.flow = Math.max(0, s.flow - decay * dt);
    }
    s.stats.peakFlow = Math.max(s.stats.peakFlow, s.flow);
    // The boss counts working, or handling a real emergency, as looking busy. A pointless call isn't.
    if (current && current.id === 'walkby' && (coding || (busy && s.busyType === 'urgent'))) current.work += dt;

    const tier = tierFor(s.flow);
    if (tier.name !== s.tierName) {
      s.tierName = tier.name;
      events.push({ type: 'tier', tier });
    }

    if (coding) {
      s.progress += TUNING.BASE_PROGRESS_PER_S * tier.mult * dt;
      s.stats.codingTime += dt;
      if (tier === TUNING.TIERS[TUNING.TIERS.length - 1]) s.stats.deepWorkTime += dt;
      if (!s.shipped && s.progress >= 100) {
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
    decide(s, card, 'delegate');
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
    decide(s, card, 'decline');
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

    const eff = TUNING.RESPOND[card.type];
    const msg = card.msg;
    s.rep += eff.rep;
    clampRep(s);
    // A quick reply to a colleague's chat takes less time than dealing with anything else.
    const busy = card.type === 'trivial' && msg.favour ? TUNING.FAVOURS.replyBusy : eff.busy;
    s.busyUntil = s.t + busy;
    s.busyDuration = busy;
    s.busyText = msg.busyText || Content.BUSY_TEXT[card.type];
    s.busyType = card.type;
    if (eff.flowToZero) s.flow = 0;
    let favour = null;
    let favourFull = false;
    if (card.type === 'urgent') s.stats.urgentHandled++;
    else if (card.type === 'trap') {
      s.stats.trapsTaken++;
      if (msg.aftermath) s.stats.aftermaths.push(msg.aftermath);
    } else {
      s.stats.trivialAnswered++;
      if (msg.favour) {
        if (s.favours.length < TUNING.FAVOURS.max) {
          s.favours.push(msg.favour);
          s.stats.favoursBanked++;
          favour = msg.favour;
        } else favourFull = true;
      }
    }
    decide(s, card, 'respond');
    events.push({ type: 'respond', card, rep: eff.rep, busy, favour, favourFull });
    return events;
  }

  function useHeadphones(s) {
    const events = [];
    if (s.over || s.headphones.charges <= 0 || s.t < s.headphones.activeUntil) return events;
    s.headphones.charges--;
    s.headphones.activeUntil = s.t + TUNING.HEADPHONES.duration;
    s.stats.headphonesUsed++;
    events.push({ type: 'headphones', until: s.headphones.activeUntil });
    return events;
  }

  const RATINGS = {
    pip: { key: 'pip', emoji: '📉' },
    missed: { key: 'missed', emoji: '⏰' },
    gold: { key: 'gold', emoji: '🥇' },
    silver: { key: 'silver', emoji: '🥈' },
    bronze: { key: 'bronze', emoji: '🥉' }
  };

  const capitalise = (str) => str.charAt(0).toUpperCase() + str.slice(1);

  // Result wording follows the role's own deliverable: a tester's cycle is "signed off", an analyst's
  // report "delivered", a manager's plan "approved".
  function ratingFor(key, role) {
    const { noun, done } = role.deliverable;
    const text = {
      pip: { title: 'Put on a PIP', blurb: 'Too many urgent messages went unanswered. HR would like a quick call.' },
      missed: { title: 'Missed the deadline', blurb: `The ${noun} didn't make it. There will be a meeting about this.` },
      gold: { title: `${capitalise(done)} & respected`, blurb: `${capitalise(noun)} ${done}, and the team still likes you.` },
      silver: { title: capitalise(done), blurb: `${capitalise(noun)} ${done}. A few people are slightly annoyed.` },
      bronze: { title: `${capitalise(done)}, but at what cost`, blurb: `It's ${done}. Your boss has "some feedback".` }
    }[key];
    return Object.assign({}, RATINGS[key], text);
  }

  function summary(s) {
    const shipped = s.progress >= 100;
    let key;
    if (s.endReason === 'pip') key = 'pip';
    else if (!shipped) key = 'missed';
    else if (s.rep >= 70) key = 'gold';
    else if (s.rep >= 40) key = 'silver';
    else key = 'bronze';
    const score = Math.max(0, Math.round(Math.min(s.progress, 200) * 10 + s.rep * 5 - (s.endReason === 'pip' ? 500 : 0)));
    return {
      rating: ratingFor(key, Content.ROLES[s.role]),
      score,
      shipped,
      role: s.role,
      level: s.level,
      boss: s.boss,
      events: s.events.map((e) => e.id),
      progress: s.progress,
      rep: s.rep,
      endReason: s.endReason,
      seed: s.seed,
      stats: Object.assign({}, s.stats, {
        aftermaths: s.stats.aftermaths.slice(),
        decisions: s.stats.decisions.map(d => Object.assign({}, d))
      })
    };
  }

  return {
    TUNING, RATINGS, OUTCOME, DEFAULT_ROLE, DEFAULT_LEVEL, BOSS_ORDER, EVENT_ORDER,
    createGame, planMorning, buildSchedule, step, act, canAct, activeEvent, inDrill, useHeadphones, summary,
    tierFor, spawnCard, spawnGap, isBusy
  };
});
