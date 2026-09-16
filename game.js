// game.js — the browser layer: role and career level choice, the daily morning, input, rendering, sound
// and run history. Every rule lives in core.js; nothing here can change how a run turns out, it only
// shows it. The DOM is updated in place each frame rather than rebuilt, so nothing flickers and nothing
// you are about to click disappears. The illustrated office and portraits are drawn by scene.js.
(function () {
  'use strict';

  const Core = window.NineCore;
  const Daily = window.NineDaily;
  const Persona = window.NinePersona;
  const Awards = window.NineAwards;
  const Challenge = window.NineChallenge;
  const Week = window.NineWeek;
  const Campaign = window.NineCampaign;
  const Rewards = window.NineRewards;
  const Review = window.NineReview;
  const Scene = window.NineScene;
  const { ROLES, ROLE_ORDER, LEVELS, LEVEL_ORDER, DAYS, WEEKDAYS, METERS, BOSSES, EVENTS, titleFor } = window.NineContent;
  const T = Core.TUNING;
  // The top tier of the morning being played: an ordinary day tops out at DEEP WORK, a backlog day
  // has only the one gear.
  const topTier = () => Core.topTier(game ? game.rules : null);
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  // ?dev unlocks every career level and exposes nineDev.advance, which is a cheat as much as a tool.
  // On a hosted copy anyone could add it to the URL and walk through the campaign, so it only works where
  // the game is being developed.
  const LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:';
  const DEV = params.has('dev') && LOCAL;

  const ui = {
    clock: $('clock'), bank: $('bank'), goalBar: $('goalBar'), pauseBtn: $('pauseBtn'),
    pauseScreen: $('pauseScreen'), pauseNote: $('pauseNote'), resumeBtn: $('resumeBtn'), restartBtn: $('restartBtn'), quitBtn: $('quitBtn'), progressMeter: $('progressMeter'), progressLabel: $('progressLabel'), progressFill: $('progressFill'), progressPct: $('progressPct'),
    repMeter: $('repMeter'), repFill: $('repFill'), repVal: $('repVal'), muteBtn: $('muteBtn'),
    stage: document.querySelector('.stage'), scene: $('scene'), dayChip: $('dayChip'), bossChip: $('bossChip'), eventBar: $('eventBar'),
    ide: $('ide'), workFile: $('workFile'), code: $('code'), tierLabel: $('tierLabel'),
    busy: $('busy'), busyText: $('busyText'), busyFill: $('busyFill'),
    flowFill: $('flowFill'), flowMult: $('flowMult'), banner: $('banner'),
    inboxHead: $('inboxHead'), favours: $('favours'), cards: $('cards'), cardCount: $('cardCount'), distracted: $('distracted'), inboxEmpty: $('inboxEmpty'),
    hpBtn: $('hpBtn'), hpLabel: $('hpLabel'), codeBtn: $('codeBtn'), codeBtnLabel: $('codeBtnLabel'),
    startScreen: $('startScreen'), startLede: $('startLede'), rolePicker: $('rolePicker'), roleDesc: $('roleDesc'),
    levelPicker: $('levelPicker'), levelDesc: $('levelDesc'), trapTell: $('trapTell'),
    campaignCard: $('campaignCard'), endCampaign: $('endCampaign'), challengeCard: $('challengeCard'), weekCard: $('weekCard'), dailyCard: $('dailyCard'), practiceBtn: $('practiceBtn'), practiceKbd: $('practiceKbd'), variantToggle: $('variantToggle'),
    startGoal: $('startGoal'), awards: $('awards'), statsNote: $('statsNote'), startHistory: $('startHistory'),
    tourSteps: $('tourSteps'), tourCount: $('tourCount'), tourBack: $('tourBack'), tourNext: $('tourNext'),
    awardsSummary: $('awardsSummary'),
    endScreen: $('endScreen'), endEmoji: $('endEmoji'), endRole: $('endRole'), endTitle: $('endTitle'), endBlurb: $('endBlurb'),
    endScore: $('endScore'), endProgressLabel: $('endProgressLabel'), endProgress: $('endProgress'), endRep: $('endRep'),
    endPromotion: $('endPromotion'), endAward: $('endAward'), endPersona: $('endPersona'), endDaily: $('endDaily'), endChallenge: $('endChallenge'), endStats: $('endStats'), endReview: $('endReview'), endQuote: $('endQuote'),
    againBtn: $('againBtn'), changeRoleBtn: $('changeRoleBtn'),
    endNote: $('endNote'), endHistory: $('endHistory'), live: $('live'),
    nightScreen: $('nightScreen'), nightDay: $('nightDay'), nightTitle: $('nightTitle'), nightBlurb: $('nightBlurb'),
    nightMeters: $('nightMeters'), nightLedger: $('nightLedger'), nightNote: $('nightNote'),
    nextMorningBtn: $('nextMorningBtn'), quitWeekBtn: $('quitWeekBtn')
  };

  const office = Scene.create(ui.scene); // the illustrated office at the top of the work panel

  const STORE = {
    runs: 'nineToNine.runs', muted: 'nineToNine.muted', variant: 'nineToNine.variant', role: 'nineToNine.role',
    daily: 'nineToNine.daily', player: 'nineToNine.player', visit: 'nineToNine.lastVisit', personas: 'nineToNine.personas',
    level: 'nineToNine.level',   // the career level picked on the start screen
    tour: 'nineToNine.tour',     // whether the rules have been read to the end at least once
    recent: 'nineToNine.recent',   // message texts seen in the last few rounds
    awards: 'nineToNine.awards',   // achievements unlocked so far
    progress: 'nineToNine.progress', // rounds played and roles finished, for the long-run achievements
    week: 'nineToNine.week',         // the work week in progress, so it survives a reload
    campaign: 'nineToNine.campaign', // which campaign levels have been cleared
    stars: 'nineToNine.stars',       // best stars per campaign level
    perk: 'nineToNine.perk'          // the perk picked for campaign mornings
  };

  let game = null;
  let role = Core.DEFAULT_ROLE;   // the role picked on the start screen; a running game keeps its own
  let level = Core.DEFAULT_LEVEL; // likewise for the career level
  let mode = 'practice';          // 'daily' | 'practice' | 'challenge' for the game in progress
  let week = null;                // the work week in progress, if there is one
  let levelPlaying = null;        // the campaign level this round is an attempt at, if any
  let pickedLevel = null;         // a cleared level chosen from the ladder to play again
  let invite = null;              // the challenge this page was opened with, decoded from the link
  let invitePlayed = false;       // and whether this visit has answered it yet
  let morning = null;             // the morning number of a daily game, fixed when it starts
  let paused = false;             // the morning is held: nothing arrives, nothing expires, no clock
  let startedAs = null;           // the kind of round in progress, so it can be started again
  let endShown = false;            // showEnd must run once per game: in a week it leaves the result screen
                                  // hidden and shows the evening instead, so "is it visible" cannot be the guard
  let busyKind = null;            // what you're stuck on: 'urgent' | 'trivial' | 'trap' (known once you've answered)
  let holding = false;
  let lastTs = 0;
  let lastBusy = null;
  let lastTargetId = null;
  let muted = false;
  const cardNodes = new Map(); // card id -> { node, timer, text }

  // ---------- helpers ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function store(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ } }
  function read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function announce(msg) { ui.live.textContent = ''; setTimeout(() => { ui.live.textContent = msg; }, 30); }
  const capitalise = (str) => str.charAt(0).toUpperCase() + str.slice(1);
  const currentRole = () => ROLES[game ? game.role : role];
  const currentDay = () => DAYS[game ? game.day : 'normal'] || DAYS.normal;
  // "and drop no more than two traps" — the rest of the job, in the words the screens use for it.
  const ALSO_WORDS = {
    trapsTaken: (n) => `fall for no more than ${n} trap${n === 1 ? '' : 's'}`,
    urgentMissed: (n) => (n === 0 ? 'miss nothing urgent' : `miss no more than ${n} urgent`)
  };
  const alsoText = (also) => Object.keys(also || {}).map((k) => (ALSO_WORDS[k] ? ALSO_WORDS[k](also[k]) : k)).join(', ');
  // What the deliverable is called: usually the role's, but a backlog morning isn't building a feature.
  const progressLabel = () => currentDay().progressLabel || currentRole().progressLabel;
  const eventName = (id) => `${EVENTS[id].emoji} ${EVENTS[id].title.replace(/!$/, '')}`;
  // "🧪 Senior Tester", "🧭 Director". Runs saved before roles or levels existed were junior developers.
  const whoPlayed = (roleId, levelId) => {
    const r = ROLES[roleId] || ROLES[Core.DEFAULT_ROLE];
    return `${r.emoji} ${titleFor(r.id, levelId).title}`;
  };

  // What this role calls the career level it is playing at: a promoted manager is a director, not a lead.
  const rankOf = (levelId, roleId) => titleFor(roleId || (game ? game.role : role), levelId).rank;

  // The 60-second session is shown as a three-hour morning.
  function clockText(t) {
    const minutes = 10 * 60 + Math.floor((Math.min(t, T.DURATION) / T.DURATION) * 180);
    const h24 = Math.floor(minutes / 60);
    const h12 = ((h24 + 11) % 12) + 1;
    return `${h12}:${String(minutes % 60).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`;
  }

  // ---------- anonymous play stats ----------
  // To answer "do people come back tomorrow?", the page tells the server when someone opens the game on
  // a given morning, and how their daily morning went. The player is a random ID made here; nothing
  // else about them is sent (server.js checks and stores only those fields; `npm run stats` reports).
  // Off in dev mode, so testing doesn't count, and with ?nostats. On a static host without server.js
  // the requests simply fail and the game carries on.
  const STATS_ON = !DEV && !params.has('nostats');

  function playerId() {
    let id = read(STORE.player);
    if (!/^[0-9a-f]{16}$/.test(id || '')) {
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes); // unlike randomUUID, this also works on plain http (phone over Wi-Fi)
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      store(STORE.player, id);
    }
    return id;
  }

  function report(event) {
    if (!STATS_ON) return;
    try {
      fetch('api/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ player: playerId() }, event)),
        keepalive: true
      }).catch(() => { /* stats are best-effort */ });
    } catch (e) { /* fetch unavailable */ }
  }

  // ---------- the daily morning ----------
  // ?dev&day=N pretends today is Morning #N, to test streaks and the next-day flow without waiting.
  const dayOverride = DEV ? Number(params.get('day')) : NaN;
  const today = () => (Number.isInteger(dayOverride) && dayOverride >= 1 ? dayOverride : Daily.morningNumber(Date.now()));
  const nextMorningText = () => `Next morning in ${Daily.countdown(Daily.msUntilNextMorning(Date.now()))}`;

  function loadDaily() {
    try {
      const all = JSON.parse(read(STORE.daily) || '{}');
      return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
    } catch (e) { return {}; }
  }
  function saveDaily(n, record) {
    const all = loadDaily();
    all[n] = record;
    const kept = {};
    Object.keys(all).map(Number).sort((a, b) => b - a).slice(0, 120).forEach((k) => { kept[k] = all[k]; });
    store(STORE.daily, JSON.stringify(kept));
  }
  const playedMornings = () => Object.keys(loadDaily()).map(Number).filter(Number.isInteger);

  function shareTextFor(n, rec) {
    return Daily.shareText({
      morning: n,
      who: whoPlayed(rec.role, rec.level),
      rating: rec.rating,
      score: rec.score,
      persona: rec.persona,
      decisions: rec.decisions,
      duration: T.DURATION,
      deepWork: rec.deepWork,
      streak: Daily.streak(playedMornings().filter((m) => m <= n), n),
      url: location.origin + location.pathname
    });
  }

  // The result exactly as it will be sent, plus the ways to send it.
  function shareBlockHtml(n, rec) {
    const text = shareTextFor(n, rec);
    return `<pre class="share-preview">${escapeHtml(text)}</pre>` +
      '<div class="share-actions">' +
        `<button class="primary share" type="button" data-share="copy" data-morning="${n}">📤 Share result</button>` +
        `<a class="secondary" data-share="whatsapp" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` +
      '</div>' +
      '<p class="share-status" role="status"></p>';
  }

  let renderedMorning = null;
  function renderDailyCard() {
    const n = today();
    const rec = loadDaily()[n];
    const streak = Daily.streak(playedMornings(), n);
    const plan = Core.planMorning(Daily.seedFor(n));
    const boss = BOSSES[plan.boss];
    const day = DAYS[plan.day];
    const rules = Core.rulesFor(plan.day, null, level); // what today asks of you at your level
    renderedMorning = n;
    if (rec) {
      // Sharing lives on the result screen only; the menu just confirms today's morning is done.
      ui.dailyCard.innerHTML =
        `<div class="daily-head"><b>☀️ Morning #${n} done</b><span class="daily-next">${nextMorningText()}</span></div>` +
        `<p class="daily-sub">${escapeHtml(`${rec.rating.emoji} ${rec.rating.title} · ${rec.score}`)}${streak >= 2 ? ` · 🔥 ${streak}-day streak` : ''}. Come back tomorrow for Morning #${n + 1}.</p>`;
    } else {
      ui.dailyCard.innerHTML =
        `<div class="daily-head"><b>☀️ Morning #${n}</b>${streak ? `<span class="streak">🔥 ${streak}-day streak</span>` : ''}</div>` +
        `<p class="daily-sub"><b>${day.emoji} ${escapeHtml(day.label)}</b> — ${escapeHtml(day.summary)}<br>` +
        `Today's boss: <b>${boss.emoji} ${escapeHtml(boss.label)}</b> — ${escapeHtml(boss.summary)}<br>` +
        '<span class="daily-fine">Same morning for everyone today · your first finished run is the one you share</span></p>' +
        `<p class="day-note">🎯 ${escapeHtml(day.goal)} As a ${LEVELS[level].emoji} ${escapeHtml(rankOf(level))} you need <b>${rules.target}%</b>${alsoText(rules.also) ? ` and to ${escapeHtml(alsoText(rules.also))}` : ''}, plus a reputation of <b>${rules.goldRep}</b> for a 🥇.</p>` +
        `<button class="primary" type="button" id="dailyBtn">Play Morning #${n}${pendingInvite() ? '' : ' <kbd>Enter</kbd>'}</button>`;
    }
    ui.practiceKbd.hidden = !rec || pendingInvite(); // once today's morning is done, Enter goes to practice
  }

  // Phones get the native share sheet (WhatsApp, Slack, Teams…); desktops get the clipboard.
  async function shareOut(text) {
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ text }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    }
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return 'copied'; } catch (e) { /* fall through */ }
    }
    // Plain http, e.g. playtesting on a phone at http://192.168.x.x, has neither API, but the old copy
    // command still works there.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    area.remove();
    return ok ? 'copied' : 'failed';
  }

  async function shareResult(button) {
    const n = Number(button.dataset.morning);
    const rec = loadDaily()[n];
    if (!rec) return;
    const box = button.closest('.daily');
    const status = box.querySelector('.share-status');
    const outcome = await shareOut(shareTextFor(n, rec));
    status.textContent = {
      shared: 'Shared ✓',
      copied: 'Copied ✓ Paste it in your team chat.',
      cancelled: '',
      failed: "Couldn't copy automatically. The text above is selected: copy it from there."
    }[outcome];
    if (outcome === 'failed') selectText(box.querySelector('.share-preview'));
  }

  // Nothing could be copied for them, so at least leave the text selected to copy by hand.
  function selectText(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // ---------- what this morning is asking for ----------
  // Kept on screen while you play, because two of the three things that decide the result — how many
  // traps you have taken, how many emergencies you have let go — are otherwise invisible until noon.
  // Nothing here can leak: both counters only move once a message has already been decided, and the
  // game has always said so out loud at that moment anyway.
  //
  // A cheap stand-in for Core.summary(), built once a frame without copying the stats arrays, so the
  // campaign's goals can be read live against the same tests that judge them at the end.
  function liveResult() {
    const rules = game.rules;
    const delivered = game.progress >= rules.target;
    const slipped = Object.keys(rules.also || {}).filter((key) => game.stats[key] > rules.also[key]);
    const key = game.rep <= 0 ? 'pip' : !delivered ? 'missed' : slipped.length ? 'dropped'
      : game.rep >= rules.goldRep ? 'gold' : game.rep >= 40 ? 'silver' : 'bronze';
    return {
      shipped: delivered && !slipped.length, delivered, slipped, rating: { key },
      endReason: game.over ? game.endReason : null,
      progress: game.progress, rep: game.rep, target: rules.target, also: rules.also,
      role: game.role, level: game.level, day: game.day, stats: game.stats
    };
  }

  const chip = (state, text) => `<span class="goal-chip ${state}"><span>${escapeHtml(text)}</span></span>`;

  function renderGoalBar() {
    const s = game;
    const live = liveResult();
    const parts = [];
    // The work itself.
    const short = Math.max(0, Math.ceil(s.rules.target - s.progress));
    parts.push(chip(live.delivered ? 'met' : '', live.delivered ? `${progressLabel()} done` : `${short}% to go of ${s.rules.target}%`));
    // And the rest of the job, counted up as it happens.
    for (const key of Object.keys(s.rules.also || {})) {
      const cap = s.rules.also[key];
      const used = s.stats[key];
      const state = used > cap ? 'failed' : used === cap ? 'close' : 'met';
      const word = key === 'trapsTaken' ? 'traps' : 'missed';
      parts.push(chip(state, `${key === 'trapsTaken' ? '🪤' : '🚨'} ${used}/${cap} ${word}`));
    }
    // In the campaign, the level's own goals, ticked off live.
    if (mode === 'campaign' && levelPlaying) {
      for (const row of Campaign.check(levelPlaying, live)) {
        // The delivery chip above already shows this one, and as a live number rather than a tick.
        if (row.id === 'ship') continue;
        parts.push(chip(row.done ? 'met' : '', `${row.done ? '✓' : '○'} ${row.label}`));
      }
    }
    // The perk taken into this morning, and how much of it is left.
    if (s.perk) {
      const p = Rewards.byId[s.perk];
      const left = s.perk === 'headphones' ? s.headphones.charges : s.perkLeft;
      parts.push(chip('', `${p.emoji} ${left ? left + ' left' : 'used'}`));
    }
    const html = '<span class="goal-lead">Goal</span>' + parts.join('');
    if (ui.goalBar.dataset.html !== html) {
      ui.goalBar.dataset.html = html;
      ui.goalBar.innerHTML = html;
    }
    ui.goalBar.hidden = false;
  }

  // ---------- the campaign ----------
  // The ladder: one morning per level, each asking for something the level before it taught. All the
  // rules of it live in campaign.js; this stores what has been cleared and draws it.
  // What has been cleared, and as which roles: { levelId: [roleId, ...] }. Every earlier shape is still
  // read: the very first version stored a plain array of ids with no role at all, and the one after it a
  // single role per level. A career is earned per role now, so the list matters: a level cleared again as
  // a tester adds the tester without taking the developer's promotion away.
  function loadClearedBy() {
    try {
      const saved = JSON.parse(read(STORE.campaign) || '{}');
      const known = (id) => Campaign.LEVELS.some((l) => l.id === id);
      const roles = (value) => (Array.isArray(value) ? value : [value]).filter((r) => ROLES[r]);
      const out = {};
      if (Array.isArray(saved)) {
        saved.filter(known).forEach((id) => { out[id] = []; });
        return out;
      }
      if (!saved || typeof saved !== 'object') return {};
      for (const id of Object.keys(saved)) if (known(id)) out[id] = roles(saved[id]);
      return out;
    } catch (e) { return {}; }
  }

  // The roles a level has been cleared as, in picker order, for the ladder's "cleared as" line.
  const rolesOf = (ids) => ROLE_ORDER.map((r) => ROLES[r]).filter((r) => (ids || []).indexOf(r.id) !== -1);

  // The career this role has climbed, which is what the start screen unlocks against.
  const careerOf = (roleId) => Campaign.careerForRole(loadClearedBy(), roleId);
  // The ladder is walked per role. Clearing it as a developer says nothing about whether you can read a
  // tester's morning — the traps are written in each role's own words — so a tester who has never played
  // starts at level 1 with the developer's stars and perks still in hand. A level saved before roles were
  // recorded at all counts for everyone: there is no way to know who played it, and nobody should be sent
  // back down a ladder they have already climbed.
  const clearedFor = (roleId) => Campaign.clearedFor(loadClearedBy(), roleId);
  const myCleared = () => clearedFor(role);
  // Cleared by anyone: what stars and perks are kept against, since those are the player's, not the role's.
  const loadCleared = () => Object.keys(loadClearedBy());
  const saveClearedBy = (map) => store(STORE.campaign, JSON.stringify(map));

  // Best stars per level, never lowered by a worse replay. A level cleared before stars existed is worth one.
  function loadStars() {
    let saved = null;
    try { saved = JSON.parse(read(STORE.stars) || 'null'); } catch (e) { saved = null; }
    return Rewards.cleanStars(saved, Campaign.LEVELS.map((l) => l.id), loadCleared());
  }
  const saveStars = (map) => store(STORE.stars, JSON.stringify(map));
  const starText = (n) => '★'.repeat(n) + '☆'.repeat(Rewards.MAX_STARS - n);
  // The perk picked for campaign mornings. Kept as picked; Rewards.perkFor decides whether it still applies.
  const loadPerk = () => read(STORE.perk) || null;

  // A week level is judged on the finished week, not on a morning. An unfinished (or absent) week reads
  // as nothing achieved, which is what the start screen wants to show before you have played one.
  function weekResult(w) {
    if (!w || !w.over) return null;
    const v = Week.verdict(w);
    // The role is carried out with the rest of it: the week is level 17, and a cleared level belongs to
    // whoever cleared it. Without this the week counted for every role at once.
    const last = w.mornings[w.mornings.length - 1];
    return { shipped: v.shipped, energy: w.energy, home: w.home, golds: v.golds, played: v.played, role: last && last.role };
  }

  function goalList(card) {
    return '<ul class="goals">' + card.map((row) =>
      `<li class="${row.done ? 'done' : 'miss'}"><b>${row.done ? '✓' : '○'}</b><span>${escapeHtml(row.label)}</span></li>`).join('') + '</ul>';
  }

  // The ladder doubles as the level picker: anything you have cleared stays open to play again, and it
  // stays green whatever happens in the replay — clearing a level is a fact about you, not a score you
  // can lose. Levels you have not reached yet are shown but not selectable.
  function ladderHtml(done, shown) {
    const next = Campaign.nextFor(done);
    const clearedBy = loadClearedBy();
    const stars = loadStars();
    return '<div class="ladder">' + Campaign.LEVELS.map((l) => {
      const isDone = done.indexOf(l.id) !== -1;
      const open = Campaign.isOpen(l, done);
      const state = [isDone ? 'done' : '', (next || {}).id === l.id ? 'now' : '', (shown || {}).id === l.id ? 'picked' : '']
        .filter(Boolean).join(' ');
      const as = rolesOf(clearedBy[l.id]);
      const label = isDone ? `Level ${l.n}: ${l.title} — cleared${as.length ? ` as a ${as.map((r) => r.label.toLowerCase()).join(', a ')}` : ''}, play again`
        : open ? `Level ${l.n}: ${l.title}`
        : `Level ${l.n} — clear level ${l.n - 1} first`;
      const got = stars[l.id] || 0;
      const starLabel = isDone ? ` · ${got} of ${Rewards.MAX_STARS} stars` : '';
      return `<button type="button" class="rung ${state}" data-rung="${l.n}"${open ? '' : ' disabled'} title="${escapeHtml(label + starLabel)}">` +
        `<span class="rung-n">${l.n}</span>${isDone ? `<span class="rung-stars" aria-hidden="true">${starText(got)}</span>` : ''}</button>`;
    }).join('') + '</div>';
  }

  // Stars already taken on a level, and what the next one asks, so a replay has something to aim at.
  function bestStarsHtml(level) {
    const got = loadStars()[level.id] || 0;
    if (!got) return '';
    const rows = Rewards.starsFor(level, null, false).rows; // for the labels only
    const nextStar = got < Rewards.MAX_STARS ? rows[got].label : null;
    return `<div class="stars-line"><span class="stars" aria-label="${got} of ${Rewards.MAX_STARS} stars">${starText(got)}</span>` +
      `<span class="campaign-teaches">${nextStar ? 'Next star: ' + escapeHtml(nextStar) : 'All three stars'}</span></div>`;
  }

  // How an attempt did, star by star, on the result screen.
  function resultStarsHtml(starCard, bestBefore) {
    const note = starCard.stars > bestBefore && bestBefore ? 'a new best'
      : bestBefore > starCard.stars ? `your best is still ${bestBefore}` : '';
    return `<div class="stars-line"><span class="stars" aria-label="${starCard.stars} of ${Rewards.MAX_STARS} stars">${starText(starCard.stars)}</span>` +
      `<span class="campaign-teaches">${note}</span></div>` +
      '<ul class="goals stars-goals">' + starCard.rows.map((row) =>
        `<li class="${row.done ? 'done' : 'miss'}"><b>${row.done ? '★' : '☆'}</b><span>${escapeHtml(row.label)}</span></li>`).join('') + '</ul>';
  }

  let perksOpen = false; // the perk fold survives the redraw a perk click causes
  // One perk into a campaign morning. Locked perks are shown with the level that unlocks them, so what a
  // level gives you is visible before you have earned it.
  function perkPickerHtml(level) {
    if (!Rewards.perkAllowed(level)) return '';
    const done = loadCleared();
    const have = Rewards.perksFrom(done);
    const levelFor = (perk) => Campaign.LEVELS.find((l) => l.id === perk.unlockedBy);
    if (!have.length) {
      const first = Rewards.PERKS[0];
      return `<p class="campaign-teaches">🎁 Clear level ${levelFor(first).n} to unlock your first perk: ${first.emoji} ${escapeHtml(first.title)}.</p>`;
    }
    const picked = Rewards.perkFor(level, loadPerk(), done);
    const buttons = [`<button type="button" class="perk${picked ? '' : ' on'}" data-perk="none" aria-pressed="${!picked}">No perk</button>`]
      .concat(Rewards.PERKS.map((p) => {
        const owned = have.indexOf(p.id) !== -1;
        const by = levelFor(p);
        return `<button type="button" class="perk${picked === p.id ? ' on' : ''}" data-perk="${p.id}" aria-pressed="${picked === p.id}"` +
          `${owned ? '' : ' disabled'} title="${escapeHtml(owned ? p.blurb : `Clear level ${by.n} to unlock`)}">` +
          `${p.emoji} ${escapeHtml(p.title)}${owned ? '' : ` · L${by.n}`}</button>`;
      }));
    const chosen = picked ? Rewards.byId[picked] : null;
    return `<details class="fold perks"${perksOpen ? ' open' : ''}><summary>🎁 Perk: ${chosen ? `${chosen.emoji} ${escapeHtml(chosen.title)}` : 'none'}</summary>` +
      `<div class="fold-body"><div class="perk-row">${buttons.join('')}</div>` +
      `<p class="perk-blurb">${chosen ? escapeHtml(chosen.blurb) : 'Play it as it comes. Stars count the same either way.'}</p></div></details>`;
  }

  // The star count beside the ladder adds up the stars ON that ladder, so it matches the rungs in front
  // of you: a role that has cleared nothing shows none, even though the best stars themselves are kept
  // for the player and come back the moment that role clears the level.
  function starsOn(done) {
    const all = loadStars();
    return Rewards.totalStars(done.reduce((mine, id) => { if (all[id]) mine[id] = all[id]; return mine; }, {}));
  }

  // Which level the card is showing: one you picked from the ladder, or the next one to clear.
  const shownLevel = () => pickedLevel || Campaign.nextFor(myCleared());

  function renderCampaignCard() {
    const done = myCleared();
    const next = shownLevel();
    if (!next) {
      ui.campaignCard.innerHTML =
        `<div class="daily-head"><b>🏅 Campaign complete</b><span class="daily-next">${done.length} of ${Campaign.LEVELS.length} · ★ ${starsOn(done)}/${Campaign.LEVELS.length * Rewards.MAX_STARS}</span></div>` +
        ladderHtml(done) +
        '<p class="daily-sub">Every level cleared, and every role, level and kind of morning is open. Pick any level above to play it again; the daily morning and the work week are where it goes from here.</p>';
      return;
    }
    const clearedBy = loadClearedBy();
    const replaying = done.indexOf(next.id) !== -1;
    const clearedAs = rolesOf(clearedBy[next.id]);
    const upNext = Campaign.nextFor(done);
    const head = `<div class="daily-head"><b>${next.emoji} Level ${next.n} · ${escapeHtml(next.title)}${replaying ? ' ✓' : ''}</b>` +
      `<span class="daily-next">${replaying && clearedAs.length ? `cleared as ${clearedAs.map((r) => `${r.emoji} ${escapeHtml(r.label)}`).join(', ')}` : `${done.length} of ${Campaign.LEVELS.length} cleared`} · ★ ${starsOn(done)}</span></div>` +
      ladderHtml(done, next) +
      // Said out loud because the ladder sits directly under the role picker, and it does belong to it:
      // the morning is the same in every role, down to the arrival times, but the words the traps hide
      // behind are not, so each role climbs the ladder itself. Stars and perks are the player's and stay.
      '<p class="campaign-teaches">Your ' + escapeHtml(ROLES[role].label.toLowerCase()) + ' ladder · stars and perks carry across roles</p>' +
      `<p class="daily-sub">${escapeHtml(next.brief)}</p>` +
      goalList(Campaign.check(next, weekResult(loadWeek()))) +
      bestStarsHtml(next);
    // The last level is a whole week, so the card becomes the week: the same strip, meters and button
    // the standalone card uses, rather than a second place that describes a week.
    if (Campaign.isWeek(next)) {
      ui.campaignCard.innerHTML = head + weekBody(loadWeek(), true);
      return;
    }
    const careerLevel = LEVELS[next.setup.level];
    const day = DAYS[next.setup.day];
    ui.campaignCard.innerHTML = head +
      `<p class="campaign-teaches">${day.emoji} ${escapeHtml(day.label)} · ${careerLevel.emoji} ${escapeHtml(rankOf(next.setup.level, role))}${!next.unlocks ? '' : next.unlocks === next.setup.level ? ' · clearing it promotes you' : ` · clears to ${LEVELS[next.unlocks].emoji} ${escapeHtml(titleFor(role, next.unlocks).title)}`}</p>` +
      perkPickerHtml(next) +
      `<button class="primary" type="button" id="campaignBtn">${replaying ? 'Play level ' + next.n + ' again' : 'Play level ' + next.n} <kbd>Enter</kbd></button>` +
      (replaying && upNext ? `<button class="link week-quit" type="button" id="backToNextBtn">Back to level ${upNext.n}, ${escapeHtml(upNext.title)}</button>` : '');
  }

  // What the attempt came to, shown as the whole card so a near miss reads as a near miss.
  function renderCampaignResult(result, level) {
    level = level || levelPlaying;
    const card = Campaign.check(level, result);
    const won = Campaign.cleared(card);
    const starCard = Rewards.starsFor(level, result, won);
    const bestBefore = loadStars()[level.id] || 0;
    const done = clearedFor(result.role);
    const isNew = won && done.indexOf(level.id) === -1; // new for this role: the ladder moves on
    const firstEver = won && loadCleared().indexOf(level.id) === -1; // new for the player: a perk is due
    if (isNew) {
      done.push(level.id);
      pickedLevel = null; // a newly cleared level hands the card to the next one
    }
    // The role that cleared it is recorded every time, not only the first, because clearing a level again
    // as another role is how that role earns the same promotion.
    if (won) {
      const by = loadClearedBy();
      const roles = by[level.id] || [];
      if (result.role && roles.indexOf(result.role) === -1) {
        by[level.id] = roles.concat(result.role);
        saveClearedBy(by);
      }
    }
    if (won) saveStars(Rewards.withBest(loadStars(), level.id, starCard.stars));
    const newPerks = firstEver ? Rewards.unlockedBy(level.id).map((id) => Rewards.byId[id]) : [];
    const next = Campaign.nextFor(done);
    const again = Campaign.isWeek(level) ? 'weekBtn' : 'campaignBtn';
    ui.endCampaign.innerHTML =
      `<div class="daily-head"><b>${won ? '✅' : '↻'} Level ${level.n} · ${escapeHtml(level.title)}</b><span class="daily-next">${won ? 'cleared' : 'not this time'}</span></div>` +
      goalList(card) +
      (won ? resultStarsHtml(starCard, bestBefore) : '') +
      newPerks.map((p) => `<p class="perk-unlocked">🎁 Perk unlocked: <b>${p.emoji} ${escapeHtml(p.title)}</b>. ${escapeHtml(p.blurb)} Pick it before any campaign morning.</p>`).join('') +
      (won
        ? `<p class="daily-sub">${escapeHtml(level.teaches)}${next ? ` Next up: ${next.emoji} ${escapeHtml(next.title)}.` : ' That was the last one.'}</p>` +
          (next ? `<button class="primary" type="button" id="campaignBtn">Play level ${next.n} <kbd>Enter</kbd></button>` : '')
        : `<p class="daily-sub">${Campaign.isWeek(level)
            ? 'A week is never the same twice. The habits that carry one are, though.'
            : 'The morning is the same every time you try it, so you already know what is coming.'}</p>` +
          `<button class="primary" type="button" id="${again}">Try level ${level.n} again <kbd>Enter</kbd></button>`);
    ui.endCampaign.hidden = false;
    if (newPerks.length) announce('Perk unlocked: ' + newPerks.map((p) => p.title).join(', '));
    if (isNew && level.unlocks) {
      const unlocked = LEVELS[level.unlocks];
      const to = titleFor(result.role, level.unlocks).title; // the title this role is promoted to
      ui.endPromotion.hidden = false;
      ui.endPromotion.textContent = `🎉 Promoted! ${unlocked.emoji} ${to} unlocked: ${unlocked.summary}`;
      announce(`Promoted to ${to}`);
    }
  }

  // ---------- the work week ----------
  // Five mornings on one set of meters. Everything about how a week is scored lives in week.js; this
  // only stores it, draws it, and hands each morning the state the player arrives in.
  function loadWeek() {
    try {
      const saved = JSON.parse(read(STORE.week) || 'null');
      if (!saved || typeof saved !== 'object' || !Array.isArray(saved.mornings)) return null;
      if (!Number.isInteger(saved.index) || saved.index < 0 || saved.index > Week.LENGTH) return null;
      return saved;
    } catch (e) { return null; }
  }
  const saveWeek = (w) => { if (w) store(STORE.week, JSON.stringify(w)); else { try { localStorage.removeItem(STORE.week); } catch (e) { /* no storage */ } } };

  const weekDays = (w) => Week.dayPlan(w.seed, Core.DAY_ORDER);
  const meterBar = (id, value) => {
    const m = METERS[id];
    const level = value >= 60 ? 'high' : value >= 30 ? 'mid' : 'low';
    return `<div class="meter-box"><div class="meter-label"><span>${m.emoji} ${m.label}</span><b>${Math.round(value)}</b></div>` +
      `<div class="meter-track"><i style="width:${Math.max(0, Math.min(100, value))}%" data-level="${level}"></i></div></div>`;
  };

  // The strip of five mornings, ticked off as they are played.
  function weekStrip(w) {
    const plan = weekDays(w);
    return '<div class="week-strip">' + WEEKDAYS.map((name, i) => {
      const done = w.mornings[i];
      const state = done ? 'done' : i === w.index ? 'now' : 'todo';
      const face = done ? done.emoji : DAYS[plan[i]].emoji;
      return `<span class="week-day ${state}" title="${escapeHtml(DAYS[plan[i]].label)}"><b>${name.slice(0, 3)}</b><i>${face}</i></span>`;
    }).join('') + '</div>';
  }

  // The body of a week card: where the week is, what it has cost, and what to press. Used both by the
  // campaign card when the week IS the level you are on, and by the standalone card once the ladder is
  // finished — so there is only ever one description of a week in the game, in one place.
  function weekBody(w, headline) {
    if (!w) {
      return (headline ? '' : '<div class="daily-head"><b>🗓️ The work week</b><span class="daily-next">5 mornings, about 5 minutes</span></div>') +
        '<p class="daily-sub">Monday to Friday on one set of meters. ⚡ Energy is spent by the very thing that wins a morning — deep focus is tiring — and only partly comes back overnight. 🏡 Home is spent by leaving the people outside work unanswered.<br>' +
        'A morning you win by emptying yourself is a morning Tuesday pays for. Past a point you can\'t reach deep work at all.</p>' +
        '<button class="primary" type="button" id="weekBtn">Start the week</button>';
    }
    const v = Week.verdict(w);
    if (w.over) {
      return (headline ? '' : `<div class="daily-head"><b>${v.emoji} ${escapeHtml(v.title)}</b><span class="daily-next">${v.shipped} of ${v.played} delivered</span></div>`) +
        weekStrip(w) +
        `<p class="daily-sub">${escapeHtml(v.blurb)}</p>` +
        '<div class="meters">' + meterBar('energy', w.energy) + meterBar('home', w.home) + '</div>' +
        '<button class="primary" type="button" id="weekBtn">Start a new week</button>';
    }
    const plan = weekDays(w);
    const day = DAYS[plan[w.index]];
    return (headline ? '' : `<div class="daily-head"><b>🗓️ ${Week.currentDayName(w)}</b><span class="daily-next">morning ${w.index + 1} of ${Week.LENGTH}</span></div>`) +
      weekStrip(w) +
      `<p class="daily-sub">Up next: <b>${day.emoji} ${escapeHtml(day.label)}</b> — ${escapeHtml(day.summary)}</p>` +
      '<div class="meters">' + meterBar('energy', w.energy) + meterBar('home', w.home) + '</div>' +
      `<button class="primary" type="button" id="weekBtn">Play ${Week.currentDayName(w)}</button>` +
      '<button class="link week-quit" type="button" id="abandonWeekBtn">Start the week over</button>';
  }

  // The standalone card is only for replaying a week once the ladder has been finished, or for picking
  // up one that is already going. Before that the week lives inside the campaign, so the start screen
  // never offers two unrelated runs of mornings at once.
  function renderWeekCard() {
    // Only once the ladder is finished. A week already in progress is NOT a reason to show it: that was
    // the first version of this and it put the two runs of mornings back on screen side by side, which is
    // the whole thing the week became level 13 to avoid. Nothing is lost — a half-played week is still in
    // storage, and it is waiting on the level 13 card (with "start the week over") when you get there.
    const show = !Campaign.nextFor(myCleared()) && !Campaign.isWeek(shownLevel());
    ui.weekCard.hidden = !show;
    if (show) ui.weekCard.innerHTML = weekBody(loadWeek());
  }

  // The evening: what the morning cost, itemised, before the next one starts.
  function showNight(result) {
    const before = week.mornings[week.mornings.length - 1];
    const v = Week.verdict(week);
    const last = week.over;
    ui.nightDay.textContent = `${before.weekday} evening`;
    ui.nightTitle.textContent = last ? `${v.emoji} ${v.title}` : 'Evening';
    ui.nightBlurb.textContent = last ? v.blurb : `${result.rating.emoji} ${result.rating.title}. Here's what it cost you.`;
    ui.nightMeters.innerHTML = meterBar('energy', week.energy) + meterBar('home', week.home) + weekStrip(week);
    const rows = before.items.map((i) =>
      `<div class="ledger-row"><span>${METERS[i.meter].emoji} ${escapeHtml(i.label)}</span><b class="${i.amount < 0 ? 'down' : 'up'}">${i.amount > 0 ? '+' : ''}${Math.round(i.amount)}</b></div>`).join('');
    const night = last ? '' :
      `<div class="ledger-row night"><span>😴 A night's sleep${before.night.energy < Week.TUNING.NIGHT.energy ? ' (not a good one)' : ''}</span><b class="up">+${Math.round(before.night.energy)}</b></div>`;
    ui.nightLedger.innerHTML = rows + night;
    const tired = Week.tiredness(week.energy);
    ui.nightNote.textContent = last
      ? `${v.shipped} of ${v.played} delivered · ${v.golds} gold · ${v.score} points.`
      : (tired.note || 'Rested enough. Tomorrow is a fresh start.');
    // A finished week is the moment the campaign's last level is decided.
    if (last) {
      const level = Campaign.nextFor(myCleared());
      if (Campaign.isWeek(level)) {
        renderCampaignResult(weekResult(week), level);
        renderCampaignCard();
      }
    }
    ui.nextMorningBtn.innerHTML = last ? 'See the week <kbd>Enter</kbd>' : `Play ${Week.currentDayName(week)} <kbd>Enter</kbd>`;
    ui.quitWeekBtn.hidden = last;
    ui.nightScreen.hidden = false;
  }

  // ---------- challenge links ----------
  // A challenge is a morning you send to one person: same seed, same boss, same interruptions, and your
  // score in the link for them to beat. Practice rounds only. Sending today's daily morning this way
  // would hand the recipient the morning early and spoil the one thing the daily has going for it.
  const challengeUrl = () => location.origin + location.pathname;
  // A challenge waiting to be answered owns the Enter key, so no other button may claim it.
  const pendingInvite = () => !!invite && !invitePlayed;

  // Everything the other player needs to rebuild this exact morning, plus the score to beat.
  function challengeFor(result) {
    return { seed: result.seed, role: result.role, level: result.level, variant: !!game.peekVariant, score: result.score, rating: result.rating.key };
  }

  function challengeText(c) {
    return Challenge.shareText({
      who: whoPlayed(c.role, c.level),
      rating: Core.RATINGS[c.rating] || Core.RATINGS.bronze,
      score: c.score,
      boss: BOSSES[Core.planMorning(c.seed).boss],
      url: Challenge.linkFor(challengeUrl(), c)
    });
  }

  // The same shape as the daily share block, so both behave identically: the exact text, then the ways
  // to send it. The challenge rides on the button, since these blocks are rebuilt each time.
  function challengeBlockHtml(c, label) {
    const text = challengeText(c);
    return `<pre class="share-preview">${escapeHtml(text)}</pre>` +
      '<div class="share-actions">' +
        `<button class="primary challenge-send" type="button" data-share="challenge" data-code="${Challenge.encode(c)}">${label}</button>` +
        `<a class="secondary" data-share="whatsapp" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` +
      '</div>' +
      '<p class="share-status" role="status"></p>';
  }

  async function sendChallenge(button) {
    const c = Challenge.decode(button.dataset.code);
    if (!c) return;
    const box = button.closest('.daily');
    const status = box.querySelector('.share-status');
    const outcome = await shareOut(challengeText(c));
    if (outcome === 'shared' || outcome === 'copied') report({ kind: 'invite', day: today() });
    status.textContent = {
      shared: 'Sent \u2713',
      copied: 'Link copied \u2713 Send it to one person and see if they come back.',
      cancelled: '',
      failed: "Couldn't copy automatically. The text above is selected: copy it from there."
    }[outcome];
    if (outcome === 'failed') selectText(box.querySelector('.share-preview'));
  }

  // The card on the start screen when the page was opened with a challenge link.
  function renderChallengeCard() {
    ui.challengeCard.hidden = !pendingInvite();
    if (ui.challengeCard.hidden) return;
    const boss = BOSSES[Core.planMorning(invite.seed).boss];
    const rating = Core.RATINGS[invite.rating] || Core.RATINGS.bronze;
    const who = whoPlayed(invite.role, invite.level);
    const locked = !unlockedLevels().includes(invite.level);
    ui.challengeCard.innerHTML =
      `<div class="daily-head"><b>\u2694\uFE0F You've been challenged</b><span class="daily-next">${escapeHtml(who)}</span></div>` +
      `<p class="daily-sub"><b>${rating.emoji} ${invite.score} to beat</b> on their exact morning \u2014 ${boss.emoji} ${escapeHtml(boss.label)} in charge, the same interruptions at the same moments.<br>` +
      `You play it as a ${escapeHtml(who)}${locked ? ", a level you haven't unlocked yet \u2014 the challenge opens it for this round only" : ''}. Today's own morning is untouched.</p>` +
      '<button class="primary" type="button" id="challengeBtn">Take the challenge <kbd>Enter</kbd></button>';
  }

  // The result of a challenge round, and the rematch: the same morning sent back with your score on it.
  function renderChallengeResult(result) {
    const answered = mode === 'challenge' && !!invite;
    const beat = answered && result.score > invite.score;
    const drew = answered && result.score === invite.score;
    const rematch = challengeFor(result);
    const head = answered
      ? `<div class="daily-head"><b>\u2694\uFE0F ${beat ? 'You beat it' : drew ? 'Dead heat' : 'Not this time'}</b>` +
        `<span class="daily-next">${result.score} vs ${invite.score}${beat ? ` \u00b7 +${result.score - invite.score}` : ''}</span></div>` +
        `<p class="daily-sub">${beat
          ? 'Send the same morning back with your score on it and let them try again.'
          : drew
            ? 'Send it back and settle it.'
            : `${invite.score - result.score} short. Send this morning to someone else, or play it again.`}</p>`
      : '<div class="daily-head"><b>\u2694\uFE0F Challenge a colleague</b></div>' +
        '<p class="daily-sub">Send this exact morning to one person \u2014 same boss, same interruptions, your score to beat. The whole thing travels in the link, so there is nothing for them to sign up for.</p>';
    ui.endChallenge.innerHTML = head + challengeBlockHtml(rematch, answered ? '\u2694\uFE0F Send it back' : '\u2694\uFE0F Challenge a colleague');
    ui.endChallenge.hidden = false;
  }

  // ---------- the phone ----------
  // Everything here is a nicety the browser may not offer, so every call is guarded and the game plays
  // exactly the same without any of it.

  // A short buzz on the things worth feeling: falling for a trap, and letting a real emergency go. Not on
  // every ping — a phone that buzzes twenty times a morning is a phone you put face down.
  const buzz = (pattern) => { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* no haptics */ } };

  // A round is sixty seconds of holding a button and reading, which looks like idling to a phone: without
  // this the screen dims mid-morning. Released the moment the round ends, and re-taken when the player
  // comes back, because the lock is dropped whenever the page is hidden.
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (!('wakeLock' in navigator)) return;
      if (on && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        const held = wakeLock;
        wakeLock = null;
        await held.release();
      }
    } catch (e) { wakeLock = null; /* denied, or not allowed while hidden */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && game && !game.over) keepAwake(true);
  });

  // ---------- sound (synthesised, no files) ----------
  let actx = null;
  function unlockAudio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === 'suspended') actx.resume();
  }
  function tone(freq, dur, type, vol, delay) {
    if (!actx || muted) return;
    const t0 = actx.currentTime + (delay || 0);
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }
  // Every notification makes the same sound. A different ping per type would tell the player what
  // a message is without reading it — the same leak the shared expiry range exists to prevent.
  const sfx = {
    ping() { tone(988, 0.08, 'sine', 0.05); tone(1480, 0.1, 'sine', 0.035, 0.07); },
    click() { tone(620, 0.04, 'triangle', 0.03); },
    buzz() { tone(150, 0.2, 'square', 0.03); tone(110, 0.22, 'square', 0.025, 0.05); },
    ding() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.05, i * 0.09)); },
    deep() { tone(392, 0.25, 'sine', 0.035); tone(587, 0.35, 'sine', 0.03, 0.08); },
    headphones() { tone(300, 0.3, 'sine', 0.03); tone(200, 0.4, 'sine', 0.025, 0.1); },
    alarm() { tone(680, 0.18, 'square', 0.035); tone(510, 0.22, 'square', 0.03, 0.16); }
  };
  function setMuted(value) {
    muted = value;
    ui.muteBtn.textContent = muted ? '🔇' : '🔊';
    store(STORE.muted, muted ? '1' : '0');
  }

  // ---------- the work that types itself out as you go ----------
  // Each role has its own screen (content.js): code for a developer, a test run for a tester, SQL for
  // an analyst, a ticket reply for support, a status doc for a manager. Highlighting is per line and
  // stateless, because the buffer is trimmed from the top and can start anywhere.
  const CHARS_PER_PERCENT = 14;
  const MAX_LINES = 40;
  const CODE_KEYWORDS = /\b(import|from|export|async|function|const|return|await|try|catch|throw|if|new)\b/g;
  const SQL_KEYWORDS = /\b(SELECT|FROM|JOIN|ON|WHERE|AND|GROUP BY|ORDER BY|AS|COUNT|SUM|DISTINCT|NULLIF|DATE_TRUNC|DESC|FALSE)\b/g;
  const QUOTED = /(&#39;[^&]*?&#39;|`[^`]*`)/g;
  let codeChars = 0;
  let codeBuffer = '';

  function withComment(line, marker, keywords) {
    const at = line.indexOf(marker);
    const body = at === -1 ? line : line.slice(0, at);
    let html = escapeHtml(body).replace(QUOTED, '<span class="s">$1</span>').replace(keywords, '<span class="k">$1</span>');
    if (at !== -1) html += `<span class="c">${escapeHtml(line.slice(at))}</span>`;
    return html;
  }
  const wrap = (cls, line) => `<span class="${cls}">${escapeHtml(line)}</span>`;

  const HIGHLIGHT = {
    code: (line) => withComment(line, '//', CODE_KEYWORDS),
    sql: (line) => withComment(line, '--', SQL_KEYWORDS),
    testlog(line) {
      const first = line.trim().charAt(0);
      if (first === '✓') return wrap('ok', line);
      if (first === '✗') return wrap('bad', line);
      if (first === '⚠') return wrap('warn', line);
      if (first === '↳' || first === '#' || first === '▶') return wrap('c', line);
      if (line.startsWith('Summary')) return wrap('h', line);
      return escapeHtml(line);
    },
    ticket(line) {
      if (/^(Ticket #|Subject:)/.test(line)) return wrap('h', line);
      if (line.startsWith('----')) return wrap('c', line);
      if (/^\s+\d\./.test(line)) return wrap('ok', line);
      return escapeHtml(line);
    },
    doc(line) {
      if (line.startsWith('#')) return wrap('h', line);
      if (line.startsWith('- ')) return `<span class="k">-</span>${escapeHtml(line.slice(1))}`;
      return escapeHtml(line);
    }
  };

  function resetCode() {
    codeChars = 0;
    codeBuffer = '';
    ui.code.innerHTML = '<span class="cursor"></span>';
  }
  function renderCode() {
    const target = Math.floor(game.progress * CHARS_PER_PERCENT);
    if (target <= codeChars) return;
    const work = ROLES[game.role].work;
    for (let i = codeChars; i < target; i++) codeBuffer += work.text[i % work.text.length];
    codeChars = target;
    let lines = codeBuffer.split('\n');
    if (lines.length > MAX_LINES) {
      lines = lines.slice(-MAX_LINES);
      codeBuffer = lines.join('\n');
    }
    const highlight = HIGHLIGHT[work.kind] || escapeHtml;
    ui.code.innerHTML = lines.map((line) => highlight(line)).join('\n') + '<span class="cursor"></span>';
    ui.code.scrollTop = ui.code.scrollHeight;
  }

  // ---------- role choice ----------
  function renderRolePicker() {
    ui.rolePicker.innerHTML = ROLE_ORDER.map((id, i) => {
      const r = ROLES[id];
      return `<button type="button" class="role-card" role="radio" data-role="${id}" title="${escapeHtml(r.label)} (${i + 1})">` +
        `<span class="role-emoji" aria-hidden="true">${r.emoji}</span><span class="role-name">${escapeHtml(r.label)}</span></button>`;
    }).join('');
  }

  // Everything the start screen and the HUD say about the work follows the chosen role, so the
  // screen behind the start overlay already previews that job before the morning begins.
  function applyRoleText() {
    const r = ROLES[role];
    for (const card of ui.rolePicker.querySelectorAll('.role-card')) {
      const selected = card.dataset.role === role;
      card.setAttribute('aria-checked', String(selected));
      card.tabIndex = selected ? 0 : -1; // one tab stop for the group; arrow keys move within it
    }
    ui.roleDesc.textContent = `${r.emoji} ${r.label}: ${r.tagline}`;
    ui.startLede.textContent = `It's 10:00 AM. ${r.goal} Everyone else has other plans for your morning.`;
    document.querySelectorAll('[data-role-verb]').forEach((el) => { el.textContent = r.verb; });
    ui.progressLabel.textContent = r.progressLabel;
    ui.endProgressLabel.textContent = r.progressLabel;
    ui.workFile.textContent = r.work.file;
    ui.codeBtnLabel.textContent = `HOLD TO ${r.verb.toUpperCase()}`;
    office.setRole(role);
    applyLevelText(); // the history line depends on both role and level
  }

  // The cards below the pickers quote your rank and what today asks of it, and both of those move when
  // you change role or level — so they are redrawn with the rest of the start screen.
  const renderStartCards = () => { renderCampaignCard(); renderDailyCard(); };

  function setRole(id, focus) {
    if (!ROLES[id]) return;
    role = id;
    // A level picked off the ladder belongs to the role that picked it: this one may not have reached it.
    pickedLevel = null;
    store(STORE.role, id);
    applyRoleText();
    renderStartCards();
    if (focus) ui.rolePicker.querySelector(`[data-role="${id}"]`).focus();
  }

  // ---------- career level ----------
  // Levels unlock in order, and each ROLE climbs its own career: clearing the level that teaches senior
  // traps as a developer makes that developer a senior, while a tester still starts at junior, because the
  // tells are written in each role's own words. Only how well traps hide changes (content.js); the rules
  // stay the same. Dev mode (?dev) unlocks everything.
  function unlockedLevels() {
    if (DEV) return LEVEL_ORDER.slice();
    const highest = Math.max(0, LEVEL_ORDER.indexOf(careerOf(role)));
    return LEVEL_ORDER.slice(0, highest + 1);
  }

  // The names are left empty here and filled in by applyLevelText: what a rung is called depends on the
  // role picked above it, and that changes without the picker being rebuilt.
  function renderLevelPicker() {
    ui.levelPicker.innerHTML = LEVEL_ORDER.map((id) =>
      `<button type="button" class="level-card" role="radio" data-level="${id}">` +
      '<span class="level-name"></span><span class="level-note"></span></button>').join('');
  }

  // `tried` is a locked level the player just clicked: say how to unlock it instead of selecting it.
  function applyLevelText(tried) {
    const open = unlockedLevels();
    for (const card of ui.levelPicker.querySelectorAll('.level-card')) {
      const id = card.dataset.level;
      const selected = id === level;
      card.setAttribute('aria-checked', String(selected));
      card.setAttribute('aria-disabled', String(!open.includes(id)));
      card.tabIndex = selected ? 0 : -1;
      card.querySelector('.level-name').textContent = `${LEVELS[id].emoji} ${rankOf(id, role)}`;
      card.querySelector('.level-note').textContent = open.includes(id) ? '' : '🔒 locked';
    }
    const shown = LEVELS[tried || level];
    const title = titleFor(role, shown.id).title; // room for the whole job here, unlike the chips
    ui.levelDesc.textContent = tried
      ? `🔒 ${title}: ${shown.unlockText.replace('{role}', currentRole().label.toLowerCase())}`
      : `${shown.emoji} ${title}: ${shown.summary}`;
    // The goal names the role's deliverable and the share the level is held to, so it is redrawn here:
    // picking a different rung used to leave the old percentage on screen.
    const r = ROLES[role];
    const demand = Core.rulesFor('normal', null, level);
    ui.startGoal.textContent = `Goal: get the ${r.deliverable.noun} ${r.deliverable.done} with your reputation intact. As a ${rankOf(level, role).toLowerCase()} that means about ${demand.target}% of it${alsoText(demand.also) ? `, and to ${alsoText(demand.also)}` : ''} — the bar rises with your career, and each kind of morning moves it again.`;
    ui.trapTell.innerHTML = LEVELS[level].tell; // trusted markup from content.js
    ui.startHistory.innerHTML = historyHtml(loadRuns(), role, level);
  }

  // ---------- how it plays ----------
  // Seven rules and the goal, one card at a time. On screen together they were most of the start screen,
  // and everything you actually came back for — the role, the ladder, today's morning — began below the
  // fold. Someone who has read them through once lands on the goal, with the rules a click away.
  const tour = { steps: [], at: 0 };

  function renderTour() {
    tour.steps.forEach((el, i) => { el.hidden = i !== tour.at; });
    const last = tour.at === tour.steps.length - 1;
    ui.tourCount.textContent = `${tour.at + 1} of ${tour.steps.length}`;
    ui.tourBack.hidden = tour.at === 0;
    ui.tourNext.textContent = last ? '↺ Read it again' : 'Next';
    if (last) store(STORE.tour, 'done');
  }

  // Next on the last card wraps back to the first, which is what "read it again" means.
  function stepTour(by) {
    const last = tour.steps.length - 1;
    tour.at = tour.at === last && by > 0 ? 0 : Math.min(last, Math.max(0, tour.at + by));
    renderTour();
  }

  function setLevel(id) {
    if (!LEVELS[id]) return;
    if (!unlockedLevels().includes(id)) { applyLevelText(id); return; }
    level = id;
    store(STORE.level, id);
    applyLevelText();
    renderStartCards();
  }

  ui.tourNext.addEventListener('click', () => stepTour(1));
  ui.tourBack.addEventListener('click', () => stepTour(-1));

  ui.levelPicker.addEventListener('click', (e) => {
    const card = e.target.closest('.level-card');
    if (card) setLevel(card.dataset.level);
  });

  // ---------- notification cards ----------
  function addCard(card) {
    const node = document.createElement('div');
    node.className = 'card entering';
    node.dataset.id = card.id;
    node.innerHTML =
      `<div class="card-top"><span class="avatar">${Scene.avatar(card.from, card.avatar)}</span><span class="from">${escapeHtml(card.from)}</span></div>` +
      '<div class="card-text"></div>' +
      '<div class="card-actions">' +
        (card.peeked ? '' : '<button class="btn-peek" data-act="peek" title="Read it, at a cost to focus (P)">👁 Peek</button>') +
        '<button class="btn-respond" data-act="respond">Respond</button>' +
        '<button class="btn-decline" data-act="decline" title="Say no politely: one small reputation cost, whatever it turns out to be (N)">Say no</button>' +
        '<button class="btn-ignore" data-act="ignore">Ignore</button>' +
        '<button class="btn-delegate" data-act="delegate" hidden></button>' +
      '</div>' +
      '<div class="card-timer"><i></i></div>';
    // New messages join the BOTTOM, the way chat apps order them. Newest-on-top pushed older messages
    // — the ones about to expire — down the list, and a phone inbox only fits a few cards: measured at
    // 375×812 with three open, the one closest to expiring was exactly the one scrolled out of sight.
    // Appending also means existing cards never jump down under a finger that is about to tap them.
    ui.cards.appendChild(node);
    cardNodes.set(card.id, { node, timer: node.querySelector('.card-timer i'), text: node.querySelector('.card-text') });
    refreshCardText(card);
    refreshDelegate(node);
    // On a call you can't answer anything yourself, but you can still pass a message on.
    if (!Core.canAct(game, 'respond')) node.querySelectorAll('button:not(.btn-delegate)').forEach((b) => { b.disabled = true; });
    void node.offsetWidth; // commit the starting position so the slide-in actually animates
    node.classList.remove('entering');
  }

  // The pass-it-on button appears on EVERY message whenever a colleague owes you a favour, named after
  // whoever would take it (the longest-owed first). Showing it only on some messages would give away
  // which ones are urgent.
  function refreshDelegate(node) {
    const button = node.querySelector('.btn-delegate');
    const helper = game.favours[0];
    button.hidden = !helper;
    if (helper) {
      button.textContent = `🤝 ${helper}`;
      button.title = `Pass it to ${helper}, who owes you a favour (D)`;
    }
  }

  function refreshCardText(card) {
    const entry = cardNodes.get(card.id);
    if (!entry) return;
    if (card.peeked) {
      entry.text.textContent = card.text;
      entry.text.classList.remove('collapsed');
      const peek = entry.node.querySelector('.btn-peek');
      if (peek) peek.remove();
    } else {
      entry.text.textContent = `${card.text.split(/\s+/).slice(0, 2).join(' ')} …`;
      entry.text.classList.add('collapsed');
    }
  }

  function removeCard(id, how) {
    const entry = cardNodes.get(id);
    if (!entry) return;
    cardNodes.delete(id);
    const node = entry.node;
    node.classList.remove('targeted');
    node.classList.add(how);
    node.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const done = () => node.remove();
    node.addEventListener('animationend', done, { once: true });
    setTimeout(done, 700);
  }

  const anchorFor = (id) => (cardNodes.get(id) ? cardNodes.get(id).node : ui.cards);

  // Keyboard shortcuts act on whichever notification will expire first; it is outlined on screen.
  function targetCard(unpeekedOnly) {
    let best = null;
    for (const c of game.cards) {
      if (unpeekedOnly && c.peeked) continue;
      if (!best || c.expiresAt < best.expiresAt) best = c;
    }
    return best;
  }

  // ---------- feedback ----------
  function popup(text, kind, anchor) {
    const rect = (anchor || ui.ide).getBoundingClientRect();
    const p = document.createElement('div');
    p.className = `pop ${kind}`;
    p.textContent = text;
    p.style.left = `${Math.min(window.innerWidth - 110, Math.max(110, rect.left + rect.width / 2))}px`;
    p.style.top = `${rect.top + rect.height / 2}px`;
    document.body.appendChild(p);
    p.addEventListener('animationend', () => p.remove(), { once: true });
    setTimeout(() => p.remove(), 1500);
  }

  let flashTimer = 0;
  function flash(kind) {
    document.body.classList.remove('flash-bad', 'flash-trap');
    void document.body.offsetWidth;
    document.body.classList.add(`flash-${kind}`);
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => document.body.classList.remove('flash-bad', 'flash-trap'), 380);
  }

  // Something urgent went unanswered: the whole desk shakes.
  let shakeTimer = 0;
  function shake() {
    ui.stage.classList.remove('shake');
    void ui.stage.offsetWidth;
    ui.stage.classList.add('shake');
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => ui.stage.classList.remove('shake'), 400);
  }

  let bannerTimer = 0;
  function showBanner(text) {
    ui.banner.textContent = text;
    ui.banner.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { ui.banner.hidden = true; }, 2600);
  }

  // ---------- office events ----------
  let eventBarTimer = 0;
  function showEventBar(id, seconds) {
    const e = EVENTS[id];
    ui.eventBar.className = 'event-bar';
    ui.eventBar.innerHTML = `<b>${e.emoji} ${escapeHtml(e.title)}</b><span>${escapeHtml(e.hint)}</span><div class="event-track"><i></i></div>`;
    ui.eventBar.hidden = false;
    const track = ui.eventBar.querySelector('.event-track i');
    track.style.transition = 'none';
    track.style.transform = 'scaleX(1)';
    void track.offsetWidth;
    track.style.transition = `transform ${seconds}s linear`;
    track.style.transform = 'scaleX(0)';
    clearTimeout(eventBarTimer);
  }

  function endEventBar(ev) {
    const e = EVENTS[ev.event.id];
    if (ev.outcome) {
      const good = ev.outcome === 'looked-busy';
      ui.eventBar.className = `event-bar outcome-${good ? 'good' : 'bad'}`;
      ui.eventBar.innerHTML = good
        ? `<b>👀 They saw you working</b><span>+${ev.rep} reputation</span>`
        : `<b>👀 Caught not working</b><span>${ev.rep} reputation</span>`;
      popup(good ? `👀 Looked busy +${ev.rep} rep` : `👀 Caught slacking ${ev.rep} rep`, good ? 'good' : 'bad', ui.repMeter);
      if (!good) { flash('bad'); shake(); sfx.buzz(); } else sfx.click();
      clearTimeout(eventBarTimer);
      eventBarTimer = setTimeout(() => { ui.eventBar.hidden = true; }, 1600);
    } else {
      ui.eventBar.hidden = true;
    }
    office.clearEvent();
    announce(`${e.title} over`);
  }

  // The type of a message is revealed only AFTER the player has committed to a decision. That
  // feedback is how the tells get learned; without it the reading skill has nothing to build on.
  function handle(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'spawn':
          addCard(ev.card);
          rememberSeen(ev.card.text);
          office.ping();
          sfx.ping();
          break;
        case 'event-start': {
          const e = EVENTS[ev.event.id];
          office.event(ev.event.id, `Boss · ${BOSSES[game.boss].short}`);
          showEventBar(ev.event.id, ev.event.until - ev.event.at);
          if (ev.event.id === 'drill' || ev.event.id === 'outage') sfx.alarm();
          announce(`${e.title} ${e.hint}`);
          break;
        }
        case 'event-end':
          endEventBar(ev);
          break;
        case 'blocked':
          popup('🎧 blocked a ping', 'info', ui.inboxHead);
          break;
        case 'expire':
          if (ev.rep < 0) {
            popup(`Missed something urgent ${ev.rep} rep`, 'bad', ui.repMeter);
            flash('bad');
            shake();
            sfx.buzz();
          }
          removeCard(ev.card.id, 'expired');
          break;
        case 'ignore': {
          const anchor = anchorFor(ev.card.id);
          if (ev.card.type === 'urgent') { popup(`That was urgent! ${ev.rep} rep`, 'bad', anchor); flash('bad'); shake(); sfx.buzz(); buzz(35); }
          else if (ev.card.type === 'trap') { popup('Dodged 🛡️', 'good', anchor); sfx.click(); }
          else sfx.click();
          removeCard(ev.card.id, 'leaving');
          break;
        }
        case 'respond': {
          const anchor = anchorFor(ev.card.id);
          busyKind = ev.card.type; // the office shows a call, or a dizzy you if it was a trap
          if (ev.saved >= 0.05) {
            ui.bank.classList.remove('spending');
            void ui.bank.offsetWidth;
            ui.bank.classList.add('spending');
            popup(`⏳ −${ev.saved.toFixed(1)}s off this one`, 'flow', ui.clock);
          }
          if (ev.perk === 'coffee') popup('☕ Still focused', 'flow', ui.clock);
          else if (ev.perk === 'cover') popup('🛡️ Covered: your focus survived it', 'good', ui.clock);
          if (ev.card.type === 'urgent') { popup(`Saved the day +${ev.rep} rep`, 'good', anchor); sfx.click(); }
          else if (ev.card.type === 'trap') { popup(LEVELS[game.level].trapPop, 'bad', anchor); flash('trap'); sfx.buzz(); buzz([18, 40, 18]); }
          else if (ev.favour) { popup(`🤝 ${ev.favour} owes you one`, 'good', anchor); sfx.click(); }
          else if (ev.favourFull) { popup(`+${ev.rep} rep · you're owed enough favours`, 'info', anchor); sfx.click(); }
          else { popup(`+${ev.rep} rep, but was it worth it?`, 'info', anchor); sfx.click(); }
          removeCard(ev.card.id, 'answered');
          break;
        }
        case 'delegate': {
          const anchor = anchorFor(ev.card.id);
          office.helper(ev.helper);
          if (ev.card.type === 'urgent') { popup(`🤝 ${ev.helper} handled it +${ev.rep} rep`, 'good', anchor); sfx.click(); }
          else if (ev.card.type === 'trap') { popup(`🤝 ${ev.helper} fell for it. Favour wasted`, 'bad', anchor); sfx.buzz(); }
          else { popup(`🤝 ${ev.helper} replied for you. Favour wasted`, 'info', anchor); sfx.click(); }
          removeCard(ev.card.id, 'answered');
          break;
        }
        case 'decline': {
          // Saying no is never the best play and never a disaster, and the popup says so: the cost is
          // the same every time, and only what it turned out to be changes.
          const anchor = anchorFor(ev.card.id);
          busyKind = 'decline';
          if (ev.card.type === 'urgent') popup(`That one was real ${ev.rep} rep`, 'bad', anchor);
          else if (ev.card.type === 'trap') popup(`Good call ${ev.rep} rep`, 'good', anchor);
          else popup(`Politely declined ${ev.rep} rep`, 'info', anchor);
          sfx.click();
          removeCard(ev.card.id, 'answered');
          break;
        }
        case 'time-won':
          popup(`⏳ +${ev.seconds}s — you're ahead of the queue`, 'good', ui.clock);
          showBanner(`⏳ ${Core.TUNING.TIME_BONUS.run} right calls in a row. ${ev.seconds} seconds in hand.`);
          sfx.ding();
          announce(`${ev.seconds} seconds banked`);
          break;
        case 'peek':
          popup(`−${ev.flowCost} flow`, 'flow', anchorFor(ev.card.id));
          refreshCardText(ev.card);
          break;
        case 'tier':
          if (ev.tier === topTier() && ev.tier.mult > 1) { sfx.deep(); announce('Deep work'); }
          break;
        case 'shipped': {
          const { noun, done } = currentDay().deliverable || currentRole().deliverable;
          showBanner(`🚀 ${capitalise(noun)} ${done}! Everything past 100% is bonus.`);
          office.celebrate();
          sfx.ding();
          announce(`${capitalise(noun)} ${done}`);
          break;
        }
        case 'headphones':
          sfx.headphones();
          announce('Headphones on');
          break;
        case 'rejected':
          if (ev.reason === 'no-favour') { popup('Nobody owes you a favour yet', 'info', ui.inboxHead); break; }
          if (ev.reason === 'event') { popup("Everyone's outside. Nothing you can do.", 'info', ui.inboxHead); break; }
          ui.busy.classList.remove('shake');
          void ui.busy.offsetWidth;
          ui.busy.classList.add('shake');
          break;
        case 'end':
          setHolding(false);
          setTimeout(showEnd, ev.reason === 'pip' ? 700 : 350);
          break;
      }
    }
  }

  // ---------- render ----------
  function render() {
    const s = game;
    if (!s) return;
    const r = ROLES[s.role];

    ui.clock.textContent = clockText(s.t);
    ui.bank.hidden = s.timeBank < 0.05;
    if (!ui.bank.hidden) ui.bank.textContent = `⏳ ${s.timeBank.toFixed(1)}s in hand`;
    if (ui.progressLabel.textContent !== progressLabel()) ui.progressLabel.textContent = progressLabel();
    renderGoalBar();
    // The bar fills toward the day's target, which is not always 100%: a backlog morning asks for more
    // and an appraisal morning for less, and the meter has to mean the same thing on all of them.
    ui.progressFill.style.width = `${Math.min(100, (s.progress / s.rules.target) * 100)}%`;
    ui.progressPct.textContent = `${Math.floor(s.progress)}% / ${s.rules.target}%`;
    ui.progressMeter.classList.toggle('done', s.progress >= s.rules.target);
    ui.repFill.style.width = `${s.rep}%`;
    ui.repFill.dataset.level = s.rep >= 70 ? 'high' : s.rep >= 40 ? 'mid' : 'low';
    ui.repVal.textContent = Math.round(s.rep);

    const tier = Core.tierFor(s.flow, s.rules.tiers);
    ui.flowFill.style.width = `${s.flow}%`;
    ui.flowMult.textContent = `×${tier.mult}`;
    ui.tierLabel.textContent = tier.name;
    ui.ide.dataset.tier = String(T.TIERS.indexOf(tier));

    const drill = Core.inDrill(s);
    const busy = Core.isBusy(s);
    const working = holding && !busy && !drill && !s.over;
    const headphonesOn = s.t < s.headphones.activeUntil;
    ui.busy.hidden = !busy;
    if (busy) {
      ui.busyText.textContent = `📞 ${s.busyText}`;
      ui.busyFill.style.width = `${Math.max(0, (s.busyUntil - s.t) / (s.busyDuration || 1)) * 100}%`;
    }
    // On a call, or outside for a drill, you can't answer anything yourself.
    const locked = busy || drill;
    if (locked !== lastBusy) {
      for (const { node } of cardNodes.values()) node.querySelectorAll('button:not(.btn-delegate)').forEach((b) => { b.disabled = locked; });
      lastBusy = locked;
    }
    document.body.classList.toggle('is-busy', busy);
    document.body.classList.toggle('coding', working);
    const top = topTier();
    // On a morning with no deep end the flow meter still moves but buys nothing, so it is shown as inert
    // rather than left looking like a meter worth filling.
    ui.stage.classList.toggle('flat-flow', top.mult === 1);
    document.body.classList.toggle('deep', working && tier === top && top.mult > 1);
    ui.codeBtn.classList.toggle('held', working);
    ui.codeBtnLabel.textContent = drill ? 'EVERYONE OUT…' : busy ? 'ON A CALL…' : working ? (tier === top && top.mult > 1 ? 'DEEP WORK' : `${r.doing}…`) : `HOLD TO ${r.verb.toUpperCase()}`;

    office.update({
      t: s.t, duration: s.duration, flow: s.flow, working, busy, busyKind,
      deep: tier === top && top.mult > 1, headphones: headphonesOn, cards: s.cards.length
    });

    for (const c of s.cards) {
      const entry = cardNodes.get(c.id);
      if (!entry) continue;
      const remaining = Math.max(0, c.expiresAt - s.t);
      entry.timer.style.width = `${(remaining / (c.expiresAt - c.spawnedAt)) * 100}%`;
      entry.node.classList.toggle('expiring', remaining < 1.5);
    }
    const target = targetCard(false);
    const targetId = target ? target.id : null;
    if (targetId !== lastTargetId) {
      const prev = cardNodes.get(lastTargetId);
      if (prev) prev.node.classList.remove('targeted');
      const next = cardNodes.get(targetId);
      if (next) next.node.classList.add('targeted');
      lastTargetId = targetId;
    }
    ui.cardCount.textContent = s.cards.length;
    ui.distracted.hidden = s.cards.length < T.DISTRACTED_AT;
    ui.inboxEmpty.hidden = s.cards.length > 0;

    // Who owes you a favour. Only re-rendered when that changes, and every card's pass-it-on button with it.
    const favourKey = s.favours.join('|');
    if (ui.favours.dataset.key !== favourKey) {
      ui.favours.dataset.key = favourKey;
      ui.favours.hidden = !s.favours.length;
      ui.favours.textContent = `🤝 ${s.favours.length}`;
      ui.favours.title = s.favours.length ? `Owe you a favour: ${s.favours.join(', ')}` : '';
      for (const { node } of cardNodes.values()) refreshDelegate(node);
    }

    ui.hpBtn.disabled = !headphonesOn && s.headphones.charges <= 0;
    ui.hpBtn.classList.toggle('active', headphonesOn);
    ui.hpLabel.textContent = headphonesOn
      ? `🎧 ${Math.ceil(s.headphones.activeUntil - s.t)}s`
      : `🎧 Headphones ×${s.headphones.charges}`;

    renderCode();
  }

  // ---------- run history (lets you compare runs, roles, levels, and variant A against B) ----------
  function loadRuns() {
    try {
      const runs = JSON.parse(read(STORE.runs) || '[]');
      return Array.isArray(runs) ? runs : [];
    } catch (e) { return []; }
  }
  function saveRun(run) {
    const runs = loadRuns();
    runs.push(run);
    store(STORE.runs, JSON.stringify(runs.slice(-100)));
  }
  function historyHtml(runs, roleId, levelId) {
    if (!runs.length) return '';
    const best = Math.max(...runs.map((r) => r.score));
    // Runs saved before roles or levels existed were all played as a junior developer.
    const roleOf = (r) => r.role || Core.DEFAULT_ROLE;
    const levelOf = (r) => r.level || Core.DEFAULT_LEVEL;
    const chips = runs.slice(-8).reverse()
      .map((r) => {
        const played = ROLES[roleOf(r)];
        const label = `${whoPlayed(roleOf(r), levelOf(r))}: ${r.title}${r.mode === 'daily' ? ` (Morning #${r.morning})` : ''}`;
        const marks = (r.mode === 'daily' ? '<i>☀</i>' : '') + (r.mode === 'challenge' ? '<i>⚔</i>' : '') + (r.variant === 'B' ? '<i>B</i>' : '');
        return `<span class="chip" title="${escapeHtml(label)}">${played ? played.emoji : ''}${r.emoji} ${r.score}${marks}</span>`;
      })
      .join('');
    const mine = runs.filter((r) => roleOf(r) === roleId && levelOf(r) === levelId);
    const roleBest = ROLES[roleId] && LEVELS[levelId] && mine.length
      ? ` · Best as ${escapeHtml(titleFor(roleId, levelId).title)}: <b>${Math.max(...mine.map((r) => r.score))}</b>`
      : '';
    let compare = '';
    const a = runs.filter((r) => r.variant !== 'B');
    const b = runs.filter((r) => r.variant === 'B');
    if (a.length >= 3 && b.length >= 3) {
      const avg = (list) => Math.round(list.reduce((sum, r) => sum + r.score, 0) / list.length);
      compare = `<div>Average score: A <b>${avg(a)}</b> (${a.length} runs) · B <b>${avg(b)}</b> (${b.length} runs)</div>`;
    }
    const found = loadPersonas().length;
    const personas = found ? `<div>Personalities found: <b>${found}</b> of ${Persona.PERSONAS.length}</div>` : '';
    return `<details class="fold"><summary>📈 ${runs.length} run${runs.length === 1 ? '' : 's'} · best <b>${best}</b></summary>` +
      `<div class="fold-body">${roleBest ? `<div>${roleBest.replace(/^ · /, '')}</div>` : ''}${compare}${personas}<div class="chips">${chips}</div></div></details>`;
  }

  // Messages seen in recent rounds, oldest first. Practice rounds and the work week deal these last
  // (core.js), so back-to-back rounds feel different. A whole week's worth is remembered — five
  // mornings in a row is the case that made repeats obvious.
  const RECENT_LIMIT = 110;
  function loadRecent() {
    try {
      const texts = JSON.parse(read(STORE.recent) || '[]');
      return Array.isArray(texts) ? texts.filter((t) => typeof t === 'string') : [];
    } catch (e) { return []; }
  }
  function rememberSeen(text) {
    const texts = loadRecent().filter((t) => t !== text);
    texts.push(text);
    store(STORE.recent, JSON.stringify(texts.slice(-RECENT_LIMIT)));
  }

  // Work personalities this player has earned so far, in the order they were first found.
  function loadPersonas() {
    try {
      const ids = JSON.parse(read(STORE.personas) || '[]');
      return Array.isArray(ids) ? ids.filter((id) => Persona.PERSONAS.some((p) => p.id === id)) : [];
    } catch (e) { return []; }
  }

  // ---------- achievements and the desk ----------
  // Unlocks are cosmetic: they add an object to your office (scene.js) and never touch the rules, so
  // nobody who has played longer gets an easier morning.
  function loadAwards() {
    try {
      const ids = JSON.parse(read(STORE.awards) || '[]');
      return Array.isArray(ids) ? ids.filter((id) => Awards.byId[id]) : [];
    } catch (e) { return []; }
  }

  function loadProgress() {
    try {
      const p = JSON.parse(read(STORE.progress) || '{}') || {};
      return { rounds: Number(p.rounds) || 0, roles: Array.isArray(p.roles) ? p.roles.filter((r) => ROLES[r]) : [] };
    } catch (e) { return { rounds: 0, roles: [] }; }
  }

  function renderAwards() {
    const have = loadAwards();
    const items = Awards.AWARDS.map((a) => {
      const got = have.indexOf(a.id) !== -1;
      return `<div class="award-item${got ? ' got' : ''}"><span class="award-emoji" aria-hidden="true">${got ? a.emoji : '🔒'}</span>` +
        `<b>${escapeHtml(a.name)}</b><span class="award-hint">${escapeHtml(got ? a.unlocks : a.hint)}</span></div>`;
    }).join('');
    // The summary is what you see folded: the count, and the things themselves.
    const got = Awards.AWARDS.filter((a) => have.indexOf(a.id) !== -1).map((a) => a.emoji).join(' ');
    ui.awardsSummary.innerHTML = `<span class="award-count">${have.length} of ${Awards.AWARDS.length} unlocked</span>` +
      (got ? ` <span class="fold-emoji" aria-hidden="true">${got}</span>` : ' <span>· each one adds something to your office</span>');
    ui.awards.innerHTML = items;
  }

  function quoteFor(stats) {
    if (stats.aftermaths.length) return stats.aftermaths[Math.floor(Math.random() * stats.aftermaths.length)];
    if (stats.trapsDodged > 0) return "You dodged every '2-minute call'. Legend.";
    if (stats.urgentMissed > 0) return 'Somewhere, something urgent is still on fire.';
    return 'A suspiciously quiet morning.';
  }

  function showEnd() {
    if (!game || !game.over || endShown) return;
    endShown = true;
    paused = false;
    ui.pauseScreen.hidden = true;
    keepAwake(false);
    const result = Core.summary(game);
    const r = ROLES[result.role];
    const boss = BOSSES[result.boss];
    const st = result.stats;
    ui.eventBar.hidden = true;
    ui.endEmoji.textContent = result.rating.emoji;
    ui.endRole.textContent = `${whoPlayed(result.role, result.level)} · ${mode === 'daily' ? `Morning #${morning}` : mode === 'challenge' ? 'Challenge' : mode === 'week' && week ? `${WEEKDAYS[Math.max(0, week.index - 1)]} of your week` : mode === 'campaign' && levelPlaying ? `Level ${levelPlaying.n}` : 'Practice'}`;
    ui.endTitle.textContent = result.rating.title;
    ui.endBlurb.textContent = result.rating.blurb;
    ui.endScore.textContent = result.score;
    ui.endProgressLabel.textContent = DAYS[result.day].progressLabel || r.progressLabel;
    ui.endProgress.textContent = `${Math.floor(result.progress)}% / ${result.target}%`;
    const asked = `A ${rankOf(result.level, result.role).toLowerCase()} is asked for ${result.target}% of this morning`;
    ui.endProgress.title = result.level === 'lead' ? `${asked}, which is the whole of it.`
      : `${asked}; a ${rankOf('lead', result.role).toLowerCase()} would be asked for ${Math.round(result.target / Core.TUNING.LEVEL_DEMAND[result.level].share)}%.`;
    ui.endRep.textContent = Math.round(result.rep);
    const rows = [
      ['🗓️ Kind of morning', `${DAYS[result.day].emoji} ${DAYS[result.day].label}`],
      ['🎯 Asked of you', `${result.target}%${alsoText(result.also) ? `, ${alsoText(result.also)}` : ''}`],
      ['🧑‍💼 Boss of the day', `${boss.emoji} ${boss.label}`],
      ['🏢 Office events', result.events.map(eventName).join(', ') || 'none'],
      ['⚡ Time in Deep Work', `${st.deepWorkTime.toFixed(1)}s`],
      ['📞 Time stuck on calls', `${st.busyTime.toFixed(1)}s`],
      ['🚨 Urgent handled / missed', `${st.urgentHandled} / ${st.urgentMissed}`],
      ['🪤 Traps taken / dodged', `${st.trapsTaken} / ${st.trapsDodged}`],
      ['⏳ Best run / time banked', `${st.bestRun} in a row / ${st.timeWon}s`],
      ['🙅 Said no politely', `${st.declined}`],
      ['↩️ Follow-ups / escalations', `${st.followUps} / ${st.escalations}`],
      ['💬 Small talk answered / ignored', `${st.trivialAnswered} / ${st.trivialIgnored}`],
      ['🤝 Favours banked / used on urgent', `${st.favoursBanked} / ${st.urgentDelegated}`],
      ['🌊 Peak flow', `${Math.round(st.peakFlow)}`]
    ];
    if (game.peekVariant) rows.push(['👁 Peeks', `${st.peeks}`]);
    ui.endStats.innerHTML = rows.map(([k, v]) => `<div class="stat"><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`).join('');
    // What you misread: the wrong calls with the tell in each, so a morning teaches something even when
    // it goes badly. Nothing is shown when there was nothing to learn from.
    const misread = Review.review(result);
    ui.endReview.hidden = !misread.length;
    ui.endReview.innerHTML = misread.length
      ? `<h3 class="review-head">🔎 What you misread<span>${escapeHtml(Review.heading(misread, st.misreads.length))}</span></h3>` +
        misread.map((m) => `<div class="misread ${m.kind === 'trap' ? 'trap' : 'urgent'}">` +
          `<b>${m.emoji} ${escapeHtml(m.title)}</b>` +
          `<blockquote><span>${escapeHtml(m.from)}</span>${escapeHtml(m.text)}</blockquote>` +
          `<p class="misread-tell">${escapeHtml(m.tell)}</p>` +
          `<p class="misread-better">${escapeHtml(m.better)}</p>` +
        '</div>').join('')
      : '';
    ui.endQuote.textContent = quoteFor(st);

    // Promotions come from the campaign now (renderCampaignResult), not from scoring a gold.
    ui.endPromotion.hidden = true;

    // The work personality, and whether it's new to this player's collection.
    const persona = Persona.personaFor(result, r);
    const found = loadPersonas();
    const isNew = !found.includes(persona.id);
    if (isNew) store(STORE.personas, JSON.stringify(found.concat(persona.id)));
    ui.endPersona.innerHTML =
      `<span class="persona-emoji" aria-hidden="true">${persona.emoji}</span>` +
      '<div>' +
        `<span class="persona-label">Your work personality${isNew ? '<span class="persona-new">New!</span>' : ''}` +
        `<span>${found.length + (isNew ? 1 : 0)} of ${Persona.PERSONAS.length} found</span></span>` +
        `<b>${escapeHtml(persona.name)}</b><p>${escapeHtml(persona.blurb)}</p><small>${escapeHtml(persona.because)}</small>` +
      '</div>';

    if (mode === 'daily') {
      // Only the first finished run of a morning is kept, reported and shared.
      if (!loadDaily()[morning]) {
        const record = {
          role: result.role,
          level: result.level,
          score: result.score,
          rating: { key: result.rating.key, emoji: result.rating.emoji, title: result.rating.title },
          persona: { id: persona.id, emoji: persona.emoji, name: persona.name },
          decisions: st.decisions,
          deepWork: Math.round(st.deepWorkTime * 10) / 10,
          progress: Math.floor(result.progress),
          rep: Math.round(result.rep),
          at: Date.now()
        };
        saveDaily(morning, record);
        report({ kind: 'daily', day: morning, role: record.role, level: record.level, rating: record.rating.key, score: record.score, deepWork: record.deepWork });
      }
      ui.endDaily.innerHTML =
        `<div class="daily-head"><b>☀️ Your Morning #${morning}</b><span class="daily-next">${nextMorningText()}</span></div>` +
        shareBlockHtml(morning, loadDaily()[morning]);
      ui.endDaily.hidden = false;
      ui.againBtn.innerHTML = 'Practice round <kbd>Enter</kbd>';
      ui.endNote.textContent = 'Come back tomorrow: a new morning, a new boss, the same one for everyone.';
    } else {
      const n = today();
      ui.endDaily.hidden = !!loadDaily()[n];
      ui.endDaily.innerHTML = ui.endDaily.hidden ? '' :
        `<div class="daily-cta">☀️ Today's Morning #${n} is still waiting. <button class="link" type="button" id="endDailyBtn">Play it</button></div>`;
      ui.againBtn.innerHTML = 'Play again <kbd>Enter</kbd>';
      ui.endNote.textContent = mode === 'challenge'
        ? 'A challenge is one morning between two people. The daily morning is the one everybody plays.'
        : 'The real test: do you want another round? Note your answer after 10 runs, and again after 30.';
    }

    ui.endCampaign.hidden = true;
    if (mode === 'campaign' && levelPlaying && !Campaign.isWeek(levelPlaying)) renderCampaignResult(result);

    // In a week the morning is not the end of anything: the evening screen takes over, shows what it
    // cost, and leads into tomorrow. The result screen still renders underneath for when the week ends.
    if (mode === 'week' && week && !week.over) {
      week = Week.afterMorning(week, result);
      saveWeek(week);
      renderWeekCard();
    }

    // Challenges: how this went against the link you arrived on, and the morning to send onward. Never
    // offered on the daily morning \u2014 that link would spoil today for whoever received it.
    if (mode === 'challenge' && invite) {
      report({ kind: 'challenge', day: today(), role: result.role, level: result.level, rating: result.rating.key, score: result.score, deepWork: Math.round(st.deepWorkTime * 10) / 10, beat: result.score > invite.score });
      invitePlayed = true;
    }
    ui.endChallenge.hidden = true;
    if (mode !== 'daily' && mode !== 'week' && mode !== 'campaign') renderChallengeResult(result);

    // Achievements, from this round plus what you have done across rounds. Cosmetic unlocks only.
    const progress = loadProgress();
    progress.rounds++;
    if (result.shipped && result.endReason !== 'pip' && progress.roles.indexOf(result.role) === -1) progress.roles.push(result.role);
    store(STORE.progress, JSON.stringify(progress));
    const unlocked = loadAwards();
    const won = Awards.earnedBy({
      finished: result.shipped && result.endReason !== 'pip',
      rating: result.rating.key,
      mode,
      role: result.role,
      events: result.events,
      stats: st,
      rounds: progress.rounds,
      rolesFinished: progress.roles,
      streak: Daily.streak(playedMornings(), today())
    }, unlocked);
    if (won.length) store(STORE.awards, JSON.stringify(unlocked.concat(won)));
    ui.endAward.hidden = !won.length;
    if (won.length) {
      ui.endAward.innerHTML = '🎁 Unlocked: ' + won.map((id) => `<b>${Awards.byId[id].emoji} ${escapeHtml(Awards.byId[id].unlocks)}</b>`).join(' · ') + ' — on your desk from now on.';
      office.setProps(Awards.propsFor(loadAwards()));
      announce('Unlocked ' + won.map((id) => Awards.byId[id].unlocks).join(', '));
    }
    renderAwards();

    saveRun({
      score: result.score, title: result.rating.title, emoji: result.rating.emoji, role: result.role, level: result.level,
      mode, morning: mode === 'daily' ? morning : undefined, variant: game.peekVariant ? 'B' : 'A', at: Date.now()
    });
    ui.endHistory.innerHTML = historyHtml(loadRuns(), result.role, result.level);
    if (mode === 'week' && week) { showNight(result); return; } // the evening, not the end
    ui.endScreen.hidden = false;
    if (!ui.endPromotion.hidden) Scene.burst(ui.endPromotion, 40); // after the overlay is visible, so the burst is seen
  }

  // ---------- pausing ----------
  // A phone rings, a real one. You can stop the morning, and the clock, the arrivals and the expiry
  // timers all stop with it because the loop simply stops advancing — no special case in the rules.
  function setPaused(on) {
    if (!game || game.over || paused === on) return;
    paused = on;
    setHolding(false);
    keepAwake(!on);
    ui.pauseBtn.textContent = on ? '▶' : '⏸';
    ui.pauseBtn.title = on ? 'Back to it (Esc)' : 'Pause (Esc)';
    // Today's morning is the same one for everybody and you get one go at it, so it cannot be re-rolled
    // halfway through; every other kind of round can.
    ui.restartBtn.hidden = mode === 'daily';
    ui.pauseNote.textContent = mode === 'daily'
      ? "The morning waits. Leaving now means today's morning is still unplayed."
      : 'The morning waits. Nothing is arriving while this is up.';
    ui.pauseScreen.hidden = !on;
    if (!on) lastTs = 0; // do not hand the loop the time spent paused
    announce(on ? 'Paused' : 'Back to it');
  }

  function leaveRound() {
    setPaused(false);
    game = null;
    keepAwake(false);
    ui.goalBar.hidden = true;
    showStart();
  }

  // ---------- lifecycle ----------
  // kind: 'daily' | 'practice' | 'challenge' | 'week' | 'campaign'
  function startGame(kind) {
    const daily = kind === 'daily';
    levelPlaying = kind === 'campaign' ? shownLevel() : null;
    if (kind === 'campaign' && !levelPlaying) { showStart(); return; } // the ladder is finished
    if (kind === 'campaign' && Campaign.isWeek(levelPlaying)) { levelPlaying = null; kind = 'week'; } // the last level IS the week
    if (daily && loadDaily()[today()]) { showStart(); return; } // today's morning is already done
    if (kind === 'challenge' && !invite) kind = 'practice';
    if (kind === 'week') {
      week = loadWeek();
      if (!week || week.over) { week = Week.newWeek((Math.random() * 0xffffffff) >>> 0); saveWeek(week); }
    } else {
      week = null; // any other round leaves the week where it is, to be picked up later
    }
    unlockAudio();
    if (kind === 'practice') store(STORE.variant, ui.variantToggle.checked ? 'B' : 'A');
    mode = kind;
    morning = daily ? today() : null;
    // The daily morning always uses the standard rules and no message history, so it is the same for
    // everyone. A challenge does the same from the sender's seed, at the role and level they played,
    // for this one round \u2014 the start screen keeps whatever you had picked. Practice rounds deal
    // recently seen messages last, so they keep feeling different.
    const challenged = kind === 'challenge';
    const inWeek = kind === 'week';
    const inCampaign = kind === 'campaign';
    const playRole = challenged ? invite.role : role;
    // A week pins the kind of morning itself (week.js deals one of each, Monday first) and carries in
    // how tired the player is, which is the only thing it is allowed to change about the rules.
    game = Core.createGame({
      role: playRole,
      level: challenged ? invite.level : inCampaign ? levelPlaying.setup.level : level,
      peekVariant: challenged ? invite.variant : (kind === 'practice' && ui.variantToggle.checked),
      seed: daily ? Daily.seedFor(morning) : challenged ? invite.seed : inWeek ? Week.seedForMorning(week.seed, week.index) : inCampaign ? levelPlaying.setup.seed : undefined,
      day: inWeek ? weekDays(week)[week.index] : inCampaign ? levelPlaying.setup.day : undefined,
      carry: inWeek ? Week.carryFor(week) : undefined,
      // One perk, and only on a campaign morning: the daily morning and a challenge are the same game for
      // everyone, and a week is five mornings taken as they come.
      perk: inCampaign ? Rewards.perkFor(levelPlaying, loadPerk(), loadCleared()) || undefined : undefined,
      // A week and a practice round both deal recently seen messages last, which matters most in a
      // week: five mornings back to back was the worst case for repeats. The daily morning and a
      // challenge pass none, so they stay identical for everyone who plays them.
      // Practice, the week and the campaign all deal recently seen messages last. It matters most in the
      // campaign: a level pins its seed so the challenge is learnable, which without this meant a level you
      // retried five times showed you the same twenty messages five times. History changes only WHICH text
      // is dealt, never when it arrives or what type it is, so the level stays the identical challenge and
      // only reads differently. The daily morning and a challenge still pass none, so they are the same for
      // everyone who plays them.
      recent: kind === 'daily' || kind === 'challenge' ? undefined : loadRecent()
    });
    holding = false;
    endShown = false;
    busyKind = null;
    lastTs = 0;
    lastBusy = null;
    lastTargetId = null;
    for (const { node } of cardNodes.values()) node.remove();
    cardNodes.clear();
    ui.cards.querySelectorAll('.card').forEach((n) => n.remove());
    resetCode();
    office.reset();
    office.setRole(playRole);
    office.setProps(Awards.propsFor(loadAwards()));
    const day = DAYS[game.day];
    ui.dayChip.textContent = `${day.emoji} ${day.label}`;
    ui.dayChip.title = `${day.summary} ${day.goal}`;
    ui.dayChip.classList.toggle('odd', game.day !== 'normal');
    ui.dayChip.hidden = false;
    const boss = BOSSES[game.boss];
    ui.bossChip.textContent = `${boss.emoji} ${boss.label}`;
    ui.bossChip.title = boss.summary;
    ui.bossChip.hidden = false;
    ui.eventBar.hidden = true;
    ui.banner.hidden = true;
    // An unusual morning is worth saying out loud before the first message lands; an ordinary one just
    // names the boss, as it always did.
    showBanner(game.day === 'normal'
      ? `${boss.emoji} Today's boss: ${boss.label}`
      : `${day.emoji} ${day.label} — ${day.goal}`);
    document.body.classList.remove('deep', 'is-busy', 'coding', 'flash-bad', 'flash-trap');
    startedAs = kind;
    paused = false;
    ui.pauseScreen.hidden = true;
    ui.pauseBtn.textContent = '⏸';
    ui.startScreen.hidden = true;
    ui.endScreen.hidden = true;
    ui.nightScreen.hidden = true;
    keepAwake(true);
    ui.goalBar.dataset.html = ''; // rebuilt on the first frame of the new morning
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    render();
  }

  // The start screen, from the results, keeping the last role and level selected.
  function showStart() {
    ui.pauseScreen.hidden = true;
    paused = false;
    ui.endScreen.hidden = true;
    ui.startScreen.hidden = false;
    applyRoleText();
    renderChallengeCard();
    renderCampaignCard();
    renderWeekCard();
    renderDailyCard();
    renderAwards();
    // Focus leaves the hidden button so Enter starts the morning; Tab still reaches the pickers.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    ui.startScreen.querySelector('.panel').scrollTop = 0;
  }

  // Fixed-timestep loop. Real elapsed time is accumulated and consumed in small, equal steps, so the
  // session runs at true speed whatever the frame rate. The first version fed each frame's time
  // straight in, capped at 0.05s — below 20fps that cap silently turned into slow motion, so a
  // budget phone at 12fps would have stretched the 60-second morning to well over a minute and a
  // half. Catch-up is still capped per frame, so returning to a backgrounded tab resumes where it
  // left off instead of fast-forwarding through a pile of missed notifications.
  const STEP_S = 1 / 60;
  const MAX_CATCH_UP_S = 0.25;
  let accumulator = 0;

  function advance(seconds) {
    accumulator += seconds;
    while (accumulator >= STEP_S && game && !game.over) {
      handle(Core.step(game, STEP_S, { holding }));
      accumulator -= STEP_S;
    }
    render();
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    if (!game || game.over || paused || document.hidden) { lastTs = ts; accumulator = 0; return; }
    const elapsed = lastTs ? Math.min(MAX_CATCH_UP_S, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    advance(elapsed);
  }

  // Playtesting aid, only when the URL has ?dev — normal play never exposes it.
  // nineDev.advance(seconds, hold) runs the session forward through exactly the same
  // step → events → render path as real play, without waiting in real time: jump straight to the end
  // screen, or check the UI in a background tab where browsers throttle animation frames.
  if (DEV) {
    window.nineDev = {
      advance(seconds, hold) {
        if (!game || game.over) return 'no game running';
        const previous = holding;
        if (hold != null) holding = !!hold;
        let left = seconds;
        while (left > 1e-9 && game && !game.over) {
          const chunk = Math.min(MAX_CATCH_UP_S, left);
          advance(chunk);
          left -= chunk;
        }
        holding = previous;
        render();
        return { t: +game.t.toFixed(2), role: game.role, level: game.level, boss: game.boss, events: game.events.map((e) => e.id), mode, morning, progress: +game.progress.toFixed(1), flow: +game.flow.toFixed(1), rep: game.rep, cards: game.cards.length, over: game.over };
      },
      state() { return game; },
      today
    };
  }

  function setHolding(value) {
    holding = value;
    ui.codeBtn.classList.toggle('held', value);
  }

  function actOn(card, action) {
    if (!game || game.over || !card) return;
    handle(Core.act(game, card.id, action));
    render();
  }

  // ---------- input ----------
  // Pointer events cover mouse and touch alike, and pointer capture keeps the hold alive if a thumb
  // drifts off the button. A second finger can still tap notifications while the first holds.
  ui.codeBtn.addEventListener('pointerdown', (e) => {
    if (!game || game.over) return;
    e.preventDefault();
    try { ui.codeBtn.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
    unlockAudio();
    setHolding(true);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => ui.codeBtn.addEventListener(type, () => setHolding(false)));
  ui.codeBtn.addEventListener('contextmenu', (e) => e.preventDefault());

  ui.cards.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-act]');
    if (!button || !game) return;
    const card = game.cards.find((c) => c.id === Number(button.closest('.card').dataset.id));
    actOn(card, button.dataset.act);
  });

  ui.rolePicker.addEventListener('click', (e) => {
    const card = e.target.closest('.role-card');
    if (card) setRole(card.dataset.role);
  });

  // The daily card and share blocks are re-rendered, so their buttons are handled here.
  document.addEventListener('click', (e) => {
    const copy = e.target.closest('[data-share="copy"]');
    if (copy) { shareResult(copy); return; }
    const send = e.target.closest('[data-share="challenge"]');
    if (send) { sendChallenge(send); return; }
    if (e.target.closest('#challengeBtn')) { startGame('challenge'); return; }
    const rung = e.target.closest('[data-rung]');
    if (rung) {
      const level = Campaign.byNumber[Number(rung.dataset.rung)];
      pickedLevel = Campaign.isOpen(level, myCleared()) ? level : pickedLevel;
      renderCampaignCard();
      renderWeekCard();
      return;
    }
    if (e.target.closest('.perks > summary')) { perksOpen = !perksOpen; return; }
    const perkBtn = e.target.closest('[data-perk]');
    if (perkBtn && !perkBtn.disabled) {
      store(STORE.perk, perkBtn.dataset.perk === 'none' ? '' : perkBtn.dataset.perk);
      renderCampaignCard();
      return;
    }
    if (e.target.closest('#backToNextBtn')) { pickedLevel = null; renderCampaignCard(); renderWeekCard(); return; }
    if (e.target.closest('#campaignBtn')) { startGame('campaign'); return; }
    if (e.target.closest('#weekBtn')) { startGame('week'); return; }
    if (e.target.closest('#abandonWeekBtn')) { saveWeek(null); week = null; renderWeekCard(); return; }
    if (e.target.closest('#dailyBtn, #endDailyBtn')) startGame('daily');
  });

  ui.hpBtn.addEventListener('click', () => {
    if (!game || game.over) return;
    handle(Core.useHeadphones(game));
    render();
  });
  ui.pauseBtn.addEventListener('click', () => setPaused(!paused));
  ui.resumeBtn.addEventListener('click', () => setPaused(false));
  // Guarded as well as hidden: today's morning is the same one for everybody and you get one go at it,
  // so it must not be restartable even if something clicks the button anyway.
  ui.restartBtn.addEventListener('click', () => { if (mode !== 'daily') startGame(startedAs || 'practice'); });
  ui.quitBtn.addEventListener('click', leaveRound);
  ui.muteBtn.addEventListener('click', () => setMuted(!muted));
  ui.practiceBtn.addEventListener('click', () => startGame('practice'));
  ui.againBtn.addEventListener('click', () => startGame('practice'));
  ui.changeRoleBtn.addEventListener('click', showStart);
  ui.nextMorningBtn.addEventListener('click', () => {
    ui.nightScreen.hidden = true;
    if (week && week.over) { ui.endScreen.hidden = false; return; } // the week is done: the result screen waits
    startGame('week');
  });
  ui.quitWeekBtn.addEventListener('click', () => { ui.nightScreen.hidden = true; showStart(); });

  const ARROWS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && game && !game.over) { e.preventDefault(); setPaused(!paused); return; }
    const overlayOpen = !ui.startScreen.hidden || !ui.endScreen.hidden || !ui.nightScreen.hidden || paused;
    if (e.code === 'Space') {
      e.preventDefault(); // never scroll the page or click a focused button
      if (!e.repeat && game && !game.over && !overlayOpen) setHolding(true);
      return;
    }
    if (!ui.startScreen.hidden && !e.repeat) {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= ROLE_ORDER.length) { e.preventDefault(); setRole(ROLE_ORDER[n - 1]); return; }
      if (ARROWS[e.key] && ui.rolePicker.contains(document.activeElement)) {
        e.preventDefault();
        const next = (ROLE_ORDER.indexOf(role) + ARROWS[e.key] + ROLE_ORDER.length) % ROLE_ORDER.length;
        setRole(ROLE_ORDER[next], true);
        return;
      }
    }
    if (e.key === 'Enter' && overlayOpen) {
      // Enter plays: today's morning from the start screen if it's still to play, otherwise a practice
      // round. It works even with a role or level card focused (clicking a card focuses it). Buttons
      // that do something else — Change role, sharing, links — keep their own Enter.
      const el = document.activeElement;
      if (el && el.closest && el.closest('#changeRoleBtn, .tour-btn, summary, [data-share]')) return;
      e.preventDefault();
      // From the start screen Enter plays what the screen is offering, topmost first: an unanswered
      // challenge, then today's morning, then a practice round.
      if (!ui.nightScreen.hidden) { ui.nextMorningBtn.click(); return; }
      const onStart = !ui.startScreen.hidden;
      if (onStart && pendingInvite()) startGame('challenge');
      else startGame(onStart && !loadDaily()[today()] ? 'daily' : 'practice');
      return;
    }
    if (e.repeat || overlayOpen || !game || game.over) {
      if (e.key === 'm' || e.key === 'M') setMuted(!muted);
      return;
    }
    const key = e.key.toLowerCase();
    if (key === 'r') actOn(targetCard(false), 'respond');
    else if (key === 'n') actOn(targetCard(false), 'decline');
    else if (key === 'x') actOn(targetCard(false), 'ignore');
    else if (key === 'p') actOn(targetCard(true), 'peek');
    else if (key === 'd') actOn(targetCard(false), 'delegate'); // works mid-call too
    else if (key === 'h') { handle(Core.useHeadphones(game)); render(); }
    else if (key === 'm') setMuted(!muted);
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') { e.preventDefault(); setHolding(false); }
  });
  window.addEventListener('blur', () => setHolding(false));

  // Keep "Next morning in …" current, and roll the start screen over to the new morning at midnight.
  setInterval(() => {
    if (!ui.startScreen.hidden && today() !== renderedMorning) { renderDailyCard(); return; }
    const text = nextMorningText();
    document.querySelectorAll('.daily-next').forEach((el) => { el.textContent = text; });
  }, 20000);

  // ---------- boot ----------
  setMuted(read(STORE.muted) === '1');
  ui.variantToggle.checked = read(STORE.variant) === 'B';
  const savedRole = read(STORE.role);
  if (savedRole && ROLES[savedRole]) role = savedRole;
  const savedLevel = read(STORE.level);
  if (savedLevel && LEVELS[savedLevel] && unlockedLevels().includes(savedLevel)) level = savedLevel;
  ui.statsNote.hidden = !STATS_ON;
  renderRolePicker();
  tour.steps = [].slice.call(ui.tourSteps.children).concat(ui.startGoal);
  tour.at = read(STORE.tour) === 'done' ? tour.steps.length - 1 : 0;
  renderTour();
  renderLevelPicker();
  applyRoleText();
  // A challenge link, if the page was opened with one. The hash stays in the address bar so the link
  // can be reopened or forwarded, and never leaves the browser: the stats hear that a challenge was
  // opened, never which one.
  invite = Challenge.decode(Challenge.codeFromUrl(location.href));
  if (invite) report({ kind: 'accept', day: today() });
  renderChallengeCard();
  renderCampaignCard();
  renderWeekCard();
  renderDailyCard();
  renderAwards();
  if (read(STORE.visit) !== String(today())) {
    report({ kind: 'visit', day: today() });
    store(STORE.visit, String(today()));
  }

  // Offline, and instant on a second launch. Service workers only run over https or on localhost, which
  // is every place this is served from; opened as a file:// copy it simply runs without one.
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* not fatal */ }));
  }

  requestAnimationFrame(frame);
})();
