// server.js — zero-dependency server for the prototype. Usage: npm start
//
// It serves only the files the game needs (an allowlist), never the rest of the folder, plus one small
// endpoint that records anonymous daily-morning plays (see recordEvent). There are no tokens, accounts
// or personal data anywhere in this project, so it listens on all interfaces by default: the game is
// designed mobile-first, and playtesting it on a phone over your Wi-Fi is part of the point. Set
// HOST=127.0.0.1 to keep it on this machine only.
const http = require('http');
const fs = require('fs');
const path = require('path');
const Daily = require('./daily');
const { ROLES, LEVELS } = require('./content');
const { RATINGS, TUNING } = require('./core');
const { EVENTS_FILE } = require('./stats');

const PORT = Number(process.env.PORT) || 8910;
const HOST = process.env.HOST || '0.0.0.0';

const PUBLIC = {
  '/index.html': 'text/html; charset=utf-8',
  '/style.css': 'text/css; charset=utf-8',
  '/content.js': 'text/javascript; charset=utf-8',
  '/core.js': 'text/javascript; charset=utf-8',
  '/daily.js': 'text/javascript; charset=utf-8',
  '/persona.js': 'text/javascript; charset=utf-8',
  '/scene.js': 'text/javascript; charset=utf-8',
  '/game.js': 'text/javascript; charset=utf-8'
};

const MAX_BODY_BYTES = 1024;
const MAX_EVENTS_BYTES = 5 * 1024 * 1024; // a few colleagues for months is well under this
const has = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);

// What gets stored, and nothing more: a random player ID made by the browser, the morning number, and
// for a finished morning the role, career level, rating, score and seconds of deep work. No names, IP
// addresses or browser details. Anything malformed is rejected rather than cleaned up.
function cleanEvent(body) {
  let e;
  try { e = JSON.parse(body); } catch (err) { return null; }
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  if (typeof e.player !== 'string' || !/^[0-9a-f]{16}$/.test(e.player)) return null;
  const today = Daily.morningNumber(Date.now());
  if (!Number.isInteger(e.day) || e.day < 1 || e.day > today + 1) return null; // +1 allows for clock skew
  const event = { ts: new Date().toISOString(), player: e.player, kind: e.kind, day: e.day };
  if (e.kind === 'visit') return event;
  if (e.kind !== 'daily') return null;
  if (!has(ROLES, e.role) || !has(RATINGS, e.rating)) return null;
  if (e.level !== undefined && !has(LEVELS, e.level)) return null; // optional: older pages don't send it
  if (!Number.isInteger(e.score) || e.score < 0 || e.score > 100000) return null;
  if (typeof e.deepWork !== 'number' || !(e.deepWork >= 0 && e.deepWork <= TUNING.DURATION)) return null;
  return Object.assign(event, {
    role: e.role,
    level: e.level || 'junior',
    rating: e.rating,
    score: e.score,
    deepWork: Math.round(e.deepWork * 10) / 10
  });
}

function send(res, status, text, headers) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
  res.end(text);
}

function recordEvent(req, res) {
  if (req.method !== 'POST') return send(res, 405, 'Method not allowed', { Allow: 'POST' });
  // Requiring a JSON content type means a page on some other site can't post here: the browser would
  // need a CORS preflight first, and this server never approves one.
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return send(res, 415, 'Expected JSON');
  let body = '';
  let tooBig = false;
  req.setEncoding('utf8');
  req.on('data', (chunk) => {
    if (tooBig) return;
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) { tooBig = true; body = ''; }
  });
  req.on('end', () => {
    if (tooBig) return send(res, 413, 'Too large');
    const event = cleanEvent(body);
    if (!event) return send(res, 400, 'Invalid event');
    fs.stat(EVENTS_FILE, (statErr, st) => {
      if (st && st.size > MAX_EVENTS_BYTES) return send(res, 507, 'Event log is full');
      fs.mkdir(path.dirname(EVENTS_FILE), { recursive: true }, (mkErr) => {
        if (mkErr) return send(res, 500, 'Could not record');
        fs.appendFile(EVENTS_FILE, JSON.stringify(event) + '\n', (writeErr) => {
          if (writeErr) return send(res, 500, 'Could not record');
          res.writeHead(204, { 'Cache-Control': 'no-store' });
          res.end();
        });
      });
    });
  });
}

function handle(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (e) {
    return send(res, 400, 'Bad request');
  }
  if (urlPath === '/api/event') return recordEvent(req, res);
  if (urlPath === '/') urlPath = '/index.html';
  const type = PUBLIC[urlPath];
  if (!type) return send(res, 404, 'Not found');
  fs.readFile(path.join(__dirname, urlPath), (err, data) => {
    if (err) return send(res, 500, 'Could not read file');
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

if (require.main === module) {
  http.createServer(handle).listen(PORT, HOST, () => {
    console.log(`9 to 9 prototype running on http://localhost:${PORT}/ (listening on ${HOST})`);
  });
}

module.exports = { cleanEvent, handle };
