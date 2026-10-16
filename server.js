'use strict';
// Critter Cafe Heist - game server (one lobby, one room, real-time).
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebSocketServer } = require('ws');
let R = require('./public/room.js'); // the room of the current round (replaced at every round start)
const Rooms = require('./rooms/index.js');
const { makeClues } = require('./clues.js');
const { makeDoor } = require('./door.js');
const DEBUG = !!process.env.CCH_DEBUG; // test mode: guard is blind, teleport + code peek allowed

const PORT = process.env.PORT || 3000;
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
let cupboards = [];
let lastRoom = null; // {key, index} of the previous round, so the same layout never comes twice in a row
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
// 1 player: solo test. 2-3 players: one Runner, the rest share the specialist jobs.
// 4+ players: roles cycle Runner, Clue Keeper, Mapper, Lookout, Runner, Clue Keeper, ...
// so the 5th player is a second Runner, the 9th a third, and so on.
function assign(order, rot, clues, decoder) {
  const n = order.length;
  const ri = rot % n;
  const ring = [];
  for (let i = 0; i < n; i++) ring.push(order[(ri + i) % n]);

  const runners = [];
  const types = new Map();
  if (n <= 3) {
    runners.push(ring[0]);
    const adv = ring.slice(1);
    if (n === 1) types.set(ring[0].id, ['clue', 'map', 'lookout']); // solo test mode
    else if (adv.length === 1) types.set(adv[0].id, ['clue', 'map', 'lookout']);
    else { types.set(adv[0].id, ['clue']); types.set(adv[1].id, ['map', 'lookout']); }
  } else {
    ring.forEach((p, i) => {
      const slot = i % 4;
      if (slot === 0) runners.push(p);
      else types.set(p.id, [TYPES[slot - 1]]);
    });
  }
  const runnerIds = runners.map(p => p.id);

  const holders = { clue: [], map: [], lookout: [] };
  for (const p of order) for (const t of (types.get(p.id) || [])) holders[t].push(p.id);

  const labelable = R.solids.filter(s => s.kind !== 'cupboard').map(s => s.id);
  const roles = new Map();
  for (const p of order) {
    const ridx = runnerIds.indexOf(p.id);
    const role = { isRunner: ridx >= 0, runnerIndex: ridx, advisors: [] };
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
        // the door-code decoder card is split between Clue Keepers too
        const dp = Math.min(k, 3);
        const dpart = j % dp;
        const dec = decoder.filter((_, i) => i % dp === dpart);
        role.advisors.push({ type: 'clue', parts: cp, part: cpart, statements: st, decoder: dec, decParts: dp, decPart: dpart });
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
  return { runnerIds, roles };
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
  // a random room + layout for every round
  if (DEBUG && process.env.CCH_ROOM) { const [k, i] = process.env.CCH_ROOM.split(':'); R = Rooms.getRoom(k, +i); } // test mode: force a layout
  else R = Rooms.pickRoom(lastRoom);
  lastRoom = { key: R.id, index: R.layoutIndex };
  cupboards = R.solids.filter(s => s.kind === 'cupboard');
  let truth = null, clues = null;
  for (const c of shuffle(cupboards)) { clues = makeClues(R, c.id); if (clues) { truth = c.id; break; } }
  if (!clues) { truth = pick(cupboards).id; clues = ['It is NOT the ' + cupboards.find(c => c.id !== truth).name.toLowerCase() + ' ' + R.noun + '.']; }
  const door = makeDoor();
  const { runnerIds, roles } = assign(order, rotation++, clues, door.decoder);
  const idx = Rooms.spawnWaypoint(R).index; // start the patrol as far from the runners as possible
  const next = (idx + 1) % R.route.length;
  const base = Math.atan2(R.route[next].y - R.route[idx].y, R.route[next].x - R.route[idx].x);
  const gx = R.route[idx].x, gy = R.route[idx].y;
  game = {
    truth, runnerIds, roles, door,
    code: door.code,
    notes: [null, null, null], // symbols the runners have read so far
    unlocked: false,
    carrier: -1,               // index of the runner holding the croissant
    keyCool: 0,
    team: order.map(p => ({
      id: p.id, name: p.name, avatar: p.avatar,
      isRunner: runnerIds.includes(p.id),
      types: (roles.get(p.id).advisors || []).map(a => a.type)
    })),
    runners: runnerIds.map((id, i) => {
      const st = R.starts[i % R.starts.length];
      return { id, x: st.x, y: st.y, input: { dx: 0, dy: 0 }, hid: false, seen: false, out: false, lostAt: 0 };
    }),
    guard: { x: gx, y: gy, next, pause: 1.5, scanT: 0, base, ang: base, alert: 0 },
    alarm: 0,
    timeLimit: R.timeLimit + R.extraRunnerTime * (runnerIds.length - 1),
    op: {}, cro: false,
    doorCool: 0,
    ping: { n: 1, x: gx, y: gy, t: 0 }
  };
  game.timeLeft = game.timeLimit;
  phase = 'playing';
  lastEnd = null;
  broadcastLobby();
  for (const p of players.values()) if (p.connected) sendStart(p);
}

function sendStart(p) {
  if (!game) return;
  const role = game.roles.get(p.id) || { spectator: true, isRunner: false, advisors: [] };
  const msg = {
    t: 'start', round: roundNo, title: R.title, room: R, timeLimit: game.timeLimit,
    runners: game.runnerIds.map(id => {
      const rp = players.get(id);
      return { id, name: rp ? rp.name : '?', avatar: rp ? rp.avatar : '🐭' };
    }),
    role, team: game.team
  };
  if (DEBUG) msg.debug = { code: game.code, truth: game.truth, decoder: game.door.decoder, noteSyms: game.door.noteSyms };
  send(p, msg);
}

function toast(text) { sendAll({ t: 'toast', text }); }

const runnerName = rn => { const p = players.get(rn.id); return p ? p.name : 'A Runner'; };
const runnerOf = id => game && game.runners.find(r => r.id === id);

function endGame(reason, who) {
  if (phase !== 'playing') return;
  phase = 'ended';
  const names = game.runners.map(runnerName);
  lastEnd = {
    t: 'end', reason, win: reason === 'win',
    tl: Math.max(0, Math.round(game.timeLeft)), alarm: Math.round(game.alarm),
    runnerName: who || (names.length > 1 ? names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1] : names[0]),
    runnerCount: names.length
  };
  sendAll(lastEnd);
  broadcastLobby();
}

