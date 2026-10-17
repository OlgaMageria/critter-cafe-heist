// Cartoon renderer. Pure drawing functions: they take a 2D context and plain data,
// so they work in the browser and can also be tested in Node with a canvas library.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./room.js'));
  else root.RENDER = factory(root.ROOM);
})(typeof self !== 'undefined' ? self : this, function (R0) {
  let R = R0; // the current room; replaced with setRoom() at the start of every round
  const T = 40;
  const W = R.W * T, H = R.H * T;
  const INK = '#5a3e36';
  const FONT = '"Fredoka","Trebuchet MS",system-ui,sans-serif';
  const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function emoji(ctx, ch, x, y, size, alpha) {
    if (!ch) return;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.font = size + 'px ' + EMOJI;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, x, y + size * 0.05);
    ctx.restore();
  }
  function label(ctx, str, x, y, size, color) {
    ctx.save();
    ctx.font = '600 ' + size + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color || INK;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function drawBase(ctx, gray) {
    const th = R.theme || {};
    const ex = R.exit;
    ctx.fillStyle = gray ? '#a7b0ba' : (th.wall || '#c79a7a');
    ctx.fillRect(0, 0, W, H);
    // wall trim
    ctx.strokeStyle = gray ? '#8d96a0' : (th.trim || '#a87a5c');
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    // floor
    for (let j = 1; j < R.H - 1; j++) {
      for (let i = 1; i < R.W - 1; i++) {
        const even = (i + j) % 2 === 0;
        ctx.fillStyle = gray ? (even ? '#eef1f4' : '#e2e7ec') : (even ? (th.floorA || '#fff3e0') : (th.floorB || '#ffe8cc'));
        ctx.fillRect(i * T, j * T, T, T);
      }
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.strokeRect(T, T, W - 2 * T, H - 2 * T);
    if (!gray) {
      // cute windows on the top wall (skipped where the exit door is)
      const doorX0 = ex && ex.side === 'top' ? ex.x : -9, doorX1 = ex && ex.side === 'top' ? ex.x + ex.w : -9;
      (th.windows || []).forEach(([wx, ww]) => {
        if (wx < doorX1 + 0.5 && wx + ww > doorX0 - 0.5) return;
        ctx.fillStyle = '#cdeeff';
        rr(ctx, wx * T + 4, 7, ww * T - 8, 24, 6); ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(wx * T + ww * T / 2, 7); ctx.lineTo(wx * T + ww * T / 2, 31);
        ctx.stroke();
      });
      if (th.deco && !(th.deco.x > doorX0 - 0.7 && th.deco.x < doorX1 + 0.7)) emoji(ctx, th.deco.emoji, th.deco.x * T, 20, 20);
    }
  }

  function drawBoxes(ctx, withLabel) {
    R.boxes.forEach(b => {
      const x = b.x * T, y = b.y * T;
      ctx.fillStyle = '#e0b57a';
      rr(ctx, x + 3, y + 5, T - 6, T - 8, 6); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = '#f0cf9d';
      ctx.fillRect(x + T / 2 - 4, y + 5, 8, T - 8);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      ctx.strokeRect(x + T / 2 - 4, y + 5, 8, T - 8);
      if (withLabel) label(ctx, 'Box', x + T / 2, y + T + 7, 11);
    });
  }

  // state: { ul: door code accepted, cro: croissant found }
  // The door sits in the wall on R.exit.side (left, right, top or bottom); the mat is on the floor in front of it.
  function drawExit(ctx, st, withLabel, tm) {
    st = st || {};
    const e = R.exit;
    const side = e.side || 'left';
    const vertical = side === 'left' || side === 'right';
    const open = !!(st.ul && st.cro);
    // floor mat (pulses green once the door is open and you carry the croissant)
    const pulse = open ? 0.4 + 0.2 * Math.sin((tm || 0) * 4) : 0;
    ctx.fillStyle = open ? 'rgba(90,210,140,' + pulse.toFixed(2) + ')' : 'rgba(200,180,170,0.35)';
    rr(ctx, e.x * T + 4, e.y * T + 4, e.w * T - 8, e.h * T - 8, 8); ctx.fill();
    ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); ctx.setLineDash([]);
    // door in the wall
    let dx, dy, dw, dh;
    if (vertical) { dw = T - 8; dh = e.h * T - 6; dx = side === 'left' ? 4 : W - T + 4; dy = e.y * T + 3; }
    else { dw = e.w * T - 6; dh = T - 8; dx = e.x * T + 3; dy = side === 'top' ? 4 : H - T + 4; }
    ctx.fillStyle = open ? '#8fd3a4' : (st.ul ? '#e8dca8' : '#d3c3b4');
    rr(ctx, dx, dy, dw, dh, 8); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    // little keypad plate: red lights while locked, green once the code is in
    const pw = vertical ? dw - 10 : 26, ph = vertical ? 24 : dh - 10;
    const kx = dx + 5, ky = dy + 5;
    ctx.fillStyle = '#3d3a4f';
    rr(ctx, kx, ky, pw, ph, 4); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      ctx.fillStyle = st.ul ? '#7ddf9a' : '#ff8f8f';
      const lx = vertical ? kx + 6 + c * 8 : kx + 6 + c * 7, ly = vertical ? ky + 7 + r * 9 : ky + 6 + r * 9;
      ctx.beginPath(); ctx.arc(lx, ly, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    emoji(ctx, open ? '🚪' : (st.ul ? '🔓' : '🔒'),
      vertical ? dx + dw / 2 : dx + dw - 22, vertical ? dy + dh - 22 : dy + dh / 2, 22);
    if (withLabel) {
      const txt = st.ul ? 'EXIT' : 'EXIT 🔢';
      if (vertical) label(ctx, txt, dx + dw / 2 + (side === 'left' ? 6 : -6), e.y * T - 8, 12);
      else label(ctx, txt, e.x * T + e.w * T / 2, side === 'top' ? (e.y + 1) * T + 9 : e.y * T - 9, 12);
    }
  }

  // Sticky notes on the floor: "?" until a Runner reads them, then the symbol
  function drawNotes(ctx, S, withLabel) {
    R.notes.forEach((n, i) => {
      const sym = S && S.nt && S.nt[i];
      const x = n.x * T, y = n.y * T;
      ctx.save();
      ctx.translate(x, y); ctx.rotate((i - 1) * 0.12);
      ctx.fillStyle = 'rgba(60,40,30,0.2)';
      rr(ctx, -10, -10, 24, 26, 3); ctx.fill();
      ctx.fillStyle = sym ? '#d9f5c4' : '#fff4a8';
      rr(ctx, -12, -13, 24, 26, 3); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
      ctx.restore();
      if (sym) emoji(ctx, sym, x, y, 17);
      else label(ctx, '?', x, y, 16);
      if (withLabel) label(ctx, 'Note ' + (i + 1), x, y + 25, 11);
    });
  }

  function drawSolid(ctx, s, o) {
    o = o || {};
    const x = s.x * T, y = s.y * T, w = s.w * T, h = s.h * T;
    ctx.fillStyle = 'rgba(60,40,30,0.22)';
    rr(ctx, x + 3, y + 6, w - 4, h - 4, 10); ctx.fill();
    ctx.fillStyle = o.gray ? '#b4bcc6' : s.fill;
    rr(ctx, x + 2, y + 2, w - 4, h - 5, 10); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = o.gray ? '#6f7882' : INK; ctx.stroke();
    if (!o.gray) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      rr(ctx, x + 8, y + 6, w - 16, 5, 3); ctx.fill();
    }
    if (s.kind === 'cupboard' && !o.gray && o.plain) {
      if (o.opened) { ctx.fillStyle = 'rgba(74,52,52,0.55)'; rr(ctx, x + 6, y + 8, w - 12, h - 17, 5); ctx.fill(); }
    } else if (s.kind === 'cupboard' && !o.gray) {
      const st = o.opened;
      if (st) {
        ctx.fillStyle = '#4a3434';
        rr(ctx, x + 7, y + 8, w - 14, h - 17, 5); ctx.fill();
        ctx.fillStyle = s.fill;
        ctx.fillRect(x + 3, y + 5, 6, h - 12);
        ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(x + 3, y + 5, 6, h - 12);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        rr(ctx, x + 7, y + 13, w - 14, h - 22, 5); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(x + w - 13, y + h / 2 + 2, 3, 0, Math.PI * 2); ctx.fill();
      }
    } else if (!o.noEmoji && s.emoji) {
      emoji(ctx, s.emoji, x + w / 2, y + (h - 3) / 2, Math.min(34, Math.min(w, h) * 0.65));
    }
    if (o.label) {
      // shrink long names so they fit on small pieces of furniture
      const base = s.w >= 2 ? 13 : (s.kind === 'cupboard' ? 10 : 12);
      const fit = Math.max(8, Math.min(base, (s.w * T - 4) / (String(o.label).length * 0.58)));
      label(ctx, o.label, x + w / 2, y + h / 2 - 1, fit);
    }
  }

  const RINGS = ['#ff7aa8', '#4f9dff', '#3fbf80', '#ffb020'];

  // rn: {x, y, avatar, name, idx}   o: {hid, carry, tm, popAge, tag}
  function drawRunner(ctx, rn, o) {
    o = o || {};
    const px = rn.x * T, py = rn.y * T;
    ctx.fillStyle = 'rgba(60,40,30,0.25)';
    ctx.beginPath(); ctx.ellipse(px, py + 11, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (o.tag) {
      // several runners: a colored ring under the feet and a name tag
      ctx.strokeStyle = RINGS[(rn.idx || 0) % RINGS.length]; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.ellipse(px, py + 11, 15, 7, 0, 0, Math.PI * 2); ctx.stroke();
      label(ctx, rn.name || '', px, py + 27, 10);
    }
    emoji(ctx, rn.avatar || '🐭', px, py, 28, o.hid ? 0.55 : 1);
    if (o.hid) emoji(ctx, '🤫', px - 14, py - 20, 15);
    if (o.carry) {
      // the golden croissant: big, glowing, bobbing next to the mouse
      const t = o.tm || 0;
      const cx = px + 14, cy = py - 22 + Math.sin(t * 5) * 2.5;
      const g = ctx.createRadialGradient(cx, cy, 3, cx, cy, 26);
      g.addColorStop(0, 'rgba(255,214,90,0.95)');
      g.addColorStop(1, 'rgba(255,214,90,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff1b8';
      ctx.beginPath(); ctx.arc(cx, cy, 15, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      emoji(ctx, '🥐', cx, cy, 24);
      emoji(ctx, '✨', cx - 15, cy - 13 + Math.sin(t * 7) * 2, 12);
      emoji(ctx, '✨', cx + 15, cy + 9 + Math.cos(t * 6) * 2, 10);
    }
    const popAge = o.popAge;
    if (popAge != null && popAge >= 0 && popAge < 1.5) {
      // "found it!" burst: expanding golden ring and a croissant floating up
      const k = popAge / 1.5;
      ctx.strokeStyle = 'rgba(255,190,40,' + (1 - k).toFixed(2) + ')';
      ctx.lineWidth = 2 + 6 * (1 - k);
      ctx.beginPath(); ctx.arc(px, py, 14 + k * 80, 0, Math.PI * 2); ctx.stroke();
      emoji(ctx, '🥐', px, py - 26 - k * 34, 30 + (1 - k) * 26, 1 - k * 0.6);
    }
  }

  // guard modes (same numbers as the server): 0 patrol, 1 chase, 2 investigate, 3 search, 4 return, 5 stunned
  const GM = { patrol: 0, chase: 1, investigate: 2, search: 3, back: 4, stunned: 5 };
  // o: { mode, alert, tm }
  function drawGuard(ctx, gx, gy, o) {
    o = o || {};
    const px = gx * T, py = gy * T, tm = o.tm || 0;
    const m = o.mode || 0;
    ctx.fillStyle = 'rgba(60,40,30,0.25)';
    ctx.beginPath(); ctx.ellipse(px, py + 12, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    const angry = m === GM.chase || o.alert;
    // a chasing cat bounces as it runs
    const bob = m === GM.chase ? Math.abs(Math.sin(tm * 14)) * -4 : 0;
    emoji(ctx, m === GM.stunned ? '😵' : angry ? '😾' : '🐱', px, py + bob, 31);
    if (m === GM.chase) emoji(ctx, '‼️', px, py - 26 + bob, 18);
    else if (m === GM.investigate) emoji(ctx, '👂', px + 14, py - 22, 15);
    else if (m === GM.search) emoji(ctx, '❓', px, py - 26 + Math.sin(tm * 5) * 2, 17);
    else if (m === GM.stunned) {
      for (let k = 0; k < 3; k++) {
        const a = tm * 5 + k * 2.1;
        emoji(ctx, '⭐', px + Math.cos(a) * 15, py - 22 + Math.sin(a) * 5, 10);
      }
    } else if (o.alert) emoji(ctx, '❗', px, py - 25, 18);
  }

  // Floating effects for game events: fx = [{x, y, e, t0, big}] (tiles, seconds)
  const FX_LIFE = 1.6;
  function drawFx(ctx, fx, now) {
    (fx || []).forEach(f => {
      const age = now - f.t0;
      if (age < 0 || age > FX_LIFE) return;
      const k = age / FX_LIFE;
      const px = f.x * T, py = f.y * T - 14 - k * 34;
      if (f.big) {
        ctx.strokeStyle = 'rgba(255,90,90,' + (1 - k).toFixed(2) + ')';
        ctx.lineWidth = 2 + 5 * (1 - k);
        ctx.beginPath(); ctx.arc(f.x * T, f.y * T, 10 + k * 60, 0, Math.PI * 2); ctx.stroke();
      }
      emoji(ctx, f.e, px, py, (f.big ? 30 : 22) * (1 + 0.3 * Math.sin(Math.min(1, age * 4) * Math.PI)), 1 - k * k);
    });
  }

  // "E: open the red cupboard" bubble over the Runner
  function drawPrompt(ctx, p) {
    if (!p || !p.text) return;
    const txt = (p.key || 'E') + ': ' + p.text;
    ctx.save();
    ctx.font = '600 13px ' + FONT;
    const w = ctx.measureText(txt).width + 16, h = 22;
    let x = p.x * T - w / 2, y = p.y * T - 52;
    x = Math.max(4, Math.min(W - w - 4, x)); y = Math.max(4, y);
    ctx.globalAlpha = p.done ? 0.75 : 1;
    ctx.fillStyle = p.done ? '#eee6df' : '#fff7cf';
    rr(ctx, x, y, w, h, 9); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x + w / 2, y + h / 2 + 1);
    ctx.restore();
  }

  // The runners in a view: V.rs = [{x, y, avatar, name, idx, out}] (smoothed positions)
  function runnersOf(V) {
    if (V && V.rs && V.rs.length) return V.rs;
    return [{ x: R.start.x, y: R.start.y, avatar: '🐭', name: '', idx: 0, out: false }];
  }

  function darkLayer(ctx) {
    const c = ctx.canvas;
    if (!c || typeof document === 'undefined') return null;
    if (!c._dark) { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; c._dark = d; }
    return c._dark;
  }

  // darkness everywhere except a soft flashlight circle around each light
  function drawDarkness(ctx, lights) {
    const rad = R.light * T;
    const layer = darkLayer(ctx);
    if (layer) {
      const dc = layer.getContext('2d');
      const k = layer.width / W;
      dc.setTransform(k, 0, 0, k, 0, 0);
      dc.globalCompositeOperation = 'source-over';
      dc.clearRect(0, 0, W, H);
      dc.fillStyle = 'rgba(22,14,40,0.992)';
      dc.fillRect(0, 0, W, H);
      dc.globalCompositeOperation = 'destination-out';
      lights.forEach(l => {
        const px = l.x * T, py = l.y * T;
        const g = dc.createRadialGradient(px, py, rad * 0.55, px, py, rad);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        dc.fillStyle = g;
        dc.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      });
      dc.globalCompositeOperation = 'source-over';
      ctx.drawImage(layer, 0, 0, W, H);
    } else {
      lights.forEach(l => {
        const px = l.x * T, py = l.y * T;
        const g = ctx.createRadialGradient(px, py, rad * 0.55, px, py, rad);
        g.addColorStop(0, 'rgba(22,14,40,0)');
        g.addColorStop(1, 'rgba(22,14,40,0.992)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      });
    }
    // a warm ring so the light looks like a torch
    ctx.strokeStyle = 'rgba(255,230,150,0.35)'; ctx.lineWidth = 2;
    lights.forEach(l => { ctx.beginPath(); ctx.arc(l.x * T, l.y * T, rad * 0.97, 0, Math.PI * 2); ctx.stroke(); });
  }

  // ----- the shared "flashlight" view -----
  // opts.light: runner indexes whose flashlight is shown (a Runner sees only their own light);
  // leave it out to see all lights at once (what the specialists get).
  function drawShared(ctx, S, V, opts) {
    ctx.clearRect(0, 0, W, H);
    drawBase(ctx, false);
    drawBoxes(ctx, false);
    drawExit(ctx, S, false, V && V.t);
    drawNotes(ctx, S, false);
    R.solids.forEach(s => drawSolid(ctx, s, { opened: S && S.op && S.op[s.id] }));
    const rs = runnersOf(V);
    const tag = rs.length > 1;
    rs.forEach((rn, i) => {
      if (rn.out) return;
      const carry = !!(S && S.cro && S.car === i);
      drawRunner(ctx, rn, { hid: S && S.rs && S.rs[i] && S.rs[i].h, carry, tm: V && V.t, popAge: carry ? (V && V.pop) : null, tag });
    });
    let lights = rs.filter(r => !r.out);
    if (opts && opts.light && opts.light.length) {
      const only = lights.filter(r => opts.light.indexOf(r.idx) >= 0);
      if (only.length) lights = only;
    }
    if (V && lights.some(l => Math.hypot(V.gx - l.x, V.gy - l.y) < R.light + 0.4)) {
      drawGuard(ctx, V.gx, V.gy, { mode: S && S.gm, alert: S && (S.seen || S.ag), tm: V.t });
    }
    if (V) drawFx(ctx, V.fx, V.t); // drawn under the darkness: you only see what happens in your light
    drawDarkness(ctx, lights);
    if (opts && opts.prompt) drawPrompt(ctx, opts.prompt);
  }

  // ----- Mapper: the whole room, labels, live runner dots -----
  function drawMap(ctx, S, V, data) {
    ctx.clearRect(0, 0, W, H);
    drawBase(ctx, false);
    drawBoxes(ctx, true);
    drawExit(ctx, S, true, V && V.t);
    drawNotes(ctx, S, true);
    const visible = new Set((data && data.labelIds) || []);
    R.solids.forEach(s => {
      let lab;
      if (s.kind === 'cupboard') lab = s.name;
      else lab = visible.has(s.id) ? s.name : '❓';
      drawSolid(ctx, s, { noEmoji: true, plain: true, label: lab, opened: S && S.op && S.op[s.id] });
    });
    const rs = runnersOf(V);
    const tag = rs.length > 1;
    rs.forEach((rn, i) => {
      if (rn.out) return;
      ctx.strokeStyle = 'rgba(255,120,160,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(rn.x * T, rn.y * T, 17, 0, Math.PI * 2); ctx.stroke();
      const carry = !!(S && S.cro && S.car === i);
      drawRunner(ctx, rn, { hid: S && S.rs && S.rs[i] && S.rs[i].h, carry, tm: V && V.t, popAge: carry ? (V && V.pop) : null, tag });
      if (S && S.rs && S.rs[i] && S.rs[i].c === 0) emoji(ctx, '🔌', rn.x * T + 16, rn.y * T - 18, 16);
    });
    if (V) drawFx(ctx, (V.fx || []).filter(f => !f.cat), V.t);
  }

  // ----- Lookout: furniture as grey blocks, the guard route and/or a fuzzy cat "radar" -----
  function drawLookout(ctx, S, V, data) {
    ctx.clearRect(0, 0, W, H);
    drawBase(ctx, true);
    R.solids.forEach(s => drawSolid(ctx, s, { gray: true }));
    if (data && data.showRoute && data.route) {
      const rt = data.route;
      ctx.setLineDash([8, 6]); ctx.lineWidth = 3.5; ctx.strokeStyle = '#ff6f91';
      ctx.beginPath();
      rt.forEach((p, i) => { i ? ctx.lineTo(p.x * T, p.y * T) : ctx.moveTo(p.x * T, p.y * T); });
      ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      // direction arrows
      rt.forEach((p, i) => {
        const q = rt[(i + 1) % rt.length];
        const mx = (p.x + q.x) / 2 * T, my = (p.y + q.y) / 2 * T;
        const a = Math.atan2(q.y - p.y, q.x - p.x);
        ctx.save(); ctx.translate(mx, my); ctx.rotate(a);
        ctx.fillStyle = '#ff6f91'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath();
        ctx.fill(); ctx.stroke(); ctx.restore();
      });
      rt.forEach((p, i) => {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(p.x * T, p.y * T, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        label(ctx, String(i + 1), p.x * T, p.y * T + 1, 13);
        label(ctx, 'waits ' + p.pause + 's', p.x * T, p.y * T + 23, 11, '#c2410c');
      });
    }
    if (data && data.showLive && V) {
      // Radar: the cat is only a fuzzy blip that refreshes every few seconds and fades in between.
      // No view cone and no exact facing: work out where it is heading yourself.
      const now = V.t || 0;
      const fade = R.radar.fade;
      const halo = R.radar.jitter * T * 1.3;
      if (V.pingPrev) {
        const q = V.pingPrev;
        ctx.strokeStyle = 'rgba(120,130,150,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(q.x * T, q.y * T, 9, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        label(ctx, 'before', q.x * T, q.y * T + 20, 10, '#7a8794');
      }
      if (V.ping) {
        const p = V.ping;
        const age = Math.max(0, now - p.t0);
        const a = Math.max(0, 1 - age / fade);
        if (a > 0) {
          ctx.fillStyle = 'rgba(90,200,140,' + (0.22 * a).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(p.x * T, p.y * T, halo, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(60,170,110,' + (0.8 * a).toFixed(3) + ')'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(p.x * T, p.y * T, halo, 0, Math.PI * 2); ctx.stroke();
          emoji(ctx, '🐾', p.x * T, p.y * T, 22, 0.35 + 0.65 * a);
        }
        if (age < 1) {
          ctx.strokeStyle = 'rgba(60,170,110,' + (1 - age).toFixed(2) + ')'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(p.x * T, p.y * T, halo * (0.4 + age * 1.6), 0, Math.PI * 2); ctx.stroke();
        }
      }
      label(ctx, '📡 radar ping every ' + R.radar.every + 's', W / 2, (R.H - 0.5) * T, 11, '#3d7a5a');
      const mood = S && { 1: 'CHASING A RUNNER!', 2: 'HEARD A NOISE, GOING TO LOOK', 3: 'SEARCHING', 4: 'WALKING BACK TO ITS ROUTE', 5: 'DAZED' }[S.gm];
      if (mood) label(ctx, '🐱 ' + mood, W / 2, 0.55 * T, 14, '#c2410c');
      else if (S && S.ag) label(ctx, 'ALERT!', W / 2, 0.55 * T, 14, '#c2410c');
    }
  }

  // ----- end-of-round replay: the whole room with everything revealed, trails and events -----
  // rp: { every, duration, frames: [{t, g: [x, y, mode], r: [[x, y, flags]]}], events, runners, route }
  // rv: { truth, noteSyms }   flags: 1 hiding, 2 seen, 4 out
  function frameAt(rp, t) {
    const fr = rp.frames;
    if (!fr.length) return null;
    let lo = 0, hi = fr.length - 1;
    if (t <= fr[0].t) return Object.assign({ idx: 0 }, fr[0]);
    if (t >= fr[hi].t) return Object.assign({ idx: hi }, fr[hi]);
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (fr[m].t <= t) lo = m; else hi = m; }
    const a = fr[lo], b = fr[hi], k = (t - a.t) / ((b.t - a.t) || 1);
    const mix = (p, q) => p + (q - p) * k;
    return {
      idx: lo, t,
      g: [mix(a.g[0], b.g[0]), mix(a.g[1], b.g[1]), a.g[2]],
      r: a.r.map((ra, i) => { const rb = b.r[i] || ra; return [mix(ra[0], rb[0]), mix(ra[1], rb[1]), ra[2]]; })
    };
  }
  const REPLAY_FX = { note: '📝', found: '🥐', wrong: '💥', badcode: '🚫', unlock: '🔓', out: '🚪', spotted: '‼️', lost: '❓', pounce: '💥' };
  function drawReplay(ctx, rp, rv, t) {
    ctx.clearRect(0, 0, W, H);
    const evs = rp.events.filter(e => e.at <= t);
    const ul = evs.some(e => e.k === 'unlock');
    const foundEv = evs.filter(e => e.k === 'found').pop();
    drawBase(ctx, false);
    drawBoxes(ctx, false);
    drawExit(ctx, { ul, cro: !!foundEv }, true, t);
    drawNotes(ctx, { nt: rv.noteSyms }, true);
    const op = {};
    evs.forEach(e => { if (e.k === 'wrong') op[e.id] = 'empty'; if (e.k === 'found') op[e.id] = 'croissant'; });
    R.solids.forEach(s => drawSolid(ctx, s, { noEmoji: true, plain: true, label: s.name, opened: op[s.id] }));
    // the right container glows gold
    const tr = R.solids.find(s => s.id === rv.truth);
    if (tr) {
      ctx.strokeStyle = 'rgba(255,190,40,' + (0.65 + 0.3 * Math.sin(t * 4)).toFixed(2) + ')'; ctx.lineWidth = 5;
      rr(ctx, tr.x * T - 3, tr.y * T - 3, tr.w * T + 6, tr.h * T + 6, 12); ctx.stroke();
      emoji(ctx, '🥐', tr.x * T + tr.w * T - 4, tr.y * T + 4, 18);
    }
    const f = frameAt(rp, t);
    if (!f) return;
    // the cat's last few seconds, dashed red
    const fr = rp.frames;
    const g0 = Math.max(0, f.idx - Math.round(6 / (rp.every || 0.25)));
    ctx.setLineDash([5, 5]); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(230,60,80,0.55)';
    ctx.beginPath(); ctx.moveTo(fr[g0].g[0] * T, fr[g0].g[1] * T);
    for (let i = g0 + 1; i <= f.idx; i++) ctx.lineTo(fr[i].g[0] * T, fr[i].g[1] * T);
    ctx.lineTo(f.g[0] * T, f.g[1] * T); ctx.stroke(); ctx.setLineDash([]);
    // every Runner's whole path so far
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    (rp.runners || []).forEach((_, i) => {
      ctx.strokeStyle = RINGS[i % RINGS.length]; ctx.globalAlpha = 0.75; ctx.lineWidth = 3.5;
      ctx.beginPath();
      let pen = false;
      for (let k = 0; k <= f.idx; k++) {
        const r = fr[k].r[i]; if (!r || r[2] & 4) { pen = false; continue; }
        if (pen) ctx.lineTo(r[0] * T, r[1] * T); else { ctx.moveTo(r[0] * T, r[1] * T); pen = true; }
      }
      const cur = f.r[i]; if (pen && cur && !(cur[2] & 4)) ctx.lineTo(cur[0] * T, cur[1] * T);
      ctx.stroke(); ctx.globalAlpha = 1;
    });
    drawFx(ctx, evs.filter(e => t - e.at < FX_LIFE).map(e => ({ x: e.x, y: e.y, e: REPLAY_FX[e.k] || '✨', t0: e.at, big: e.k === 'pounce' || e.k === 'wrong' })), t);
    f.r.forEach((r, i) => {
      if (r[2] & 4) return;
      const info = (rp.runners || [])[i] || {};
      drawRunner(ctx, { x: r[0], y: r[1], avatar: info.avatar, name: info.name, idx: i },
        { hid: r[2] & 1, carry: !!foundEv && foundEv.i === i, tm: t, tag: true });
      if (r[2] & 2) emoji(ctx, '👀', r[0] * T - 16, r[1] * T - 18, 14);
    });
    drawGuard(ctx, f.g[0], f.g[1], { mode: f.g[2], tm: t });
  }

  function setRoom(r) { R = r; }
  function getRoom() { return R; }

  return { T, W, H, drawShared, drawMap, drawLookout, drawReplay, setRoom, getRoom };
});
