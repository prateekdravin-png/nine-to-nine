// rewards.js — what clearing the campaign gives you back. Two kinds, deliberately unequal:
//
//   STARS  one to three per level. The first is clearing it; the other two ask for the same morning done
//          better. They change nothing about how the game plays. They are a reason to go back to a level
//          you have already cleared, and a plain record of how well you know it.
//
//   PERKS  small edges, unlocked by clearing particular levels, and you take ONE into a campaign morning.
//          These do change the rules, which is why there are few of them, why you only ever carry one,
//          and why test/rewards.test.js holds each against the player who answers everything without
//          reading. The first idea was more headphones as levels went on; the simulated players showed
//          four pairs taking that player from 6% gold to 80%, because headphones block exactly the traps
//          a non-reader would fall into. A reward for clearing levels must never become a way round the
//          reading those levels teach.
//
// Pure data and functions: core.js applies a perk, game.js stores and draws both.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NineRewards = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- stars ----
  // Cumulative: a second star needs the first, a third needs both. Every criterion reads the same run
  // summary the level's own goals read, so a star can never ask for something the rules do not measure.
  //
  // Chosen with the simulated players on every pinned morning: a perfect reader takes three stars on all
  // twelve, a 90% reader usually stops at two, an 80% reader at one where it clears at all. On levels 8
  // and 12 a gold is already part of clearing, so the second star comes with the first there.
  const gold = (r) => !!r && !!r.rating && r.rating.key === 'gold';
  const MORNING_STARS = [
    { id: 'clear', label: 'Clear the level' },
    { id: 'gold', label: 'Finish on a gold', test: gold },
    { id: 'clean', label: 'On a gold, with no traps taken and nothing urgent missed',
      test: (r) => gold(r) && r.stats.trapsTaken === 0 && r.stats.urgentMissed === 0 }
  ];
  // A week is judged on the finished week. A paced reader delivered 4 of 5 in 21 weeks out of 24 and all
  // five on 60 energy in about half of them; the player who delivers everything flat out fails to clear.
  const WEEK_STARS = [
    { id: 'clear', label: 'Clear the level' },
    { id: 'four', label: 'Deliver 4 of the 5 mornings', test: (w) => !!w && w.shipped >= 4 },
    { id: 'five', label: 'Deliver all 5, and finish on 60 energy', test: (w) => !!w && w.shipped >= 5 && w.energy >= 60 }
  ];
  const MAX_STARS = 3;

  const starRules = (level) => (level && level.kind === 'week' ? WEEK_STARS : MORNING_STARS);

  // How one attempt did, star by star. `cleared` comes from campaign.js, which owns what clearing means.
  function starsFor(level, result, cleared) {
    let earned = 0;
    let stillEarning = true;
    const rows = starRules(level).map((rule, i) => {
      const met = i === 0 ? !!cleared : !!cleared && !!rule.test(result);
      const done = stillEarning && met;
      if (done) earned++;
      else stillEarning = false;
      return { id: rule.id, label: rule.label, done };
    });
    return { stars: earned, rows };
  }

  // Stars only ever go up: a worse replay never takes one away, the same way a cleared level stays cleared.
  function withBest(saved, levelId, stars) {
    const out = Object.assign({}, saved);
    const n = Math.max(0, Math.min(MAX_STARS, Math.floor(Number(stars) || 0)));
    if (n > (out[levelId] || 0)) out[levelId] = n;
    return out;
  }

  // Tolerant of whatever is in storage: unknown levels and nonsense counts are dropped, and a level that
  // was cleared before stars existed is worth the one star clearing always gives.
  function cleanStars(saved, knownIds, clearedIds) {
    const known = new Set(knownIds || []);
    const out = {};
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const id of Object.keys(saved)) {
        const n = Math.floor(Number(saved[id]));
        if (known.has(id) && n >= 1) out[id] = Math.min(MAX_STARS, n);
      }
    }
    for (const id of clearedIds || []) if (known.has(id) && !out[id]) out[id] = 1;
    return out;
  }

  const totalStars = (map) => Object.keys(map || {}).reduce((sum, id) => sum + (map[id] || 0), 0);

  // ---- perks ----
  // Each is unlocked by clearing the level that teaches the thing it softens, so a perk is never an edge
  // at something you have not been shown yet. Their effects live in core.js under TUNING.PERKS; the
  // numbers in these blurbs are checked against those in the tests, so the words cannot drift.
  const PERKS = [
    {
      id: 'coffee', emoji: '☕', title: 'Strong coffee', unlockedBy: 'read',
      blurb: 'Your first 2 emergencies don’t knock you out of focus.'
    },
    {
      id: 'headphones', emoji: '🎧', title: 'Spare headphones', unlockedBy: 'headphones',
      blurb: 'Two goes with the headphones: a spare 6-second pair, once 15 seconds have passed since the first.'
    },
    {
      id: 'cover', emoji: '🛡️', title: 'Manager’s cover', unlockedBy: 'cannot-tell',
      blurb: 'The first trap you fall for is over sooner, and your focus survives it.'
    },
    {
      // Appraisal week is where silence is shown to cost more than anything you build, and a polite no
      // is the alternative to silence. Two of them, not a morning of them.
      id: 'politeexit', emoji: '🙅', title: 'Polite exit', unlockedBy: 'appraisal',
      blurb: 'Your first 2 polite noes cost no reputation.'
    },
    {
      // Release day is where there is no slack on anything urgent, so this is the level that earns one
      // missed emergency back — and only the reputation for it, since the escalation still arrives.
      id: 'secondchance', emoji: '📌', title: 'Second chance', unlockedBy: 'release',
      blurb: 'The first emergency you miss costs no reputation, and still comes back once.'
    },
    {
      // The level that shows a trap left to run out asking again, louder. Snooze keeps two of them gone;
      // a trap you take is still taken, so it is no help to a player who answers everything.
      id: 'snooze', emoji: '🔕', title: 'Snooze', unlockedBy: 'come-back',
      blurb: 'The first 2 traps you leave to run out don’t come back.'
    },
    {
      // The outage level, where favours are the plan. One already owed is a plan that does not need a
      // quiet spell first, and it is worth nothing to a player who never passes an emergency on.
      id: 'oncall', emoji: '📟', title: 'On-call rota', unlockedBy: 'everything-down',
      blurb: 'You start the morning with Alex already owing you a favour.'
    },
    {
      // The long day at the top, where time is what you are shortest of. The second comes off the first
      // thing you answer that is not a trap, the same rule every banked second follows.
      id: 'cleardiary', emoji: '📆', title: 'Clear diary', unlockedBy: 'long-day-top',
      blurb: 'You start the morning with 1 second in hand, off the first real thing you answer.'
    }
  ];
  const byId = {};
  for (const perk of PERKS) byId[perk.id] = perk;

  // Which perks a player has, from the levels they have cleared, in the order they arrive.
  function perksFrom(clearedIds) {
    const done = new Set(clearedIds || []);
    return PERKS.filter((p) => done.has(p.unlockedBy)).map((p) => p.id);
  }

  // What clearing one particular level hands over, for the result screen to announce.
  const unlockedBy = (levelId) => PERKS.filter((p) => p.unlockedBy === levelId).map((p) => p.id);

  // Perks are for single campaign mornings. A week is five mornings on one set of meters, and the daily
  // morning and a challenge have to be the same game for everyone who plays them.
  const perkAllowed = (level) => !!level && level.kind !== 'week';

  // The perk to actually take into a morning: the one picked, if it is still unlocked and allowed.
  function perkFor(level, picked, clearedIds) {
    if (!perkAllowed(level) || !byId[picked]) return null;
    return perksFrom(clearedIds).indexOf(picked) !== -1 ? picked : null;
  }

  return {
    MORNING_STARS, WEEK_STARS, MAX_STARS, starsFor, withBest, cleanStars, totalStars,
    PERKS, byId, perksFrom, unlockedBy, perkAllowed, perkFor
  };
});
