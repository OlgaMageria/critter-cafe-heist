// Headless test: connects fake players over WebSocket and plays rounds.
// The server is started in test mode (CCH_DEBUG=1): the guard is blind, players may teleport,
// and the start message carries the secret code so we can check the whole door flow.
const WebSocket = require('ws');
let R = require('../public/room.js'); // replaced by the round's room once a game starts
const Rooms = require('../rooms/index.js');
const { makeDoor, decode, SYMBOLS } = require('../door.js');
let URL = '';

function client(name) {
  const c = { name, id: 'id-' + name, last: null, start: null, end: null, toasts: [], keypad: [] };
  c.ws = new WebSocket(URL);
  c.ready = new Promise(res => c.ws.on('open', () => {
    c.ws.send(JSON.stringify({ t: 'join', id: c.id, name, avatar: '🐭' }));
    res();
  }));
  c.ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'start') c.start = m;
    else if (m.t === 'end') c.end = m;
    else if (m.t === 'toast') c.toasts.push(m.text);
    else if (m.t === 's') c.last = m;
    else if (m.t === 'keypad') c.keypad.push(m);
    else if (m.t === 'lobby') c.lobby = m;
  });
  c.send = m => c.ws.send(JSON.stringify(m));
  c.idx = () => c.start.role.runnerIndex;
  c.me = () => c.last.rs[c.idx()];
  return c;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };

const half = R.runner.half;
const isBlocked = (x, y) => x - half < 1 || x + half > R.W - 1 || y - half < 1 || y + half > R.H - 1 ||
  R.solids.some(s => x + half > s.x && x - half < s.x + s.w && y + half > s.y && y - half < s.y + s.h);
const inExit = (x, y) => { const e = R.exit; return x > e.x - 0.3 && x < e.x + e.w + 0.3 && y > e.y - 0.3 && y < e.y + e.h + 0.3; };
const dd = (x, y, p) => Math.hypot(x - p.x, y - p.y);
const cupCenter = s => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });
// a free spot about one tile from a container where that container is the closest thing to interact with
function standAt(c) {
  const cands = [];
  for (let dx = -1.3; dx <= 1.3; dx += 0.1) for (let dy = -1.3; dy <= 1.3; dy += 0.1) {
    const x = c.x + dx, y = c.y + dy, d = Math.hypot(dx, dy);
    if (d < 0.8 || d > 1.3 || isBlocked(x, y) || inExit(x, y)) continue;
    if (R.notes.some(n => dd(x, y, n) <= R.noteRange + 0.05)) continue;
    if (dd(x, y, R.keypad) <= d + 0.1 && dd(x, y, R.keypad) <= R.keypadRange) continue;
    cands.push({ x, y, d });
  }
  cands.sort((a, b) => a.d - b.d);
  return cands[0] || null;
}
// a free spot next to the door keypad (outside the exit mat) where the keypad is the closest thing
function standAtKeypad() {
  let best = null;
  for (let x = 1; x < R.W - 1; x += 0.1) for (let y = 1; y < R.H - 1; y += 0.1) {
    if (isBlocked(x, y) || inExit(x, y)) continue;
    const d = dd(x, y, R.keypad);
    if (d > 1.5 || R.notes.some(n => dd(x, y, n) <= R.noteRange + 0.05)) continue;
    if (R.solids.some(s => s.kind === 'cupboard' && dd(x, y, cupCenter(s)) <= d + 0.1)) continue;
    if (!best || d < best.d) best = { x, y, d };
  }
  return best;
}
// a free spot far from the keypad
function farFromKeypad() {
  for (let x = R.W - 2; x >= 1; x -= 0.5) for (let y = R.H - 2; y >= 1; y -= 0.5) {
    if (!isBlocked(x, y) && dd(x, y, R.keypad) > R.keypadRange + 3) return { x, y };
  }
  return null;
}