const dist = (x, y, p) => Math.hypot(x - p.x, y - p.y);

function doInteract(rn, ridx) {
  if (rn.out) return;
  const many = game.runners.length > 1;
  const who = many ? runnerName(rn) + ': ' : '';
  // everything within reach: sticky notes, the door keypad, containers. The closest one wins.
  const cands = [];
  R.notes.forEach((n, i) => { const d = dist(rn.x, rn.y, n); if (d <= R.noteRange) cands.push({ k: 'note', i, d }); });
  const kd = dist(rn.x, rn.y, R.keypad);
  if (kd <= R.keypadRange) cands.push({ k: 'pad', d: kd });
  for (const s of cupboards) {
    const d = Math.hypot(rn.x - (s.x + s.w / 2), rn.y - (s.y + s.h / 2));
    if (d <= R.interactRange) cands.push({ k: 'cup', s, d });
  }
  if (!cands.length) return;
  cands.sort((a, b) => a.d - b.d);
  const t = cands[0];

  if (t.k === 'note') {
    const i = t.i;
    if (game.notes[i]) { toast(`📝 Note ${i + 1} is already read: ${game.notes[i]}`); return; }
    game.notes[i] = game.door.noteSyms[i];
    toast(`📝 ${who}Note ${i + 1} says ${game.notes[i]}. What does it mean? Ask the Clue Keeper!`);
    return;
  }
  if (t.k === 'pad') {
    if (game.unlocked) toast('🔓 The door lock is already open.');
    else {
      const p = players.get(rn.id);
      if (p) send(p, { t: 'keypad' });
    }
    return;
  }
  const best = t.s;
  if (game.op[best.id]) { toast('You already checked that one 👍'); return; }
  if (best.id === game.truth) {
    game.op[best.id] = 'croissant';
    game.cro = true;
    game.carrier = ridx;
    toast(`🥐 ${who}Got the golden croissant! Sneak to the EXIT door!`);
  } else {
    game.op[best.id] = 'empty';
    game.alarm = Math.min(100, game.alarm + R.wrongPenalty);
    game.guard.alert = R.alertSeconds;
    toast(`😿 ${who}The ${best.name.toLowerCase()} ${R.noun} is empty! Noise: +${R.wrongPenalty} alarm and the guard is on ALERT!`);
  }
}

