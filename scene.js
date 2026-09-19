// scene.js — the illustrated office: the little scene of you at your desk that reacts to play, and the
// drawn portraits of the people who message you. Presentation only: it reads game state and never
// changes it, so the rules, balance and tests are untouched. Everything is inline SVG and CSS (no image
// files), so it stays sharp on any screen and works offline; style.css switches the animations off for
// players who ask their device to reduce motion.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NineScene = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // FNV-1a: the same name always gives the same face.
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  const SKIN = ['#F6D2B5', '#EDB98A', '#D69E6E', '#B97A4E', '#8D5A3B', '#5E3A26'];
  const HAIR = ['#2B1B12', '#4A2E1D', '#7A4A2A', '#B9803F', '#1F1F24', '#8E8E93', '#A0412D'];
  const SHIRT = ['#5B7FD6', '#E07A5F', '#3D9A7A', '#9B6BFF', '#F2B134', '#D95D8C', '#4AA3C7'];
  const BACKDROP = ['#DCE7F7', '#F6E3D8', '#DDEFE6', '#EAE1FA', '#F8EBC9', '#F5DCE6', '#D9EEF5'];
  const HAIRSTYLES = ['short', 'side', 'bun', 'long', 'curly', 'buzz', 'bald'];

  // A face is picked from the name alone, never from assumptions about who the person is: hairstyle,
  // skin tone and so on are independent draws, so the cast comes out varied.
  function looks(name) {
    const h = hash(String(name));
    return {
      skin: SKIN[h % SKIN.length],
      hair: HAIR[(h >>> 3) % HAIR.length],
      shirt: SHIRT[(h >>> 7) % SHIRT.length],
      backdrop: BACKDROP[(h >>> 11) % BACKDROP.length],
      style: HAIRSTYLES[(h >>> 15) % HAIRSTYLES.length],
      glasses: ((h >>> 19) & 7) === 0, // about 1 in 8
      beard: ((h >>> 22) & 7) === 1    // about 1 in 8
    };
  }

  // A head and shoulders in a 40×40 box, head centred at (20, 18). Portraits use it as is; the office
  // scene scales it up for you, for colleagues who walk over, and for the boss on a walk-by.
  function face(l) {
    const hair = {
      short: `<path d="M10.6 18 Q10 8.4 20 8.2 Q30 8.4 29.4 18 Q27 12.6 20 12.6 Q13 12.6 10.6 18 Z" fill="${l.hair}"/>`,
      side: `<path d="M10.6 19 Q10 8 21 8.2 Q31 9 29.5 17 Q24 11.2 15 14.6 Q12.6 15.6 10.6 19 Z" fill="${l.hair}"/>`,
      bun: `<circle cx="20" cy="7.4" r="4" fill="${l.hair}"/><path d="M10.6 17 Q10.5 8.8 20 8.6 Q29.5 8.8 29.4 17 Q26 12.8 20 12.8 Q14 12.8 10.6 17 Z" fill="${l.hair}"/>`,
      long: `<path d="M10.8 16.5 Q12 9.4 20 9.4 Q28 9.4 29.2 16.5 Q24.5 12.6 20 12.8 Q15.5 12.6 10.8 16.5 Z" fill="${l.hair}"/>`,
      curly: `<g fill="${l.hair}"><circle cx="12.2" cy="14" r="3.8"/><circle cx="15" cy="10" r="4"/><circle cx="20" cy="8.6" r="4.2"/><circle cx="25" cy="10" r="4"/><circle cx="27.8" cy="14" r="3.8"/></g>`,
      buzz: `<path d="M11.2 16 Q12 9.2 20 9.1 Q28 9.2 28.8 16 Q24 13.4 20 13.5 Q16 13.4 11.2 16 Z" fill="${l.hair}" opacity="0.8"/>`,
      bald: ''
    }[l.style];
    const longBack = l.style === 'long'
      ? `<path d="M9.5 17 Q9 7.5 20 7.8 Q31 7.5 30.5 17 L31.5 31 Q27 33 24.5 28 L24.5 21 L15.5 21 L15.5 28 Q13 33 8.5 31 Z" fill="${l.hair}"/>`
      : '';
    return longBack +
      `<path class="shirt" d="M5 41 Q7 28.5 20 28.5 Q33 28.5 35 41 Z" fill="${l.shirt}"/>` +
      `<rect x="17" y="24" width="6" height="6" fill="${l.skin}"/>` +
      `<circle cx="20" cy="18" r="9" fill="${l.skin}"/>` +
      hair +
      (l.beard ? `<path d="M12.3 20.5 Q13 28.6 20 29 Q27 28.6 27.7 20.5 Q25 24.6 20 24.8 Q15 24.6 12.3 20.5 Z" fill="${l.hair}"/>` : '') +
      '<g fill="#2B1B12"><circle class="eye" cx="16.8" cy="18.6" r="1.05"/><circle class="eye" cx="23.2" cy="18.6" r="1.05"/></g>' +
      (l.beard ? '' : '<path class="mouth" d="M17.6 22.2 Q20 23.8 22.4 22.2" fill="none" stroke="#2B1B12" stroke-width="0.9" stroke-linecap="round"/>') +
      (l.glasses ? '<g fill="none" stroke="#2B1B12" stroke-width="0.8"><circle cx="16.8" cy="18.6" r="2.6"/><circle cx="23.2" cy="18.6" r="2.6"/><path d="M19.4 18.6 H20.6"/></g>' : '');
  }

  function portrait(name) {
    const l = looks(name);
    return `<svg class="portrait" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><rect width="40" height="40" fill="${l.backdrop}"/>${face(l)}</svg>`;
  }

  // Emoji that stand for one person get a portrait, and so does any sender named like "Neha · QA".
  // Bots, teams, apps and group chats keep their icon on a tile, so people and systems are easy to tell
  // apart at a glance. A face is keyed on the first name, so "Ramesh · Manager" and "Ramesh · Peer
  // Manager" are the same Ramesh.
  const PEOPLE = new Set(['🧑', '👩', '👨', '🧔', '👨‍💼', '👩‍💼', '🧑‍💼', '👩‍💻', '🧑‍💻', '👨‍💻', '👩‍🔬', '🧑‍🔬', '👩‍🎨', '🧑‍🎨', '🧑‍🔧', '🧑‍🏫', '👔']);
  const isPerson = (from, emoji) => PEOPLE.has(emoji) || String(from).includes(' · ');

  function avatar(from, emoji) {
    return isPerson(from, emoji)
      ? portrait(String(from).split(' · ')[0].trim())
      : `<span class="avatar-tile">${esc(emoji)}</span>`;
  }

  // ---------- the office ----------
  const PLAYER = { skin: '#E0AC84', hair: '#3B2A20', style: 'short', shirt: '#5B7FD6', backdrop: 'none', glasses: false, beard: false };
  const ROLE_SHIRT = { developer: '#5B7FD6', tester: '#3D9A7A', analyst: '#9B6BFF', support: '#E07A5F', manager: '#E0A12E' };

  // The scene is a band whose height the layout decides, so it is drawn to COVER that band and cropped
  // from the middle. Anchoring it to the bottom (xMidYMax) kept the floor and cut the top, which on a
  // short phone with a busy goal bar meant cutting your own head off.
  function officeSvg() {
    return '<svg class="office" viewBox="0 0 600 180" preserveAspectRatio="xMidYMid slice" data-state="idle" data-hp="0" data-stress="0" aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<clipPath id="nine-window"><rect x="76" y="22" width="138" height="84" rx="3"/></clipPath>' +
        // The wall is lit from the window, so it is brightest on the left and falls away to the right.
        '<linearGradient id="nine-wall" x1="0" y1="0" x2="1" y2="0.35">' +
          '<stop offset="0" stop-color="#FBF0E2"/><stop offset="0.45" stop-color="#F1E3D1"/><stop offset="1" stop-color="#E3D0B9"/>' +
        '</linearGradient>' +
        // The same wall an hour and a half later, with the sun higher and the light warmer.
        '<linearGradient id="nine-wall-noon" x1="0" y1="0" x2="1" y2="0.35">' +
          '<stop offset="0" stop-color="#FFF4DC"/><stop offset="0.45" stop-color="#F7E6C8"/><stop offset="1" stop-color="#E6CDA8"/>' +
        '</linearGradient>' +
        '<linearGradient id="nine-floor" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#D9C3AB"/><stop offset="1" stop-color="#C2A488"/>' +
        '</linearGradient>' +
        // The shaft of light from the window across the desk, and the glow the monitor throws back.
        '<linearGradient id="nine-beam" x1="0" y1="0" x2="0.6" y2="1">' +
          '<stop offset="0" stop-color="#FFE9B8" stop-opacity="0.85"/><stop offset="1" stop-color="#FFE9B8" stop-opacity="0"/>' +
        '</linearGradient>' +
        '<radialGradient id="nine-screenglow"><stop offset="0" stop-color="#8FE0A5" stop-opacity="0.5"/><stop offset="1" stop-color="#8FE0A5" stop-opacity="0"/></radialGradient>' +
        '<radialGradient id="nine-vignette" cx="0.5" cy="0.45" r="0.72">' +
          '<stop offset="0.55" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#2B1B12" stop-opacity="0.3"/>' +
        '</radialGradient>' +
        '<radialGradient id="nine-contact"><stop offset="0" stop-color="#8C5F3C" stop-opacity="0.45"/><stop offset="1" stop-color="#8C5F3C" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      '<rect class="wall" width="600" height="180" fill="url(#nine-wall)"/>' +
      '<rect y="146" width="600" height="34" fill="url(#nine-floor)"/>' +
      '<rect y="144" width="600" height="4" fill="#C7AB8F"/>' +
      // A skirting board: two lines of shadow where the wall meets the floor is most of what reads as depth.
      '<rect y="138" width="600" height="6" fill="#E0CDB4"/><rect y="136" width="600" height="2" fill="#CBB294" opacity="0.7"/>' +
      // window: the sky and sun follow the clock from 10 AM to 1 PM
      '<rect x="70" y="16" width="150" height="96" rx="6" fill="#FFFFFF"/>' +
      '<rect class="sky" x="76" y="22" width="138" height="84" rx="3" fill="#CDE8F7"/>' +
      '<g clip-path="url(#nine-window)">' +
        '<circle class="sun" cx="90" cy="96" r="10" fill="#FFD36E"/>' +
        '<g class="cloud" fill="#FFFFFF"><ellipse cx="100" cy="44" rx="16" ry="6"/><ellipse cx="110" cy="40" rx="10" ry="7"/></g>' +
        '<g class="cloud cloud-2" fill="#FFFFFF"><ellipse cx="160" cy="58" rx="14" ry="5"/><ellipse cx="168" cy="54" rx="8" ry="6"/></g>' +
        '<g fill="#9DBFD2"><rect x="80" y="80" width="16" height="26"/><rect x="99" y="70" width="18" height="36"/><rect x="120" y="86" width="14" height="20"/><rect x="150" y="74" width="16" height="32"/><rect x="170" y="84" width="20" height="22"/><rect x="194" y="78" width="16" height="28"/></g>' +
      '</g>' +
      '<rect x="143" y="22" width="4" height="84" fill="#FFFFFF"/><rect x="76" y="62" width="138" height="4" fill="#FFFFFF"/>' +
      // poster, wall clock and the alarm light that goes off in a drill or an outage
      '<rect x="452" y="24" width="40" height="52" rx="3" fill="#5B7FD6"/><path d="M472 32 Q479 42 477 58 L467 58 Q465 42 472 32 Z" fill="#FFFFFF"/><path d="M467 54 L461 62 L467 60 Z M477 54 L483 62 L477 60 Z" fill="#FFD36E"/>' +
      '<circle cx="540" cy="52" r="20" fill="#FFFFFF" stroke="#2E3A4F" stroke-width="3"/>' +
      '<line class="hand-hour" x1="540" y1="52" x2="540" y2="41" stroke="#2E3A4F" stroke-width="3" stroke-linecap="round"/>' +
      '<line class="hand-minute" x1="540" y1="52" x2="540" y2="36" stroke="#E07A5F" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="540" cy="52" r="2" fill="#2E3A4F"/>' +
      '<g class="alarm"><rect x="314" y="14" width="26" height="8" rx="3" fill="#7A2E2E"/><circle cx="327" cy="26" r="9" fill="#E24B4A"/></g>' +
      '<g class="wifi-out" transform="translate(250 30)"><path d="M-16 6 Q0 -10 16 6" fill="none" stroke="#2E3A4F" stroke-width="3"/><path d="M-9 12 Q0 3 9 12" fill="none" stroke="#2E3A4F" stroke-width="3"/><circle cy="17" r="3" fill="#2E3A4F"/><path d="M-18 -8 L18 22" stroke="#E24B4A" stroke-width="3" stroke-linecap="round"/></g>' +
      // plant
      '<path d="M44 118 Q30 96 40 84 Q50 100 48 118 Z" fill="#5B9A3B"/><path d="M50 118 Q52 90 66 82 Q66 104 54 118 Z" fill="#6FA84A"/><path d="M46 118 Q40 104 28 100 Q34 116 44 120 Z" fill="#4E8A33"/><rect x="36" y="118" width="26" height="28" rx="3" fill="#C88B5A"/>' +
      // The shaft of daylight lands on the floor and across the desk. It strengthens toward noon, which
      // ties the light to the clock rather than making it decoration.
      '<g class="beam"><path d="M80 26 L214 26 L438 176 L150 176 Z" fill="url(#nine-beam)"/>' +
        '<g class="motes" fill="#FFF6DE"><circle cx="200" cy="60" r="1.8"/><circle cx="252" cy="96" r="1.4"/><circle cx="170" cy="118" r="1.6"/><circle cx="300" cy="140" r="1.5"/><circle cx="228" cy="42" r="1.2"/></g>' +
      '</g>' +
      // the boss, walking past behind your desk
      '<g class="boss-walk"><g class="boss-body"></g></g>' +
      // Contact shadows: nothing looks like it is standing on the floor without one.
      '<ellipse cx="238" cy="168" rx="70" ry="9" fill="url(#nine-contact)"/>' +
      '<ellipse cx="315" cy="170" rx="180" ry="8" fill="url(#nine-contact)" opacity="0.7"/>' +
      '<ellipse cx="49" cy="148" rx="26" ry="5" fill="url(#nine-contact)"/>' +
      // you: chair, deep-work glow, body, face, headphones, call, sweat, dizzy
      '<rect x="206" y="66" width="64" height="76" rx="16" fill="#3A4A6B"/>' +
      '<rect x="206" y="66" width="20" height="76" rx="16" fill="#2F3D59" opacity="0.55"/>' +
      '<g class="aura" fill="#FFD36E"><circle cx="238" cy="88" r="62" opacity="0.16"/><circle cx="238" cy="88" r="46" opacity="0.22"/></g>' +
      '<g class="me">' +
        `<rect class="shirt" x="204" y="104" width="68" height="40" rx="14" fill="${PLAYER.shirt}"/>` +
        `<g transform="translate(198 38) scale(2)">${face(PLAYER)}</g>` +
        '<path class="mouth-sad" d="M233 85 Q238 81 243 85" fill="none" stroke="#2B1B12" stroke-width="1.8" stroke-linecap="round"/>' +
        '<g class="hp"><path d="M218 74 Q217 46 238 46 Q259 46 258 74" fill="none" stroke="#2E3A4F" stroke-width="4"/><rect x="213" y="66" width="9" height="16" rx="4" fill="#2E3A4F"/><rect x="254" y="66" width="9" height="16" rx="4" fill="#2E3A4F"/></g>' +
        '<path class="sweat" d="M262 58 Q266 65 262 68 Q258 65 262 58 Z" fill="#7FC6F2"/>' +
        '<g class="dizzy" fill="#9B6BFF"><circle cx="222" cy="48" r="3"/><circle cx="254" cy="48" r="3"/><circle cx="238" cy="38" r="3"/></g>' +
        `<g class="call"><rect class="shirt" x="258" y="74" width="13" height="36" rx="6.5" fill="${PLAYER.shirt}"/><rect x="252" y="62" width="9" height="18" rx="2.5" fill="#2E3A4F"/><circle cx="262" cy="76" r="5" fill="${PLAYER.skin}"/></g>` +
      '</g>' +
      '<g class="bubble"><rect x="272" y="20" width="44" height="22" rx="11" fill="#FFFFFF"/><path d="M280 40 L274 48 L288 41 Z" fill="#FFFFFF"/><circle cx="284" cy="31" r="2.6" fill="#2E3A4F"/><circle cx="294" cy="31" r="2.6" fill="#2E3A4F"/><circle cx="304" cy="31" r="2.6" fill="#2E3A4F"/></g>' +
      // desk and everything on it
      '<rect x="150" y="116" width="330" height="12" rx="3" fill="#C8966A"/><rect x="158" y="128" width="314" height="18" fill="#A9754C"/><rect x="166" y="146" width="8" height="20" fill="#8C5F3C"/><rect x="456" y="146" width="8" height="20" fill="#8C5F3C"/>' +
      '<rect x="364" y="102" width="12" height="12" fill="#2E3A4F"/><rect x="348" y="112" width="44" height="5" rx="2" fill="#2E3A4F"/>' +
      '<ellipse class="screenglow" cx="330" cy="96" rx="96" ry="46" fill="url(#nine-screenglow)"/>' +
      '<rect x="316" y="42" width="108" height="64" rx="5" fill="#2E3A4F"/><rect class="screen" x="322" y="48" width="96" height="52" rx="2" fill="#1B2233"/>' +
      '<g class="lines"><rect x="328" y="54" width="36" height="4" rx="2" fill="#FF7AB2"/><rect x="332" y="62" width="58" height="4" rx="2" fill="#8FE0A5"/><rect x="332" y="70" width="44" height="4" rx="2" fill="#C7D3E3"/><rect x="336" y="78" width="62" height="4" rx="2" fill="#9B6BFF"/><rect x="332" y="86" width="30" height="4" rx="2" fill="#5F6F86"/><rect x="328" y="94" width="20" height="4" rx="2" fill="#8FE0A5"/></g>' +
      '<rect class="caret" x="333" y="93.5" width="3" height="5" rx="1" fill="#8FE0A5"/>' +
      '<rect x="212" y="111" width="52" height="6" rx="2" fill="#DDE2EA"/>' +
      '<g class="pizza"><rect x="276" y="106" width="36" height="10" rx="2" fill="#E0A44E"/><rect x="276" y="101" width="36" height="6" rx="2" fill="#C98B3A"/><path d="M288 101 L300 101 L294 96 Z" fill="#E8C07A"/></g>' +
      '<rect x="436" y="100" width="16" height="16" rx="3" fill="#F7F1E8"/><path d="M452 104 Q459 104 459 109 Q459 113 452 113" fill="none" stroke="#F7F1E8" stroke-width="2.5"/>' +
      '<path class="steam" d="M440 96 Q437 90 441 85 Q444 80 441 75" fill="none" stroke="#B9A48E" stroke-width="2" stroke-linecap="round"/>' +
      '<path class="steam steam-2" d="M447 96 Q444 90 448 85 Q451 80 448 75" fill="none" stroke="#B9A48E" stroke-width="2" stroke-linecap="round"/>' +
      '<g class="deskphone"><rect x="176" y="109" width="24" height="8" rx="2" fill="#2E3A4F"/><rect x="179" y="110.5" width="14" height="5" rx="1" fill="#4D8DFF"/></g>' +
      '<g class="ping"><circle cx="188" cy="94" r="9" fill="#E24B4A"/><rect x="186.8" y="88" width="2.4" height="8" rx="1" fill="#FFFFFF"/><circle cx="188" cy="99" r="1.3" fill="#FFFFFF"/></g>' +
      // your hands on the keyboard (in front of the desk)
      `<g class="arm arm-left"><rect class="shirt" x="204" y="98" width="13" height="20" rx="6.5" fill="${PLAYER.shirt}"/><circle cx="214" cy="114" r="5" fill="${PLAYER.skin}"/></g>` +
      `<g class="arm arm-right"><rect class="shirt" x="259" y="98" width="13" height="20" rx="6.5" fill="${PLAYER.shirt}"/><circle cx="262" cy="114" r="5" fill="${PLAYER.skin}"/></g>` +
      // desk objects unlocked by achievements (awards.js), hidden until earned
      '<g class="prop prop-cat"><rect x="18" y="34" width="34" height="30" rx="3" fill="#FFFFFF" stroke="#C7AB8F" stroke-width="2"/><circle cx="35" cy="50" r="8" fill="#E0A44E"/><path d="M29 44 L31 38 L35 43 M41 44 L39 38 L35 43" fill="#E0A44E"/><circle cx="32" cy="49" r="1.2" fill="#2B1B12"/><circle cx="38" cy="49" r="1.2" fill="#2B1B12"/></g>' +
      '<g class="prop prop-calendar"><rect x="500" y="84" width="34" height="34" rx="3" fill="#FFFFFF" stroke="#2E3A4F" stroke-width="2"/><rect x="500" y="84" width="34" height="9" fill="#E24B4A"/><g fill="#9DBFD2"><rect x="504" y="97" width="6" height="5"/><rect x="514" y="97" width="6" height="5"/><rect x="524" y="97" width="6" height="5"/><rect x="504" y="106" width="6" height="5"/><rect x="514" y="106" width="6" height="5"/></g></g>' +
      '<g class="prop prop-medal"><path d="M438 80 L444 94 L450 80" fill="none" stroke="#4D8DFF" stroke-width="3"/><circle cx="444" cy="99" r="7" fill="#F5B83D" stroke="#C98B3A" stroke-width="1.5"/></g>' +
      '<g class="prop prop-extinguisher"><rect x="8" y="122" width="14" height="24" rx="5" fill="#E24B4A"/><rect x="12" y="116" width="6" height="7" fill="#7A2E2E"/><rect x="8" y="131" width="14" height="5" fill="#F7F1E8"/></g>' +
      '<g class="prop prop-monitor"><rect x="268" y="58" width="50" height="46" rx="4" fill="#2E3A4F"/><rect x="273" y="63" width="40" height="34" rx="2" fill="#1B2233"/><rect x="278" y="69" width="24" height="3" rx="1.5" fill="#8FE0A5"/><rect x="278" y="76" width="30" height="3" rx="1.5" fill="#C7D3E3"/><rect x="278" y="83" width="18" height="3" rx="1.5" fill="#5F6F86"/><rect x="288" y="104" width="10" height="9" fill="#2E3A4F"/><rect x="276" y="112" width="34" height="5" rx="2" fill="#2E3A4F"/></g>' +
      '<g class="prop prop-notes"><rect x="318" y="44" width="11" height="11" fill="#F5E06A"/><rect x="318" y="58" width="11" height="11" fill="#7FD1B9"/></g>' +
      '<g class="prop prop-plant"><path d="M163 104 Q154 94 159 86 Q166 94 165 104 Z" fill="#5B9A3B"/><path d="M166 104 Q168 90 176 86 Q176 98 169 104 Z" fill="#6FA84A"/><rect x="156" y="104" width="18" height="12" rx="2" fill="#C88B5A"/></g>' +
      '<g class="prop prop-trophy"><path d="M202 102 H214 L212 110 H204 Z" fill="#F5B83D"/><path d="M201 103 Q197 106 202 108 M215 103 Q219 106 214 108" fill="none" stroke="#F5B83D" stroke-width="1.6"/><rect x="205" y="110" width="6" height="3" fill="#C98B3A"/><rect x="202" y="113" width="12" height="3" rx="1" fill="#C98B3A"/></g>' +
      '<g class="prop prop-stand"><rect x="406" y="100" width="4" height="16" fill="#8C5F3C"/><rect x="398" y="113" width="20" height="3" rx="1.5" fill="#8C5F3C"/><path d="M400 100 Q408 92 416 100" fill="none" stroke="#2E3A4F" stroke-width="3"/><rect x="397" y="99" width="6" height="9" rx="3" fill="#2E3A4F"/><rect x="413" y="99" width="6" height="9" rx="3" fill="#2E3A4F"/></g>' +
      '<g class="prop prop-photo"><rect x="458" y="100" width="22" height="16" rx="2" fill="#FFFFFF" stroke="#C7AB8F" stroke-width="1.5"/><circle cx="465" cy="108" r="3" fill="#E0AC84"/><circle cx="473" cy="108" r="3" fill="#B97A4E"/></g>' +
      // star milestones: a lamp by the window, a nameplate on the desk front, and a framed star beside the poster.
      // Everything below sits inside x 90-510, y 26-154: measured, the part of the office every screen shows
      // (a phone's start screen crops the sides to 90-510, its morning crops the top and bottom to 26-154).
      '<g class="prop prop-lamp"><ellipse cx="128" cy="104" rx="18" ry="8" fill="#FFE9B8" opacity="0.55"/><rect x="126.5" y="94" width="3" height="48" fill="#2E3A4F"/><ellipse cx="128" cy="143" rx="10" ry="2.5" fill="#2E3A4F"/><path d="M116 96 L140 96 L134 80 L122 80 Z" fill="#F5E06A" stroke="#C98B3A" stroke-width="1.2"/></g>' +
      '<g class="prop prop-nameplate"><rect x="392" y="131" width="54" height="11" rx="2" fill="#E2C06A" stroke="#9C7A2E" stroke-width="1"/><rect x="400" y="135" width="38" height="1.6" rx="0.8" fill="#8A6A26"/><rect x="406" y="138.2" width="26" height="1.4" rx="0.7" fill="#8A6A26" opacity="0.7"/></g>' +
      '<g class="prop prop-framedstar"><rect x="427" y="28" width="22" height="22" rx="2" fill="#C98B3A"/><rect x="429.5" y="30.5" width="17" height="17" fill="#FFFFFF"/><path d="M438 32 L439.8 36.6 L444.7 36.8 L440.9 39.9 L442.1 44.7 L438 42 L433.9 44.7 L435.1 39.9 L431.3 36.8 L436.2 36.6 Z" fill="#F5B83D" stroke="#C98B3A" stroke-width="0.7"/></g>' +
      // upper-level achievements: a cone in front of the desk, running shoes under it, a basket to its right
      '<g class="prop prop-cone"><path d="M369 126 L378 147 L360 147 Z" fill="#F08A3E"/><path d="M365.5 135 L372.5 135 L374.3 139 L363.7 139 Z" fill="#FFFFFF"/><rect x="357" y="146" width="24" height="3.5" rx="1" fill="#C9652A"/></g>' +
      '<g class="prop prop-shoes"><path d="M292 152 Q292 143 299 143 L304 143 Q306 147 314 148 Q318 149 318 152 Z" fill="#4D8DFF"/><path d="M322 152 Q322 143 329 143 L334 143 Q336 147 344 148 Q348 149 348 152 Z" fill="#4D8DFF"/><rect x="292" y="151" width="26" height="2.2" rx="1" fill="#FFFFFF"/><rect x="322" y="151" width="26" height="2.2" rx="1" fill="#FFFFFF"/></g>' +
      '<g class="prop prop-basket"><path d="M472 130 L494 130 L491 152 L475 152 Z" fill="#8C9BB0"/><rect x="471" y="128" width="24" height="3" rx="1.5" fill="#5F6F86"/><path d="M478 134 L479 149 M483 134 L483 149 M488 134 L487 149" stroke="#6F7F96" stroke-width="1"/><circle cx="480" cy="127" r="3" fill="#FFFFFF"/><circle cx="486" cy="126.5" r="2.6" fill="#F7F1E8"/></g>' +
      // a colleague who owes you a favour walks over
      '<g class="helper"><g class="helper-body"></g>' +
        '<g><rect x="400" y="14" width="56" height="22" rx="11" fill="#FFFFFF"/><path d="M444 34 L452 42 L436 35 Z" fill="#FFFFFF"/>' +
        '<text x="428" y="29" text-anchor="middle" font-size="11" font-weight="700" fill="#2E3A4F" font-family="system-ui, sans-serif">On it!</text></g>' +
      '</g>' +
      // Last of all, so it darkens the whole room a little at the edges and keeps the eye on the desk.
      '<rect class="vignette" width="600" height="180" fill="url(#nine-vignette)" pointer-events="none"/>' +
    '</svg>';
  }

  const lerp = (a, b, f) => Math.round(a + (b - a) * f);
  function mix(from, to, f) {
    const p = (hex, i) => parseInt(hex.slice(i, i + 2), 16);
    const c = [1, 3, 5].map((i) => lerp(p(from, i), p(to, i), f).toString(16).padStart(2, '0'));
    return `#${c.join('')}`;
  }

  const CONFETTI = ['#F5B83D', '#4D8DFF', '#35C98A', '#FF5D6C', '#9B6BFF', '#FF7AB2'];

  // A burst of confetti from the middle of `container` (which needs position: relative).
  function burst(container, count) {
    if (!container || typeof document === 'undefined') return;
    for (let i = 0; i < (count || 30); i++) {
      const bit = document.createElement('span');
      bit.className = 'confetti';
      const angle = Math.random() * Math.PI * 2;
      const distance = 50 + Math.random() * 110;
      bit.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
      bit.style.setProperty('--dy', `${Math.sin(angle) * distance * 0.7 + 40}px`);
      bit.style.setProperty('--rot', `${Math.round(Math.random() * 720 - 360)}deg`);
      bit.style.background = CONFETTI[i % CONFETTI.length];
      container.appendChild(bit);
      setTimeout(() => bit.remove(), 1400);
    }
  }

  const restart = (el, cls) => {
    el.classList.remove(cls);
    void el.getBoundingClientRect(); // let the animation start again from the beginning
    el.classList.add(cls);
  };

  // Someone drawn standing at the desk: a colleague coming to help, or the boss walking past.
  function person(l, x, y, scale) {
    const w = 52 * scale;
    return `<rect x="${x}" y="${y + 68 * scale}" width="${w}" height="${60 * scale}" rx="${16 * scale}" fill="${l.shirt}"/>` +
      `<rect x="${x + 10 * scale}" y="${y + 124 * scale}" width="${12 * scale}" height="${28 * scale}" rx="5" fill="#2E3A4F"/>` +
      `<rect x="${x + 30 * scale}" y="${y + 124 * scale}" width="${12 * scale}" height="${28 * scale}" rx="5" fill="#2E3A4F"/>` +
      `<g transform="translate(${x - 10 * scale} ${y}) scale(${scale * 1.8})">${face(l)}</g>`;
  }

  function create(container) {
    container.innerHTML = officeSvg();
    const svg = container.querySelector('svg');
    const q = (selector) => svg.querySelector(selector);
    const sky = q('.sky');
    const wall = q('.wall');
    const beam = q('.beam');
    const sun = q('.sun');
    const hourHand = q('.hand-hour');
    const minuteHand = q('.hand-minute');
    const phone = q('.deskphone');
    const ping = q('.ping');
    const helper = q('.helper');
    const helperBody = q('.helper-body');
    const bossBody = q('.boss-body');
    let lastMinute = -1;
    let lastSteam = -1;
    let helperTimer = 0;

    const set = (key, value) => { if (svg.dataset[key] !== value) svg.dataset[key] = value; };

    return {
      // Your shirt is your role's colour.
      setRole(roleId) {
        const colour = ROLE_SHIRT[roleId] || PLAYER.shirt;
        svg.querySelectorAll('.me .shirt, .arm .shirt').forEach((el) => el.setAttribute('fill', colour));
      },

      // Called every frame with a snapshot of the game; only touches the DOM when something changed.
      update(s) {
        const f = Math.min(1, Math.max(0, s.t / s.duration));
        const minute = Math.floor(f * 180);
        if (minute !== lastMinute) {
          lastMinute = minute;
          sky.setAttribute('fill', mix('#CDE8F7', '#7CC4EC', f));
          // The room warms and the shaft of light sharpens as the sun climbs toward noon.
          if (wall) wall.setAttribute('fill', f > 0.62 ? 'url(#nine-wall-noon)' : 'url(#nine-wall)');
          if (beam) beam.setAttribute('opacity', (0.35 + f * 0.5).toFixed(2));
          sun.setAttribute('cx', String(90 + f * 110));
          sun.setAttribute('cy', String(96 - f * 64));
          const clockMinutes = 600 + minute; // 10:00 AM onwards
          hourHand.setAttribute('transform', `rotate(${((clockMinutes / 60) % 12) * 30} 540 52)`);
          minuteHand.setAttribute('transform', `rotate(${(clockMinutes % 60) * 6} 540 52)`);
        }
        const state = s.busy ? (s.busyKind === 'trap' ? 'trap' : 'call') : s.working ? (s.deep ? 'deep' : 'typing') : 'idle';
        set('state', state);
        set('hp', s.headphones ? '1' : '0');
        set('stress', s.cards >= 3 ? '1' : '0');
        // Coffee steam fades as your focus drops.
        const steam = Math.round((0.15 + 0.85 * (s.flow / 100)) * 20) / 20;
        if (steam !== lastSteam) {
          lastSteam = steam;
          svg.style.setProperty('--steam', String(steam));
        }
      },

      // A message lands: the desk phone buzzes.
      ping() {
        restart(phone, 'buzz');
        restart(ping, 'show');
      },

      // A colleague who owed you a favour walks over to take something off your plate.
      helper(name) {
        helperBody.innerHTML = person(looks(name), 444, 24, 1);
        helper.classList.add('here');
        clearTimeout(helperTimer);
        helperTimer = setTimeout(() => helper.classList.remove('here'), 1900);
      },

      // An office event: the alarm goes off, the Wi-Fi dies, lunch lands, or the boss walks past.
      event(id, bossName) {
        if (id === 'walkby') bossBody.innerHTML = person(looks(bossName || 'Boss'), 100, 18, 0.9);
        set('event', id);
      },
      clearEvent() { svg.removeAttribute('data-event'); },

      // Desk objects unlocked by achievements (awards.js). Cosmetic only: they never touch the rules.
      setProps(props) {
        const on = new Set(props || []);
        svg.querySelectorAll('.prop').forEach((el) => {
          const id = [...el.classList].find((c) => c.indexOf('prop-') === 0);
          el.classList.toggle('on', on.has(id.slice(5)));
        });
      },
      celebrate() { burst(container, 34); },

      reset() {
        set('state', 'idle');
        set('stress', '0');
        set('hp', '0');
        svg.removeAttribute('data-event');
        helper.classList.remove('here');
        lastMinute = -1;
      }
    };
  }

  return { avatar, portrait, looks, isPerson, create, burst };
});