async function scenario(n) {
  console.log('\n--- scenario: ' + n + ' players ---');
  const cs = [];
  for (let i = 0; i < n; i++) { const c = client('P' + i); cs.push(c); await c.ready; await sleep(30); }
  await sleep(150);
  ok(cs[0].lobby && cs[0].lobby.players.length === n, 'lobby shows ' + n + ' players');
  cs[0].send({ t: 'start' });
  await sleep(500);
  ok(cs.every(c => c.start), 'everyone got a start message');
  R = cs[0].start.room;
  ok(R && R.solids.length > 6 && R.noun, 'the start message carries the room: ' + R.title + ' / ' + R.layoutName);
  ok(cs.every(c => c.start.room.layoutName === R.layoutName), 'everyone gets the same room');

  // ----- roles -----
  const runners = cs.filter(c => c.start.role.isRunner);
  const expectedRunners = n >= 4 ? Math.ceil(n / 4) : 1;
  ok(runners.length === expectedRunners, runners.length + ' runner(s), expected ' + expectedRunners);
  ok(cs[0].start.runners.length === expectedRunners, 'start message lists every runner');
  ok(new Set(runners.map(c => c.idx())).size === runners.length, 'runner indexes are unique');
  const types = {};
  cs.forEach(c => (c.start.role.advisors || []).forEach(a => { types[a.type] = (types[a.type] || 0) + 1; }));
  if (n >= 2) ok(types.clue >= 1 && types.map >= 1 && types.lookout >= 1, 'every specialist type is covered: ' + JSON.stringify(types));
  if (n >= 4) {
    const cnt = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) cnt[i % 4]++;
    ok(types.clue === cnt[1] && types.map === cnt[2] && types.lookout === cnt[3], 'role cycle Runner/Clue/Map/Lookout is respected');
  }
  const clueHolders = cs.filter(c => (c.start.role.advisors || []).some(a => a.type === 'clue'));
  ok(clueHolders.every(c => c.start.role.advisors.find(a => a.type === 'clue').statements.length >= 1), 'every clue keeper has at least one clue');
  if (clueHolders.length) {
    const syms = new Set();
    clueHolders.forEach(c => c.start.role.advisors.find(a => a.type === 'clue').decoder.forEach(d => syms.add(d.sym)));
    ok(syms.size === SYMBOLS.length, 'decoder cards together cover all ' + SYMBOLS.length + ' symbols');
  }
  if (n > 1) ok(runners.every(c => !c.start.role.advisors.length), 'runners hold no specialist info');
  ok(cs[0].start.timeLimit === R.timeLimit + R.extraRunnerTime * (expectedRunners - 1), 'time limit grows with the number of runners');

  // ----- movement (runner with index 0 starts at the first start spot) -----
  const runner = runners.find(c => c.idx() === 0);
  runner.send({ t: 'input', dx: 1, dy: 0 });
  await sleep(500);
  ok(runner.last && runner.me().x <= R.W - 1 - half + 0.01, 'runner cannot leave the room (x=' + runner.me().x + ')');
  runner.send({ t: 'input', dx: 0, dy: -1 });
  await sleep(1500);
  const { x: rx, y: ry } = runner.me();
  ok(!isBlocked(rx, ry) || ry > R.H - 1, 'runner is not inside furniture at (' + rx + ',' + ry + ')');
  // open a WRONG container: noise + alert
  const dbg0 = cs[0].start.debug;
  const wrongCup = R.solids.find(c => c.kind === 'cupboard' && c.id !== dbg0.truth);
  const spot0 = standAt(cupCenter(wrongCup));
  runner.send({ t: 'input', dx: 0, dy: 0 });
  runner.send({ t: 'tp', x: spot0.x, y: spot0.y });
  await sleep(200);
  const alBefore0 = runner.last.al;
  runner.send({ t: 'interact' });
  await sleep(300);
  ok(runner.toasts.some(t => t.includes('empty') && t.includes(R.noun)), 'wrong ' + R.noun + ' is empty (' + wrongCup.name + ')');
  ok(runner.last.al >= alBefore0 + R.wrongPenalty - 2, 'wrong container adds ' + R.wrongPenalty + ' alarm (alarm=' + runner.last.al + ')');
  ok(runner.last.ag === 1, 'guard goes on alert after a wrong container');
  runner.send({ t: 'input', dx: 0, dy: 0 });
  const other = cs.find(c => !c.start.role.isRunner) || cs.find(c => c !== runner && c.idx() > 0);
  if (other) {
    const before = { ...runner.me() };
    other.send({ t: 'input', dx: -1, dy: 0 });
    await sleep(400);
    ok(Math.abs(runner.me().x - before.x) < 0.05, 'input from a non-runner is ignored');
  }
  if (runners.length > 1) {
    const r2 = runners.find(c => c.idx() === 1);
    const p0 = { ...r2.me() };
    runner.send({ t: 'input', dx: -1, dy: 0 });
    await sleep(300);
    runner.send({ t: 'input', dx: 0, dy: 0 });
    ok(Math.abs(r2.me().x - p0.x) < 0.05 && Math.abs(r2.me().y - p0.y) < 0.05, 'runners move independently');
  }
  ok(runner.last && typeof runner.last.tl === 'number' && runner.last.tl < cs[0].start.timeLimit, 'timer is counting down (' + runner.last.tl + ')');
  ok(typeof runner.last.pn === 'number' && runner.last.px >= 1, 'radar blip data is sent');
  cs[0].send({ t: 'again' });
  await sleep(200);
  ok(!cs.some(c => c.end), 'round is still running');
  cs.forEach(c => c.ws.close());
  await sleep(200);
}

