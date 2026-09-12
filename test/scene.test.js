// Run with: npm test
// The illustrated office's portraits: people get a face, systems keep an icon, each person always looks
// the same, and nothing from a message can reach the page as markup. (The animated scene itself needs a
// browser; its pure helpers are checked here.)
const test = require('node:test');
const assert = require('node:assert/strict');
const Scene = require('../scene');
const { ROLES, ROLE_ORDER, LEVEL_ORDER } = require('../content');

const everySender = () => {
  const senders = new Map();
  for (const role of ROLE_ORDER) {
    for (const level of LEVEL_ORDER) {
      for (const list of Object.values(ROLES[role].byLevel[level])) {
        for (const m of list) senders.set(`${m.from}|${m.avatar}`, m);
      }
    }
  }
  return [...senders.values()];
};

test('people get a drawn portrait; bots, teams and apps keep an icon tile', () => {
  assert.match(Scene.avatar('Priya · Tech Lead', '👩‍💻'), /class="portrait"/);
  assert.match(Scene.avatar('Neha · QA', '🧪'), /class="portrait"/, 'a named colleague is a person whatever their icon');
  assert.match(Scene.avatar('Mom', '👩'), /class="portrait"/);
  assert.equal(Scene.avatar('Jenkins', '🤖'), '<span class="avatar-tile">🤖</span>');
  assert.equal(Scene.avatar('Family Group', '👨‍👩‍👧'), '<span class="avatar-tile">👨‍👩‍👧</span>', 'a group chat is not one person');
});

test('the same person always looks the same, whatever their job title', () => {
  assert.equal(Scene.avatar('Ramesh · Manager', '👨‍💼'), Scene.avatar('Ramesh · Peer Manager', '👨‍💼'));
  assert.deepEqual(Scene.looks('Kiran'), Scene.looks('Kiran'));
});

test('the cast looks varied', () => {
  const people = new Set(everySender().filter((m) => Scene.isPerson(m.from, m.avatar)).map((m) => m.from.split(' · ')[0].trim()));
  const faces = new Set([...people].map((name) => Scene.portrait(name)));
  assert.ok(people.size >= 20, `expected a sizeable cast (${people.size} people)`);
  assert.ok(faces.size >= people.size * 0.9, `${faces.size} different faces for ${people.size} people`);
  const styles = new Set([...people].map((name) => Scene.looks(name).style));
  assert.ok(styles.size >= 5, `hairstyles should vary (${[...styles].join(', ')})`);
});

test('message text never reaches the page as markup', () => {
  for (const out of [Scene.avatar('<img src=x onerror=alert(1)>', '<script>'), Scene.avatar('Eve · <b>boss</b>', '🤖')]) {
    assert.doesNotMatch(out, /<img|<script|<b>/);
  }
});

test('every sender in the game renders', () => {
  for (const m of everySender()) {
    const out = Scene.avatar(m.from, m.avatar);
    assert.ok(out.startsWith('<svg class="portrait"') || out.startsWith('<span class="avatar-tile">'), m.from);
    assert.doesNotMatch(out, /undefined/, m.from);
  }
});
