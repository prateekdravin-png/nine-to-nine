// Three lists name the files the game is made of, and they have to agree:
//
//   sw.js SHELL      what is cached for offline play, and what npm run build copies to the host
//   server.js PUBLIC what the local server will hand out (an allowlist, so the rest of the folder stays private)
//   index.html       what the page actually loads
//
// When they drift nothing fails loudly. A new module left out of PUBLIC 404s on localhost only, the global
// it defines is undefined, and the start screen throws while the hosted copy works fine, which is how
// rewards.js was first caught. So they are checked against each other here.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { shipped } = require('../build');

const ROOT = path.join(__dirname, '..');
const source = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

// Files only the host needs, never the page.
const HOST_ONLY = new Set(['_headers']);

function servedLocally() {
  const block = source('server.js').match(/const PUBLIC = \{([\s\S]*?)\};/);
  assert.ok(block, 'server.js no longer declares a PUBLIC allowlist');
  return [...block[1].matchAll(/'\/([^']+)'\s*:/g)].map((m) => m[1]);
}

test('the local server hands out every file the build ships, and nothing else', () => {
  const build = shipped().filter((f) => !HOST_ONLY.has(f)).sort();
  const local = servedLocally().sort();
  assert.deepStrictEqual(local.filter((f) => build.indexOf(f) === -1), [], 'server.js serves files the build does not ship');
  assert.deepStrictEqual(build.filter((f) => local.indexOf(f) === -1), [], 'server.js is missing files the build ships, so they 404 on localhost');
});

test('every script the page loads is shipped and cached', () => {
  const scripts = [...source('index.html').matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scripts.length > 5, 'expected the page to load its modules as script tags');
  const build = shipped();
  for (const script of scripts) assert.ok(build.indexOf(script) !== -1, `index.html loads ${script}, but sw.js does not cache it and the build will not ship it`);
});
