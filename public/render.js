// Cartoon renderer. Pure drawing functions: they take a 2D context and plain data,
// so they work in the browser and can also be tested in Node with a canvas library.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./room.js'));
  else root.RENDER = factory(root.ROOM);
})(typeof self !== 'undefined' ? self : this, function (R) {
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
    ctx.fillStyle = gray ? '#a7b0ba' : '#c79a7a';
    ctx.fillRect(0, 0, W, H);
    // wall trim
    ctx.strokeStyle = gray ? '#8d96a0' : '#a87a5c';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    // floor
    for (let j = 1; j < R.H - 1; j++) {
      for (let i = 1; i < R.W - 1; i++) {
        const even = (i + j) % 2 === 0;
        ctx.fillStyle = gray ? (even ? '#eef1f4' : '#e2e7ec') : (even ? '#fff3e0' : '#ffe8cc');
        ctx.fillRect(i * T, j * T, T, T);
      }
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.strokeRect(T, T, W - 2 * T, H - 2 * T);
    if (!gray) {
      // cute windows on the top wall
      [[3, 2], [9, 2]].forEach(([wx, ww]) => {
        ctx.fillStyle = '#cdeeff';
        rr(ctx, wx * T + 4, 7, ww * T - 8, 24, 6); ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(wx * T + ww * T / 2, 7); ctx.lineTo(wx * T + ww * T / 2, 31);
        ctx.stroke();
      });
      emoji(ctx, '☕', 12.5 * T, 20, 20);
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

  function drawExit(ctx, open, withLabel, tm) {
    const e = R.exit;
    // floor mat (pulses green once you carry the croissant)
    const pulse = open ? 0.4 + 0.2 * Math.sin((tm || 0) * 4) : 0;
    ctx.fillStyle = open ? 'rgba(90,210,140,' + pulse.toFixed(2) + ')' : 'rgba(200,180,170,0.35)';
    rr(ctx, e.x * T + 4, e.y * T + 4, e.w * T - 8, e.h * T - 8, 8); ctx.fill();
    ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); ctx.setLineDash([]);
    // door in the wall
    ctx.fillStyle = open ? '#8fd3a4' : '#d3c3b4';
    rr(ctx, 4, e.y * T + 3, T - 8, e.h * T - 6, 8); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    emoji(ctx, open ? '🚪' : '🔒', T / 2, (e.y + e.h / 2) * T, 22);
    if (withLabel) label(ctx, 'EXIT', T / 2, e.y * T - 8, 12);
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
    if (o.label) label(ctx, o.label, x + w / 2, y + h / 2 - 1, s.w >= 2 ? 13 : (s.kind === 'cupboard' ? 10 : 12));
  }

  function drawRunner(ctx, x, y, hid, cro, tm, popAge, avatar) {
    const px = x * T, py = y * T;
    ctx.fillStyle = 'rgba(60,40,30,0.25)';
    ctx.beginPath(); ctx.ellipse(px, py + 11, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    emoji(ctx, avatar || '🐭', px, py, 28, hid ? 0.55 : 1);
    if (hid) emoji(ctx, '🤫', px - 14, py - 20, 15);
    if (cro) {
      // the golden croissant: big, glowing, bobbing next to the mouse
      const t = tm || 0;
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
    if (popAge != null && popAge >= 0 && popAge < 1.5) {
      // "found it!" burst: expanding golden ring and a croissant floating up
      const k = popAge / 1.5;
      ctx.strokeStyle = 'rgba(255,190,40,' + (1 - k).toFixed(2) + ')';
      ctx.lineWidth = 2 + 6 * (1 - k);
      ctx.beginPath(); ctx.arc(px, py, 14 + k * 80, 0, Math.PI * 2); ctx.stroke();
      emoji(ctx, '🥐', px, py - 26 - k * 34, 30 + (1 - k) * 26, 1 - k * 0.6);
    }
  }

  function drawGuard(ctx, gx, gy, seen) {
    const px = gx * T, py = gy * T;
    ctx.fillStyle = 'rgba(60,40,30,0.25)';
    ctx.beginPath(); ctx.ellipse(px, py + 12, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    emoji(ctx, seen ? '😾' : '🐱', px, py, 31);
    if (seen) emoji(ctx, '❗', px, py - 25, 18);
  }

  function drawCone(ctx, gx, gy, ang, alert) {
    const px = gx * T, py = gy * T;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, (R.guard.range + (alert ? R.alertRangeBonus : 0)) * T, ang - R.guard.half, ang + R.guard.half);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,90,100,0.22)'; ctx.fill();
    ctx.strokeStyle = 'rgba(235,60,80,0.7)'; ctx.lineWidth = 2; ctx.stroke();
  }

  // ----- the shared "flashlight" view everyone sees -----
  function drawShared(ctx, S, V) {
    ctx.clearRect(0, 0, W, H);
    drawBase(ctx, false);
    drawBoxes(ctx, false);
    drawExit(ctx, !!(S && S.cro), false, V && V.t);
    R.solids.forEach(s => drawSolid(ctx, s, { opened: S && S.op && S.op[s.id] }));
    const rx = V ? V.rx : R.start.x, ry = V ? V.ry : R.start.y;
    drawRunner(ctx, rx, ry, S && S.hid, S && S.cro, V && V.t, V && V.pop, V && V.avatar);
    if (V && Math.hypot(V.gx - rx, V.gy - ry) < R.light + 0.4) drawGuard(ctx, V.gx, V.gy, S && (S.seen || S.ag));
    // darkness with a soft flashlight circle around the runner
    const px = rx * T, py = ry * T, rad = R.light * T;
    const g = ctx.createRadialGradient(px, py, rad * 0.55, px, py, rad);
    g.addColorStop(0, 'rgba(22,14,40,0)');
    g.addColorStop(1, 'rgba(22,14,40,0.992)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // a warm ring so the light looks like a torch
    ctx.strokeStyle = 'rgba(255,230,150,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, rad * 0.97, 0, Math.PI * 2); ctx.stroke();
  }

  // ----- Mapper: the whole room, labels, live runner dot -----
  function drawMap(ctx, S, V, data) {
    ctx.clearRect(0, 0, W, H);
    drawBase(ctx, false);
    drawBoxes(ctx, true);
    drawExit(ctx, !!(S && S.cro), true, V && V.t);
    const visible = new Set((data && data.labelIds) || []);
    R.solids.forEach(s => {
      let lab;
      if (s.kind === 'cupboard') lab = s.name;
      else lab = visible.has(s.id) ? s.name : '❓';
      drawSolid(ctx, s, { noEmoji: true, plain: true, label: lab, opened: S && S.op && S.op[s.id] });
    });
    const rx = V ? V.rx : R.start.x, ry = V ? V.ry : R.start.y;
    ctx.strokeStyle = 'rgba(255,120,160,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(rx * T, ry * T, 17, 0, Math.PI * 2); ctx.stroke();
    drawRunner(ctx, rx, ry, S && S.hid, S && S.cro, V && V.t, V && V.pop, V && V.avatar);
  }

  // ----- Lookout: furniture as grey blocks, guard route and/or live guard -----
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
      const al = !!(S && S.ag);
      drawCone(ctx, V.gx, V.gy, V.ga, al);
      drawGuard(ctx, V.gx, V.gy, al);
      if (al) label(ctx, 'ALERT!', V.gx * T, V.gy * T - 38, 14, '#c2410c');
    }
  }

  return { T, W, H, drawShared, drawMap, drawLookout };
});
