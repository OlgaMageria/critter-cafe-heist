'use strict';
// Room builder. Every room theme (kitchen, office, storeroom) has 5 hand-drawn layouts.
// A layout is a 16 x 10 ASCII map, so it is easy to read and to change:
//
//   Each layout is the 8 rows x 14 columns of floor; the wall ring is added automatically.
//   .  floor
//   r b g p o y   the 6 colored containers (red, blue, green, purple, orange, yellow)
//   x  hiding box (stand inside it and the cat can't see you)
//   n  sticky-note spot (exactly 3)  1 2 3 4  runner start spots (all 4 needed)
//   E  the exit door mat (2 tiles, touching a wall)
//   A-Z (except E)  furniture, defined by the theme's legend. Touching tiles with the same
//                   letter form ONE piece of furniture and must make a rectangle.
//
// Playable floor is x 1..14, y 1..8. buildRoom() turns a layout into the room object the game uses,
// and validateRoom() checks it is fair (everything reachable, route clear, clues solvable).

const BASE = require('../public/room.js');
const THEMES = {
  kitchen: require('./kitchen.js'),
  office: require('./office.js'),
  storeroom: require('./storeroom.js')
};

const COLORS = {
  r: { id: 'red', name: 'Red', fill: '#ff8f8f' },
  b: { id: 'blue', name: 'Blue', fill: '#8fc2ff' },
  g: { id: 'green', name: 'Green', fill: '#9be3a8' },
  p: { id: 'purple', name: 'Purple', fill: '#c9a6ff' },
  o: { id: 'orange', name: 'Orange', fill: '#ffb561' },
  y: { id: 'yellow', name: 'Yellow', fill: '#ffe27a' }
};

