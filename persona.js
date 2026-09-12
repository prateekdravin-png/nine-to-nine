// persona.js — the "work personality" each round ends with: a funny, shareable label for HOW you played,
// earned from stats the rules already track. Kept apart from the rules (core.js) because it never
// affects a result; it only describes one.
//
// Personalities are checked in order and the first one earned wins, so the most telling behaviour is
// named: getting put on a PIP outranks everything, a flawless run outranks any single strength, and
// falling for traps outranks dodging a few. The last one always matches, so every round gets one.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NinePersona = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // Each check gets the round's stats plus: finished (the deliverable reached 100% without a PIP) and pip.
  const PERSONAS = [
    {
      id: 'ghost', emoji: '👻', name: 'The Ghost',
      earned: (st) => st.pip,
      blurb: () => 'Too busy to answer anyone. HR found you anyway.',
      because: (st) => `${plural(st.urgentMissed, 'urgent message')} left unanswered`
    },
    {
      id: 'zen', emoji: '🧘', name: 'The Zen Master',
      earned: (st) => st.finished && st.trapsTaken === 0 && st.urgentMissed === 0 && st.trivialAnswered === 0 && st.cardsSeen >= 10,
      blurb: () => 'Every call right. Not a single trap. Suspiciously calm.',
      because: (st) => `${st.urgentHandled} urgent handled, ${plural(st.trapsDodged, 'trap')} dodged, nothing missed`
    },
    {
      id: 'martyr', emoji: '🥵', name: 'The Martyr',
      earned: (st) => st.finished && st.trapsTaken >= 3,
      blurb: (role) => `Said yes to every "quick" ask and still got the ${role.deliverable.noun} ${role.deliverable.done}. Please take a day off.`,
      because: (st) => `${plural(st.trapsTaken, 'trap')} taken, and still finished`
    },
    {
      id: 'yes', emoji: '🙋', name: 'The Yes Machine',
      earned: (st) => st.trapsTaken >= 3,
      blurb: () => 'Never met a "quick call" they could refuse.',
      because: (st) => `${plural(st.trapsTaken, '"quick" ask')} accepted`
    },
    {
      id: 'banker', emoji: '🤝', name: 'The Favour Banker',
      earned: (st) => st.urgentDelegated >= 2,
      blurb: () => 'Every chai you said yes to paid off in a crisis.',
      because: (st) => `${st.urgentDelegated} emergencies handed to colleagues who owed you`
    },
    {
      id: 'firewall', emoji: '🛡️', name: 'The Human Firewall',
      earned: (st) => st.trapsTaken === 0 && st.trapsDodged >= 4,
      blurb: () => 'Nothing "quick" gets past you.',
      because: (st) => `${plural(st.trapsDodged, 'trap')} dodged, none taken`
    },
    {
      id: 'lastline', emoji: '🚒', name: 'The Last Line of Defence',
      earned: (st) => st.urgentMissed === 0 && st.urgentHandled >= 4,
      blurb: () => 'Every real emergency, handled. Everyone else slept soundly.',
      because: (st) => `all ${st.urgentHandled} urgent messages handled`
    },
    {
      id: 'chai', emoji: '☕', name: 'The Chai Diplomat',
      earned: (st) => st.trivialAnswered >= 3,
      blurb: () => "Replied to everyone's small talk. The team loves you. The deadline doesn't.",
      because: (st) => `${plural(st.trivialAnswered, 'bit')} of small talk answered`
    },
    {
      id: 'hermit', emoji: '🎧', name: 'The Noise-Cancelled',
      earned: (st) => st.headphonesUsed > 0 && st.deepWorkTime >= 25,
      blurb: () => 'Headphones on, world off.',
      because: (st) => `${Math.round(st.deepWorkTime)}s of deep work, with headphones`
    },
    {
      id: 'diver', emoji: '🌊', name: 'The Deep Diver',
      earned: (st) => st.deepWorkTime >= 30,
      blurb: () => 'Went so deep the notifications echoed.',
      because: (st) => `${Math.round(st.deepWorkTime)}s of deep work`
    },
    {
      id: 'juggler', emoji: '🤹', name: 'The Juggler',
      earned: () => true,
      blurb: () => 'A bit of everything, and a lot of plates in the air.',
      because: (st) => `${plural(st.cardsSeen, 'message')} juggled`
    }
  ];

  // result: Core.summary(); role: the role object from content.js (for wording only).
  function personaFor(result, role) {
    const st = Object.assign({}, result.stats, {
      pip: result.endReason === 'pip',
      finished: result.shipped && result.endReason !== 'pip'
    });
    const p = PERSONAS.find((persona) => persona.earned(st));
    return { id: p.id, emoji: p.emoji, name: p.name, blurb: p.blurb(role), because: p.because(st) };
  }

  return { PERSONAS, personaFor };
});
