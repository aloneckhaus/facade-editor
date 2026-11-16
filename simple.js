/* Facade editor v0.2 – simple: floor/wall grid + windows only. World units = metres, y up. */
(function () {
'use strict';
var $ = function (id) { return document.getElementById(id); };
var cv = $('cv'), ctx = cv.getContext('2d'), DPR = window.devicePixelRatio || 1;
var PALETTE = ['#0f9d9a', '#2e9e44', '#2f5fd6', '#9b3fb0', '#e07b00', '#0f9aa8', '#b8860b', '#c2185b'];

var S = {
  G: { floors: 8, h: 3.15, h0: null, bays: [6, 4.5, 6, 4.5], wall: 0.25, ox: 0, oy: 0 },
  types: [
    { id: 'A', w: 0.6, h: 1.4, sill: 0.9, color: '#0f9d9a' },
    { id: 'B', w: 1.0, h: 1.2, sill: 1.0, color: '#2e9e44' },
    { id: 'C', w: 1.6, h: 1.2, sill: 1.0, color: '#2f5fd6' },
    { id: 'D', w: 1.2, h: 2.4, sill: 0.0, color: '#9b3fb0' }
  ],
  win: [],
  gen: { pct: { A: 40, B: 25, C: 25, D: 10 }, gap: 0.6, margin: 0.4, top: 0.3, per: 2, empty: 10, max: 0, same: false, seed: 1 },
  view: { s: 20, ox: 300, oy: 600 },
  sel: new Set(), cells: new Set(), place: null,
  bg: null, model: null, bgOp: 0.35, bgUnit: 'auto', unitScale: 1, srcUnits: 0, bgName: '', bgExp: false
};
var nid = 1; function uid() { return 'w' + (nid++); }
function T(id) { for (var i = 0; i < S.types.length; i++) if (S.types[i].id === id) return S.types[i]; return null; }
function W(id) { for (var i = 0; i < S.win.length; i++) if (S.win[i].id === id) return S.win[i]; return null; }
function cm(v) { return Math.round(v * 1000) / 10; }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function toast(m) { var t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.style.display = 'none'; }, 2600); }
function snap5(v) { return Math.round(v * 20) / 20; }

// ---------------- grid geometry
function fh(f) { return f === 0 && S.G.h0 ? S.G.h0 : S.G.h; }
function base(f) { var y = S.G.oy; for (var i = 0; i < f; i++) y += fh(i); return y; }
function topY() { return base(S.G.floors); }
function bayL(b) { var x = S.G.ox; for (var i = 0; i < b; i++) x += S.G.bays[i]; return x; }
function clearL(b) { return bayL(b) + S.G.wall / 2; }
function span(b) { return S.G.bays[b] - S.G.wall; }
function totalW() { return S.G.bays.reduce(function (a, b) { return a + b; }, 0); }
function absX(w) { return clearL(w.b) + w.dx; }
function absY(w) { return base(w.f) + w.sill; }
function cellAt(x, y) {
  if (x < S.G.ox || x > S.G.ox + totalW() || y < S.G.oy || y > topY()) return null;
  var f = 0; while (f < S.G.floors - 1 && y >= base(f + 1)) f++;
  var b = 0; while (b < S.G.bays.length - 1 && x >= bayL(b + 1)) b++;
  return { f: f, b: b };
}
function ck(f, b) { return f + ',' + b; }

// ---------------- undo
var U = [], R = [];
function snap() { return JSON.stringify({ G: S.G, t: S.types, w: S.win }); }
function push() { U.push(snap()); if (U.length > 200) U.shift(); R.length = 0; }
function restore(s) { var o = JSON.parse(s); S.G = o.G; S.types = o.t; S.win = o.w; S.sel.clear(); refresh(); }
function undo() { if (U.length) { R.push(snap()); restore(U.pop()); } }
function redo() { if (R.length) { U.push(snap()); restore(R.pop()); } }

// ---------------- view
function resize() { var r = cv.getBoundingClientRect(); cv.width = r.width * DPR; cv.height = r.height * DPR; draw(); }
function w2s(x, y) { return [x * S.view.s + S.view.ox, S.view.oy - y * S.view.s]; }
function s2w(px, py) { return [(px - S.view.ox) / S.view.s, (S.view.oy - py) / S.view.s]; }
function fit() {
  var r = cv.getBoundingClientRect(), x0 = S.G.ox - 2.5, x1 = S.G.ox + totalW() + 1, y0 = S.G.oy - 2.2, y1 = topY() + 1.2;
  var s = Math.min((r.width - 40) / (x1 - x0), (r.height - 50) / (y1 - y0));
  S.view.s = s; S.view.ox = r.width / 2 - (x0 + x1) / 2 * s; S.view.oy = r.height / 2 - 10 + (y0 + y1) / 2 * s; draw();
}

