// Browser test: 3 real browser tabs (headless Chromium) play through the page.
// Checks the "E: ..." prompt, events, the end screen with replay and scores, the host hand-over
// when a Runner drops, reactions, and that the page logs no errors.
//   npm run test:ui                 (needs: npx playwright install chromium)
//   SHOTS=some/folder npm run test:ui   also saves screenshots
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');

const PORT = 3199;
const SHOTS = process.env.SHOTS || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + name + '.png', fullPage: true }); };

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  // test mode with a seeing guard, always the first kitchen layout
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname + '/..',
    env: { ...process.env, PORT, CCH_DEBUG: '1', CCH_SEE: '1', CCH_ROOM: 'kitchen:0' }
  });
  await new Promise((res, rej) => {
    let log = '';
    const t = setTimeout(() => rej(new Error('server did not start: ' + log)), 10000);
    srv.stdout.on('data', d => { log += d; if (log.includes('is running')) { clearTimeout(t); res(); } });
  });
  const browser = await chromium.launch();
  const errors = [];
  const tabs = [];
  try {
    for (const name of ['Olga', 'Bea', 'Cy']) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      // listen in on the page's WebSocket so the test knows the secrets (test mode) and can teleport the Runner
      const T = { name, page, start: null, last: null, server: null, evs: [] };
      page.on('console', m => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
      page.on('pageerror', e => errors.push(name + ': ' + e.message));
      await page.routeWebSocket(/\/ws$/, ws => {
        const server = ws.connectToServer(); T.server = server;
        ws.onMessage(m => server.send(m));
        server.onMessage(m => {
          const j = JSON.parse(m);
          if (j.t === 'start') T.start = j;
          else if (j.t === 's') T.last = j;
          else if (j.t === 'ev') T.evs.push(j);
          ws.send(m);
        });
      });
      await page.goto('http://localhost:' + PORT);
      await page.fill('#nameInput', name);
      await page.click('#joinBtn');
      await sleep(250);
      tabs.push(T);
    }
    const [host] = tabs;
    ok(await host.page.isVisible('#startBtn'), 'the first player is the host and can start');
    ok((await host.page.textContent('#soundBtn')).includes('off'), 'sound starts muted');
    await host.page.click('#soundBtn');
    ok((await host.page.textContent('#soundBtn')).includes('on'), 'the sound button turns sound on');
    await shot(host.page, '1-lobby');
    await host.page.click('#startBtn');
    await sleep(700);

    const R = host.start.room, dbg = host.start.debug;
    const run = tabs.find(t => t.start.role.isRunner);
    const spec = tabs.find(t => !t.start.role.isRunner);
    let cur = run; // the tab that teleports
    const tp = async (x, y) => { cur.server.send(JSON.stringify({ t: 'tp', x, y })); await sleep(250); };
    const me = () => cur.last.rs[cur.start.role.runnerIndex];
    const besides = async s => {
      for (const [dx, dy] of [[0.5, 1.5], [0.5, -0.5], [-0.5, 0.5], [1.5, 0.5]]) {
        await tp(s.x + dx, s.y + dy);
        if (Math.abs(me().x - (s.x + dx)) < 0.01 && Math.abs(me().y - (s.y + dy)) < 0.01) return;
      }
    };

    // the prompt shows what E will do (drawn on the canvas, so check the touch button label too)
    const wrong = R.solids.find(s => s.kind === 'cupboard' && s.id !== dbg.truth);
    await besides(wrong);
    await sleep(200);
    ok(await run.page.$eval('#actBtn', b => b.textContent) === 'OPEN', 'next to a container the action button says OPEN');
    ok(!(await run.page.$eval('#actBtn', b => b.classList.contains('dim'))), 'and is not dimmed');
    await shot(run.page, '2-prompt');
    await run.page.keyboard.press('e');
    await sleep(400);
    ok(spec.evs.some(e => e.k === 'wrong'), 'opening a wrong container sends an event');
    ok(!(await spec.page.isHidden('#catPill')), 'the HUD says the cat heard something');
    await shot(spec.page, '3-noise');

    // walk into the cat: it pounces
    for (let k = 0; k < 10 && !run.evs.some(e => e.k === 'pounce'); k++) { await tp(run.last.gx + 0.3, run.last.gy); await sleep(150); }
    ok(run.evs.some(e => e.k === 'pounce'), 'the cat pounces on a Runner standing right next to it');
    ok((await run.page.$eval('#catPill', e => e.textContent)).includes('dazed'), 'the HUD shows the dazed cat');
    await shot(run.page, '4-pounce');

    // drama: high alarm turns the screen edge red
    const vig = await run.page.$eval('#vignette', e => +e.style.opacity);
    ok(run.last.al < 55 || vig > 0, 'the red vignette shows when the alarm is high (alarm ' + Math.round(run.last.al) + ', vignette ' + vig + ')');

    // win the round
    for (let i = 0; i < 3; i++) { await tp(R.notes[i].x, R.notes[i].y); ok((await run.page.$eval('#actBtn', b => b.textContent)) === 'READ', 'on note ' + (i + 1) + ' the action button says READ'); await run.page.keyboard.press('e'); await sleep(200); }
    await besides(R.solids.find(s => s.id === dbg.truth));
    await run.page.keyboard.press('e'); await sleep(300);
    const nearPad = { left: [1, 0], right: [-1, 0], top: [0, 1], bottom: [0, -1] }[R.exit.side];
    await tp(R.keypad.x + nearPad[0], R.keypad.y + nearPad[1]);
    await run.page.keyboard.press('e'); await sleep(300);
    ok(await run.page.isVisible('#keypad'), 'E next to the door opens the keypad');
    for (const ch of dbg.code) await run.page.keyboard.press(ch);
    await run.page.keyboard.press('Enter'); await sleep(300);
    await tp(R.exit.x + R.exit.w / 2, R.exit.y + R.exit.h / 2); await sleep(1500);
    ok(await host.page.isVisible('#endOverlay'), 'the end screen shows');
    ok((await host.page.textContent('#endTitle')).includes('success'), 'the heist is a success');
    ok((await host.page.$$('#endStars i.on')).length >= 1, 'the end screen shows stars');
    ok((await host.page.textContent('#reveal')).includes(R.solids.find(s => s.id === dbg.truth).name.toLowerCase()), 'the end screen reveals the right container');
    ok((await host.page.textContent('#points')).includes('Round total'), 'the end screen lists the points');
    ok(await host.page.isVisible('#replayCv'), 'the replay is shown');
    await sleep(2500); // a short test round: the 4x replay is over by now
    const t1 = await host.page.textContent('#rpTime');
    await host.page.click('#rpPlay'); // play again from the start
    await sleep(300);
    const t2 = await host.page.textContent('#rpTime');
    ok(t1 !== t2 && t2.startsWith('0:0'), 'the replay can be played again (' + t1 + ' -> ' + t2 + ')');
    await host.page.click('#rpSpeed');
    ok((await host.page.textContent('#rpSpeed')) === '8×', 'the replay speed can change');
    await shot(host.page, '5-end');

    // next round: a Runner drops and the host hands over the critter
    await host.page.click('#endBtns .btn.primary'); await sleep(800);
    ok((await host.page.textContent('#scorePill')).match(/Team [1-9]/), 'the team score carries over to the next round');
    let run2 = tabs.find(t => t.start.role.isRunner);
    if (run2 === host) {
      // the host must stay: get busted quickly so somebody else runs next round
      cur = run2;
      for (let i = 0; i < 6 && !(await host.page.isVisible('#endOverlay')); i++) {
        const c = R.solids.filter(s => s.kind === 'cupboard' && s.id !== host.start.debug.truth)[i];
        if (c) { await besides(c); run2.server.send(JSON.stringify({ t: 'interact' })); await sleep(300); }
        else { await tp(R.keypad.x + nearPad[0], R.keypad.y + nearPad[1]); run2.server.send(JSON.stringify({ t: 'code', code: '000' })); await sleep(400); }
      }
      await host.page.click('#endBtns .btn.primary'); await sleep(800);
      run2 = tabs.find(t => t.start.role.isRunner);
    }
    ok(run2 !== host, 'a non-host is the Runner');
    await run2.page.context().close();
    await sleep(800);
    ok(await host.page.isVisible('#dropBox'), 'the host sees that the Runner dropped');
    const btns = await host.page.$$('#dropBox .btn');
    ok(btns.length >= 1, 'the host gets "Make X the Runner" buttons (' + btns.length + ')');
    await shot(host.page, '6-drop');
    await btns[0].click(); await sleep(800);
    const newRunner = tabs.find(t => t !== run2 && t.start.role.isRunner);
    ok(!!newRunner, 'the chosen player is the Runner now (' + (newRunner && newRunner.name) + ')');
    ok(await host.page.isHidden('#dropBox'), 'the drop box goes away');
    await shot(newRunner.page, '7-new-runner');

    // reactions
    await host.page.click('#reacts button');
    await sleep(300);
    const other = tabs.find(t => t !== host && t !== run2);
    ok((await other.page.$$('.floater')).length === 1, 'a reaction floats up on the other screens');
    ok(errors.length === 0, 'no errors in the browser console' + (errors.length ? ': ' + errors.join(' | ') : ''));
  } catch (e) { console.error(e); fails++; }
  await browser.close();
  srv.kill();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})();
