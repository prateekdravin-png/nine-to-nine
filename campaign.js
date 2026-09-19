// campaign.js — the game as a ladder. Everything this prototype can do arrives at once otherwise:
// flow, traps, headphones, favours, saying no, day types, career levels, bought time. The campaign is
// the curriculum — one morning per level, each asking for one thing you have not had to do yet, and
// nothing new is introduced until the level before it has been shown.
//
// It is also the only ladder now. Career levels used to unlock by scoring a gold, which promoted you
// for a good morning rather than for learning anything; clearing the level that teaches senior traps is
// what makes you a senior, and the same for lead.
//
// Each level pins the morning's seed, so a level is a designed challenge you can learn rather than a
// lottery you re-roll. Your ROLE is never pinned: it changes only wording, so the campaign plays the
// same for a tester as for a developer.
//
// Pure functions only: game.js stores progress and draws it, core.js plays the mornings.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NineCampaign = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Every seed below was found by searching for a morning that a competent simulated player clears in
  // all five roles, and that the player who has not learned this level's lesson fails. A level nobody
  // can pass, or one that falls to a naive strategy, is a broken level; test/campaign.test.js re-checks
  // both on every run, so a tuning change cannot quietly turn one into either.

  // Goal builders. Every goal reads one thing off the run summary, so a level can never ask for
  // something the rules do not already measure.
  const shipped = (r) => r.shipped && r.endReason !== 'pip';
  const goal = (id, label, test) => ({ id, label, test });
  const atLeast = (id, label, read, n) => goal(id, label, (r) => read(r) >= n);
  const atMost = (id, label, read, n) => goal(id, label, (r) => read(r) <= n);

  const SHIP = goal('ship', 'Finish the work', shipped);
  const st = (key) => (r) => r.stats[key];

  const LEVELS = [
    {
      n: 1, id: 'first', title: 'First morning', emoji: '💼',
      brief: 'Hold the button. That is the whole job, until it is not.',
      teaches: 'The work only moves while you are working.',
      hint: 'Hold the button and keep holding it. Nothing you tap moves the bar — only the work does, and nothing on this morning is worth stopping for.',
      setup: { day: 'normal', level: 'junior', seed: 1010 },
      goals: [SHIP]
    },
    {
      n: 2, id: 'read', title: 'Read the room', emoji: '🚨',
      brief: 'Some of what lands really is on fire. Leaving one of those costs you.',
      teaches: 'Ignoring something urgent costs reputation.',
      hint: 'Read every card before you touch it. The real ones name what is broken and who is waiting; leaving one of those is the only thing here that can fail you.',
      setup: { day: 'normal', level: 'junior', seed: 1020 },
      goals: [SHIP, atMost('missed', 'Miss nothing urgent', st('urgentMissed'), 0)]
    },
    {
      n: 3, id: 'never-quick', title: "It's never quick", emoji: '🪤',
      brief: 'Anything quick, small or just 2 mins never is. Let them go.',
      teaches: 'Traps give themselves away at junior.',
      hint: 'Every trap this morning says so: quick, small, just 2 mins, only a sec. Tap Ignore and go back to work — a trap you never touch cannot take you.',
      setup: { day: 'normal', level: 'junior', seed: 1031 },
      goals: [SHIP, atLeast('dodge', 'Dodge 5 traps', st('trapsDodged'), 5)]
    },
    {
      n: 4, id: 'deep-end', title: 'The deep end', emoji: '🌊',
      brief: 'Uninterrupted work compounds. Four seconds in, you are worth three of you.',
      teaches: 'Flow is the point of protecting your attention.',
      hint: 'Flow builds while you hold the button and starts again the moment you answer anything. Pick the quietest stretch, hold it, and let the small stuff run out on its own.',
      setup: { day: 'normal', level: 'junior', seed: 1040 },
      goals: [SHIP, atLeast('deep', '25 seconds in Deep Work', st('deepWorkTime'), 25)]
    },
    {
      n: 5, id: 'headphones', title: 'Headphones on', emoji: '🎧',
      brief: 'Ten seconds where only a real emergency gets through. Spend them well.',
      teaches: 'You have one tool, once a morning.',
      hint: 'Put the headphones on while the inbox is quiet, not while it is full: ten seconds where only a real emergency gets through is ten seconds of building flow. And take no traps at all — when in doubt, ignore.',
      setup: { day: 'normal', level: 'junior', seed: 1050 },
      goals: [SHIP, atLeast('used', 'Use your headphones', st('headphonesUsed'), 1), atMost('traps', 'Take no traps at all', st('trapsTaken'), 0)]
    },
    {
      n: 6, id: 'colleague', title: 'Be a colleague', emoji: '🤝',
      brief: 'Answer someone’s chat and they owe you one. Save it for something real.',
      teaches: 'Favours: a little focus now for a rescue later.',
      hint: 'Favours come from answering small talk from a person, never from a bot or a group chat. Bank three early, then tap 🤝 on a real emergency and a colleague takes it — it counts as handled and costs you no time.',
      setup: { day: 'normal', level: 'junior', seed: 1060 },
      goals: [SHIP, atLeast('banked', 'Bank 3 favours', st('favoursBanked'), 3), atLeast('spent', 'Spend one on an emergency', st('urgentDelegated'), 1)]
    },
    {
      n: 7, id: 'cannot-tell', title: "When you can't tell", emoji: '🙅',
      brief: 'Traps stop saying "quick". They are polite now, and nothing is actually wrong.',
      teaches: 'Saying no is the cheapest way to be wrong.',
      hint: 'Senior traps are polite and open-ended with nothing actually wrong behind them. When you genuinely cannot tell, say no: it costs a few points of reputation and never costs you a trap. This level wants that twice.',
      setup: { day: 'normal', level: 'senior', seed: 1070 },
      goals: [SHIP, atMost('traps', 'Take at most 2 traps', st('trapsTaken'), 2), atLeast('declined', 'Say no at least twice', st('declined'), 2)],
      unlocks: 'senior'
    },
    {
      n: 8, id: 'appraisal', title: 'Appraisal week', emoji: '📋',
      brief: 'Nothing you build matters this morning next to who saw you ignore them.',
      teaches: 'A day type changes what the morning is for.',
      hint: 'Nothing you build counts today, only who saw you ignore them. Answer the real emergencies, say no when you cannot tell rather than letting it run out, and do not chase the work.',
      setup: { day: 'appraisal', level: 'senior', seed: 1082 },
      goals: [atLeast('rep', 'Finish on 88 reputation', (r) => r.rep, 88)]
    },
    {
      n: 9, id: 'backlog', title: 'Backlog day', emoji: '🗃️',
      brief: 'A pile of small tickets. There is no deep end to get into today.',
      teaches: 'Sometimes focus buys you nothing and only time hurts.',
      hint: 'There is no deep end today, so stop protecting your focus: keep moving, and let time be the only thing you spend. One trap is all you are allowed, so read before you tap.',
      setup: { day: 'backlog', level: 'senior', seed: 1090 },
      goals: [SHIP, atMost('traps', 'Take no more than one trap', st('trapsTaken'), 1)]
    },
    {
      n: 10, id: 'release', title: 'Release day', emoji: '🚀',
      brief: 'Most of what lands really is on fire, and it all counts double.',
      teaches: 'There is no slack on the days that matter.',
      hint: 'Most of what lands really is on fire and it counts double. Answer every emergency the moment it arrives — the work will wait, the outage will not.',
      setup: { day: 'release', level: 'senior', seed: 1100 },
      goals: [SHIP, atMost('missed', 'Miss nothing urgent', st('urgentMissed'), 0)]
    },
    {
      n: 11, id: 'on-a-roll', title: 'On a roll', emoji: '⏳',
      brief: 'Twelve right calls in a row and the morning gives you five seconds back.',
      teaches: 'Reading well is worth time, not just the absence of trouble.',
      hint: 'The run counts calls you make, not messages you skip: Respond to an urgent, tap Ignore on a trap or small talk. A message you let run out never builds the run, and a polite no or a reply to small talk ends it. Watch the ⏳ chip in the goal bar.',
      // Seed 1110 asked for perfection: a flawless reader hit exactly twelve and a 90% reader only four,
      // so a single misread anywhere in the morning failed the level. This morning carries more messages,
      // and a strong reader who slips once still strings twelve together; someone answering without
      // reading still tops out at three.
      setup: { day: 'normal', level: 'senior', seed: 1119 },
      goals: [SHIP, atLeast('run', 'A run of 12 right calls', st('bestRun'), 12)]
    },
    {
      n: 12, id: 'lead', title: 'Lead', emoji: '👑',
      brief: 'Traps shout URGENT now, and the real emergencies are the calm ones.',
      teaches: 'Alarm words mislead. Ask what is actually broken.',
      hint: 'Lead traps shout URGENT and ASAP; the real emergencies are often the calm ones that name what is broken. Ask who is waiting, not how loudly. Gold needs the work finished and your reputation intact.',
      setup: { day: 'normal', level: 'lead', seed: 1120 },
      goals: [SHIP, goal('gold', 'Finish on a gold', (r) => r.rating.key === 'gold')],
      unlocks: 'lead'
    },
    {
      // Levels 13 to 16 are the lead's own mornings. Everything up to here taught a piece of the job on an
      // ordinary day with an ordinary boss; these four change the weather instead of the rules — a day type
      // and the three bosses the daily morning can deal you — so nothing new has to be explained and the
      // difficulty comes from the morning itself. Each seed was searched for the same way as the rest: a
      // player who has learned the level clears it in all five roles, and one who has not never does.
      n: 13, id: 'quiet-house', title: 'Working from home', emoji: '🏠',
      brief: 'Half as many interruptions, and focus twice as hard to hold.',
      teaches: 'A quiet morning is not an easy one. Nothing is protecting your attention but you.',
      hint: 'Half the interruptions, and flow drains twice as fast. Do not wait for quiet — it is already quiet. Start holding immediately, and treat every reply as costing you more than it would in the office.',
      setup: { day: 'wfh', level: 'lead', seed: 1304 },
      goals: [SHIP, atLeast('deep', '35 seconds in Deep Work', st('deepWorkTime'), 35)]
    },
    {
      n: 14, id: 'micromanager', title: 'The micromanager', emoji: '🔍',
      brief: 'Your boss checks in all morning, and today most of it really is on fire.',
      teaches: 'When the alarms are real, what they cost you is time, not judgement.',
      hint: 'Today the alarms mean it. Take at least three of them and leave none, and spend nothing on saying no — the judgement is easy this morning, the clock is not.',
      setup: { day: 'normal', level: 'lead', seed: 1313 },
      goals: [SHIP, atMost('missed', 'Miss nothing urgent', st('urgentMissed'), 0), atLeast('handled', 'Handle at least 3 real emergencies', st('urgentHandled'), 3)]
    },
    {
      n: 15, id: 'all-polite', title: 'All so polite', emoji: '🙂',
      brief: 'Nobody shouts today. The traps say please, and thank you, and “whenever you get a minute”.',
      teaches: 'Politeness is not safety. Read what is being asked, not how nicely it is asked.',
      hint: 'Nobody shouts today, so loudness tells you nothing. Ask what is broken behind the request: if the answer is nothing, it is a trap however kindly it is put. Take none at all.',
      setup: { day: 'normal', level: 'lead', seed: 1305 },
      goals: [SHIP, atMost('traps', 'Take no traps at all', st('trapsTaken'), 0)]
    },
    {
      n: 16, id: 'noon', title: 'It all lands at noon', emoji: '⌛',
      brief: 'A quiet start, and then the whole morning arrives at once, right at the end.',
      teaches: 'Spend the quiet building a lead. The end of the morning will not give you one.',
      hint: 'The morning is quiet and then all of it arrives at once. Bank your deep work in the first half — the last stretch will not give you forty seconds of anything.',
      setup: { day: 'normal', level: 'lead', seed: 1327 },
      goals: [SHIP, atMost('missed', 'Miss nothing urgent', st('urgentMissed'), 0), atLeast('deep', '40 seconds in Deep Work', st('deepWorkTime'), 40)]
    },
    {
      // The only level that is not one morning. Everything before it teaches a piece of a morning; this
      // asks whether you can do it five times running without emptying yourself, which is the actual
      // question the game is about. It closes the first part of the ladder rather than sitting beside it
      // as a mode; the levels after it go back to single mornings, each asking for something new.
      n: 17, id: 'the-week', title: 'A week that holds', emoji: '🗓️',
      kind: 'week',
      brief: 'Five mornings on one set of meters. Monday to Friday, and still a person on Friday.',
      teaches: 'A morning you win by emptying yourself is a morning Tuesday pays for.',
      hint: 'Five mornings, one set of meters. Stop working while you still have energy for tomorrow, answer the people outside work, and take the three deliveries across the week rather than burning Monday for one.',
      setup: { day: 'normal', level: 'lead', seed: 0 },
      goals: [
        goal('delivered', 'Deliver at least 3 of the 5 mornings', (w) => w.shipped >= 3),
        goal('energy', 'Finish the week on 40 energy', (w) => w.energy >= 40),
        goal('home', 'And on 40 at home', (w) => w.home >= 40)
      ]
    },
    // ---- After the week ----
    // The ladder carries on past the week rather than ending there. curve.js showed why these could not
    // just be harder versions of what came before: judgement difficulty is already used up (level 15
    // needs ~94% reading accuracy) and every level from 10 on sits on the same plateau. So these hold
    // judgement near the lead tier and climb on time instead, and each is strict only about its own lesson
    // — stacking zero-tolerance goals is what pushed early drafts of both past 94%.
    {
      n: 18, id: 'come-back', title: "It'll come back", emoji: '🔁',
      brief: 'A trap you let run out is not a trap you turned down. It asks again, louder.',
      teaches: "Turn a trap down; don't let it expire. Leaving it is not a no.",
      hint: 'Ignore each trap as soon as you have read it. One you leave to run out comes back pushier, and at lead it comes back sounding urgent. Nothing you have dismissed ever returns.',
      setup: { day: 'normal', level: 'lead', seed: 3 },
      // Only a trap that EXPIRED comes back (core.js queueFollowUp); one you dismissed stays gone. That is
      // the whole lesson, and it bites slow readers hardest, since theirs are the traps that run out.
      goals: [SHIP, atMost('hanging', 'Leave nothing hanging', st('followUps'), 0)]
    },
    {
      n: 19, id: 'everything-down', title: 'Everything is down', emoji: '🚨',
      brief: 'Three things break at once, and you can only be on one call.',
      teaches: 'A real outage is more than one person can carry. The favours you banked are the plan.',
      hint: 'Answer colleagues in the quiet to bank favours. When the outage hits, pass the real emergencies on — you can hand one over even while you are on a call. Miss none, and pass on at least two.',
      setup: { day: 'normal', level: 'lead', seed: 30 },
      // Level 6 showed one favour can rescue you; this morning's burst needs two in hand. The tightest
      // lead morning for time (a first-time reader's pace and no slower), which is the climb curve.js asked for.
      goals: [SHIP, atMost('missed', 'Miss nothing urgent', st('urgentMissed'), 0),
        atLeast('passed', 'Pass on at least two emergencies', st('urgentDelegated'), 2)]
    },
    {
      // The promotion to the top rung, built like level 12: the new tell on an ordinary morning, and a
      // gold to clear it. At head a player who learned lead as a rule ("calm means real") takes every calm
      // trap and never clears it; a perfect reader golds it in every role. Seed 13 measured 92% on the
      // judgement curve and 2.9s per message on time, level 19's pace, with nothing but lunch going on.
      n: 20, id: 'head-of', title: 'Head of', emoji: '🏔️',
      brief: 'Everything sounds real now, calm or loud. Only some of it is happening today.',
      teaches: 'Calm or loud says nothing at the top. Ask whether it is live, and whether it is now.',
      hint: 'At head, traps sound exactly like emergencies. Look for when and where: next week, staging, a draft or a rehearsal is a trap. A real one is live and happening now, whether it shouts or not. Gold needs the work finished and your reputation intact.',
      setup: { day: 'normal', level: 'head', seed: 13 },
      goals: [SHIP, goal('gold', 'Finish on a gold', (r) => r.rating.key === 'gold')],
      unlocks: 'head'
    }
  ];

  const byNumber = {};
  for (const level of LEVELS) byNumber[level.n] = level;

  const LAST = LEVELS[LEVELS.length - 1].n;

  // How one run measured up. Returns a row per goal so the result screen can show the whole card,
  // including the ones that were met, rather than only what went wrong.
  function check(level, summary) {
    return level.goals.map((g) => ({ id: g.id, label: g.label, done: !!summary && !!g.test(summary) }));
  }

  const cleared = (results) => results.length > 0 && results.every((r) => r.done);

  // A week level is judged on a finished week (week.js verdict), not on one morning's summary.
  const isWeek = (level) => !!level && level.kind === 'week';

  // The next level to play: the first one not yet cleared, or null once the ladder is finished.
  function nextFor(clearedIds) {
    const done = new Set(clearedIds || []);
    return LEVELS.find((l) => !done.has(l.id)) || null;
  }

  const isOpen = (level, clearedIds) => {
    const done = new Set(clearedIds || []);
    return level.n === 1 || done.has(level.id) || LEVELS.some((l) => l.n === level.n - 1 && done.has(l.id));
  };

  // Career levels are campaign rewards: clearing the level that teaches senior traps is what makes you a
  // senior. careerFrom answers that for the ladder as a whole; careerForRole answers it for one role, and
  // that is what the start screen gates on.
  function careerFrom(clearedIds) {
    const done = new Set(clearedIds || []);
    let highest = 'junior';
    for (const level of LEVELS) if (level.unlocks && done.has(level.id)) highest = level.unlocks;
    return highest;
  }

  // Which levels one ROLE has cleared, which is the ladder that role is walking. A level recorded with no
  // role at all was saved before roles were recorded; it counts for everyone, because there is no way to
  // know who played it and nobody should be sent back down a ladder they have already climbed.
  function clearedFor(clearedBy, roleId) {
    const by = clearedBy || {};
    return Object.keys(by).filter((id) => !by[id] || !by[id].length || by[id].indexOf(roleId) !== -1);
  }

  // What one ROLE has earned. A level is the same morning whoever plays it, but the tells are written in
  // that role's own words, so learning to read them as a developer is not the same as learning to read
  // them as a tester: each role climbs its own career. clearedBy maps a level id to the roles that have
  // cleared it.
  function careerForRole(clearedBy, roleId) {
    const by = clearedBy || {};
    let highest = 'junior';
    for (const level of LEVELS) {
      const roles = by[level.id];
      if (level.unlocks && Array.isArray(roles) && roles.indexOf(roleId) !== -1) highest = level.unlocks;
    }
    return highest;
  }

  return { LEVELS, LAST, byNumber, check, cleared, isWeek, nextFor, isOpen, careerFrom, careerForRole, clearedFor };
});
