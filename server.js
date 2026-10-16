'use strict';
// Critter Cafe Heist - game server (one lobby, one room, real-time).
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebSocketServer } = require('ws');
const R = require('./public/room.js');
const { makeClues } = require('./clues.js');

const PORT = process.env.PORT || 3000;
const VERSION = require('./package.json').version;
const PUB = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); } catch (e) { urlPath = '/'; }
  if (urlPath === '/') urlPath = '/index.html';
  if (urlPath === '/version') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ version: VERSION }));
  }
  const file = path.join(PUB, urlPath);
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end('Nope'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });

// ---------- helpers ----------
const AVATARS = ['🐭', '🐹', '🐰', '🦊', '🐼', '🐨', '🐸', '🐵', '🐧', '🦝', '🐻', '🐯'];
const TYPES = ['clue', 'map', 'lookout'];
const cupboards = R.solids.filter(s => s.kind === 'cupboard');
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const r2 = n => Math.round(n * 100) / 100;
const cleanName = s => String(s || '').replace(/[<>]/g, '').trim().slice(0, 14) || 'Critter';

// ---------- lobby / players ----------
const players = new Map(); // id -> {id,name,avatar,ws,connected,lostAt}
let phase = 'lobby'; // lobby | playing | ended
let game = null;
let lastEnd = null;
let roundNo = 0;
let rotation = Math.floor(Math.random() * 100);

const send = (p, m) => { if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(m)); };
const sendAll = m => {
  const s = JSON.stringify(m);
  for (const p of players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(s);
};
const hostId = () => { for (const p of players.values()) if (p.connected) return p.id; return null; };

function broadcastLobby() {
  const list = [...players.values()].map(p => ({ id: p.id, name: p.name, avatar: p.avatar, connected: p.connected }));
  const h = hostId();
  for (const p of players.values()) send(p, { t: 'lobby', phase, players: list, hostId: h, you: p.id, round: roundNo });
}

// ---------- roles & clues ----------
function assign(order, rot, clues) {
  const n = order.length;
  const ri = rot % n;
  const runner = order[ri];
  const adv = [];
  for (let i = 1; i < n; i++) adv.push(order[(ri + i) % n]);

  const types = new Map();
  if (n === 1) types.set(runner.id, ['clue', 'map', 'lookout']); // solo test mode
  else if (adv.length === 1) types.set(adv[0].id, ['clue', 'map', 'lookout']);
  else if (adv.length === 2) { types.set(adv[0].id, ['clue']); types.set(adv[1].id, ['map', 'lookout']); }
  else adv.forEach((p, i) => types.set(p.id, [TYPES[i % 3]]));

  const holders = { clue: [], map: [], lookout: [] };
  for (const p of order) for (const t of (types.get(p.id) || [])) holders[t].push(p.id);

  const labelable = R.solids.filter(s => s.kind !== 'cupboard').map(s => s.id);
  const roles = new Map();
  for (const p of order) {
    const role = { isRunner: p.id === runner.id, advisors: [] };
    for (const t of (types.get(p.id) || [])) {
      const k = holders[t].length;
      const j = holders[t].indexOf(p.id);
      const parts = Math.min(k, 3);
      const part = j % parts;
      if (t === 'clue') {
        // clues are split between Clue Keepers (never more parts than there are clues)
        const cp = Math.min(k, clues.length);
        const cpart = j % cp;
        let st = clues.filter((_, i) => i % cp === cpart);
        if (!st.length) st = [clues[cpart % clues.length]];
        role.advisors.push({ type: 'clue', parts: cp, part: cpart, statements: st });
      } else if (t === 'map') {
        role.advisors.push({ type: 'map', parts, part, labelIds: labelable.filter((_, i) => i % parts === part) });
      } else {
        const showRoute = k === 1 || j % 2 === 0;
        const showLive = k === 1 || j % 2 === 1;
        role.advisors.push({ type: 'lookout', showRoute, showLive, route: showRoute ? R.route : null });
      }
    }
    roles.set(p.id, role);
  }
  return { runnerId: runner.id, roles };
}

// ---------- game ----------
function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
function blocked(x, y, h) {
  if (x - h < 1 || x + h > R.W - 1 || y - h < 1 || y + h > R.H - 1) return true;
  for (const s of R.solids) {
    if (x + h > s.x && x - h < s.x + s.w && y + h > s.y && y - h < s.y + s.h) return true;
  }
  return false;
}
function losClear(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(d / 0.15));
  for (let i = 1; i < steps; i++) {
    const x = x0 + (x1 - x0) * i / steps;
    const y = y0 + (y1 - y0) * i / steps;
    for (const s of R.solids) if (inRect(x, y, s)) return false;
  }
  return true;
}
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

