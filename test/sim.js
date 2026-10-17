// Headless test: connects fake players over WebSocket and plays rounds.
// The server is started in test mode (CCH_DEBUG=1): the guard is blind, players may teleport,
// and the start message carries the secret code so we can check the whole door flow.
// With CCH_SEE=1 the guard gets its eyes back (used for the chase / pounce tests).
//   node test/sim.js            everything (every layout of every room)
//   node test/sim.js --quick    one layout per room
//   node test/sim.js --unit     only the tests that need no server
const WebSocket = require('ws');
let R = require('../public/room.js'); // replaced by the round's room once a game starts
const Rooms = require('../rooms/index.js');
const { makeDoor, decode, SYMBOLS } = require('../door.js');
let URL = '';

function client(name) {
  const c = { name, id: 'id-' + name, last: null, start: null, end: null, toasts: [], keypad: [], evs: [], reacts: [], roster: null, full: null, starts: 0 };
  c.ws = new WebSocket(URL);
  c.ready = new Promise(res => c.ws.on('open', () => {
    c.ws.send(JSON.stringify({ t: 'join', id: c.id, name, avatar: '🐭' }));
    res();
  }));
  c.ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'start') { c.start = m; c.starts++; c.end = null; } // a new round wipes the last round's result
    else if (m.t === 'ev') c.evs.push(m);
    else if (m.t === 'react') c.reacts.push(m);
    else if (m.t === 'roster') c.roster = m;
    else if (m.t === 'full') c.full = m;
    else if (m.t === 'end') c.end = m;
    else if (m.t === 'toast') c.toasts.push(m.text);
    else if (m.t === 's') c.last = m;
    else if (m.t === 'keypad') c.keypad.push(m);
    else if (m.t === 'lobby') c.lobby = m;
  });
  c.send = m => c.ws.send(JSON.stringify(m));
  // resolves once the server has really taken this player in (joins on separate sockets can overtake each other)
  c.joined = async () => { await c.ready; await waitFor(() => c.lobby && c.lobby.players.some(p => p.id === c.id)); };
  c.closed = new Promise(res => c.ws.on('close', res));
  c.idx = () => c.start.role.runnerIndex;
  c.me = () => c.last.rs[c.idx()];
  return c;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
// wait until cond() is true (a slow machine, like a CI runner, needs longer than any fixed sleep); false after ms
async function waitFor(cond, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (cond()) return true; } catch (e) {} await sleep(25); }
  return false;
}
// a client has its round: start message plus the first live state
const inGame = c => !!(c.start && c.last && c.last.rs);
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
  for (let i = 0; i < n; i++) { const c = client('P' + i); cs.push(c); await c.joined(); }
  await sleep(150);
  ok(cs[0].lobby && cs[0].lobby.players.length === n, 'lobby shows ' + n + ' players');
  if (n === R.maxPlayers) {
    const extra = client('Extra');
    await extra.ready; await sleep(300);
    ok(extra.full && extra.full.max === R.maxPlayers, 'player ' + (n + 1) + ' is told the lobby is full');
    await extra.closed;
    ok(cs[0].lobby.players.length === n, 'the extra player is not added to the lobby');
    const back = client('P3'); // same id as a player who is already in: always allowed back
    await back.ready; await sleep(200);
    ok(!back.full && back.lobby && back.lobby.players.length === n, 'a player who already has a seat can always reconnect');
    cs[3] = back;
  }
  cs[0].send({ t: 'start' });
  await waitFor(() => cs.every(inGame));
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
  ok(cs.every(c => c.evs.some(e => e.k === 'wrong' && e.id === wrongCup.id)), 'everybody gets the "wrong container" event (sound + animation)');
  ok([2, 3].includes(runner.last.gm), 'the cat goes to look where the noise was (mode ' + runner.last.gm + ')');
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
  for (let i = 0; i < 5; i++) { const c = client('D' + i); cs.push(c); await c.joined(); }
  await sleep(150);
  cs[0].send({ t: 'start' });
  await waitFor(() => cs.every(inGame));
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
  const kinds = new Set(clueKeeper.evs.map(e => e.k));
  ok(['note', 'badcode', 'unlock', 'found', 'out'].every(k => kinds.has(k)), 'game events are sent for notes, codes, the croissant and escapes: ' + [...kinds].join(' '));

  // the end of the round: score, secrets revealed, replay
  const end = clueKeeper.end;
  ok(end.reveal && end.reveal.truth === dbg.truth && end.reveal.code === dbg.code, 'the end reveals the right ' + R.noun + ' and the door code');
  ok(end.reveal.clues.length >= 1 && end.reveal.noteSyms.join('') === dbg.noteSyms.join(''), 'the end reveals the clues and the note symbols');
  const rp = end.replay;
  ok(rp && rp.frames.length >= 4 && rp.frames.every(f => f.r.length === 2 && f.g.length === 3), 'the replay has ' + (rp && rp.frames.length) + ' frames with both runners and the cat');
  ok(rp.frames.every((f, i) => i === 0 || f.t >= rp.frames[i - 1].t), 'replay frames are in time order');
  ok(rp.events.length === clueKeeper.evs.length, 'the replay holds every event of the round');
  ok(rp.runners.length === 2 && rp.runners[0].name, 'the replay knows the runners');
  const sc = end.score;
  ok(sc && sc.pts >= 15 + 20 + 30 + 100 - 5 && sc.stars >= 1, 'a won round scores points (' + sc.pts + ') and stars (' + sc.stars + ')');
  ok(sc.parts.some(p => p.pts < 0), 'the wrong code costs points');
  ok(end.board.rounds === 1 && end.board.wins === 1 && end.board.total === sc.pts, 'the team scoreboard counts the round');
  ok(clueKeeper.lobby.board.total === sc.pts, 'the lobby carries the scoreboard');
  cs.forEach(c => c.ws.close());
  await sleep(200);
}