// Full door flow with 2 runners: notes -> keypad -> croissant -> everyone out
async function doorFlow() {
  console.log('\n--- door flow: 5 players, 2 runners ---');
  const cs = [];
  for (let i = 0; i < 5; i++) { const c = client('D' + i); cs.push(c); await c.ready; await sleep(30); }
  await sleep(150);
  cs[0].send({ t: 'start' });
  await sleep(500);
  R = cs[0].start.room;
  const dbg = cs[0].start.debug;
  ok(!!dbg && /^[1-9]{3}$/.test(dbg.code), 'test mode exposes a 3-digit code: ' + (dbg && dbg.code));
  ok(decode(dbg.decoder, dbg.noteSyms) === dbg.code, 'the notes decode to the door code');
  const A = cs.find(c => c.start.role.isRunner && c.idx() === 0);
  const B = cs.find(c => c.start.role.isRunner && c.idx() === 1);
  const clueKeeper = cs.find(c => (c.start.role.advisors || []).some(a => a.type === 'clue'));
  ok(clueKeeper.start.role.advisors[0].decoder.length === SYMBOLS.length, 'single Clue Keeper holds the full decoder card');
  const startPing = A.last.pn;
  const tp = async (c, x, y) => { c.send({ t: 'tp', x, y }); await sleep(150); };

  R.notes.forEach((nt, i) => ok(!isBlocked(nt.x, nt.y), 'note ' + (i + 1) + ' spot is free floor'));

  // read the 3 notes (A reads two, B reads one)
  await tp(A, R.notes[0].x, R.notes[0].y); A.send({ t: 'interact' }); await sleep(200);
  ok(A.last.nt[0] === dbg.noteSyms[0], 'note 1 shows its symbol after reading');
  ok(!A.last.nt[1] && !A.last.nt[2], 'unread notes stay hidden');
  await tp(B, R.notes[1].x, R.notes[1].y); B.send({ t: 'interact' }); await sleep(200);
  await tp(A, R.notes[2].x, R.notes[2].y); A.send({ t: 'interact' }); await sleep(200);
  ok(clueKeeper.last.nt.every((v, i) => v === dbg.noteSyms[i]), 'everyone sees all 3 symbols once read');

  // keypad: far away does nothing, near the door opens it
  const farSpot = farFromKeypad();
  await tp(B, farSpot.x, farSpot.y); B.send({ t: 'interact' }); await sleep(150);
  ok(B.keypad.length === 0, 'no keypad when standing far from the door');
  B.send({ t: 'code', code: dbg.code }); await sleep(150);
  ok(A.last.ul === 0, 'code typed far from the door is ignored');
  const padSpot = standAtKeypad();
  await tp(A, padSpot.x, padSpot.y); A.send({ t: 'interact' }); await sleep(200);
  ok(A.keypad.length === 1 && !A.keypad[0].result, 'keypad opens next to the door');
  const wrong = dbg.code === '123' ? '321' : '123';
  const alBefore = A.last.al;
  A.send({ t: 'code', code: wrong }); await sleep(200);
  ok(A.last.ul === 0 && A.keypad.some(k => k.result === 'bad'), 'wrong code is rejected');
  ok(A.last.al >= alBefore + R.badCodePenalty - 2, 'wrong code adds alarm (' + A.last.al + ')');
  A.send({ t: 'code', code: dbg.code }); await sleep(200);
  ok(A.last.ul === 0, 'keypad is locked out for a moment after a wrong code');
  await sleep(R.keypadCooldown * 1000);
  A.send({ t: 'code', code: dbg.code }); await sleep(200);
  ok(A.last.ul === 1 && A.keypad.some(k => k.result === 'ok'), 'right code unlocks the door');

  // door is unlocked but the croissant is still missing
  const mat = { x: R.exit.x + R.exit.w / 2, y: R.exit.y + R.exit.h / 2 };
  await tp(A, mat.x, mat.y); await sleep(300);
  ok(A.me().o === 0, 'unlocked door still stays shut without the croissant');
  ok(A.toasts.some(t => t.includes('croissant first')), 'runner is told to find the croissant');

  // B finds the croissant
  const cup = R.solids.find(s => s.id === dbg.truth);
  const spot = standAt(cupCenter(cup));
  await tp(B, spot.x, spot.y); B.send({ t: 'interact' }); await sleep(200);
  ok(B.last.cro === 1 && B.last.car === 1, 'runner 2 carries the croissant');
  await sleep(300);
  ok(A.me().o === 1, 'runner 1 steps out of the open door');
  ok(!cs.some(c => c.end), 'round is not over while a runner is still inside');
  await tp(B, mat.x, mat.y); await sleep(300);
  ok(cs.every(c => c.end && c.end.win), 'round is won when every runner is out');
  ok(A.last.pn > startPing, 'radar blip refreshed during the round (pn ' + startPing + ' -> ' + A.last.pn + ')');
  cs.forEach(c => c.ws.close());
  await sleep(200);
}