function startGame() {
  const order = [...players.values()].filter(p => p.connected);
  if (!order.length) return;
  roundNo++;
  const truth = pick(cupboards).id;
  const clues = makeClues(R, truth);
  const { runnerId, roles } = assign(order, rotation++, clues);
  const idx = Math.floor(Math.random() * R.route.length);
  const next = (idx + 1) % R.route.length;
  const base = Math.atan2(R.route[next].y - R.route[idx].y, R.route[next].x - R.route[idx].x);
  game = {
    truth, runnerId, roles,
    team: order.map(p => ({
      id: p.id, name: p.name, avatar: p.avatar,
      isRunner: p.id === runnerId,
      types: (roles.get(p.id).advisors || []).map(a => a.type)
    })),
    runner: { x: R.start.x, y: R.start.y },
    input: { dx: 0, dy: 0 },
    guard: { x: R.route[idx].x, y: R.route[idx].y, next, pause: 1.5, scanT: 0, base, ang: base, alert: 0 },
    alarm: 0, timeLeft: R.timeLimit,
    op: {}, cro: false, seen: false, hid: false,
    doorCool: 0, runnerLostAt: 0
  };
  phase = 'playing';
  lastEnd = null;
  broadcastLobby();
  for (const p of players.values()) if (p.connected) sendStart(p);
}

function sendStart(p) {
  if (!game) return;
  const role = game.roles.get(p.id) || { spectator: true, isRunner: false, advisors: [] };
  const rp = players.get(game.runnerId);
  send(p, {
    t: 'start', round: roundNo, title: R.title, timeLimit: R.timeLimit,
    runner: { id: game.runnerId, name: rp ? rp.name : '?', avatar: rp ? rp.avatar : '🐭' },
    role, team: game.team
  });
}

function toast(text) { sendAll({ t: 'toast', text }); }

function endGame(reason) {
  if (phase !== 'playing') return;
  phase = 'ended';
  const rp = players.get(game.runnerId);
  lastEnd = {
    t: 'end', reason, win: reason === 'win',
    tl: Math.max(0, Math.round(game.timeLeft)), alarm: Math.round(game.alarm),
    runnerName: rp ? rp.name : 'The Runner'
  };
  sendAll(lastEnd);
  broadcastLobby();
}

function doInteract() {
  const r = game.runner;
  let best = null, bd = 1e9;
  for (const s of cupboards) {
    const d = Math.hypot(r.x - (s.x + s.w / 2), r.y - (s.y + s.h / 2));
    if (d < bd) { bd = d; best = s; }
  }
  if (!best || bd > R.interactRange) return;
  if (game.op[best.id]) { toast('You already checked that one 👍'); return; }
  if (best.id === game.truth) {
    game.op[best.id] = 'croissant';
    game.cro = true;
    toast('🥐 Got the golden croissant! Sneak to the EXIT door!');
  } else {
    game.op[best.id] = 'empty';
    game.alarm = Math.min(100, game.alarm + R.wrongPenalty);
    game.guard.alert = R.alertSeconds;
    toast(`😿 The ${best.name.toLowerCase()} cupboard is empty! Noise: +${R.wrongPenalty} alarm and the guard is on ALERT!`);
  }
}