// ---------------- render
var drag = null, hover = null, ghost = null;
function draw() { render(ctx, cv.width, cv.height, DPR, S.view, false); }
function render(c, Wd, Ht, dpr, v, exp) {
  var s = v.s * dpr, ox = v.ox * dpr, oy = v.oy * dpr;
  function X(x) { return x * s + ox; } function Y(y) { return oy - y * s; }
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = exp ? '#fff' : '#fbfaf7'; c.fillRect(0, 0, Wd, Ht);
  // background
  if (S.bg) {
    c.save(); c.setTransform(s, 0, 0, -s, ox, oy); c.lineWidth = dpr / s; c.globalAlpha = S.bgOp; c.strokeStyle = '#3a3a3a';
    Object.keys(bgPaths).forEach(function (k) { if (S.bg.layers[k].visible) c.stroke(bgPaths[k]); }); c.restore();
  }
  var G = S.G, x0 = X(G.ox), x1 = X(G.ox + totalW()), yb = Y(G.oy), yt = Y(topY()), f, b;
  // selected / hover cells
  S.cells.forEach(function (k) { var p = k.split(','), ff = +p[0], bb = +p[1]; if (ff >= G.floors || bb >= G.bays.length) return;
    c.fillStyle = 'rgba(30,136,255,0.10)'; c.fillRect(X(bayL(bb)), Y(base(ff + 1)), G.bays[bb] * s, fh(ff) * s); });
  if (!exp && hover && S.place) { c.fillStyle = 'rgba(232,150,12,0.08)'; c.fillRect(X(bayL(hover.b)), Y(base(hover.f + 1)), G.bays[hover.b] * s, fh(hover.f) * s); }
  // walls (bands)
  c.fillStyle = 'rgba(120,112,100,0.22)';
  for (b = 0; b <= G.bays.length; b++) { var wx = bayL(b); var a = b === 0 ? 0 : -G.wall / 2, e = b === G.bays.length ? 0 : G.wall / 2; c.fillRect(X(wx + a), yt, (e - a) * s, yb - yt); }
  // floor lines
  c.strokeStyle = '#8a8378'; c.lineWidth = 1 * dpr; c.setLineDash([6 * dpr, 4 * dpr]); c.beginPath();
  for (f = 1; f < G.floors; f++) { var yy = Y(base(f)); c.moveTo(x0, yy); c.lineTo(x1, yy); }
  c.stroke(); c.setLineDash([]);
  // wall lines
  c.strokeStyle = '#6f685d'; c.lineWidth = 1 * dpr; c.beginPath();
  for (b = 1; b < G.bays.length; b++) { var xx = X(bayL(b)); c.moveTo(xx, yt); c.lineTo(xx, yb); }
  c.stroke();
  c.strokeStyle = '#e8960c'; c.lineWidth = 2.5 * dpr; c.strokeRect(x0, yt, x1 - x0, yb - yt);
  // labels
  var fs = Math.max(10, Math.min(13, s * 0.35)) * dpr; c.font = fs + 'px Heebo, Arial'; c.fillStyle = '#6f685d'; c.textBaseline = 'middle';
  c.textAlign = 'right';
  for (f = 0; f <= G.floors; f++) { var ly = Y(base(f)); var lv = base(f) - G.oy; c.fillText((lv >= 0 ? '+' : '') + lv.toFixed(2), x0 - 8 * dpr, ly);
    if (f < G.floors) { c.fillStyle = '#a39b8f'; c.fillText(f === 0 ? 'קרקע' : 'קומה ' + f, x0 - 8 * dpr, Y(base(f) + fh(f) / 2)); c.fillStyle = '#6f685d'; } }
  c.textAlign = 'center';
  var dy = yb + 18 * dpr; c.beginPath(); c.strokeStyle = '#8a8378'; c.lineWidth = dpr;
  for (b = 0; b < G.bays.length; b++) { var bx0 = X(bayL(b)), bx1 = X(bayL(b + 1)); c.moveTo(bx0, dy); c.lineTo(bx1, dy); c.moveTo(bx0, dy - 5 * dpr); c.lineTo(bx0, dy + 5 * dpr); c.moveTo(bx1, dy - 5 * dpr); c.lineTo(bx1, dy + 5 * dpr);
    c.fillText(String(Math.round(G.bays[b] * 100)), (bx0 + bx1) / 2, dy + 12 * dpr); c.fillText(String(b + 1), (bx0 + bx1) / 2, yt - 12 * dpr); }
  c.stroke(); c.fillText('סה״כ ' + Math.round(totalW() * 100) + ' ס״מ', (x0 + x1) / 2, dy + 30 * dpr);
  c.textBaseline = 'alphabetic'; c.textAlign = 'start';
  // windows
  S.win.forEach(function (w) { drawWin(c, w, X, Y, s, dpr, false); });
  if (!exp && ghost) { c.save(); c.globalAlpha = 0.5; drawWin(c, ghost, X, Y, s, dpr, false); c.restore(); }
  if (exp) return;
  // selection
  c.strokeStyle = '#1e88ff'; c.lineWidth = 2 * dpr;
  S.win.forEach(function (w) { if (!S.sel.has(w.id)) return; var x = X(absX(w)), y = Y(absY(w) + w.h); c.strokeRect(x - 3 * dpr, y - 3 * dpr, w.w * s + 6 * dpr, w.h * s + 6 * dpr); });
  if (S.sel.size === 1) { var w1 = W(Array.from(S.sel)[0]); if (w1) handles(w1).forEach(function (h) { var p = [X(h.x), Y(h.y)]; c.fillStyle = '#fff'; c.fillRect(p[0] - 4 * dpr, p[1] - 4 * dpr, 8 * dpr, 8 * dpr); c.strokeRect(p[0] - 4 * dpr, p[1] - 4 * dpr, 8 * dpr, 8 * dpr); });
    if (w1 && drag && (drag.m === 'move' || drag.m === 'resize')) label(c, w1, X, Y, dpr); }
  if (ghost) label(c, ghost, X, Y, dpr);
  if (drag && drag.m === 'box') { var r = rect(drag.x0, drag.y0, drag.x1, drag.y1); c.setLineDash([4 * dpr, 3 * dpr]); c.strokeStyle = '#1e88ff'; c.lineWidth = dpr; c.strokeRect(X(r.x), Y(r.y + r.h), r.w * s, r.h * s); c.setLineDash([]); }
}
function label(c, w, X, Y, dpr) {
  var t = Math.round(w.w * 100) + '×' + Math.round(w.h * 100) + '  אדן ' + Math.round(w.sill * 100) + '  מהקיר ' + Math.round(w.dx * 100);
  c.font = (12 * dpr) + 'px Heebo, Arial'; var tw = c.measureText(t).width, x = X(absX(w)), y = Y(absY(w) + w.h) - 10 * dpr;
  c.fillStyle = 'rgba(44,42,39,.88)'; c.fillRect(x - 4 * dpr, y - 14 * dpr, tw + 8 * dpr, 18 * dpr); c.fillStyle = '#fff'; c.fillText(t, x, y);
}
function drawWin(c, w, X, Y, s, dpr) {
  var t = T(w.t) || { color: '#777' }, x = X(absX(w)), y = Y(absY(w) + w.h), ww = w.w * s, hh = w.h * s, bad = w.dx < -1e-6 || w.dx + w.w > span(w.b) + 1e-6 || w.sill + w.h > fh(w.f) + 1e-6;
  c.fillStyle = 'rgba(255,255,255,0.95)'; c.fillRect(x, y, ww, hh);
  c.fillStyle = hexA(t.color, 0.14); c.fillRect(x, y, ww, hh);
  c.strokeStyle = bad ? '#ff0000' : t.color; c.lineWidth = Math.max(1, Math.min(2.4 * dpr, 0.05 * s)); if (bad) c.setLineDash([4 * dpr, 3 * dpr]); c.strokeRect(x, y, ww, hh); c.setLineDash([]);
  if (ww > 20 * dpr && hh > 14 * dpr) { c.fillStyle = t.color; c.font = '600 ' + Math.min(14 * dpr, hh * 0.35) + 'px Heebo, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(w.t, x + ww / 2, y + hh / 2); c.textAlign = 'start'; c.textBaseline = 'alphabetic'; }
}
function hexA(h, a) { var n = parseInt(h.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
function rect(x0, y0, x1, y1) { return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }; }
function handles(w) { var x = absX(w), y = absY(w); return [{ x: x, y: y + w.h / 2, k: 'l' }, { x: x + w.w, y: y + w.h / 2, k: 'r' }, { x: x + w.w / 2, y: y + w.h, k: 't' }, { x: x + w.w / 2, y: y, k: 'b' }]; }

// ---------------- snapping (horizontal position inside a bay)
function snapDx(b, dx, w, exclude) {
  var tol = 8 / S.view.s, best = null, bd = tol, sp = span(b);
  var cands = [{ v: (sp - w) / 2, k: 'מרכז' }, { v: S.gen.margin, k: 'מרווח מקיר' }, { v: sp - w - S.gen.margin, k: 'מרווח מקיר' }];
  S.win.forEach(function (o) { if (o.b !== b || (exclude && exclude.has(o.id))) return; cands.push({ v: o.dx, k: 'יישור' }); cands.push({ v: o.dx + o.w - w, k: 'יישור' }); });
  cands.forEach(function (c) { var d = Math.abs(c.v - dx); if (d < bd) { bd = d; best = c; } });
  return best ? best.v : snap5(dx);
}
function windowFromPoint(t, x, y) {
  var c = cellAt(x, y); if (!c) return null;
  var dx = snapDx(c.b, x - clearL(c.b) - t.w / 2, t.w);
  dx = Math.max(0, Math.min(span(c.b) - t.w, dx));
  return { t: t.id, f: c.f, b: c.b, dx: dx, sill: t.sill, w: t.w, h: t.h };
}

// ---------------- mouse
function ev(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function hitWin(x, y) { var tol = 4 / S.view.s; for (var i = S.win.length - 1; i >= 0; i--) { var w = S.win[i], ax = absX(w), ay = absY(w); if (x >= ax - tol && x <= ax + w.w + tol && y >= ay - tol && y <= ay + w.h + tol) return w; } return null; }
function hitHandle(px, py) { if (S.sel.size !== 1) return null; var w = W(Array.from(S.sel)[0]); if (!w) return null; var hs = handles(w); for (var i = 0; i < hs.length; i++) { var p = w2s(hs[i].x, hs[i].y); if (Math.abs(p[0] - px) < 7 && Math.abs(p[1] - py) < 7) return hs[i]; } return null; }
cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
cv.addEventListener('mousedown', function (e) {
  cv.focus(); var p = ev(e), w = s2w(p[0], p[1]);
  if (e.button === 1 || e.button === 2 || spaceDown) { drag = { m: 'pan', px: p[0], py: p[1], ox: S.view.ox, oy: S.view.oy }; return; }
  if (pickOrigin) { pickOrigin = false; var sp = bgSnap(w[0], w[1]); push(); S.G.ox = +sp[0].toFixed(3); S.G.oy = +sp[1].toFixed(3); refresh(); toast('פינת הגריד הוצבה'); return; }
  var h = hitHandle(p[0], p[1]);
  if (h) { var w0 = W(Array.from(S.sel)[0]); push(); drag = { m: 'resize', k: h.k, w: w0, o: JSON.parse(JSON.stringify(w0)) }; return; }
  var hit = hitWin(w[0], w[1]);
  if (hit && !(S.place && e.altKey)) {
    if (e.shiftKey || e.ctrlKey) { if (S.sel.has(hit.id)) S.sel.delete(hit.id); else S.sel.add(hit.id); refreshProps(); draw(); return; }
    if (!S.sel.has(hit.id)) { S.sel = new Set([hit.id]); }
    push(); drag = { m: 'move', x0: w[0], y0: w[1], items: Array.from(S.sel).map(function (id) { var o = W(id); return { w: o, ax: absX(o), f: o.f, b: o.b, dx: o.dx }; }), anchor: hit, moved: false };
    refreshProps(); draw(); return;
  }
  if (S.place) { var t = T(S.place), nw = t && windowFromPoint(t, w[0], w[1]);
    if (nw) { push(); nw.id = uid(); S.win.push(nw); S.sel = new Set([nw.id]); refresh(); } return; }
  drag = { m: 'box', x0: w[0], y0: w[1], x1: w[0], y1: w[1], add: e.shiftKey };
  if (!e.shiftKey) { S.sel.clear(); S.cells.clear(); }
  refreshProps(); draw();
});
window.addEventListener('mousemove', function (e) {
  var p = ev(e), w = s2w(p[0], p[1]);
  if (!drag) {
    if (e.target !== cv) return;
    hover = cellAt(w[0], w[1]);
    ghost = S.place && T(S.place) && !hitWin(w[0], w[1]) ? windowFromPoint(T(S.place), w[0], w[1]) : null;
    var h = hitHandle(p[0], p[1]); cv.style.cursor = h ? (h.k === 'l' || h.k === 'r' ? 'ew-resize' : 'ns-resize') : hitWin(w[0], w[1]) ? 'move' : S.place ? 'copy' : 'default';
    draw(); return;
  }
  if (drag.m === 'pan') { S.view.ox = drag.ox + p[0] - drag.px; S.view.oy = drag.oy + p[1] - drag.py; draw(); return; }
  if (drag.m === 'box') { drag.x1 = w[0]; drag.y1 = w[1]; draw(); return; }
  if (drag.m === 'move') {
    drag.moved = true;
    var a = drag.items.filter(function (i) { return i.w === drag.anchor; })[0], ex = new Set(drag.items.map(function (i) { return i.w.id; }));
    // target cell for the anchor: where its centre goes
    var cx = a.ax + a.w.w / 2 + (w[0] - drag.x0), cy = base(a.f) + a.w.sill + a.w.h / 2 + (w[1] - drag.y0);
    var c = cellAt(Math.max(S.G.ox + 1e-6, Math.min(S.G.ox + totalW() - 1e-6, cx)), Math.max(S.G.oy + 1e-6, Math.min(topY() - 1e-6, cy))) || { f: a.f, b: a.b };
    var df = c.f - a.f, ndx = e.altKey ? cx - a.w.w / 2 - clearL(c.b) : snapDx(c.b, cx - a.w.w / 2 - clearL(c.b), a.w.w, ex);
    var shiftX = (clearL(c.b) + ndx) - a.ax;
    drag.items.forEach(function (i) {
      var nf = Math.max(0, Math.min(S.G.floors - 1, i.f + df)), nax = i.ax + shiftX, nc = cellAt(Math.max(S.G.ox, Math.min(S.G.ox + totalW() - 1e-6, nax + i.w.w / 2)), base(nf) + 0.01) || { b: i.b };
      i.w.f = nf; i.w.b = nc.b; i.w.dx = nax - clearL(nc.b);
    });
    refreshProps(true); draw(); return;
  }
  if (drag.m === 'resize') {
    var o = drag.o, ww = drag.w, lx = clearL(o.b), by = base(o.f), mn = 0.1;
    if (drag.k === 'l') { var r0 = o.dx + o.w, nl = Math.min(r0 - mn, snap5(w[0] - lx)); ww.dx = nl; ww.w = r0 - nl; }
    if (drag.k === 'r') { ww.w = Math.max(mn, snap5(w[0] - lx) - o.dx); }
    if (drag.k === 't') { ww.h = Math.max(mn, snap5(w[1] - by) - o.sill); }
    if (drag.k === 'b') { var top = o.sill + o.h, ns = Math.min(top - mn, Math.max(0, snap5(w[1] - by))); ww.sill = ns; ww.h = top - ns; }
    refreshProps(true); draw(); return;
  }
});
window.addEventListener('mouseup', function () {
  if (!drag) return; var d = drag; drag = null;
  if (d.m === 'box') {
    var r = rect(d.x0, d.y0, d.x1, d.y1);
    if (r.w * S.view.s < 4 && r.h * S.view.s < 4) { var c = cellAt(d.x0, d.y0); if (c) { var k = ck(c.f, c.b); if (S.cells.has(k)) S.cells.delete(k); else S.cells.add(k); } }
    else {
      for (var f = 0; f < S.G.floors; f++) for (var b = 0; b < S.G.bays.length; b++) { var bx = bayL(b), by = base(f); if (bx < r.x + r.w && bx + S.G.bays[b] > r.x && by < r.y + r.h && by + fh(f) > r.y) S.cells.add(ck(f, b)); }
      S.win.forEach(function (w) { var ax = absX(w), ay = absY(w); if (ax >= r.x && ax + w.w <= r.x + r.w && ay >= r.y && ay + w.h <= r.y + r.h) S.sel.add(w.id); });
    }
    refresh(); return;
  }
  if (d.m === 'move' && !d.moved) U.pop();
  if (d.m === 'move' || d.m === 'resize') d.items && d.items.forEach(function (i) { delete i.w.gen; });
  if (d.m === 'resize') delete d.w.gen;
  refresh();
});
cv.addEventListener('wheel', function (e) { e.preventDefault(); var p = ev(e), w = s2w(p[0], p[1]); var f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)); S.view.s = Math.max(0.05, Math.min(5000, S.view.s * f)); S.view.ox = p[0] - w[0] * S.view.s; S.view.oy = p[1] + w[1] * S.view.s; draw(); }, { passive: false });
cv.addEventListener('mouseleave', function () { ghost = null; hover = null; draw(); });
var spaceDown = false;
window.addEventListener('keydown', function (e) {
  var tg = (e.target.tagName || '').toLowerCase(); if (tg === 'input' || tg === 'select') return;
  var k = e.key.toLowerCase();
  if (e.key === ' ') { spaceDown = true; e.preventDefault(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicate(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); saveProject(); return; }
  if ((e.ctrlKey || e.metaKey) && k === 'a') { e.preventDefault(); S.sel = new Set(S.win.map(function (w) { return w.id; })); refresh(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { del(); return; }
  if (e.key === 'Escape') { S.place = null; S.sel.clear(); S.cells.clear(); ghost = null; refresh(); return; }
  if (e.key.indexOf('Arrow') === 0 && S.sel.size) { e.preventDefault(); var st = e.shiftKey ? 0.1 : 0.01; push();
    selW().forEach(function (w) { if (e.key === 'ArrowLeft') w.dx -= st; if (e.key === 'ArrowRight') w.dx += st; if (e.key === 'ArrowUp') w.sill += st; if (e.key === 'ArrowDown') w.sill -= st; delete w.gen; }); refresh(); return; }
  if (k === 'f') fit();
});
window.addEventListener('keyup', function (e) { if (e.key === ' ') spaceDown = false; });
function selW() { return S.win.filter(function (w) { return S.sel.has(w.id); }); }
function del() { if (!S.sel.size) return; push(); S.win = S.win.filter(function (w) { return !S.sel.has(w.id); }); S.sel.clear(); refresh(); }
function duplicate() {
  var sel = selW(); if (!sel.length) return; push(); var ns = new Set();
  sel.forEach(function (w) { var n = JSON.parse(JSON.stringify(w)); n.id = uid(); delete n.gen;
    var nb = w.b + 1 < S.G.bays.length ? w.b + 1 : null;
    if (nb != null) { n.b = nb; n.dx = w.dx + (span(nb) - span(w.b)) / 2; } else n.dx = w.dx + w.w + S.gen.gap;
    S.win.push(n); ns.add(n.id); });
  S.sel = ns; refresh();
}
// "all" or "1-3,5" (1-based floors where ground = 0? we use: 0 = ground)
function parseList(str, n) {
  str = String(str || '').trim(); if (!str || /^(all|הכל|כל)/i.test(str)) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  var out = []; str.split(/[,\s]+/).forEach(function (p) { var m = p.match(/^(\d+)\s*-\s*(\d+)$/); if (m) { for (var i = +m[1]; i <= +m[2]; i++) out.push(i); } else if (/^\d+$/.test(p)) out.push(+p); });
  return out.filter(function (i) { return i >= 0 && i < n; });
}
function exists(f, b, dx, wid, w) { var e = 0.005; return S.win.some(function (o) { return o.f === f && o.b === b && o.dx < dx + wid - e && dx < o.dx + o.w - e && o.sill < w.sill + w.h - e && w.sill < o.sill + o.h - e; }); } // overlap with an existing window
function copyFloors(str) {
  var sel = selW(); if (!sel.length) return toast('בחר חלון'); var fl = parseList(str, S.G.floors), n = 0; push();
  sel.forEach(function (w) { fl.forEach(function (f) { if (f === w.f || exists(f, w.b, w.dx, w.w, w) || w.sill + w.h > fh(f) + 1e-6) return; var c = JSON.parse(JSON.stringify(w)); c.id = uid(); c.f = f; delete c.gen; S.win.push(c); n++; }); });
  refresh(); toast('נוספו ' + n + ' חלונות');
}
function copyBays(str) {
  var sel = selW(); if (!sel.length) return toast('בחר חלון'); var bl = parseList(str ? str.split(/[,\s]+/).map(function (x) { var m = x.match(/^(\d+)-(\d+)$/); return m ? (m[1] - 1) + '-' + (m[2] - 1) : /^\d+$/.test(x) ? String(x - 1) : x; }).join(',') : '', S.G.bays.length), n = 0; push();
  sel.forEach(function (w) { bl.forEach(function (b) { if (b === w.b) return; var dx = w.dx + (span(b) - span(w.b)) / 2; if (exists(w.f, b, dx, w.w, w) || w.w > span(b)) return; var c = JSON.parse(JSON.stringify(w)); c.id = uid(); c.b = b; c.dx = dx; delete c.gen; S.win.push(c); n++; }); });
  refresh(); toast('נוספו ' + n + ' חלונות');
}

// ---------------- panels
function refresh() { gridToUI(); renderTypes(); refreshProps(); renderMix(); renderQty(); draw(); }
function gridToUI() {
  var G = S.G, a = document.activeElement;
  if (a !== $('gFloors')) $('gFloors').value = G.floors; if (a !== $('gH')) $('gH').value = Math.round(G.h * 100);
  if (a !== $('gH0')) $('gH0').value = G.h0 ? Math.round(G.h0 * 100) : ''; if (a !== $('gWall')) $('gWall').value = Math.round(G.wall * 100);
  if (a !== $('gBays')) $('gBays').value = compressBays(G.bays);
  if (a !== $('gX')) $('gX').value = G.ox; if (a !== $('gY')) $('gY').value = G.oy;
}
function compressBays(b) { var out = [], i = 0; while (i < b.length) { var j = i; while (j + 1 < b.length && Math.abs(b[j + 1] - b[i]) < 1e-6) j++; var v = Math.round(b[i] * 100); out.push(j > i ? (j - i + 1) + '*' + v : String(v)); i = j + 1; } return out.join(', '); }
function parseBays(s) { var out = []; String(s).split(/[,;\s]+/).forEach(function (p) { if (!p) return; var m = p.match(/^(\d+)\s*[*xX×]\s*(\d+(?:\.\d+)?)$/); if (m) { for (var i = 0; i < +m[1]; i++) out.push(+m[2] / 100); } else if (+p > 0) out.push(+p / 100); }); return out; }
function applyGrid() {
  var nf = Math.max(1, Math.min(200, +$('gFloors').value | 0)), h = +$('gH').value / 100, h0 = $('gH0').value ? +$('gH0').value / 100 : null, bays = parseBays($('gBays').value), wall = Math.max(0, +$('gWall').value / 100);
  if (!(h > 0.5) || !bays.length) { toast('בדוק את נתוני הגריד'); gridToUI(); return; }
  push(); S.G.floors = nf; S.G.h = h; S.G.h0 = h0 && Math.abs(h0 - h) > 1e-6 ? h0 : null; S.G.bays = bays; S.G.wall = wall;
  var before = S.win.length; S.win = S.win.filter(function (w) { return w.f < nf && w.b < bays.length; });
  if (S.win.length < before) toast('הוסרו ' + (before - S.win.length) + ' חלונות שהיו מחוץ לגריד');
  S.cells.forEach(function (k) { var p = k.split(','); if (+p[0] >= nf || +p[1] >= bays.length) S.cells.delete(k); });
  refresh(); fit();
}
['gFloors', 'gH', 'gH0', 'gBays', 'gWall'].forEach(function (id) { $(id).addEventListener('change', applyGrid); });
['gX', 'gY'].forEach(function (id) { $(id).addEventListener('change', function () { push(); S.G.ox = +$('gX').value || 0; S.G.oy = +$('gY').value || 0; refresh(); }); });

function renderTypes() {
  var h = '<tr><th></th><th>סוג</th><th>רוחב</th><th>גובה</th><th>אדן</th><th></th></tr>';
  S.types.forEach(function (t, i) {
    h += '<tr data-i="' + i + '"><td><input type="color" data-f="color" value="' + t.color + '"></td><td><button class="tbtn' + (S.place === t.id ? ' on' : '') + '" data-place="' + esc(t.id) + '" title="לחץ ואז לחץ בגריד"><span class="sw" style="background:' + t.color + '"></span>' + esc(t.id) + '</button></td>' +
      '<td><input type="number" step="5" data-f="w" value="' + Math.round(t.w * 100) + '"></td><td><input type="number" step="5" data-f="h" value="' + Math.round(t.h * 100) + '"></td><td><input type="number" step="5" data-f="sill" value="' + Math.round(t.sill * 100) + '"></td><td><button class="x" data-del="' + i + '" title="מחיקה">✕</button></td></tr>';
  });
  if (h === lastTypesHtml) return; // don't replace the DOM needlessly (would swallow clicks after an input blur)
  lastTypesHtml = h; $('types').innerHTML = h;
}
var lastTypesHtml = '';
$('types').addEventListener('click', function (e) {
  var b = e.target.closest('[data-place]'); if (b) { var id = b.getAttribute('data-place'); S.place = S.place === id ? null : id; if (S.place) toast('לחץ בתא בגריד כדי להוסיף חלון ' + id + ' · Esc לסיום'); renderTypes(); return; }
  var d = e.target.closest('[data-del]'); if (d) { var t = S.types[+d.getAttribute('data-del')]; var n = S.win.filter(function (w) { return w.t === t.id; }).length; if (n && !confirm('למחוק את סוג ' + t.id + ' ואת ' + n + ' החלונות שלו?')) return; push(); S.win = S.win.filter(function (w) { return w.t !== t.id; }); S.types.splice(+d.getAttribute('data-del'), 1); if (S.place === t.id) S.place = null; refresh(); }
});
$('types').addEventListener('change', function (e) {
  var tr = e.target.closest('tr'), f = e.target.getAttribute('data-f'); if (!tr || !f) return; var t = S.types[+tr.getAttribute('data-i')]; push();
  if (f === 'color') t.color = e.target.value; else { var nv = (+e.target.value) / 100, old = t[f]; t[f] = nv;
    S.win.forEach(function (w) { if (w.t !== t.id) return; if (Math.abs(w[f] - old) < 1e-6) { if (f === 'w') w.dx += (old - nv) / 2; w[f] = nv; } }); }
  refresh();
});
$('addType').onclick = function () { push(); var id = String.fromCharCode(65 + S.types.length); while (T(id)) id += "'"; S.types.push({ id: id, w: 1.2, h: 1.4, sill: 0.9, color: PALETTE[S.types.length % PALETTE.length] }); S.gen.pct[id] = 0; refresh(); };

var lastPropsKey = '';
function refreshProps(light) {
  var el = $('props'); if (light && el.contains(document.activeElement)) return;
  var sel = selW();
  if (!sel.length) { lastPropsKey = ''; el.innerHTML = '<span class="mut">לחץ על חלון כדי לערוך אותו. Shift+לחיצה לבחירת כמה.</span>'; return; }
  var w = sel[0], one = sel.length === 1, h = '';
  if (one) h += '<div class="row"><b>חלון ' + esc(w.t) + '</b><span class="mut">' + (w.f === 0 ? 'קרקע' : 'קומה ' + w.f) + ' · מפתח ' + (w.b + 1) + '</span></div>';
  else h += '<div class="row"><b>נבחרו ' + sel.length + ' חלונות</b></div>';
  h += '<div class="row"><label>סוג</label><select id="pT">' + (one ? '' : '<option value="">—</option>') + S.types.map(function (t) { return '<option' + (one && t.id === w.t ? ' selected' : '') + '>' + esc(t.id) + '</option>'; }).join('') + '</select></div>';
  if (one) h += '<div class="row"><label>רוחב / גובה</label><input id="pW" type="number" step="5" value="' + Math.round(w.w * 100) + '"><input id="pH" type="number" step="5" value="' + Math.round(w.h * 100) + '"></div>' +
    '<div class="row"><label>אדן (ס״מ)</label><input id="pS" type="number" step="5" value="' + Math.round(w.sill * 100) + '"></div>' +
    '<div class="row"><label>מרחק מהקיר (ס״מ)</label><input id="pX" type="number" step="5" value="' + Math.round(w.dx * 100) + '"><button class="b" id="pC">למרכז</button></div>';
  h += '<div class="row"><button class="b" id="pDup">שכפול</button><button class="b" id="pDel">מחיקה</button></div>' +
    '<div class="row"><label>העתק לקומות</label><input id="pFl" type="text" style="width:90px" placeholder="הכל" title="הכל, או למשל 1-5,8 (0 = קרקע)"><button class="b" id="pFlB">העתק</button></div>' +
    '<div class="row"><label>העתק למפתחים</label><input id="pBy" type="text" style="width:90px" placeholder="הכל" title="הכל, או למשל 1,3"><button class="b" id="pByB">העתק</button></div>';
  var key = sel.map(function (x) { return x.id + ':' + x.f + ':' + x.b + ':' + x.t; }).join('|') + '#' + S.types.map(function (t) { return t.id; }).join(',');
  if (key === lastPropsKey && $('pT')) {
    // same selection: update values in place so a click on a button right after editing a field isn't swallowed
    var tmp = document.createElement('div'); tmp.innerHTML = h;
    el.firstChild.innerHTML = tmp.firstChild.innerHTML;
    tmp.querySelectorAll('input[id],select[id]').forEach(function (n) { var o = $(n.id); if (o && o !== document.activeElement && n.type !== 'text') o.value = n.tagName === 'SELECT' ? (n.querySelector('[selected]') || n.options[0]).value : n.value; });
  } else { el.innerHTML = h; lastPropsKey = key; }
  $('pT').onchange = function () { var t = T(this.value); if (!t) return; push(); sel.forEach(function (x) { var c = x.dx + x.w / 2; x.t = t.id; x.w = t.w; x.h = t.h; x.sill = t.sill; x.dx = c - t.w / 2; delete x.gen; }); refresh(); };
  if (one) {
    $('pW').onchange = function () { push(); var c = w.dx + w.w / 2; w.w = Math.max(0.1, +this.value / 100); w.dx = c - w.w / 2; delete w.gen; refresh(); };
    $('pH').onchange = function () { push(); w.h = Math.max(0.1, +this.value / 100); delete w.gen; refresh(); };
    $('pS').onchange = function () { push(); w.sill = +this.value / 100; delete w.gen; refresh(); };
    $('pX').onchange = function () { push(); w.dx = +this.value / 100; delete w.gen; refresh(); };
    $('pC').onclick = function () { push(); w.dx = (span(w.b) - w.w) / 2; refresh(); };
  }
  $('pDup').onclick = duplicate; $('pDel').onclick = del;
  $('pFlB').onclick = function () { copyFloors($('pFl').value); }; $('pByB').onclick = function () { copyBays($('pBy').value); };
}

// ---------------- generator
function rng(seed) { var a = seed >>> 0 || 1; return function () { a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function scopeCells() {
  var out = []; if (S.cells.size) S.cells.forEach(function (k) { var p = k.split(','); out.push({ f: +p[0], b: +p[1] }); });
  else for (var f = 0; f < S.G.floors; f++) for (var b = 0; b < S.G.bays.length; b++) out.push({ f: f, b: b });
  return out.filter(function (c) { return c.f < S.G.floors && c.b < S.G.bays.length; }).sort(function (a, b) { return a.f - b.f || a.b - b.b; });
}
function renderMix() {
  var cnt = {}, tot = 0; S.win.forEach(function (w) { cnt[w.t] = (cnt[w.t] || 0) + 1; tot++; });
  $('mix').innerHTML = '<tr><th>סוג</th><th>% יעד</th><th>בפועל</th></tr>' + S.types.map(function (t) {
    return '<tr><td><span class="sw" style="background:' + t.color + '"></span> ' + esc(t.id) + ' <span class="mut">' + Math.round(t.w * 100) + '×' + Math.round(t.h * 100) + '</span></td><td><input type="number" min="0" step="5" data-pct="' + esc(t.id) + '" value="' + (S.gen.pct[t.id] || 0) + '"></td><td class="mut">' + (tot ? (cnt[t.id] || 0) + ' (' + Math.round(100 * (cnt[t.id] || 0) / tot) + '%)' : '–') + '</td></tr>'; }).join('');
  var g = S.gen, a = document.activeElement;
  [['genGap', g.gap * 100], ['genMargin', g.margin * 100], ['genTop', g.top * 100], ['genPer', g.per], ['genEmpty', g.empty], ['genMax', g.max]].forEach(function (p) { if (a !== $(p[0])) $(p[0]).value = Math.round(p[1]); });
  $('genSame').checked = g.same;
  $('genScope').textContent = S.cells.size ? 'הפריסה תחול על ' + S.cells.size + ' תאים נבחרים (Esc לביטול הבחירה)' : 'הפריסה תחול על כל הגריד. לבחירת תאים: גרור על שטח ריק.';
}
$('mix').addEventListener('change', function (e) { var id = e.target.getAttribute('data-pct'); if (id) S.gen.pct[id] = Math.max(0, +e.target.value); });
function readGen() { var g = S.gen; g.gap = +$('genGap').value / 100; g.margin = +$('genMargin').value / 100; g.top = +$('genTop').value / 100; g.per = Math.max(1, +$('genPer').value | 0); g.empty = Math.max(0, Math.min(95, +$('genEmpty').value)); g.max = Math.max(0, +$('genMax').value | 0); g.same = $('genSame').checked; }
['genGap', 'genMargin', 'genTop', 'genPer', 'genEmpty', 'genMax', 'genSame'].forEach(function (id) { $(id).addEventListener('change', readGen); });
function generate() {
  readGen(); var g = S.gen, Rn = rng(g.seed), types = S.types.filter(function (t) { return (g.pct[t.id] || 0) > 0; });
  if (!types.length) { toast('הגדר אחוזים לסוגי החלונות'); return null; }
  var sumP = types.reduce(function (a, t) { return a + g.pct[t.id]; }, 0), cells = scopeCells(), inScope = {};
  cells.forEach(function (c) { inScope[ck(c.f, c.b)] = 1; });
  push();
  S.win = S.win.filter(function (w) { return !(w.gen && inScope[ck(w.f, w.b)]); });
  var count = {}, total = 0, patterns = {}, skipped = 0; types.forEach(function (t) { count[t.id] = 0; });
  function pick(el) { var ws = el.map(function (t) { return Math.max(0.02, g.pct[t.id] / sumP * (total + 1) - count[t.id] + 0.5) * (0.6 + 0.8 * Rn()); });
    var s = ws.reduce(function (a, b) { return a + b; }, 0), r = Rn() * s; for (var i = 0; i < el.length; i++) { r -= ws[i]; if (r <= 0) return el[i]; } return el[el.length - 1]; }
  function makePattern(c) {
    var sp = span(c.b), avail = sp - 2 * g.margin, maxH = fh(c.f) - g.top;
    var el = types.filter(function (t) { return t.w <= avail + 1e-6 && t.sill + t.h <= maxH + 1e-6; });
    if (!el.length) { skipped++; return []; }
    if (Rn() * 100 < g.empty) return [];
    var k = 1 + Math.floor(Rn() * g.per), chosen = [], used = 0;
    for (var i = 0; i < k; i++) { var fitT = el.filter(function (t) { return used + (chosen.length ? g.gap : 0) + t.w <= avail + 1e-6; }); if (!fitT.length) break; var t = pick(fitT); used += (chosen.length ? g.gap : 0) + t.w; chosen.push(t); count[t.id]++; total++; }
    var slack = avail - used, ws = []; for (var j = 0; j <= chosen.length; j++) ws.push(Rn());
    var sw = ws.reduce(function (a, b) { return a + b; }, 0) || 1, x = g.margin + slack * ws[0] / sw, out = [];
    chosen.forEach(function (t, j2) { out.push({ t: t.id, dx: snap5(x), w: t.w, h: t.h, sill: t.sill }); x += t.w + g.gap + slack * ws[j2 + 1] / sw; });
    return out;
  }
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i]; if (g.max && total >= g.max) break;
    var pat;
    if (g.same && patterns[c.b]) { pat = patterns[c.b].filter(function (p) { return p.sill + p.h <= fh(c.f) - g.top + 1e-6; }); pat.forEach(function (p) { count[p.t]++; total++; }); }
    else { pat = makePattern(c); if (g.same) patterns[c.b] = pat; }
    var manual = S.win.filter(function (w) { return w.f === c.f && w.b === c.b; });
    pat.forEach(function (p) {
      if (manual.some(function (m) { return p.dx < m.dx + m.w + g.gap && p.dx + p.w + g.gap > m.dx; })) { count[p.t]--; total--; return; }
      S.win.push({ id: uid(), t: p.t, f: c.f, b: c.b, dx: p.dx, sill: p.sill, w: p.w, h: p.h, gen: true });
    });
  }
  S.sel.clear(); refresh();
  $('genRes').innerHTML = 'נוצרו ' + total + ' חלונות ב-' + cells.length + ' תאים' + (skipped ? ' · ב-' + skipped + ' תאים אף סוג לא נכנס' : '') + '<br>' +
    types.map(function (t) { return t.id + ': ' + count[t.id] + ' (' + (total ? Math.round(100 * count[t.id] / total) : 0) + '%, יעד ' + Math.round(100 * g.pct[t.id] / sumP) + '%)'; }).join(' · ');
  return { total: total, count: count, cells: cells.length };
}
$('genBtn').onclick = generate;
$('reseed').onclick = function () { S.gen.seed = (Math.random() * 1e9) | 0; generate(); };
$('genClear').onclick = function () { var sc = {}; scopeCells().forEach(function (c) { sc[ck(c.f, c.b)] = 1; }); push(); S.win = S.win.filter(function (w) { return !(w.gen && sc[ck(w.f, w.b)]); }); $('genRes').innerHTML = ''; refresh(); };

// ---------------- quantities
function renderQty() {
  var rows = {}, tot = 0, area = 0;
  S.win.forEach(function (w) { var k = w.t + '|' + Math.round(w.w * 100) + '×' + Math.round(w.h * 100); var r = rows[k] || (rows[k] = { t: w.t, d: Math.round(w.w * 100) + '×' + Math.round(w.h * 100), n: 0, a: 0 }); r.n++; r.a += w.w * w.h; tot++; area += w.w * w.h; });
  var fa = totalW() * (topY() - S.G.oy);
  var h = '<table><tr><th>סוג</th><th>מידה</th><th>כמות</th><th>שטח מ״ר</th></tr>' + Object.keys(rows).sort().map(function (k) { var r = rows[k], t = T(r.t) || { color: '#999' }; return '<tr><td><span class="sw" style="background:' + t.color + '"></span> ' + esc(r.t) + '</td><td>' + r.d + '</td><td>' + r.n + '</td><td>' + r.a.toFixed(2) + '</td></tr>'; }).join('') +
    '<tr><th>סה״כ</th><th></th><th>' + tot + '</th><th>' + area.toFixed(2) + '</th></tr></table>' +
    '<div class="row"><b>אחוז זיגוג בחזית: ' + (fa ? (100 * area / fa).toFixed(1) : 0) + '%</b><span class="mut">(' + area.toFixed(1) + ' מתוך ' + fa.toFixed(1) + ' מ״ר)</span></div>';
  $('qty').innerHTML = h;
}

// ---------------- background (optional)
var bgPaths = {}, pickOrigin = false, SI = null;
function loadBg(file) {
  var ext = file.name.split('.').pop().toLowerCase(), rd = new FileReader(); $('bgInfo').textContent = 'טוען…';
  rd.onload = function () { try {
    if (ext === 'dxf') setModel(FEGeom.fromDxfParser(new DxfParser().parseSync(rd.result)), file.name);
    else getDwgLib().then(function (lib) { var LW = self['libredwg-web'], dwg = lib.dwg_read_data(new Uint8Array(rd.result), LW.Dwg_File_Type.DWG); if (!dwg) throw new Error('הקובץ לא נקרא'); var db = lib.convert(dwg); try { lib.dwg_free(dwg); } catch (e) {} setModel(FEGeom.fromLibreDwg(db), file.name); })
      .catch(function (err) { $('bgInfo').textContent = 'שגיאה: ' + (err.message || err); });
  } catch (err) { $('bgInfo').textContent = 'שגיאה: ' + (err.message || err); } };
  if (ext === 'dxf') rd.readAsText(file); else rd.readAsArrayBuffer(file);
}
var dwgP = null;
function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('לא נטען ' + src)); }; document.head.appendChild(s); }); }
function getDwgLib() {
  if (dwgP) return dwgP;
  function bytes() { var b64 = function () { return loadScript('lib/libredwg-wasm.b64.js').then(function () { var s = atob(self.LIBREDWG_WASM_B64), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); self.LIBREDWG_WASM_B64 = null; return u.buffer; }); };
    if (location.protocol === 'file:') return b64(); return fetch('lib/libredwg-web.wasm').then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); }).catch(b64); }
  dwgP = loadScript('lib/libredwg-glue.js').then(function () { return loadScript('lib/libredwg-web.umd.js'); }).then(bytes)
    .then(function (buf) { return self.createModule({ wasmBinary: buf, print: function () {}, printErr: function () {} }); })
    .then(function (inst) { return self['libredwg-web'].LibreDwg.createByWasmInstance(inst); });
  dwgP.catch(function () { dwgP = null; }); return dwgP;
}
function setModel(m, name) { m.hebShx = true; S.model = m; S.bgName = name; S.srcUnits = m.units || 0; buildBg(true); }
function buildBg(first) {
  var sc = S.bgUnit === 'auto' ? (FEGeom.UNIT_TO_M[S.srcUnits] || 0.01) : +S.bgUnit; S.unitScale = sc;
  S.bg = FEGeom.flatten(S.model, sc); bgPaths = {};
  Object.keys(S.bg.layers).forEach(function (k) { var L = S.bg.layers[k]; if (!L.polys.length) return; var p = new Path2D(); L.polys.forEach(function (a) { p.moveTo(a[0], a[1]); for (var i = 2; i < a.length; i += 2) p.lineTo(a[i], a[i + 1]); }); bgPaths[k] = p; });
  buildSI();
  var b = S.bg.robust; $('bgInfo').innerHTML = esc(S.bgName) + ' · ' + Object.keys(bgPaths).length + ' שכבות' + (b ? ' · ' + (b.x1 - b.x0).toFixed(0) + '×' + (b.y1 - b.y0).toFixed(0) + ' מ׳' : '') + '<br>לחץ "הצב פינת הגריד" ובחר את הפינה השמאלית התחתונה של החזית.';
  if (first && b) { var r = cv.getBoundingClientRect(), s = Math.min((r.width - 40) / (b.x1 - b.x0), (r.height - 40) / (b.y1 - b.y0)); S.view.s = s; S.view.ox = r.width / 2 - (b.x0 + b.x1) / 2 * s; S.view.oy = r.height / 2 + (b.y0 + b.y1) / 2 * s; }
  draw();
}
function buildSI() { var pts = []; Object.keys(S.bg.layers).forEach(function (k) { S.bg.layers[k].polys.forEach(function (a) { for (var i = 0; i < a.length; i += 2) pts.push(a[i], a[i + 1]); }); }); SI = pts; }
function bgSnap(x, y) { if (!SI) return [snap5(x), snap5(y)]; var tol = 10 / S.view.s, bd = tol, best = null; for (var i = 0; i < SI.length; i += 2) { var d = Math.abs(SI[i] - x) + Math.abs(SI[i + 1] - y); if (d < bd) { bd = d; best = [SI[i], SI[i + 1]]; } } return best || [x, y]; }
$('bgOpen').onclick = function () { $('bgIn').click(); };
$('bgIn').onchange = function () { if (this.files[0]) loadBg(this.files[0]); this.value = ''; };
$('bgClear').onclick = function () { S.bg = null; S.model = null; bgPaths = {}; SI = null; $('bgInfo').textContent = ''; draw(); };
$('bgOp').oninput = function () { S.bgOp = +this.value; draw(); };
$('bgUnit').onchange = function () { S.bgUnit = this.value; if (S.model) buildBg(true); };
$('bgPick').onclick = function () { if (!S.bg) return toast('טען קודם קובץ רקע'); pickOrigin = true; toast('לחץ על הפינה השמאלית התחתונה של החזית ברקע'); };
$('bgExp').onchange = function () { S.bgExp = this.checked; };