// open wrong containers until the alarm ends the round
async function bust(c, room, truth) {
  for (const cup of room.solids.filter(s => s.kind === 'cupboard' && s.id !== truth)) {
    if (c.end) return;
    const sp = standAt(cupCenter(cup));
    c.send({ t: 'tp', x: sp.x, y: sp.y }); await sleep(120);
    c.send({ t: 'interact' }); await sleep(150);
  }
  await sleep(200);
  // the alarm cools down a little between containers: a wrong door code finishes the job
  if (!c.end) {
    const sp = standAtKeypad();
    c.send({ t: 'tp', x: sp.x, y: sp.y }); await sleep(120);
    c.send({ t: 'code', code: '000' }); await sleep(100);
    c.send({ t: 'code', code: c.start.debug.code === '111' ? '222' : '111' }); await sleep(300);
  }
}

// Joining while a round runs: you watch it, then you play from the next one. Plus scores over rounds and reactions.
async function lateJoin() {
  console.log('\n--- joining mid-round, scores across rounds, reactions ---');
  const a = client('L0'), b = client('L1');
  await a.joined(); await b.joined(); await waitFor(() => a.lobby.players.length === 2);
  a.send({ t: 'start' }); await waitFor(() => inGame(a) && inGame(b));
  R = a.start.room;
  const late = client('Late');
  await late.ready; await waitFor(() => inGame(late));
  ok(late.start && late.start.role.spectator, 'a player who joins mid-round gets the round as a spectator');
  ok(late.last && late.last.rs, 'the spectator gets the live state');
  const entry = a.lobby.players.find(p => p.id === late.id);
  ok(entry && entry.waiting, 'the lobby marks them as joining next round');
  ok(!a.start.team.some(t => t.id === late.id), 'they are not part of the running round');
  const runner = [a, b].find(c => c.start.role.isRunner);
  await bust(runner, R, a.start.debug.truth);
  ok(a.end && a.end.reason === 'alarm' && !a.end.win, 'too many wrong containers set off the alarm');
  ok(a.end.score.pts === 0 && a.end.board.rounds === 1 && a.end.board.wins === 0, 'a busted round scores 0 and still counts as a round');
  ok(late.end && late.end.replay, 'the late joiner sees the end of the round and the replay too');
  a.send({ t: 'again' }); await waitFor(() => late.starts === 2 && inGame(a));
  ok(late.start.role && !late.start.role.spectator && late.starts === 2, 'the late joiner gets a real role in the next round');
  ok(a.start.team.length === 3, 'the next round has all 3 players');
  ok(!a.lobby.players.find(p => p.id === late.id).waiting, 'they are no longer marked as waiting');
  ok(a.lobby.board.rounds === 1, 'the scoreboard is still there in round 2');

  // reactions
  late.send({ t: 'react', e: '👏' }); await sleep(150);
  ok([a, b, late].every(c => c.reacts.length === 1 && c.reacts[0].e === '👏' && c.reacts[0].name === 'Late'), 'a reaction reaches everybody with the sender\'s name');
  late.send({ t: 'react', e: '🔥' }); await sleep(150);
  ok(a.reacts.length === 1, 'reactions are rate limited');
  await sleep(700);
  late.send({ t: 'react', e: '<b>hi</b>' }); await sleep(150);
  ok(a.reacts.length === 1, 'only the listed reaction emoji are allowed');
  b.send({ t: 'resetScores' }); await sleep(150);
  ok(a.lobby.board.rounds === 1, 'scores cannot be reset while a round runs');
  [a, b, late].forEach(c => c.ws.close());
  await sleep(200);
}

