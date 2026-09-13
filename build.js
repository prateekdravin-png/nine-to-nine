// build.js — assemble the folder that gets deployed. Usage: npm run build
//
// The repository holds more than the game: a server, simulated players, a balance report and the tests.
// None of that belongs on a public host, so the build copies only what the browser actually loads into
// dist/ and a host is pointed at that.
//
// The list of files is not written here twice. sw.js already has to name every file the game needs,
// because that is what it caches for offline play, so that list IS the manifest and this reads it. If
// the two ever drift, the game breaks offline in a way that is painful to notice; this way they cannot.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'dist');

// Everything sw.js caches, plus the worker itself (which it would never cache).
function shipped() {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const list = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  if (!list) throw new Error('sw.js no longer has a SHELL list to read');
  const files = list[1]
    .split(',')
    .map((line) => line.trim().replace(/^['"]|['"]$/g, ''))
    .filter((name) => name && name !== './');
  // Plus the worker itself, which it would never cache, and the host's cache rules.
  return [...new Set(files.concat(['sw.js', '_headers']))];
}

function build() {
  const files = shipped();
  const missing = files.filter((name) => !fs.existsSync(path.join(ROOT, name)));
  if (missing.length) throw new Error(`sw.js caches files that do not exist: ${missing.join(', ')}`);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of files) {
    fs.mkdirSync(path.dirname(path.join(OUT, name)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, name), path.join(OUT, name));
  }

  const bytes = files.reduce((sum, name) => sum + fs.statSync(path.join(OUT, name)).size, 0);
  console.log(`dist/  ${files.length} files, ${(bytes / 1024).toFixed(0)} KB`);
  for (const name of files) console.log(`  ${name}`);
  console.log('\nPoint a static host at dist/. The one thing it does not include is the stats endpoint,');
  console.log('which needs a server; without it the game posts into the void and plays on regardless.');
}

if (require.main === module) build();

module.exports = { shipped, build };