const W = BASE.W, H = BASE.H;
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function buildRoom(themeKey, index) {
  const theme = THEMES[themeKey];
  const lay = theme.layouts[index];
  const where = `${themeKey} layout ${index + 1}`;
  // layouts are written as the 8 x 14 playable floor; the wall ring is added here
  if (lay.rows.length !== H - 2) throw new Error(`${where}: needs ${H - 2} rows`);
  lay.rows.forEach((r, i) => { if (r.length !== W - 2) throw new Error(`${where}: row ${i + 1} needs ${W - 2} characters, has ${r.length}`); });
  const wallRow = '#'.repeat(W);
  const rows = [wallRow, ...lay.rows.map(r => '#' + r + '#'), wallRow];

  const solids = [], boxes = [], notes = [], starts = [], exitTiles = [];
  const seen = rows.map(r => r.split('').map(() => false));
  const cupboardTiles = {};
  const counts = {};

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = rows[y][x];
      const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      if (border) { if (c !== '#') throw new Error(`${where}: the outer ring must be # (x${x} y${y})`); continue; }
      if (c === '#') throw new Error(`${where}: # inside the room (x${x} y${y})`);
      if (c === '.') continue;
      if (c === 'x') { boxes.push({ x, y, w: 1, h: 1 }); continue; }
      if (c === 'n') { notes.push({ x: x + 0.5, y: y + 0.5 }); continue; }
      if (c === 'E') { exitTiles.push({ x, y }); continue; }
      if (c >= '1' && c <= '4') { starts[+c - 1] = { x: x + 0.5, y: y + 0.5 }; continue; }
      if (COLORS[c]) {
        if (cupboardTiles[c]) throw new Error(`${where}: container '${c}' appears twice`);
        cupboardTiles[c] = { x, y };
        const k = COLORS[c];
        solids.push({ id: k.id, kind: 'cupboard', name: k.name, emoji: '', x, y, w: 1, h: 1, fill: k.fill });
        continue;
      }
      const def = theme.legend[c];
      if (!def) throw new Error(`${where}: unknown character '${c}' at x${x} y${y}`);
      if (seen[y][x]) continue;
      // flood fill the piece of furniture
      const stack = [[x, y]]; seen[y][x] = true;
      let x0 = x, x1 = x, y0 = y, y1 = y, n = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop(); n++;
        x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny][nx] || rows[ny][nx] !== c) continue;
          seen[ny][nx] = true; stack.push([nx, ny]);
        }
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (w * h !== n) throw new Error(`${where}: '${c}' at x${x} y${y} is not a rectangle`);
      counts[c] = (counts[c] || 0) + 1;
      solids.push({
        id: slug(def.name) + (counts[c] > 1 ? '-' + counts[c] : ''),
        kind: def.kind, name: def.name, emoji: def.emoji, x: x0, y: y0, w, h, fill: def.fill, _ch: c
      });
    }
  }
  // fix ids of repeated furniture so every piece has a number (name, name-2, ...) and drop helper field
  solids.forEach(s => { delete s._ch; });

  if (Object.keys(cupboardTiles).length !== 6) throw new Error(`${where}: needs all 6 containers (r b g p o y)`);
  if (notes.length !== 3) throw new Error(`${where}: needs exactly 3 note spots (n), has ${notes.length}`);
  for (let i = 0; i < 4; i++) if (!starts[i]) throw new Error(`${where}: start spot ${i + 1} is missing`);
  if (exitTiles.length !== 2) throw new Error(`${where}: exit E needs exactly 2 tiles`);

  // exit: 2 tiles next to a wall
  const ex0 = Math.min(...exitTiles.map(t => t.x)), ex1 = Math.max(...exitTiles.map(t => t.x));
  const ey0 = Math.min(...exitTiles.map(t => t.y)), ey1 = Math.max(...exitTiles.map(t => t.y));
  const exit = { x: ex0, y: ey0, w: ex1 - ex0 + 1, h: ey1 - ey0 + 1 };
  if (exit.w * exit.h !== 2) throw new Error(`${where}: exit tiles must touch each other`);
  if (exit.h === 2 && exit.x === 1) exit.side = 'left';
  else if (exit.h === 2 && exit.x === W - 2) exit.side = 'right';
  else if (exit.w === 2 && exit.y === 1) exit.side = 'top';
  else if (exit.w === 2 && exit.y === H - 2) exit.side = 'bottom';
  else throw new Error(`${where}: exit must run along a wall`);

  // which things stand next to each container, and which walls it touches (used for clues)
  const neighbors = {}, walls = {};
  const cups = solids.filter(s => s.kind === 'cupboard');
  const others = solids.filter(s => s.kind !== 'cupboard');
  for (const c of cups) {
    const names = new Set();
    for (const o of others) {
      const touchX = c.x + 1 > o.x && c.x < o.x + o.w; // overlap in x
      const touchY = c.y + 1 > o.y && c.y < o.y + o.h; // overlap in y
      const sideX = (c.x + 1 === o.x || o.x + o.w === c.x) && touchY;
      const sideY = (c.y + 1 === o.y || o.y + o.h === c.y) && touchX;
      if (sideX || sideY) names.add(o.name);
    }
    neighbors[c.id] = [...names];
    const wl = [];
    if (c.y === 1) wl.push('top');
    if (c.y === H - 2) wl.push('bottom');
    if (c.x === 1) wl.push('left');
    if (c.x === W - 2) wl.push('right');
    walls[c.id] = wl;
  }

  const route = lay.route.map(([x, y, pause]) => ({ x, y, pause }));
  const room = Object.assign({}, BASE, {
    id: themeKey,
    title: theme.title,
    noun: theme.noun,
    layoutName: lay.name,
    layoutIndex: index,
    theme: theme.look,
    solids, boxes, exit, starts, start: starts[0], notes,
    keypad: { x: exit.x + exit.w / 2, y: exit.y + exit.h / 2 },
    route, neighbors, walls
  });
  return room;
}

// the route point farthest from all runner start spots: the guard starts its patrol there
function spawnWaypoint(room) {
  let best = { index: 0, dist: -1 };
  room.route.forEach((p, i) => {
    const d = Math.min(...room.starts.map(st => Math.hypot(p.x - st.x, p.y - st.y)));
    if (d > best.dist) best = { index: i, dist: d };
  });
  return best;
}