function unitTests() {
  console.log('\n--- rooms ---');
  const { makeClues, solveClues } = require('../clues.js');
  const themes = Object.keys(Rooms.THEMES);
  ok(themes.length === 3, 'there are 3 rooms: ' + themes.join(', '));
  ok(themes.every(k => Rooms.THEMES[k].layouts.length === 5), 'every room has 5 layouts');
  ok(Rooms.LIST.length === 15, '15 room layouts in total');
  for (const k of themes) {
    const maps = new Set(Rooms.THEMES[k].layouts.map(l => l.rows.join('|')));
    ok(maps.size === 5, k + ': the 5 layouts are all different');
    const doors = new Set(Rooms.THEMES[k].layouts.map((_, i) => Rooms.getRoom(k, i).exit.side));
    ok(doors.size >= 2, k + ': the door is not always on the same wall (' + [...doors].join(', ') + ')');
  }
  let problems = [];
  for (const r of Rooms.LIST) problems = problems.concat(Rooms.validateRoom(Rooms.getRoom(r.key, r.index), makeClues));
  ok(problems.length === 0, 'every layout is fair: all reachable, guard route clear, notes spaced, clues solvable' + (problems.length ? ' -> ' + problems.slice(0, 5).join('; ') : ''));

  console.log('\n--- clue generator (every layout, every container) ---');
  let bad = 0, tooMany = 0, tooFew = 0, runs = 0;
  for (const r of Rooms.LIST) {
    const room = Rooms.getRoom(r.key, r.index);
    const cups = room.solids.filter(x => x.kind === 'cupboard');
    if (cups.length !== 6) bad++;
    for (const c of cups) {
      for (let i = 0; i < 30; i++) {
        const cl = makeClues(room, c.id);
        runs++;
        const res = cl && solveClues(room, cl);
        if (!res || res.length !== 1 || res[0] !== c.id) bad++;
        if (cl && cl.length > 3) tooMany++;
        if (cl && cl.length < 2) tooFew++;
      }
    }
  }
  ok(bad === 0, 'every clue set points to exactly one container (' + bad + ' bad of ' + runs + ')');
  ok(tooMany === 0 && tooFew === 0, 'every clue set has 2 or 3 clues');

  console.log('\n--- random room picker ---');
  const seen = new Set();
  let prev = null, repeats = 0;
  for (let i = 0; i < 600; i++) {
    const r = Rooms.pickRoom(prev);
    const cur = { key: r.id, index: r.layoutIndex };
    if (prev && prev.key === cur.key && prev.index === cur.index) repeats++;
    seen.add(cur.key + cur.index);
    prev = cur;
  }
  ok(seen.size === 15, 'all 15 layouts come up at random (' + seen.size + ' seen in 600 rounds)');
  ok(repeats === 0, 'the same layout never comes twice in a row');

  console.log('\n--- door code generator ---');
  let badDoor = 0;
  for (let i = 0; i < 1000; i++) {
    const d = makeDoor();
    const digits = d.decoder.map(x => x.digit);
    if (new Set(digits).size !== digits.length || digits.some(x => x < 1 || x > 9)) badDoor++;
    if (new Set(d.noteSyms).size !== 3 || d.code.length !== 3 || decode(d.decoder, d.noteSyms) !== d.code) badDoor++;
  }
  ok(badDoor === 0, 'every door has distinct digits per symbol, 3 distinct notes and a matching 3-digit code');
}

(async () => {
  const { spawn } = require('child_process');
  let port = 3111;
  const quick = process.argv.includes('--quick');
  unitTests();
  const run = async (label, env) => {
    port++;
    URL = 'ws://localhost:' + port + '/ws';
    const srv = spawn('node', ['server.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT: port, CCH_DEBUG: '1', ...env } });
    await sleep(700);
    if (label === 'flow') await doorFlow(); else await scenario(label);
    srv.kill();
  };
  try {
    for (const n of [1, 2, 3, 4, 5, 6, 9, 15]) await run(n, {});
    // the whole door flow in every single layout of every room
    const only = quick ? Rooms.LIST.filter((_, i) => i % 5 === 0) : Rooms.LIST;
    for (const r of only) {
      console.log('\n>>> forced layout ' + r.key + ' ' + (r.index + 1));
      await run('flow', { CCH_ROOM: r.key + ':' + r.index });
    }
  } catch (e) { console.error(e); fails++; }
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})();
