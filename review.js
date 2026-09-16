// review.js — "what you misread": the two or three wrong calls from a morning, each with the tell that
// gave the message away.
//
// A score tells you that you got it wrong. It does not tell you what you could have seen. Every trap and
// every real emergency in this game is written around a tell that changes with your career level
// (content.js: junior traps minimise, senior traps are polite and open-ended, lead traps shout), so a
// wrong call can always be explained by pointing at the words that were on the screen.
//
// Two rules hold this honest:
//   * It only ever explains messages you got WRONG. Naming the tell in one you read correctly would be
//     teaching you nothing and spoiling a message you had already earned.
//   * It quotes the message that was actually on screen, and the word it points at is found in that
//     text rather than assumed. If the tell for that level is not in the words, it says what was true
//     instead (a senior trap gives itself away by nothing being broken at all).
//
// Pure functions only: core.js records the wrong calls, game.js draws what this returns.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./content'));
  else root.NineReview = factory(root.NineContent);
})(typeof self !== 'undefined' ? self : this, function (Content) {
  'use strict';

  // Three is the most a result screen can carry without becoming a lecture, and enough to show a pattern.
  const MAX = 3;

  // Worst first, so the one that cost the most is the one you read: an emergency left to burn, then a
  // trap taken (an hour of your morning), then a polite no to something real (cheap, still wrong).
  const WEIGHT = { missed: 3, trap: 2, declined: 1 };

  const kindOf = (miss) => {
    if (miss.type === 'urgent') return miss.action === 'decline' ? 'declined' : 'missed';
    return miss.type === 'trap' ? 'trap' : null;
  };

  // The word from the message itself, never one invented for the explanation.
  function quoted(text, pattern) {
    const found = String(text || '').match(pattern);
    return found ? found[0].replace(/[!]+$/, '') : null;
  }

  const TITLE = {
    missed: { expired: 'It ran out while you were elsewhere', ignore: 'You left a real emergency' },
    declined: 'You said no to a real emergency',
    trap: { junior: 'You took a "quick" one', senior: 'You took a polite one', lead: 'You took one that shouted' }
  };

  function tellFor(kind, miss, levelId) {
    if (kind === 'trap') {
      if (levelId === 'lead') {
        const word = quoted(miss.text, Content.TELLS.alarm);
        return word
          ? `It shouted “${word}”. At lead the loud ones are the traps, and the real emergencies are calm.`
          : 'At lead the loud ones are the traps, and the real emergencies are calm.';
      }
      if (levelId === 'senior') {
        return 'Nothing was actually broken, and nobody was waiting. A senior trap is polite and open-ended.';
      }
      const word = quoted(miss.text, Content.TELLS.minimising);
      return word
        ? `It said “${word}”. Anything quick, small or just 2 mins never is.`
        : 'Anything quick, small or just 2 mins never is.';
    }
    // A real emergency, whether it was ignored, left to run out, or politely declined.
    if (levelId === 'lead') return 'It was calm and said what was broken. At lead that is what a real one sounds like.';
    const word = quoted(miss.text, Content.TELLS.alarm);
    return word
      ? `It said “${word}” and named what was broken, with someone waiting on you.`
      : 'Something was broken and someone was waiting on you.';
  }

  const BETTER = {
    missed: 'Answer it, or pass it to a colleague who owes you a favour.',
    declined: 'A polite no still leaves the fire burning. This one was worth your time.',
    trap: 'Leave it. It comes back once, and it is still not quick.'
  };

  // The review for one finished morning: at most three wrong calls, worst first, each with what it was,
  // the tell in its own words, and what to do with the next one like it.
  function review(summary) {
    if (!summary || !summary.stats || !Array.isArray(summary.stats.misreads)) return [];
    const levelId = Content.LEVELS[summary.level] ? summary.level : 'junior';
    const wrong = summary.stats.misreads
      .map((miss) => ({ miss, kind: kindOf(miss) }))
      .filter((row) => row.kind)
      // Worst first, and within a kind the earliest, so the review reads in the order the morning went.
      .sort((a, b) => (WEIGHT[b.kind] - WEIGHT[a.kind]) || (a.miss.at - b.miss.at));
    // One of each kind of mistake before a second of any: four emergencies missed and one trap taken is
    // two lessons, and filling all three slots with the same tell teaches only one of them.
    const picked = [];
    for (const pass of [1, 2, 3]) {
      for (const row of wrong) {
        if (picked.length >= MAX) break;
        if (picked.indexOf(row) !== -1) continue;
        if (picked.filter((p) => p.kind === row.kind).length >= pass) continue;
        picked.push(row);
      }
    }
    return picked
      .map(({ miss, kind }) => ({
        kind,
        at: miss.at,
        emoji: kind === 'trap' ? '🪤' : '🚨',
        title: kind === 'trap' ? TITLE.trap[levelId] || TITLE.trap.junior
          : kind === 'declined' ? TITLE.declined
            : TITLE.missed[miss.action] || TITLE.missed.ignore,
        from: miss.from,
        text: miss.text,
        tell: tellFor(kind, miss, levelId),
        better: BETTER[kind]
      }));
  }

  // How the section introduces itself: nothing to say when the morning was read cleanly.
  function heading(items, total) {
    if (!items.length) return null;
    const more = Math.max(0, total - items.length);
    return more ? `The ${items.length} that cost you most, of ${total} wrong calls` : items.length === 1 ? 'One wrong call' : `Your ${items.length} wrong calls`;
  }

  return { MAX, review, heading, tellFor };
});
