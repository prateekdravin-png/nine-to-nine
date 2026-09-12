// awards.js — achievements and the desk objects they unlock. Pure and cosmetic: an unlock only changes
// what your office looks like (scene.js), never the rules, so nobody who has played longer has an easier
// morning. Kept apart from the browser layer so the conditions can be tested on their own.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NineAwards = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Each award unlocks exactly one object in the office. `earned` reads a finished round plus what the
  // player has done across rounds (see context below), never anything live, so it can be checked once at
  // the end of a round.
  //
  // context: { finished, rating, mode, role, events, stats, rounds, rolesFinished, streak }
  const AWARDS = [
    {
      id: 'first', emoji: '🗒️', name: 'First morning', prop: 'notes',
      unlocks: 'Sticky notes on your monitor',
      hint: 'Finish your first morning',
      earned: (c) => c.rounds >= 1
    },
    {
      id: 'firewall', emoji: '🪴', name: 'Human firewall', prop: 'plant',
      unlocks: 'A plant for your desk',
      hint: 'Dodge 6 traps in one morning',
      earned: (c) => c.stats.trapsDodged >= 6
    },
    {
      id: 'spotless', emoji: '🏆', name: 'Nothing slipped', prop: 'trophy',
      unlocks: 'A small trophy',
      hint: 'Finish the work without missing anything urgent',
      earned: (c) => c.finished && c.stats.urgentMissed === 0
    },
    {
      id: 'deepdiver', emoji: '🎧', name: 'Deep diver', prop: 'stand',
      unlocks: 'A headphone stand',
      hint: '40 seconds of deep work in one morning',
      earned: (c) => c.stats.deepWorkTime >= 40
    },
    {
      id: 'rescue', emoji: '🖼️', name: 'The rescue', prop: 'photo',
      unlocks: 'A photo of the team',
      hint: 'Pass an emergency to a colleague while you are stuck on a call',
      earned: (c) => c.stats.rescues >= 1
    },
    {
      id: 'allroles', emoji: '🖥️', name: 'Tried everything', prop: 'monitor',
      unlocks: 'A second monitor',
      hint: 'Finish the work in all five roles',
      earned: (c) => c.rolesFinished.length >= 5
    },
    {
      id: 'streak3', emoji: '📅', name: 'Three in a row', prop: 'calendar',
      unlocks: 'A wall calendar',
      hint: 'Play the daily morning three days running',
      earned: (c) => c.streak >= 3
    },
    {
      id: 'regular', emoji: '🐈', name: 'Regular', prop: 'cat',
      unlocks: 'A photo of a cat',
      hint: 'Play ten mornings',
      earned: (c) => c.rounds >= 10
    },
    {
      id: 'goldendaily', emoji: '🥇', name: 'Gold star', prop: 'medal',
      unlocks: 'A medal on the wall',
      hint: 'Earn 🥇 on a daily morning',
      earned: (c) => c.mode === 'daily' && c.rating === 'gold'
    },
    {
      id: 'survivor', emoji: '🧯', name: 'Survivor', prop: 'extinguisher',
      unlocks: 'A fire extinguisher',
      hint: 'Live through a fire drill and an outage in the same morning',
      earned: (c) => c.events.indexOf('drill') !== -1 && c.events.indexOf('outage') !== -1
    }
  ];

  const byId = {};
  for (const a of AWARDS) byId[a.id] = a;

  // What a finished round just earned, leaving out anything already unlocked.
  function earnedBy(context, already) {
    const have = new Set(already || []);
    return AWARDS.filter((a) => !have.has(a.id) && a.earned(context)).map((a) => a.id);
  }

  // The desk objects to draw, for a set of unlocked award ids.
  const propsFor = (ids) => AWARDS.filter((a) => (ids || []).indexOf(a.id) !== -1).map((a) => a.prop);

  return { AWARDS, byId, earnedBy, propsFor };
});