// A Runner loses their connection; the host hands the critter to someone else.
async function swapFlow() {
  console.log('\n--- runner disconnects, host hands over the critter ---');
  const cs = [];
  for (let i = 0; i < 4; i++) { const c = client('S' + i); cs.push(c); await c.joined(); }
  await sleep(150);
  const host = cs[0];
  host.send({ t: 'start' }); await waitFor(() => cs.every(inGame));
  R = host.start.room;
  let runner = cs.find(c => c.start.role.isRunner);
  if (runner === host) { // the host has to stay connected for this test: next round
    await bust(runner, R, host.start.debug.truth);
    host.send({ t: 'again' }); await waitFor(() => cs.every(c => c.starts === 2 && inGame(c)));
    R = host.start.room;
    runner = cs.find(c => c.start.role.isRunner);
  }
  const taker = cs.find(c => c !== host && c !== runner);
  const takerRole = taker.start.role.advisors.map(a => a.type).join();
  const spot = standAt(cupCenter(R.solids.find(s => s.kind === 'cupboard' && s.id !== host.start.debug.truth)));
  runner.send({ t: 'tp', x: spot.x, y: spot.y }); await sleep(200);
  const pos = { ...runner.me() };
  runner.ws.close(); await waitFor(() => host.last.rs[0].c === 0);
  ok(host.last.rs[0].c === 0, 'the state shows the Runner is disconnected');
  ok(host.last.dl > 0 && host.last.dl <= R.dropSeconds, 'and how long until the round is called off (' + host.last.dl + 's)');
  ok(host.toasts.some(t => t.includes('lost their connection')), 'everybody is told the Runner dropped');
  taker.send({ t: 'swap', runner: 0, to: taker.id }); await sleep(200);
  ok(!taker.start.role.isRunner, 'only the host can hand over the critter');
  host.send({ t: 'swap', runner: 0, to: runner.id }); await sleep(200);
  ok(host.last.rs[0].c === 0, 'the critter cannot be handed back to the missing player');
  const startsBefore = taker.starts;
  host.send({ t: 'swap', runner: 0, to: taker.id }); await waitFor(() => taker.starts === startsBefore + 1);
  ok(taker.start.role.isRunner && taker.start.role.runnerIndex === 0 && taker.starts === startsBefore + 1, 'the chosen player becomes the Runner');
  ok(Math.abs(taker.me().x - pos.x) < 0.01 && Math.abs(taker.me().y - pos.y) < 0.01, 'they take over at the same spot');
  await waitFor(() => host.roster);
  ok(host.roster && host.roster.runners[0].id === taker.id, 'everybody else gets the new runner names');
  await waitFor(() => host.last.rs[0].c === 1 && host.last.dl === null);
  ok(host.last.rs[0].c === 1 && host.last.dl === null, 'the round goes on');
  let moved = false;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const before = { ...taker.me() };
    taker.send({ t: 'input', dx, dy }); await sleep(250); taker.send({ t: 'input', dx: 0, dy: 0 }); await sleep(100);
    if (Math.hypot(taker.me().x - before.x, taker.me().y - before.y) > 0.1) { moved = true; break; }
  }
  ok(moved, 'the new Runner can move');
  const back = client(runner.name); // the missing player comes back
  await back.ready; await waitFor(() => inGame(back));
  ok(back.start && !back.start.role.isRunner && back.start.role.advisors.map(a => a.type).join() === takerRole, 'the returning player gets the job of the one who took over (' + takerRole + ')');
  ok(!cs.some(c => c.end), 'nobody lost the round because of the disconnect');
  [...cs, back].forEach(c => { try { c.ws.close(); } catch (e) {} });
  await sleep(200);
}