function tryCode(rn, raw) {
  if (rn.out || game.unlocked) return;
  const p = players.get(rn.id);
  if (dist(rn.x, rn.y, R.keypad) > R.keypadRange) { toast('You are too far from the keypad.'); return; }
  if (game.keyCool > 0) return;
  const code = String(raw || '').replace(/\D/g, '').slice(0, 3);
  if (code.length < 3) return;
  if (code === game.code) {
    game.unlocked = true;
    toast('🔓 Click! The door lock opens.' + (game.cro ? ' Now get out!' : ' Now find the golden croissant!'));
    if (p) send(p, { t: 'keypad', result: 'ok' });
  } else {
    game.keyCool = R.keypadCooldown;
    game.alarm = Math.min(100, game.alarm + R.badCodePenalty);
    game.guard.alert = Math.max(game.guard.alert, R.alertSeconds / 2);
    toast(`🔢 Wrong code! The keypad buzzes loudly: +${R.badCodePenalty} alarm.`);
    if (p) send(p, { t: 'keypad', result: 'bad' });
  }
}

function update(dt) {
  const g = game;
  // runner movement
  for (const rn of g.runners) {
    if (rn.out) continue;
    const { dx, dy } = rn.input;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      const step = R.runner.speed * dt / len;
      const h = R.runner.half;
      const nx = rn.x + dx * step;
      if (!blocked(nx, rn.y, h)) rn.x = nx;
      const ny = rn.y + dy * step;
      if (!blocked(rn.x, ny, h)) rn.y = ny;
    }
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

  // vision: every runner who is still in the room can be seen
  let seenCount = 0;
  const range = R.guard.range + (alert ? R.alertRangeBonus : 0);
  for (const rn of g.runners) {
    rn.seen = false;
    if (rn.out) { rn.hid = false; continue; }
    rn.hid = R.boxes.some(b => inRect(rn.x, rn.y, b));
    const d = Math.hypot(rn.x - gd.x, rn.y - gd.y);
    if (!DEBUG && !rn.hid && d <= range) {
      const inCone = d < 0.9 || Math.abs(angDiff(Math.atan2(rn.y - gd.y, rn.x - gd.x), gd.ang)) <= R.guard.half;
      if (inCone && losClear(gd.x, gd.y, rn.x, rn.y)) rn.seen = true;
    }
    if (rn.seen) seenCount++;
  }
  if (seenCount) g.alarm += (R.seenRate + R.extraSeenRate * (seenCount - 1)) * dt;
  else g.alarm = Math.max(0, g.alarm - 2 * dt);
  g.timeLeft -= dt;
  g.doorCool = Math.max(0, g.doorCool - dt);
  g.keyCool = Math.max(0, g.keyCool - dt);

  // radar blip for the Lookout: a fuzzy copy of the guard's position, refreshed every few seconds
  g.ping.t += dt;
  if (g.ping.t >= R.radar.every) {
    g.ping.t = 0; g.ping.n++;
    const j = R.radar.jitter;
    g.ping.x = Math.max(1, Math.min(R.W - 1, gd.x + (Math.random() * 2 - 1) * j));
    g.ping.y = Math.max(1, Math.min(R.H - 1, gd.y + (Math.random() * 2 - 1) * j));
  }

  // exit: needs the door code AND the croissant. The round is won when every runner is out.
  for (const rn of g.runners) {
    if (rn.out || !inRect(rn.x, rn.y, R.exit)) continue;
    if (!g.unlocked) {
      if (g.doorCool === 0) { g.doorCool = 3; toast('🔢 The door has a keypad lock! Find the code: stand near the door and press Space / E.'); }
    } else if (!g.cro) {
      if (g.doorCool === 0) { g.doorCool = 3; toast('🔓 The door is unlocked, but you still need the golden croissant first!'); }
    } else {
      rn.out = true; rn.input = { dx: 0, dy: 0 };
      const left = g.runners.filter(r => !r.out).length;
      if (left) toast(`🚪 ${runnerName(rn)} made it out! ${left} runner${left > 1 ? 's' : ''} still inside.`);
    }
  }
  if (g.runners.every(r => r.out)) return endGame('win');
  if (g.alarm >= 100) { g.alarm = 100; return endGame('alarm'); }
  if (g.timeLeft <= 0) { g.timeLeft = 0; return endGame('time'); }

  sendAll({
    t: 's',
    rs: g.runners.map(rn => ({ x: r2(rn.x), y: r2(rn.y), h: rn.hid ? 1 : 0, s: rn.seen ? 1 : 0, o: rn.out ? 1 : 0 })),
    gx: r2(gd.x), gy: r2(gd.y),
    pn: g.ping.n, px: r2(g.ping.x), py: r2(g.ping.y),
    al: r2(g.alarm), tl: r2(g.timeLeft), seen: seenCount ? 1 : 0,
    cro: g.cro ? 1 : 0, car: g.carrier, ag: alert ? 1 : 0, op: g.op,
    nt: g.notes, ul: g.unlocked ? 1 : 0
  });
}

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (phase === 'playing' && game) {
    for (const rn of game.runners) {
      const rp = players.get(rn.id);
      if (!rn.out && rp && !rp.connected) {
        if (!rn.lostAt) rn.lostAt = now;
        if (now - rn.lostAt > 15000) { endGame('left', runnerName(rn)); break; }
      } else rn.lostAt = 0;
    }
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
        if (phase === 'playing' && game) {
          const rn = runnerOf(me.id);
          if (rn && !rn.out) {
            const c = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
            rn.input = { dx: c(+m.dx), dy: c(+m.dy) };
          }
        }
        break;
      case 'interact':
        if (phase === 'playing' && game) {
          const rn = runnerOf(me.id);
          if (rn) doInteract(rn, game.runners.indexOf(rn));
        }
        break;
      case 'code':
        if (phase === 'playing' && game) {
          const rn = runnerOf(me.id);
          if (rn) tryCode(rn, m.code);
        }
        break;
      case 'tp': // test mode only
        if (DEBUG && phase === 'playing' && game) {
          const rn = runnerOf(me.id);
          if (rn && !blocked(+m.x, +m.y, R.runner.half)) { rn.x = +m.x; rn.y = +m.y; }
        }
        break;
    }
  });
  ws.on('close', () => {
    if (me && me.ws === ws) {
      me.connected = false; me.ws = null; me.lostAt = Date.now();
      const rn = runnerOf(me.id); if (rn) rn.input = { dx: 0, dy: 0 };
      broadcastLobby();
    }
  });
  ws.on('error', () => {});
});

// make sure every room layout is fair (reachable, clear guard route, solvable clues)
{
  let bad = 0;
  for (const r of Rooms.LIST) {
    const problems = Rooms.validateRoom(Rooms.getRoom(r.key, r.index), makeClues);
    problems.forEach(p => { console.warn('ROOM PROBLEM: ' + p); bad++; });
  }
  if (!bad) console.log(`Rooms OK: ${Rooms.LIST.length} layouts checked`);
}

server.listen(PORT, () => {
  console.log('\n🐭🥐  Critter Cafe Heist is running!\n');
  console.log(`   On this laptop:   http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`   Same network:     http://${i.address}:${PORT}`);
  }
  console.log('\n   For teammates who are not on your network, see README.md (one-line tunnel command).\n');
});

