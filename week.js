// week.js — Monday to Friday as one run. A single morning has no tomorrow, so there is never a reason
// not to spend everything you have: hold the button every second, take every call, answer nothing at
// home. The week exists to put a price on that.
//
// Two meters carry between mornings. ENERGY is spent by the very thing that wins a morning — deep
// focus is tiring, and so is being pulled into calls — and only partly returns overnight, so a morning
// you won by emptying yourself is a morning Tuesday pays for. HOME is spent by leaving the people
// outside work unanswered and by the mornings you had to stay late to finish.
//
// Only energy touches the rules of a morning (tired people focus worse). Home never does: it decides
// how much of your energy the night gives back, so neglecting it doesn't make any single morning
// harder — it makes every morning after it harder to recover from. That keeps one lever on the loop
// and one lever on the week, instead of two things quietly fighting over the same numbers.
//
// Pure functions only: game.js keeps the week in storage and draws it, core.js plays the mornings.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./content'));
  else root.NineWeek = factory(root.NineContent);
})(typeof self !== 'undefined' ? self : this, function (Content) {
  'use strict';

  const LENGTH = Content.WEEKDAYS.length; // Monday to Friday

  const TUNING = {
    START: { energy: 100, home: 100 },
    // What a morning takes out of you. Deep work is the expensive one on purpose: it is the thing that
    // wins mornings, so it has to be the thing that costs a week.
    COST: {
      perDeepWorkS: 1.05,
      perBusyS: 1.1,
      perTrapTaken: 3,      // an hour lost to someone else's "quick call" is its own kind of tiring
      perPersonalIgnored: 9,
      lateFinish: 12,       // you didn't hit the target by noon, so the afternoon ate the evening
      perPersonalAnswered: 3
    },
    // The night. A full recovery would make the week meaningless, so it never quite covers a hard
    // morning — and a home life you have been ignoring stops the night helping at all.
    NIGHT: { energy: 32, home: 4, homeGateAt: 50, homeGateFactor: 0.45 },
    // Being tired changes the next morning, and nothing else does. tierCap is the one that actually
    // decides a week: past a point the top gear is simply gone, so no amount of holding the button gets
    // you back to deep work. Slowing the climb alone was not a cost worth pacing for — the simulated
    // weeks hit the same targets on an empty tank.
    TIRED: [
      { at: 62, flowGain: 0.85, flowDecayIdle: 1.05, tierCap: 0, note: 'A bit tired. Focus is slower to come.' },
      { at: 38, flowGain: 0.7, flowDecayIdle: 1.2, tierCap: 3, note: 'Running on fumes. Deep work is out of reach today.' },
      { at: 16, flowGain: 0.55, flowDecayIdle: 1.4, tierCap: 2, note: "Empty. You're at the desk, and that's about it." }
    ],
    // How many of a morning's small-talk arrivals are from outside work. Left to the message pools
    // alone, a personal message would turn up about every other morning, which is too rare for the
    // other half of the game to be a decision you can plan around.
    PERSONAL_PER_MORNING: 2
  };

  const clamp = (v) => Math.max(0, Math.min(100, v));

  // Each morning of the week gets its own seed, so a week is five different mornings — and the same
  // five for anyone playing that week's seed.
  function seedForMorning(weekSeed, index) {
    let h = (weekSeed ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (index + 1), 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    return (Math.imul(h, 0xc2b2ae35) >>> 0);
  }

  // A week deals its own kinds of morning rather than letting each seed roll one independently, which
  // gave weeks with three backlog days and no appraisal. Monday is always ordinary, so the first
  // morning teaches the rhythm; the other four are one of each, shuffled. The set is therefore always
  // the same and the ORDER never is, which is where the interest lives: a release day on Tuesday and
  // a release day on Friday, with nothing left in the tank, are not the same morning.
  function dayPlan(seed, dayOrder) {
    const rest = dayOrder.filter((d) => d !== 'normal');
    let h = (seed ^ 0x27d4eb2f) >>> 0;
    const next = () => {
      h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
      return (h >>> 8) / 0xffffff;
    };
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    return ['normal'].concat(rest).slice(0, LENGTH);
  }

  function newWeek(seed) {
    return {
      seed: seed >>> 0,
      index: 0,                 // which morning comes next, 0 = Monday
      energy: TUNING.START.energy,
      home: TUNING.START.home,
      mornings: [],             // one record per morning played
      over: false
    };
  }

  const currentDayName = (week) => Content.WEEKDAYS[Math.min(week.index, LENGTH - 1)];

  // How tired you are, as the rules see it. Returned even at full energy so callers always get the
  // same shape.
  function tiredness(energy) {
    let worst = null;
    for (const step of TUNING.TIRED) if (energy < step.at) worst = step;
    return worst || { at: 100, flowGain: 1, flowDecayIdle: 1, tierCap: 0, note: null };
  }

  // What createGame needs to know about the state you arrive in. A week that hasn't started, or a
  // player who is fine, carries nothing.
  function carryFor(week) {
    const tired = tiredness(week.energy);
    return {
      flowGain: tired.flowGain,
      flowDecayIdle: tired.flowDecayIdle,
      tierCap: tired.tierCap,
      personal: TUNING.PERSONAL_PER_MORNING
    };
  }

  // What one morning cost, itemised, so the screen between mornings can show the player exactly which
  // of their choices is being charged for rather than just moving a bar.
  function costOf(summary) {
    const st = summary.stats;
    const C = TUNING.COST;
    const late = !summary.shipped || summary.endReason === 'pip';
    const items = [
      { id: 'deep', meter: 'energy', amount: -st.deepWorkTime * C.perDeepWorkS, label: 'Time in deep focus' },
      { id: 'calls', meter: 'energy', amount: -st.busyTime * C.perBusyS, label: 'Time pulled into calls' },
      { id: 'traps', meter: 'energy', amount: -st.trapsTaken * C.perTrapTaken, label: 'Calls that went nowhere' },
      { id: 'ignored', meter: 'home', amount: -(st.personalIgnored || 0) * C.perPersonalIgnored, label: 'Left unanswered at home' },
      { id: 'answered', meter: 'home', amount: (st.personalAnswered || 0) * C.perPersonalAnswered, label: 'Answered someone at home' },
      { id: 'late', meter: 'home', amount: late ? -C.lateFinish : 0, label: 'Stayed late to finish' }
    ];
    return items.filter((i) => Math.abs(i.amount) >= 0.05);
  }

  // Close one morning: charge what it cost, then sleep on it.
  function afterMorning(week, summary) {
    if (week.over) return week;
    const items = costOf(summary);
    const spend = (meter) => items.filter((i) => i.meter === meter).reduce((sum, i) => sum + i.amount, 0);
    const energySpent = spend('energy');
    const homeSpent = spend('home');

    const before = { energy: week.energy, home: week.home };
    let energy = clamp(week.energy + energySpent);
    let home = clamp(week.home + homeSpent);

    const index = week.index;
    const last = index >= LENGTH - 1;
    // The night only comes if there is another morning to sleep into.
    const night = last ? { energy: 0, home: 0 }
      : {
        // A home life you are not tending stops the night doing its job, which is how a bad week
        // compounds instead of simply being bad once.
        energy: TUNING.NIGHT.energy * (home < TUNING.NIGHT.homeGateAt ? TUNING.NIGHT.homeGateFactor : 1),
        home: TUNING.NIGHT.home
      };
    energy = clamp(energy + night.energy);
    home = clamp(home + night.home);

    const record = {
      index,
      weekday: Content.WEEKDAYS[index],
      day: summary.day,
      role: summary.role,
      rating: summary.rating.key,
      emoji: summary.rating.emoji,
      title: summary.rating.title,
      score: summary.score,
      shipped: summary.shipped && summary.endReason !== 'pip',
      items,
      night,
      before,
      after: { energy, home }
    };
    return Object.assign({}, week, {
      energy,
      home,
      index: index + 1,
      over: last,
      mornings: week.mornings.concat(record)
    });
  }

  // What the week added up to. Deliberately two axes and not one number: the whole point of a week is
  // that what you delivered and what it cost can come apart, and a single score would hide exactly the
  // thing the mode exists to show.
  function verdict(week) {
    const played = week.mornings.length;
    const shipped = week.mornings.filter((m) => m.shipped).length;
    const golds = week.mornings.filter((m) => m.rating === 'gold').length;
    const score = week.mornings.reduce((sum, m) => sum + m.score, 0);
    const delivered = played ? shipped / played >= 0.6 : false;
    const wellFor = (week.energy + week.home) / 2;
    const intact = wellFor >= 50;
    let key;
    if (!played) key = 'lost';
    else if (delivered && intact) key = 'hero';
    else if (delivered) key = 'burnt';
    else if (intact && shipped) key = 'balanced';
    else if (intact) key = 'coasted';
    else key = 'lost';
    return Object.assign({ key, shipped, golds, played, score, energy: week.energy, home: week.home }, Content.VERDICTS[key]);
  }

  // One row per morning, for sharing a week the way a morning is shared: the rating and what it cost,
  // never which messages were which.
  function shareText(week, o) {
    const v = verdict(week);
    const bar = (value) => '█'.repeat(Math.round(value / 20)) + '░'.repeat(5 - Math.round(value / 20));
    return [
      `9 to 9 · a week as ${o.who}`,
      `${v.emoji} ${v.title}`,
      week.mornings.map((m) => `${m.weekday.slice(0, 3)} ${m.emoji}`).join('  '),
      `⚡ ${bar(week.energy)} energy · 🏡 ${bar(week.home)} home`,
      `${v.shipped}/${v.played} delivered · ${v.score} points`,
      o.url
    ].filter(Boolean).join('\n');
  }

  return { LENGTH, TUNING, newWeek, dayPlan, seedForMorning, carryFor, costOf, afterMorning, tiredness, verdict, currentDayName, shareText };
});