function update(dt) {
  const g = game;
  // runner movement
  const { dx, dy } = g.input;
  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    const step = R.runner.speed * dt / len;
    const h = R.runner.half;
    let nx = g.runner.x + dx * step;
    if (!blocked(nx, g.runner.y, h)) g.runner.x = nx;
    let ny = g.runner.y + dy * step;
    if (!blocked(g.runner.x, ny, h)) g.runner.y = ny;
  }
  // guard patrol
  const gd = g.guard;
  const alert = gd.alert > 0;
  if (alert) gd.alert = Math.max(0, gd.alert - dt);
  if (gd.pause > 0) {
    // on alert the guard barely stops and scans faster
    const k = alert ? 4 : 1;
    gd.pause -= dt * k; gd.scanT += dt * k;
    if (gd.pause < 0) gd.pause = 0;
  } else {
    const tg = R.route[gd.next];
    const ddx = tg.x - gd.x, ddy = tg.y - gd.y;
    const d = Math.hypot(ddx, ddy);
    const step = R.guard.speed * (alert ? R.alertSpeed : 1) * dt;
    if (d <= step) {
      gd.x = tg.x; gd.y = tg.y; gd.pause = tg.pause; gd.scanT = 0;
      gd.next = (gd.next + 1) % R.route.length;
      const nt = R.route[gd.next];
      gd.base = Math.atan2(nt.y - gd.y, nt.x - gd.x);
    } else {
      gd.x += ddx / d * step; gd.y += ddy / d * step;
      gd.base = Math.atan2(ddy, ddx);
    }
  }
  gd.ang = gd.base + (gd.pause > 0 ? Math.sin(gd.scanT * 2.2) * 0.7 : 0);

  // vision
  const rx = g.runner.x, ry = g.runner.y;
  g.hid = R.boxes.some(b => inRect(rx, ry, b));
  let seen = false;
  const d = Math.hypot(rx - gd.x, ry - gd.y);
  const range = R.guard.range + (alert ? R.alertRangeBonus : 0);
  if (!g.hid && d <= range) {
    const inCone = d < 0.9 || Math.abs(angDiff(Math.atan2(ry - gd.y, rx - gd.x), gd.ang)) <= R.guard.half;
    if (inCone && losClear(gd.x, gd.y, rx, ry)) seen = true;
  }
  g.seen = seen;
  g.alarm = seen ? g.alarm + 30 * dt : Math.max(0, g.alarm - 2 * dt);
  g.timeLeft -= dt;
  g.doorCool = Math.max(0, g.doorCool - dt);

  // exit
  if (inRect(rx, ry, R.exit)) {
    if (g.cro) return endGame('win');
    if (g.doorCool === 0) { g.doorCool = 3; toast('🔒 The door is locked. Find the golden croissant first!'); }
  }
  if (g.alarm >= 100) { g.alarm = 100; return endGame('alarm'); }
  if (g.timeLeft <= 0) { g.timeLeft = 0; return endGame('time'); }

  sendAll({
    t: 's', rx: r2(rx), ry: r2(ry), gx: r2(gd.x), gy: r2(gd.y), ga: r2(gd.ang),
    al: r2(g.alarm), tl: r2(g.timeLeft), seen: g.seen ? 1 : 0, hid: g.hid ? 1 : 0,
    cro: g.cro ? 1 : 0, ag: alert ? 1 : 0, op: g.op
  });
}

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (phase === 'playing' && game) {
    const rp = players.get(game.runnerId);
    if (rp && !rp.connected) {
      if (!game.runnerLostAt) game.runnerLostAt = now;
      if (now - game.runnerLostAt > 15000) endGame('left');
    } else game.runnerLostAt = 0;
    if (phase === 'playing') update(dt);
  }
}, 50);

// remove people who left the lobby for a while
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const p of [...players.values()]) {
    if (!p.connected && now - p.lostAt > 60000 && phase !== 'playing') { players.delete(p.id); changed = true; }
  }
  if (changed) broadcastLobby();
}, 5000);

// ---------- connections ----------
wss.on('connection', ws => {
  let me = null;
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (m.t === 'join') {
      const id = String(m.id || '').slice(0, 40);
      if (!id) return;
      const name = cleanName(m.name);
      const avatar = AVATARS.includes(m.avatar) ? m.avatar : AVATARS[0];
      let p = players.get(id);
      if (p) {
        if (p.ws && p.ws !== ws) { try { p.ws.close(); } catch (e) {} }
        p.ws = ws; p.connected = true; p.name = name; p.avatar = avatar;
      } else {
        p = { id, name, avatar, ws, connected: true, lostAt: 0 };
        players.set(id, p);
      }
      me = p;
      broadcastLobby();
      if (game && (phase === 'playing' || phase === 'ended')) {
        sendStart(p);
        if (phase === 'ended' && lastEnd) send(p, lastEnd);
      }
      return;
    }
    if (!me) return;
    const isHost = hostId() === me.id;
    switch (m.t) {
      case 'start': if (isHost && phase === 'lobby') startGame(); break;
      case 'again': if (isHost && phase === 'ended') startGame(); break;
      case 'lobby':
        if (isHost && phase === 'ended') { phase = 'lobby'; game = null; lastEnd = null; broadcastLobby(); }
        break;
      case 'input':
        if (phase === 'playing' && game && me.id === game.runnerId) {
          const c = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
          game.input = { dx: c(+m.dx), dy: c(+m.dy) };
        }
        break;
      case 'interact':
        if (phase === 'playing' && game && me.id === game.runnerId) doInteract();
        break;
    }
  });
  ws.on('close', () => {
    if (me && me.ws === ws) {
      me.connected = false; me.ws = null; me.lostAt = Date.now();
      if (game && game.runnerId === me.id) game.input = { dx: 0, dy: 0 };
      broadcastLobby();
    }
  });
  ws.on('error', () => {});
});

server.listen(PORT, () => {
  console.log('\n🐭🥐  Critter Cafe Heist v' + VERSION + ' is running!\n');
  console.log(`   On this laptop:   http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`   Same network:     http://${i.address}:${PORT}`);
  }
  console.log('\n   For teammates who are not on your network, see README.md (one-line tunnel command).\n');
});