// ---------------- export / save
function baseName() { return 'facade_grid'; }
function download(name, data, mime) { var b = data instanceof Blob ? data : new Blob([data], { type: mime }); var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
var ACI = { 1: [255, 0, 0], 2: [255, 255, 0], 3: [0, 255, 0], 4: [0, 255, 255], 5: [0, 0, 255], 6: [255, 0, 255], 8: [128, 128, 128], 30: [255, 127, 0], 140: [0, 127, 255], 200: [191, 0, 255], 94: [0, 130, 0], 12: [189, 0, 0], 174: [0, 63, 189], 214: [189, 0, 189] };
function aci(hex) { var n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255, best = 7, bd = 1e9; Object.keys(ACI).forEach(function (k) { var c = ACI[k], d = (c[0] - r) * (c[0] - r) + (c[1] - g) * (c[1] - g) + (c[2] - b) * (c[2] - b); if (d < bd) { bd = d; best = +k; } }); return best; }
function dstr(s) { return String(s).replace(/[^\x20-\x7e]/g, function (ch) { return '\\U+' + ('0000' + ch.charCodeAt(0).toString(16).toUpperCase()).slice(-4); }); }
function buildDxf() {
  var u = S.bg ? 1 / S.unitScale : 100, out = [], ent = [], layers = { '0': 7, FE_GRID_FLOORS: 8, FE_GRID_WALLS: 8, FE_GRID_TEXT: 8 }, blocks = {};
  function n(v) { return String(Math.round(v * u * 1e5) / 1e5); }
  function E() { for (var i = 0; i < arguments.length; i++) ent.push(String(arguments[i])); }
  function line(l, a, b, c, d) { E(0, 'LINE', 8, l, 10, n(a), 20, n(b), 30, 0, 11, n(c), 21, n(d), 31, 0); }
  function text(l, x, y, h, s, al) { E(0, 'TEXT', 8, l, 10, n(x), 20, n(y), 30, 0, 40, n(h), 1, dstr(s)); if (al) E(72, al, 73, 2, 11, n(x), 21, n(y), 31, 0); }
  function poly(l, pts) { E(0, 'POLYLINE', 8, l, 66, 1, 10, 0, 20, 0, 30, 0, 70, 1); for (var i = 0; i < pts.length; i += 2) E(0, 'VERTEX', 8, l, 10, n(pts[i]), 20, n(pts[i + 1]), 30, 0); E(0, 'SEQEND', 8, l); }
  if (S.bg && S.bgExp) Object.keys(S.bg.layers).forEach(function (k) { var L = S.bg.layers[k], ln = dstr(k.replace(/[<>\/\\":;?*|=`]/g, '_')); if (!L.polys.length) return; layers[ln] = 7; L.polys.forEach(function (a) { for (var i = 0; i + 3 < a.length; i += 2) line(ln, a[i], a[i + 1], a[i + 2], a[i + 3]); }); });
  var G = S.G, x0 = G.ox, x1 = G.ox + totalW(), y0 = G.oy, y1 = topY(), f, b;
  poly('FE_GRID_FLOORS', [x0, y0, x1, y0, x1, y1, x0, y1]);
  for (f = 1; f < G.floors; f++) line('FE_GRID_FLOORS', x0, base(f), x1, base(f));
  for (b = 0; b <= G.bays.length; b++) { var xb = bayL(b); line('FE_GRID_WALLS', xb, y0, xb, y1); if (G.wall > 0) { var a = b === 0 ? 0 : -G.wall / 2, e = b === G.bays.length ? 0 : G.wall / 2; if (a !== 0) line('FE_GRID_WALLS', xb + a, y0, xb + a, y1); if (e !== 0) line('FE_GRID_WALLS', xb + e, y0, xb + e, y1); } }
  for (f = 0; f <= G.floors; f++) { var lv = base(f) - G.oy; text('FE_GRID_TEXT', x0 - 0.3, base(f) + 0.05, 0.2, (lv >= 0 ? '+' : '') + lv.toFixed(2), 2); }
  for (b = 0; b < G.bays.length; b++) text('FE_GRID_TEXT', (bayL(b) + bayL(b + 1)) / 2, y0 - 0.5, 0.2, String(Math.round(G.bays[b] * 100)), 1);
  S.win.forEach(function (w) { var t = T(w.t) || { color: '#888888' }, bn = 'FE_W_' + w.t.replace(/[^A-Za-z0-9_]/g, '_') + '_' + Math.round(w.w * 100) + 'x' + Math.round(w.h * 100), ln = 'FE_WIN_' + w.t.replace(/[^A-Za-z0-9_]/g, '_');
    layers[ln] = aci(t.color); blocks[bn] = { w: w.w, h: w.h, t: w.t }; E(0, 'INSERT', 8, ln, 2, bn, 10, n(absX(w)), 20, n(absY(w)), 30, 0); });
  function g(c, v) { out.push(String(c), String(v)); }
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$EXTMIN'); g(10, n(x0 - 1)); g(20, n(y0 - 1)); g(30, 0); g(9, '$EXTMAX'); g(10, n(x1 + 1)); g(20, n(y1 + 1)); g(30, 0); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1); g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0); g(0, 'ENDTAB');
  var lk = Object.keys(layers); g(0, 'TABLE'); g(2, 'LAYER'); g(70, lk.length); lk.forEach(function (k) { g(0, 'LAYER'); g(2, k); g(70, 0); g(62, layers[k]); g(6, 'CONTINUOUS'); }); g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1); g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 0.2 * u); g(3, 'txt'); g(4, ''); g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'BLOCKS');
  Object.keys(blocks).forEach(function (bn) { var bl = blocks[bn], fr = Math.min(0.05, bl.w / 6, bl.h / 6), save = ent; ent = [];
    poly('0', [0, 0, bl.w, 0, bl.w, bl.h, 0, bl.h]); poly('0', [fr, fr, bl.w - fr, fr, bl.w - fr, bl.h - fr, fr, bl.h - fr]); text('0', bl.w / 2, bl.h / 2, Math.min(0.2, bl.h / 4), bl.t, 1);
    g(0, 'BLOCK'); g(8, '0'); g(2, bn); g(70, 0); g(10, 0); g(20, 0); g(30, 0); g(3, bn); for (var i = 0; i < ent.length; i++) out.push(ent[i]); ent = save; g(0, 'ENDBLK'); g(8, '0'); });
  g(0, 'ENDSEC'); g(0, 'SECTION'); g(2, 'ENTITIES');
  return out.join('\r\n') + '\r\n' + (ent.length ? ent.join('\r\n') + '\r\n' : '') + '0\r\nENDSEC\r\n0\r\nEOF\r\n';
}
$('expDxf').onclick = function () { download(baseName() + '.dxf', buildDxf(), 'application/dxf'); toast('DXF נשמר (' + (S.bg ? 'ביחידות הרקע' : 'בס״מ') + ')'); };
$('expPng').onclick = function () {
  var x0 = S.G.ox - 2.5, x1 = S.G.ox + totalW() + 1, y0 = S.G.oy - 2.2, y1 = topY() + 1.2, s = 3000 / Math.max(x1 - x0, y1 - y0), Wd = Math.ceil((x1 - x0) * s), Ht = Math.ceil((y1 - y0) * s);
  var c = document.createElement('canvas'); c.width = Wd; c.height = Ht; var sel = S.sel, cells = S.cells; S.sel = new Set(); S.cells = new Set();
  render(c.getContext('2d'), Wd, Ht, 1, { s: s, ox: -x0 * s, oy: y1 * s }, true); S.sel = sel; S.cells = cells;
  c.toBlob(function (b) { download(baseName() + '.png', b, 'image/png'); });
};
function projectData() { return { app: 'facade-editor-simple', version: 2, G: S.G, types: S.types, win: S.win, gen: S.gen }; }
function saveProject() { download(baseName() + '.facade.json', JSON.stringify(projectData(), null, 1), 'application/json'); }
function loadProject(d) {
  if (d.app !== 'facade-editor-simple') throw new Error('קובץ פרויקט לא מתאים לגרסה הזו');
  push(); S.G = d.G; S.types = d.types; S.win = d.win; S.gen = Object.assign(S.gen, d.gen || {}); S.sel.clear(); S.cells.clear();
  nid = 1; S.win.forEach(function (w) { var k = +String(w.id).slice(1); if (k >= nid) nid = k + 1; }); refresh(); fit();
}
$('saveP').onclick = saveProject;
$('openP').onclick = function () { $('openPIn').click(); };
$('openPIn').onchange = function () { var f = this.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { try { loadProject(JSON.parse(r.result)); toast('הפרויקט נטען'); } catch (e) { toast('שגיאה: ' + e.message); } }; r.readAsText(f); this.value = ''; };
$('undo').onclick = undo; $('redo').onclick = redo; $('fit').onclick = fit;
$('bgOp').value = S.bgOp;
window.addEventListener('resize', resize);
window.addEventListener('beforeunload', function (e) { if (S.win.length && U.length) { e.preventDefault(); e.returnValue = ''; } });
// autosave to the browser so a refresh doesn't lose work
setInterval(function () { try { localStorage.setItem('facade-simple-autosave', JSON.stringify(projectData())); } catch (e) {} }, 5000);
try { var as = localStorage.getItem('facade-simple-autosave'); if (as) { var d = JSON.parse(as); if (d && d.app === 'facade-editor-simple') { S.G = d.G; S.types = d.types; S.win = d.win; S.gen = Object.assign(S.gen, d.gen || {}); S.win.forEach(function (w) { var k = +String(w.id).slice(1); if (k >= nid) nid = k + 1; }); } } } catch (e) {}

window.FE2 = { S: S, generate: generate, buildDxf: buildDxf, w2s: w2s, s2w: s2w, fit: fit, refresh: refresh, copyFloors: copyFloors, copyBays: copyBays, projectData: projectData, loadProject: loadProject, base: base, bayL: bayL, absX: absX, absY: absY, undo: undo };
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(function () {});
if ('launchQueue' in window) window.launchQueue.setConsumer(function (lp) { if (lp.files && lp.files.length) lp.files[0].getFile().then(function (f) { if (/\.json$/i.test(f.name)) { f.text().then(function (t) { loadProject(JSON.parse(t)); }); } else { $('bgBox').open = true; loadBg(f); } }); });
resize(); refresh(); fit();
})();
