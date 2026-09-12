// daily.js — the daily morning: one morning a day, the same one for everyone (the Wordle model), and
// the spoiler-free result people paste into their team chat. Pure functions only: game.js handles the
// page and storage, and server.js and stats.js use the same morning numbering.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NineDaily = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY_MS = 24 * 60 * 60 * 1000;
  // Mornings turn over at midnight India time for everyone, wherever they are, so an onsite colleague
  // in the US is on the same morning as the team in Bengaluru and their results compare.
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const FIRST_MORNING = Date.UTC(2026, 8, 11); // Morning #1 is 11 Sep 2026, India time

  const sinceFirst = (now) => now + IST_OFFSET_MS - FIRST_MORNING;

  function morningNumber(now) {
    return Math.max(1, Math.floor(sinceFirst(now) / DAY_MS) + 1);
  }

  // The calendar date (India time) of a morning, as YYYY-MM-DD.
  function morningDate(n) {
    return new Date(FIRST_MORNING + (n - 1) * DAY_MS).toISOString().slice(0, 10);
  }

  function msUntilNextMorning(now) {
    const into = ((sinceFirst(now) % DAY_MS) + DAY_MS) % DAY_MS;
    return DAY_MS - into;
  }

  function countdown(ms) {
    const minutes = Math.max(1, Math.ceil(ms / 60000));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  }

  // FNV-1a turns a morning number into its seed. Stable, not secret: the point is only that everyone
  // who plays Morning #N gets the same one.
  function seedFor(n) {
    const str = `9to9-morning-${n}`;
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  const SQUARES = { good: '🟩', meh: '🟨', bad: '🟥' };

  // One square per message in the order they arrived, with a row for each in-game hour (10, 11 and 12
  // o'clock), so the grid shows the morning getting busier. A square says how the call turned out —
  // right call, answered small talk, wrong call — never what the message was, so sharing a result
  // doesn't tell anyone which of today's messages are traps.
  function grid(decisions, duration) {
    const rows = [[], [], []];
    decisions.slice().sort((a, b) => a.at - b.at).forEach((d) => {
      const hour = Math.min(2, Math.max(0, Math.floor((d.at / duration) * 3)));
      rows[hour].push(SQUARES[d.outcome] || '⬜');
    });
    return rows.filter((r) => r.length).map((r) => r.join('')).join('\n');
  }

  // Consecutive mornings played, counting back from today, or from yesterday while today's morning is
  // still unplayed, so a streak doesn't look broken before the day is over.
  function streak(playedMornings, today) {
    const played = new Set(playedMornings);
    let n = played.has(today) ? today : today - 1;
    let count = 0;
    while (played.has(n)) { count++; n--; }
    return count;
  }

  function shareText(o) {
    const extras = [`⚡ ${Math.round(o.deepWork)}s deep work`];
    if (o.streak >= 2) extras.push(`🔥 ${o.streak}-day streak`);
    return [
      `9 to 9 · Morning #${o.morning} · ${o.who}`, // who played it, e.g. "🧪 Senior Tester"
      `${o.rating.emoji} ${o.rating.title} · ${o.score}`,
      // Only the personality's name: the reason behind it ("6 traps dodged") would hint at today's messages.
      o.persona ? `${o.persona.emoji} ${o.persona.name}` : '',
      grid(o.decisions, o.duration),
      extras.join(' · '),
      o.url
    ].filter(Boolean).join('\n');
  }

  return { DAY_MS, FIRST_MORNING, SQUARES, morningNumber, morningDate, msUntilNextMorning, countdown, seedFor, grid, streak, shareText };
});