// The guard can see (CCH_SEE=1): it spots a Runner, chases them, pounces, searches and walks back.
async function catFlow() {
  console.log('\n--- the cat: spot, chase, pounce, search, go back ---');
  const c = client('Cat');
  await c.joined();
  c.send({ t: 'start' }); await waitFor(() => inGame(c));
  R = c.start.room;
  ok(c.last.gm === 0, 'the cat starts on patrol');
  // stand right where the cat is
  let pounce = null;
  for (let k = 0; k < 12 && !pounce; k++) {
    const g = c.last;
    for (const [dx, dy] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) if (!isBlocked(g.gx + dx, g.gy + dy)) { c.send({ t: 'tp', x: g.gx + dx, y: g.gy + dy }); break; }
    await sleep(150);
    pounce = c.evs.find(e => e.k === 'pounce');
  }
  ok(c.evs.some(e => e.k === 'spotted'), 'the cat spots a Runner right in front of it');
  ok(!!pounce, 'and pounces');
  ok(c.last.al >= R.pouncePenalty, 'a pounce adds ' + R.pouncePenalty + ' alarm (alarm=' + c.last.al + ')');
  ok(c.last.gm === 5, 'the cat is dazed after a pounce');
  // hide in a box, far away
  const box = R.boxes.slice().sort((p, q) => Math.hypot(q.x - c.last.gx, q.y - c.last.gy) - Math.hypot(p.x - c.last.gx, p.y - c.last.gy))[0];
  c.send({ t: 'tp', x: box.x + 0.5, y: box.y + 0.5 }); await sleep(200);
  ok(c.last.rs[0].h === 1, 'the Runner hides in a box');
  const alarm = c.last.al;
  await sleep((R.guard.pounceStun + 0.5) * 1000);
  ok([3, 4, 0, 1].includes(c.last.gm), 'after the daze the cat searches or heads back (mode ' + c.last.gm + ')');
  await sleep((R.guard.searchTime + 0.5) * 1000);
  ok([4, 0].includes(c.last.gm), 'then it walks back to its route (mode ' + c.last.gm + ')');
  ok(c.last.al <= alarm, 'a hidden Runner is not seen: the alarm cools down');
  ok(!c.end, 'the round goes on');
  c.ws.close(); await sleep(200);
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

  console.log('\n--- what Space / E does (shared by server and browser) ---');
  const RULES = require('../public/rules.js');
  const room = Rooms.getRoom('kitchen', 0);
  const cup = room.solids.find(x => x.kind === 'cupboard');
  const nearCup = RULES.interactTarget(room, cup.x + 0.5, cup.y + 1.5);
  ok(nearCup && nearCup.k === 'cup' && nearCup.s.id === cup.id, 'standing next to a container targets it');
  ok(RULES.promptText(room, nearCup, {}).text === 'Open the ' + cup.name.toLowerCase() + ' ' + room.noun, 'the prompt names the container');
  ok(RULES.promptText(room, nearCup, { op: { [cup.id]: 'empty' } }).done, 'an opened container shows as checked');
  const onNote = RULES.interactTarget(room, room.notes[1].x, room.notes[1].y);
  ok(onNote && onNote.k === 'note' && onNote.i === 1, 'standing on a note targets that note');
  ok(RULES.promptText(room, onNote, { nt: [null, null, null] }).text === 'Read note 2', 'the prompt says which note');
  const atPad = RULES.interactTarget(room, room.keypad.x + (room.exit.side === 'left' ? 1 : room.exit.side === 'right' ? -1 : 0), room.keypad.y + (room.exit.side === 'top' ? 1 : room.exit.side === 'bottom' ? -1 : 0));
  ok(atPad && atPad.k === 'pad', 'standing near the door targets the keypad');
  ok(RULES.interactTarget(room, 7.5, 4.5) === null || RULES.interactTarget(room, 7.5, 4.5).d >= 0, 'the target is null or the closest thing');
  let far = 0;
  for (let x = 1.3; x < 15; x += 0.5) for (let y = 1.3; y < 9; y += 0.5) if (!RULES.interactTarget(room, x, y)) far++;
  ok(far > 50, 'most of the floor has nothing to interact with (' + far + ' spots)');

  console.log('\n--- scores ---');
  const Score = require('../scoring.js');
  const win = Score.scoreRound({ win: true, notes: 3, unlocked: true, cro: true, wrong: 0, badCodes: 0, timeLeft: 120, maxAlarm: 20 });
  ok(win.pts === 15 + 20 + 30 + 100 + 60 + 40 && win.stars === 3, 'a clean fast win: ' + win.pts + ' points, 3 stars');
  const sloppy = Score.scoreRound({ win: true, notes: 3, unlocked: true, cro: true, wrong: 2, badCodes: 1, timeLeft: 10, maxAlarm: 95 });
  ok(sloppy.stars === 1 && sloppy.pts === 15 + 20 + 30 + 100 + 5 + 2 - 20 - 5, 'a sloppy win: ' + sloppy.pts + ' points, 1 star');
  const lost = Score.scoreRound({ win: false, notes: 2, unlocked: false, cro: true, wrong: 1, badCodes: 0, timeLeft: 0, maxAlarm: 100 });
  ok(lost.pts === 10 + 30 - 10 && lost.stars === 0, 'a lost round still scores what got done: ' + lost.pts);
  ok(Score.scoreRound({ win: false, notes: 0, wrong: 4, badCodes: 3, timeLeft: 0, maxAlarm: 100 }).pts === 0, 'a round never scores below 0');
  const b = Score.makeBoard();
  Score.addRound(b, { round: 1, room: 'K', layout: 'A', win: true, time: 200, ...win });
  Score.addRound(b, { round: 2, room: 'K', layout: 'B', win: true, time: 150, ...sloppy });
  Score.addRound(b, { round: 3, room: 'K', layout: 'C', win: false, reason: 'alarm', time: 90, ...lost });
  ok(b.total === win.pts + sloppy.pts + lost.pts && b.rounds === 3 && b.wins === 2, 'the board adds up rounds and points');
  ok(b.streak === 0 && b.bestStreak === 2 && b.fastest === 150 && b.stars === 4, 'streaks, fastest win and stars');
  ok(b.history.length === 3 && b.history[0].round === 3, 'history is newest first');
  for (let i = 4; i < 20; i++) Score.addRound(b, { round: i, room: 'K', layout: 'A', win: true, time: 100, ...win });
  ok(b.history.length === 10, 'history keeps the last 10 rounds');

  console.log('\n--- browser files ---');
  const fs = require('fs');
  const html = fs.readFileSync(__dirname + '/../public/index.html', 'utf8');
  const inline = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  let parsed = true;
  try { new Function(inline); } catch (e) { parsed = false; console.log(e); }
  ok(parsed, 'the page script has no syntax errors');
  const ids = [...inline.matchAll(/\$\('#([\w-]+)'\)/g)].map(m => m[1]);
  const missing = [...new Set(ids)].filter(id => !html.includes('id="' + id + '"'));
  ok(missing.length === 0, 'every #id the page script uses exists in the page' + (missing.length ? ': ' + missing.join(', ') : ''));
  for (const f of ['room.js', 'rules.js', 'render.js', 'sound.js']) ok(html.includes('<script src="' + f + '">'), 'the page loads ' + f);
  const D = require('../public/render.js');
  ok(['drawShared', 'drawMap', 'drawLookout', 'drawReplay'].every(k => typeof D[k] === 'function'), 'the renderer has every view');
  const SFX = require('../public/sound.js');
  ok(!SFX.isOn(), 'sound is off by default');
  let quiet = true;
  try { SFX.names.forEach(n => SFX.play(n)); } catch (e) { quiet = false; }
  ok(quiet && ['note', 'found', 'wrong', 'badcode', 'unlock', 'out', 'spotted', 'lost', 'pounce'].every(n => SFX.names.includes(n)), 'every game event has a sound (and muted sounds do nothing)');

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
  if (process.argv.includes('--unit')) {
    console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASSED');
    process.exit(fails ? 1 : 0);
  }
  const run = async (label, env) => {
    port++;
    URL = 'ws://localhost:' + port + '/ws';
    const srv = spawn('node', ['server.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT: port, CCH_DEBUG: '1', ...env } });
    // wait until the server says it is listening (or give up after 10 s)
    let log = '';
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('server did not start:\n' + log)), 10000);
      const on = d => { log += d; if (log.includes('is running')) { clearTimeout(t); res(); } };
      srv.stdout.on('data', on); srv.stderr.on('data', on);
      srv.on('exit', code => { clearTimeout(t); rej(new Error('server exited (' + code + '):\n' + log)); });
    });
    ok(!log.includes('ROOM PROBLEM'), 'the server starts without room problems');
    try {
      if (label === 'flow') await doorFlow();
      else if (typeof label === 'function') await label();
      else await scenario(label);
    } finally { srv.removeAllListeners('exit'); srv.kill(); }
  };
  try {
    for (const n of [1, 2, 3, 4, 5, 6, 9, 15]) await run(n, {});
    await run(lateJoin, {});
    await run(swapFlow, {});
    await run(catFlow, { CCH_SEE: '1' });
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