// ----- fairness checks (used by the tests, and logged at server start) -----
function validateRoom(room, makeClues) {
  const problems = [];
  const where = `${room.id} layout ${room.layoutIndex + 1}`;
  const inSolid = (x, y, h) => room.solids.some(s => x + h > s.x && x - h < s.x + s.w && y + h > s.y && y - h < s.y + s.h);
  const tileFree = (tx, ty) => tx >= 1 && ty >= 1 && tx <= W - 2 && ty <= H - 2 &&
    !room.solids.some(s => tx >= s.x && tx < s.x + s.w && ty >= s.y && ty < s.y + s.h);

  // start spots, notes and route points must be on free floor
  room.starts.forEach((p, i) => { if (inSolid(p.x, p.y, 0.3)) problems.push(`${where}: start ${i + 1} is inside furniture`); });
  room.notes.forEach((p, i) => { if (inSolid(p.x, p.y, 0.3)) problems.push(`${where}: note ${i + 1} is inside furniture`); });
  room.route.forEach((p, i) => { if (inSolid(p.x, p.y, 0.25)) problems.push(`${where}: route point ${i + 1} is inside furniture`); });
  // the guard walks straight lines: they must not cross furniture
  room.route.forEach((p, i) => {
    const q = room.route[(i + 1) % room.route.length];
    const steps = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 0.1);
    for (let k = 0; k <= steps; k++) {
      const x = p.x + (q.x - p.x) * k / steps, y = p.y + (q.y - p.y) * k / steps;
      if (inSolid(x, y, 0.25)) { problems.push(`${where}: guard route ${i + 1}->${(i + 1) % room.route.length + 1} crosses furniture`); break; }
    }
  });
  if (room.route.length < 4) problems.push(`${where}: guard route needs 4+ points`);
  // the guard must never start (or wait) right next to the runners' start spots
  room.route.forEach((p, i) => {
    const nearest = Math.min(...room.starts.map(st => Math.hypot(p.x - st.x, p.y - st.y)));
    if (nearest < 2.5) problems.push(`${where}: guard route point ${i + 1} is too close to the runner start spots (${nearest.toFixed(1)} tiles)`);
  });
  if (spawnWaypoint(room) .dist < 4.5) problems.push(`${where}: no guard route point is far enough (4.5+ tiles) from the runner start spots to be the guard's start`);

  // reachability on the tile grid
  const start = room.starts[0];
  const reach = new Set([Math.floor(start.x) + ',' + Math.floor(start.y)]);
  const q = [[Math.floor(start.x), Math.floor(start.y)]];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, key = nx + ',' + ny;
      if (!reach.has(key) && tileFree(nx, ny)) { reach.add(key); q.push([nx, ny]); }
    }
  }
  const can = (x, y) => reach.has(Math.floor(x) + ',' + Math.floor(y));
  room.starts.forEach((p, i) => { if (!can(p.x, p.y)) problems.push(`${where}: start ${i + 1} is walled off`); });
  room.notes.forEach((p, i) => { if (!can(p.x, p.y)) problems.push(`${where}: note ${i + 1} cannot be reached`); });
  room.boxes.forEach((b, i) => { if (!can(b.x + 0.5, b.y + 0.5)) problems.push(`${where}: box ${i + 1} cannot be reached`); });
  for (let tx = room.exit.x; tx < room.exit.x + room.exit.w; tx++) {
    for (let ty = room.exit.y; ty < room.exit.y + room.exit.h; ty++) {
      if (!can(tx + 0.5, ty + 0.5)) problems.push(`${where}: the exit cannot be reached`);
    }
  }
  const cups = room.solids.filter(s => s.kind === 'cupboard');
  for (const c of cups) {
    const open = [[c.x + 1, c.y], [c.x - 1, c.y], [c.x, c.y + 1], [c.x, c.y - 1]].some(([tx, ty]) => reach.has(tx + ',' + ty));
    if (!open) problems.push(`${where}: the ${c.name} container cannot be reached`);
  }

  // notes should not sit right next to a container or the keypad, so "read" and "open" never clash
  room.notes.forEach((p, i) => {
    for (const c of cups) {
      if (Math.hypot(p.x - (c.x + 0.5), p.y - (c.y + 0.5)) < 1.5) problems.push(`${where}: note ${i + 1} is too close to the ${c.name} container`);
    }
    if (Math.hypot(p.x - room.keypad.x, p.y - room.keypad.y) < 2.2) problems.push(`${where}: note ${i + 1} is too close to the keypad`);
    room.notes.forEach((o, j) => { if (j > i && Math.hypot(p.x - o.x, p.y - o.y) < 3) problems.push(`${where}: notes ${i + 1} and ${j + 1} are too close together`); });
  });

  // every container must be solvable by clues
  if (makeClues) {
    for (const c of cups) {
      let good = true;
      try { const r = makeClues(room, c.id); good = !!(r && r.length >= 2 && r.length <= 3); } catch (e) { good = false; }
      if (!good) problems.push(`${where}: no good clue set for the ${c.name} container`);
    }
  }
  return problems;
}

const LIST = [];
for (const key of Object.keys(THEMES)) THEMES[key].layouts.forEach((_, i) => LIST.push({ key, index: i }));

const cache = {};
function getRoom(key, index) {
  const id = key + ':' + index;
  if (!cache[id]) cache[id] = buildRoom(key, index);
  return cache[id];
}

// random room + layout, never the exact same one twice in a row
function pickRoom(prev) {
  const pool = LIST.filter(r => !prev || r.key !== prev.key || r.index !== prev.index);
  const p = pool[Math.floor(Math.random() * pool.length)];
  return getRoom(p.key, p.index);
}

module.exports = { THEMES, LIST, buildRoom, validateRoom, getRoom, pickRoom, spawnWaypoint };
