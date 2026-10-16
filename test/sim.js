// Headless test: connects fake players over WebSocket and plays a round.
const WebSocket = require('ws');
const R = require('../public/room.js');
let URL = '';

function client(name) {
  const c = { name, id: 'id-' + name, msgs: [], last: null, start: null, end: null, toasts: [] };
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
    else if (m.t === 'lobby') c.lobby = m;
  });
  c.send = m => c.ws.send(JSON.stringify(m));
  return c;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };

async function scenario(n) {
  console.log('\n--- scenario: ' + n + ' players ---');
  const cs = [];
  for (let i = 0; i < n; i++) { const c = client('P' + i); cs.push(c); await c.ready; await sleep(30); }
  await sleep(150);
  ok(cs[0].lobby && cs[0].lobby.players.length === n, 'lobby shows ' + n + ' players');
  cs[0].send({ t: 'start' });
  await sleep(400);
  ok(cs.every(c => c.start), 'everyone got a start message');
  const runners = cs.filter(c => c.start.role.isRunner);
  ok(runners.length === 1, 'exactly one runner');
  const runner = runners[0];
  const types = {};
  cs.forEach(c => (c.start.role.advisors || []).forEach(a => { types[a.type] = (types[a.type] || 0) + 1; }));
  if (n >= 2) ok(types.clue >= 1 && types.map >= 1 && types.lookout >= 1, 'every specialist type is covered: ' + JSON.stringify(types));
  const clueHolders = cs.filter(c => (c.start.role.advisors || []).some(a => a.type === 'clue'));
  ok(clueHolders.every(c => c.start.role.advisors.find(a => a.type === 'clue').statements.length >= 1), 'every clue keeper has at least one clue');
  ok(!runner.start.role.advisors.length || n === 1, 'runner holds no specialist info (unless solo)');

  // runner walks into the wall to the right: must stay inside the room
  runner.send({ t: 'input', dx: 1, dy: 0 });
  await sleep(500);
  ok(runner.last && runner.last.rx <= R.W - 1 - R.runner.half + 0.01, 'runner cannot leave the room (x=' + (runner.last && runner.last.rx) + ')');
  // walk up into the table/yellow cupboard area: must not enter solids
  runner.send({ t: 'input', dx: 0, dy: -1 });
  await sleep(1500);
  const { rx, ry } = runner.last;
  const inSolid = R.solids.some(s => rx + 0.28 > s.x && rx - 0.28 < s.x + s.w && ry + 0.28 > s.y && ry - 0.28 < s.y + s.h);
  ok(!inSolid, 'runner is not inside furniture at (' + rx + ',' + ry + ')');
  // try to open a cupboard (may or may not be in range)
  runner.send({ t: 'interact' });
  await sleep(300);
  // the runner now stands right below the yellow cupboard: it is either the croissant or a noisy miss
  const missed = runner.toasts.some(t => t.includes('empty'));
  if (missed) {
    ok(runner.last.al >= R.wrongPenalty - 2, 'wrong cupboard adds ' + R.wrongPenalty + ' alarm (alarm=' + runner.last.al + ')');
    ok(runner.last.ag === 1, 'guard goes on alert after a wrong cupboard');
  } else {
    ok(runner.last.cro === 1 && runner.toasts.some(t => t.includes('croissant')), 'right cupboard gives the croissant');
  }
  runner.send({ t: 'input', dx: 0, dy: 0 });
  // non-runners' input must be ignored
  const other = cs.find(c => c !== runner);
  if (other) {
    const before = { ...runner.last };
    other.send({ t: 'input', dx: -1, dy: 0 });
    await sleep(400);
    ok(Math.abs(runner.last.rx - before.rx) < 0.05, 'input from non-runner is ignored');
  }
  ok(runner.last && typeof runner.last.tl === 'number' && runner.last.tl < R.timeLimit, 'timer is counting down (' + runner.last.tl + ')');
  // host can restart with rotation only after the round ends; before that "again" must be ignored
  cs[0].send({ t: 'again' });
  await sleep(200);
  ok(!cs.some(c => c.end), 'round is still running');
  cs.forEach(c => c.ws.close());
  await sleep(200);
}

function clueTests() {
  console.log('\n--- clue generator ---');
  const { makeClues, solveClues } = require('../clues.js');
  const cups = R.solids.filter(s => s.kind === 'cupboard').map(c => c.id);
  let bad = 0, tooMany = 0, tooFew = 0;
  for (const t of cups) {
    for (let i = 0; i < 200; i++) {
      const c = makeClues(R, t);
      const r = solveClues(R, c);
      if (!r || r.length !== 1 || r[0] !== t) bad++;
      if (c.length > 3) tooMany++;
      if (c.length < 2) tooFew++;
    }
  }
  ok(cups.length === 6, 'there are 6 cupboards');
  ok(bad === 0, 'every clue set points to exactly one cupboard (' + bad + ' bad of ' + cups.length * 200 + ')');
  ok(tooMany === 0 && tooFew === 0, 'every clue set has 2 or 3 clues');
}

(async () => {
  const { spawn } = require('child_process');
  let port = 3111;
  clueTests();
  try {
    for (const n of [1, 2, 3, 5, 15]) {
      port++;
      URL = 'ws://localhost:' + port + '/ws';
      const srv = spawn('node', ['server.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT: port } });
      await sleep(700);
      await scenario(n);
      srv.kill();
    }
  } catch (e) { console.error(e); fails++; }
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})();
