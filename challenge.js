// challenge.js — challenge links: "I scored 812 on this morning, beat it."
//
// The whole challenge travels in the link's hash, so there is nothing to store and no account to make:
// the code holds the morning's seed, the role and career level it was played at, the variant, and the
// score to beat. The recipient's game rebuilds the identical morning from that seed — same boss, same
// office events, same interruptions arriving at the same moments — so the two scores compare.
//
// Message wording is the one thing that can differ: practice rounds deal recently seen messages last
// (core.js), and the two players have seen different ones. What a message *is* and *when* it lands is
// fixed by the seed, so the morning is the same shape and the same difficulty for both.
//
// The hash is deliberate. A fragment never leaves the browser, so a challenge is not visible to the
// server, and the link works on a static host with no back end at all.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./content'), require('./core'));
  else root.NineChallenge = factory(root.NineContent, root.NineCore);
})(typeof self !== 'undefined' ? self : this, function (Content, Core) {
  'use strict';

  const VERSION = 1;
  const MAX_SCORE = 1000000;
  // Sorted, so adding a rating or reordering RATINGS doesn't silently change what old links mean.
  const RATING_ORDER = Object.keys(Core.RATINGS).sort();

  const index = (list, value) => list.indexOf(value);

  // FNV-1a over the packed fields. Not security: it catches a link that a chat app wrapped, truncated
  // or turned into a smiley, so the game says "that link looks broken" instead of playing a random
  // morning and claiming it was the challenge.
  function checksum(body) {
    let h = 0x811c9dc5;
    for (let i = 0; i < body.length; i++) {
      h ^= body.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36).slice(-3).padStart(3, '0');
  }

  // Fields as base36, joined with dots, checksum last: short enough to survive any chat client, and
  // readable enough to debug by eye.
  function encode(c) {
    const role = index(Content.ROLE_ORDER, c.role);
    const level = index(Content.LEVEL_ORDER, c.level);
    const rating = index(RATING_ORDER, c.rating);
    if (role < 0 || level < 0 || rating < 0) return null;
    if (!Number.isInteger(c.score) || c.score < 0 || c.score > MAX_SCORE) return null;
    const body = [VERSION, c.seed >>> 0, role, level, c.variant ? 1 : 0, c.score, rating]
      .map((n) => n.toString(36)).join('.');
    return body + '.' + checksum(body);
  }

  function decode(code) {
    if (typeof code !== 'string') return null;
    const parts = code.trim().split('.');
    if (parts.length !== 8) return null;
    const body = parts.slice(0, 7).join('.');
    if (parts[7] !== checksum(body)) return null;
    const nums = parts.slice(0, 7).map((p) => (/^[0-9a-z]{1,7}$/.test(p) ? parseInt(p, 36) : NaN));
    if (nums.some((n) => !Number.isInteger(n))) return null;
    const [version, seed, role, level, variant, score, rating] = nums;
    if (version !== VERSION) return null;
    if (seed > 0xffffffff) return null;
    if (!Content.ROLE_ORDER[role] || !Content.LEVEL_ORDER[level]) return null;
    if (variant > 1 || score > MAX_SCORE || !RATING_ORDER[rating]) return null;
    return {
      seed,
      role: Content.ROLE_ORDER[role],
      level: Content.LEVEL_ORDER[level],
      variant: variant === 1,
      score,
      rating: RATING_ORDER[rating]
    };
  }

  const linkFor = (base, c) => { const code = encode(c); return code ? `${base}#c=${code}` : null; };

  // Accepts a full URL or a bare hash, and tolerates the trailing punctuation a chat app may glue on.
  function codeFromUrl(url) {
    const hash = String(url || '').split('#').slice(1).join('#');
    const match = /(?:^|[#&])c=([0-9a-z.]+)/.exec(hash);
    return match ? match[1].replace(/\.+$/, '') : null;
  }

  // What gets pasted into the team chat. It names the morning's boss — the start screen already shows
  // today's boss before you play, so that is not a spoiler — and never what any message says.
  function shareText(o) {
    return [
      `9 to 9 · a challenge from ${o.who}`,
      `${o.rating.emoji} ${o.score} to beat on this exact morning`,
      `${o.boss.emoji} Boss of the day: ${o.boss.label}`,
      'Same seed, same interruptions, same three hours. Good luck.',
      o.url
    ].filter(Boolean).join('\n');
  }

  return { VERSION, RATING_ORDER, encode, decode, linkFor, codeFromUrl, shareText, checksum };
});
