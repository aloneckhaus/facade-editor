/* Facade Editor v0.1 – prototype. World units = metres, y up. */
(function () {
'use strict';
var $ = function (id) { return document.getElementById(id); };
var cv = $('cv'), ctx = cv.getContext('2d');
var DPR = window.devicePixelRatio || 1;

// ------------------------------------------------------------------ state
var S = {
  bg: null, model: null, fileName: '', srcUnits: 0, unitScale: 1, unitMode: 'auto',
  bgOpacity: 0.35, bgText: true, bgColor: false,
  types: [
    { id: 'A', kind: 'window', name: 'חלון A', w: 0.6, h: 1.4, sill: 0.9, color: '#d43c3c' },
    { id: 'B', kind: 'window', name: 'חלון B', w: 1.0, h: 1.0, sill: 1.1, color: '#2e9e44' },
    { id: 'C', kind: 'window', name: 'חלון C', w: 1.6, h: 1.0, sill: 1.1, color: '#2f5fd6' },
    { id: 'D', kind: 'window', name: 'חלון D', w: 1.2, h: 2.4, sill: 0.0, color: '#9b3fb0' },
    { id: 'M1', kind: 'balcony', name: 'מרפסת', w: 3.0, h: 1.1, sill: -0.2, color: '#7a5a3a', slab: 0.2, style: 'glass' }
  ],
  materials: [
    { id: 'stone', name: 'אבן', color: '#d8c7a2', pw: 0.6, ph: 0.4 },
    { id: 'hpl', name: 'HPL', color: '#9eabb5', pw: 1.2, ph: 0.6 },
    { id: 'plaster', name: 'טיח', color: '#efe9dc', pw: 0, ph: 0 }
  ],
  elements: [], levels: [],
  view: { s: 20, ox: 400, oy: 400 },
  sel: new Set(), tool: 'select', placeType: 'A', curMat: 'stone',
  snap: { end: true, line: true, lev: true, grid: true, grid_cm: 5 },
  gen: { zone: null, mode: 'columns', cols: 10, empty: 0, gap: 0.6, margin: 0.5, top: 0.3, max: 0, avoid: true, seed: 1, pct: { A: 40, B: 25, C: 25, D: 10 } }
};
var nextId = 1;
function uid() { return 'e' + (nextId++); }
function typeById(id) { for (var i = 0; i < S.types.length; i++) if (S.types[i].id === id) return S.types[i]; return null; }
function matById(id) { for (var i = 0; i < S.materials.length; i++) if (S.materials[i].id === id) return S.materials[i]; return S.materials[0]; }
function elById(id) { for (var i = 0; i < S.elements.length; i++) if (S.elements[i].id === id) return S.elements[i]; return null; }
function selected() { return S.elements.filter(function (e) { return S.sel.has(e.id); }); }
function cm(v) { return Math.round(v * 1000) / 10; }
function fmtM(v) { return (v >= 0 ? '+' : '') + v.toFixed(2); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function toast(m, ms) { var t = $('toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(function () { t.style.display = 'none'; }, ms || 2500); }
function elColor(e) { if (e.color) return e.color; if (e.kind === 'cladding') return matById(e.type).color; var t = typeById(e.type); return t ? t.color : '#555'; }

// ------------------------------------------------------------------ undo
var undoStack = [], redoStack = [];
function snapshot() { return JSON.stringify({ e: S.elements, l: S.levels, t: S.types, m: S.materials, z: S.gen.zone }); }
function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 150) undoStack.shift(); redoStack.length = 0; }
function restore(s) { var o = JSON.parse(s); S.elements = o.e; S.levels = o.l; S.types = o.t; S.materials = o.m; S.gen.zone = o.z; S.sel.clear(); refreshAll(); }
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); }

// ------------------------------------------------------------------ view
function resize() { var r = cv.getBoundingClientRect(); cv.width = Math.max(1, r.width * DPR); cv.height = Math.max(1, r.height * DPR); draw(); }
function w2s(x, y) { return [x * S.view.s + S.view.ox, S.view.oy - y * S.view.s]; }
function s2w(px, py) { return [(px - S.view.ox) / S.view.s, (S.view.oy - py) / S.view.s]; }
function fitBox(b, pad) {
  var r = cv.getBoundingClientRect(), W = r.width, H = r.height - 24; pad = pad == null ? 40 : pad;
  var bw = Math.max(1e-6, b.x1 - b.x0), bh = Math.max(1e-6, b.y1 - b.y0);
  var s = Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh);
  S.view.s = s; S.view.ox = (W - bw * s) / 2 - b.x0 * s; S.view.oy = (H + bh * s) / 2 + b.y1 * s - bh * s + 0;
  S.view.oy = H / 2 + (b.y0 + b.y1) / 2 * s;
  draw();
}
function contentBox() {
  var b = null;
  function add(x0, y0, x1, y1) { if (!b) b = { x0: x0, y0: y0, x1: x1, y1: y1 }; else { b.x0 = Math.min(b.x0, x0); b.y0 = Math.min(b.y0, y0); b.x1 = Math.max(b.x1, x1); b.y1 = Math.max(b.y1, y1); } }
  if (S.bg && S.bg.robust) { var r = S.bg.robust; add(r.x0, r.y0, r.x1, r.y1); }
  S.elements.forEach(function (e) { add(e.x, e.y, e.x + e.w, e.y + e.h); });
  return b || { x0: -2, y0: -2, x1: 30, y1: 25 };
}
function fit() { fitBox(contentBox()); }

// ------------------------------------------------------------------ import
function setStatusInfo(html, isErr) { $('fileInfo').innerHTML = html ? '<div class="msg' + (isErr ? ' err' : '') + '">' + html + '</div>' : ''; }
function loadFile(file) {
  if (!file) return;
  var name = file.name, ext = name.split('.').pop().toLowerCase();
  var rd = new FileReader();
  setStatusInfo('טוען ' + esc(name) + '…');
  rd.onload = function () {
    try {
      if (ext === 'json') { loadProject(JSON.parse(rd.result)); return; }
      if (ext === 'dxf') {
        var text = rd.result;
        if (text.indexOf('AC1009') < 0 && /\$DWGCODEPAGE[\s\S]{0,30}ANSI_1255/.test(text.slice(0, 20000))) { /* fine */ }
        var dxf = new DxfParser().parseSync(text);
        setModel(FEGeom.fromDxfParser(dxf), name);
      } else if (ext === 'dwg') {
        loadDwg(new Uint8Array(rd.result), name);
      } else setStatusInfo('סוג קובץ לא נתמך: ' + esc(ext), true);
    } catch (err) { console.error(err); setStatusInfo('שגיאה בקריאת הקובץ: ' + esc(err.message || err), true); }
  };
  if (ext === 'dxf' || ext === 'json') rd.readAsText(file); else rd.readAsArrayBuffer(file);
}
var dwgLibPromise = null;
function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('לא ניתן לטעון ' + src)); }; document.head.appendChild(s); }); }
function getDwgLib() {
  if (dwgLibPromise) return dwgLibPromise;
  // hosted (http/https): fetch the raw .wasm; opened from disk (file://): fall back to the base64 copy
  function wasmBytes() {
    var viaB64 = function () { return loadScript('lib/libredwg-wasm.b64.js').then(function () {
      var b64 = self.LIBREDWG_WASM_B64, bin = atob(b64), u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      self.LIBREDWG_WASM_B64 = null; return u8.buffer; }); };
    if (location.protocol === 'file:') return viaB64();
    return fetch('lib/libredwg-web.wasm').then(function (r) { if (!r.ok) throw new Error('wasm ' + r.status); return r.arrayBuffer(); }).catch(viaB64);
  }
  dwgLibPromise = loadScript('lib/libredwg-glue.js').then(function () { return loadScript('lib/libredwg-web.umd.js'); })
    .then(wasmBytes)
    .then(function (buf) {
      return self.createModule({ wasmBinary: buf, print: function () {}, printErr: function () {} });
    }).then(function (inst) { return self['libredwg-web'].LibreDwg.createByWasmInstance(inst); });
  dwgLibPromise.catch(function () { dwgLibPromise = null; });
  return dwgLibPromise;
}
function loadDwg(u8, name) {
  setStatusInfo('טוען מנוע DWG (פעם ראשונה ~2-5 שניות)…');
  getDwgLib().then(function (lib) {
    setStatusInfo('קורא ' + esc(name) + '…');
    return new Promise(function (r) { setTimeout(r, 30); }).then(function () {
      var LW = self['libredwg-web'];
      var dwg = lib.dwg_read_data(u8, LW.Dwg_File_Type.DWG);
      if (!dwg) throw new Error('הקובץ לא נקרא (ייתכן גרסת DWG לא נתמכת)');
      var db = lib.convert(dwg);
      try { lib.dwg_free(dwg); } catch (e) {}
      window.__lastDwgDb = db;
      setModel(FEGeom.fromLibreDwg(db), name);
    });
  }).catch(function (err) { console.error(err); setStatusInfo('שגיאה בקריאת DWG: ' + esc(err.message || err) + '<br>אפשרות: להמיר ל-DXF (ODA File Converter / Save As DXF ב-AutoCAD) ולפתוח את ה-DXF.', true); });
}
function setModel(model, name) {
  model.hebShx = true;
  S.model = model; S.fileName = name; S.srcUnits = model.units || 0;
  rebuildBg(true);
}
function rebuildBg(refit) {
  if (!S.model) return;
  var scale = S.unitMode === 'auto' ? (FEGeom.UNIT_TO_M[S.srcUnits] || guessScale()) : +S.unitMode;
  var oldVis = {}; if (S.bg) Object.keys(S.bg.layers).forEach(function (k) { oldVis[k] = S.bg.layers[k].visible; });
  S.unitScale = scale;
  var t0 = performance.now();
  S.bg = FEGeom.flatten(S.model, scale);
  Object.keys(oldVis).forEach(function (k) { if (S.bg.layers[k]) S.bg.layers[k].visible = oldVis[k]; });
  buildBgPaths(); buildSnapIndex();
  var nseg = 0, nl = 0; Object.keys(S.bg.layers).forEach(function (k) { var L = S.bg.layers[k]; if (L.count) nl++; L.polys.forEach(function (p) { nseg += p.length / 2 - 1; }); });
  var b = S.bg.robust, un = FEGeom.UNIT_NAME[S.srcUnits] || ('קוד ' + S.srcUnits);
  setStatusInfo('<b>' + esc(S.fileName) + '</b><br>' + nl + ' שכבות עם תוכן · ' + nseg.toLocaleString() + ' קטעים · ' + S.bg.stats.inserts.toLocaleString() + ' בלוקים פורקו · ' + S.bg.texts.length + ' טקסטים<br>יחידות בקובץ: ' + un + (S.unitMode === 'auto' && !FEGeom.UNIT_TO_M[S.srcUnits] ? ' (נוחש: ' + scale + ' מ׳ ליחידה)' : '') +
    (b ? '<br>תחום עיקרי: ' + (b.x1 - b.x0).toFixed(1) + ' × ' + (b.y1 - b.y0).toFixed(1) + ' מ׳' : '') + ' · ' + Math.round(performance.now() - t0) + ' ms');
  $('empty').style.display = 'none';
  renderLayers();
  if (refit) fit(); else draw();
}
function guessScale() {
  // unknown units: guess from extents (architects: mm or cm)
  var tmp = FEGeom.flatten(S.model, 1), b = tmp.robust; if (!b) return 1;
  var d = Math.max(b.x1 - b.x0, b.y1 - b.y0);
  return d > 20000 ? 0.001 : d > 800 ? 0.01 : 1;
}
var bgPaths = {};
function buildBgPaths() {
  bgPaths = {};
  Object.keys(S.bg.layers).forEach(function (k) {
    var L = S.bg.layers[k]; if (!L.polys.length) return;
    var p = new Path2D();
    L.polys.forEach(function (a) { p.moveTo(a[0], a[1]); for (var i = 2; i < a.length; i += 2) p.lineTo(a[i], a[i + 1]); });
    bgPaths[k] = p;
  });
}
function renderLayers() {
  var el = $('layers'); if (!S.bg) { el.innerHTML = '<span class="mut">אין שרטוט טעון</span>'; return; }
  var ks = Object.keys(S.bg.layers).filter(function (k) { return S.bg.layers[k].count || S.bg.texts.some(function (t) { return t.layer === k; }); }).sort();
  el.innerHTML = ks.map(function (k) { var L = S.bg.layers[k];
    return '<label><span class="mut">' + L.count + '</span> ' + esc(k) + ' <span class="sw" style="background:' + FEGeom.aciHex(L.colorIndex) + '"></span><input type="checkbox" data-layer="' + esc(k) + '"' + (L.visible ? ' checked' : '') + '></label>'; }).join('');
}

// ------------------------------------------------------------------ snapping index
var SI = null;
function buildSnapIndex() {
  var b = S.bg.robust || S.bg.bbox; if (!b) { SI = null; return; }
  var cell = Math.max(b.x1 - b.x0, b.y1 - b.y0) / 300 || 1, pts = new Map(), segs = new Map();
  function key(ix, iy) { return ix * 73856093 ^ iy * 19349663; }
  function addTo(m, k, v) { var a = m.get(k); if (!a) m.set(k, a = []); a.push(v); }
  Object.keys(S.bg.layers).forEach(function (ln) {
    var L = S.bg.layers[ln];
    L.polys.forEach(function (a, pi) {
      for (var i = 0; i < a.length; i += 2) {
        addTo(pts, key(Math.floor(a[i] / cell), Math.floor(a[i + 1] / cell)), [a[i], a[i + 1], ln]);
        if (i + 3 < a.length) {
          var x0 = a[i], y0 = a[i + 1], x1 = a[i + 2], y1 = a[i + 3];
          var cx0 = Math.floor(Math.min(x0, x1) / cell), cx1 = Math.floor(Math.max(x0, x1) / cell), cy0 = Math.floor(Math.min(y0, y1) / cell), cy1 = Math.floor(Math.max(y0, y1) / cell);
          if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 400) continue;
          for (var cx = cx0; cx <= cx1; cx++) for (var cy = cy0; cy <= cy1; cy++) addTo(segs, key(cx, cy), [x0, y0, x1, y1, ln]);
        }
      }
    });
  });
  SI = { cell: cell, pts: pts, segs: segs, key: key };
}
function snapPoint(x, y, opt) {
  opt = opt || {};
  var tol = 10 / S.view.s, best = null, bd = tol;
  if (window.__altDown) return { x: x, y: y, kind: '' };
  if (SI && (S.snap.end || S.snap.line)) {
    var c = SI.cell, r = Math.ceil(tol / c), ix = Math.floor(x / c), iy = Math.floor(y / c);
    if (r <= 3) for (var dx = -r; dx <= r; dx++) for (var dy = -r; dy <= r; dy++) {
      var k = SI.key(ix + dx, iy + dy);
      if (S.snap.end) { var P = SI.pts.get(k); if (P) for (var i = 0; i < P.length; i++) { var p = P[i]; if (!S.bg.layers[p[2]].visible) continue; var d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = { x: p[0], y: p[1], kind: 'נקודת קצה' }; } } }
    }
    if (!best && S.snap.line && r <= 3) {
      var bd2 = tol * 0.8;
      for (var dx2 = -r; dx2 <= r; dx2++) for (var dy2 = -r; dy2 <= r; dy2++) {
        var G = SI.segs.get(SI.key(ix + dx2, iy + dy2)); if (!G) continue;
        for (var j = 0; j < G.length; j++) { var g = G[j]; if (!S.bg.layers[g[4]].visible) continue;
          var vx = g[2] - g[0], vy = g[3] - g[1], L2 = vx * vx + vy * vy; if (!L2) continue;
          var t = Math.max(0, Math.min(1, ((x - g[0]) * vx + (y - g[1]) * vy) / L2)), qx = g[0] + t * vx, qy = g[1] + t * vy, d2 = Math.hypot(qx - x, qy - y);
          if (d2 < bd2) { bd2 = d2; best = { x: qx, y: qy, kind: 'על קו' }; } }
      }
    }
  }
  if (!best && S.snap.lev) {
    // element corners / edges and level lines
    var bdE = tol;
    S.elements.forEach(function (e) { if (opt.exclude && opt.exclude.has(e.id)) return;
      [[e.x, e.y], [e.x + e.w, e.y], [e.x, e.y + e.h], [e.x + e.w, e.y + e.h]].forEach(function (q) { var d = Math.hypot(q[0] - x, q[1] - y); if (d < bdE) { bdE = d; best = { x: q[0], y: q[1], kind: 'פינת אלמנט' }; } }); });
    if (!best) { var by = tol, ly = null; S.levels.forEach(function (l) { var d = Math.abs(l.y - y); if (d < by) { by = d; ly = l.y; } }); if (ly != null) best = { x: gridV(x), y: ly, kind: 'מפלס' }; }
  }
  if (!best && S.snap.grid && !opt.noGrid) return { x: gridV(x), y: gridV(y), kind: 'גריד', grid: true };
  return best || { x: x, y: y, kind: '' };
}
function gridV(v) { if (!S.snap.grid) return v; var g = S.snap.grid_cm / 100; return Math.round(v / g) * g; }
// snap a moving rectangle (x,y,w,h): try its corners, return corrected x,y
function snapRect(x, y, w, h, exclude) {
  var cands = [[0, 0], [w, 0], [0, h], [w, h], [w / 2, 0]], best = null;
  for (var i = 0; i < cands.length; i++) {
    var c = cands[i], sp = snapPoint(x + c[0], y + c[1], { exclude: exclude, noGrid: true });
    if (sp.kind) { var d = Math.hypot(sp.x - x - c[0], sp.y - y - c[1]); if (!best || d < best.d) best = { d: d, x: sp.x - c[0], y: sp.y - c[1], kind: sp.kind }; }
  }
  if (best) return best;
  if (S.snap.grid) return { x: gridV(x), y: gridV(y), kind: 'גריד' };
  return { x: x, y: y, kind: '' };
}
function levelBelow(y) { var best = null; S.levels.forEach(function (l) { if (l.y <= y + 1e-6 && (best == null || l.y > best)) best = l.y; }); return best; }
function sortedLevels() { return S.levels.slice().sort(function (a, b) { return a.y - b.y; }); }

// ------------------------------------------------------------------ render
function draw() { render(ctx, cv.width, cv.height, DPR, S.view, false); updateStatus(); }
function render(c, W, H, dpr, view, exportMode) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = exportMode ? '#ffffff' : '#fbfaf7'; c.fillRect(0, 0, W, H);
  var s = view.s * dpr, ox = view.ox * dpr, oy = view.oy * dpr;
  function X(x) { return x * s + ox; } function Y(y) { return oy - y * s; }
  // grid (light) when zoomed in
  if (!exportMode && S.snap.grid) {
    var g = S.snap.grid_cm / 100; while (g * s < 12 * dpr) g *= 10;
    var x0 = Math.floor((0 - ox) / s / g) * g, x1 = (W - ox) / s, y0 = Math.floor((oy - H) / s / g) * g, y1 = oy / s;
    c.strokeStyle = 'rgba(0,0,0,0.04)'; c.lineWidth = 1; c.beginPath();
    for (var gx = x0; gx <= x1; gx += g) { c.moveTo(X(gx), 0); c.lineTo(X(gx), H); }
    for (var gy = y0; gy <= y1; gy += g) { c.moveTo(0, Y(gy)); c.lineTo(W, Y(gy)); }
    c.stroke();
  }
  // cladding (under the background lines so the drawing stays readable)
  S.elements.forEach(function (e) { if (e.kind === 'cladding') drawCladding(c, e, X, Y, s, dpr); });
  // background drawing
  if (S.bg) {
    c.save(); c.setTransform(s, 0, 0, -s, ox, oy); c.lineWidth = dpr / s; c.lineJoin = 'round';
    c.globalAlpha = S.bgOpacity;
    Object.keys(bgPaths).forEach(function (k) { var L = S.bg.layers[k]; if (!L.visible) return;
      var col = S.bgColor ? FEGeom.aciHex(L.colorIndex) : '#3a3a3a'; if (S.bgColor && col === '#ffffff') col = '#999';
      c.strokeStyle = col; c.stroke(bgPaths[k]); });
    c.restore();
    if (S.bgText) {
      c.save(); c.globalAlpha = S.bgOpacity; c.fillStyle = '#3a3a3a'; c.textBaseline = 'alphabetic';
      var n = 0;
      for (var i = 0; i < S.bg.texts.length && n < 4000; i++) { var t = S.bg.texts[i]; if (!S.bg.layers[t.layer] || !S.bg.layers[t.layer].visible) continue;
        var hp = t.h * s; if (hp < 3 * dpr) continue; var tx = X(t.x), ty = Y(t.y); if (tx < -2000 || tx > W + 2000 || ty < -200 || ty > H + 200) continue;
        n++; c.save(); c.translate(tx, ty); c.rotate(-t.rot); c.font = hp.toFixed(1) + 'px Heebo, Arial, sans-serif'; c.direction = 'ltr'; c.fillText(t.s, 0, 0); c.restore(); }
      c.restore();
    }
  }
  // generator zone
  var z = S.gen.zone;
  if (z && !exportMode) { c.save(); c.setLineDash([8 * dpr, 5 * dpr]); c.strokeStyle = '#e8960c'; c.lineWidth = 2 * dpr; c.strokeRect(X(z.x), Y(z.y + z.h), z.w * s, z.h * s); c.fillStyle = 'rgba(232,150,12,0.05)'; c.fillRect(X(z.x), Y(z.y + z.h), z.w * s, z.h * s); c.restore(); }
  // levels
  if (S.levels.length) {
    var bx = contentBox(), lx0 = X(bx.x0) - 10 * dpr, lx1 = X(bx.x1) + 10 * dpr;
    c.save(); c.setLineDash([6 * dpr, 4 * dpr]); c.strokeStyle = 'rgba(90,90,90,0.75)'; c.lineWidth = 1 * dpr; c.fillStyle = '#666'; c.font = (11 * dpr) + 'px Heebo, Arial';
    S.levels.forEach(function (l) { var yy = Y(l.y); c.beginPath(); c.moveTo(lx0, yy); c.lineTo(lx1, yy); c.stroke(); c.fillText(fmtM(l.y) + (l.name ? '  ' + l.name : ''), lx1 + 4 * dpr, yy + 4 * dpr); });
    c.restore();
  }
  // balconies + windows
  S.elements.forEach(function (e) { if (e.kind === 'balcony') drawBalcony(c, e, X, Y, s, dpr); });
  S.elements.forEach(function (e) { if (e.kind === 'window') drawWindow(c, e, X, Y, s, dpr); });
  if (exportMode) return;
  // selection
  var sel = selected();
  c.save(); c.strokeStyle = '#1e88ff'; c.lineWidth = 2 * dpr;
  sel.forEach(function (e) { c.strokeRect(X(e.x) - 2 * dpr, Y(e.y + e.h) - 2 * dpr, e.w * s + 4 * dpr, e.h * s + 4 * dpr); });
  if (sel.length === 1) { handles(sel[0]).forEach(function (h) { c.fillStyle = '#fff'; c.fillRect(X(h.x) - 4 * dpr, Y(h.y) - 4 * dpr, 8 * dpr, 8 * dpr); c.strokeRect(X(h.x) - 4 * dpr, Y(h.y) - 4 * dpr, 8 * dpr, 8 * dpr); }); }
  c.restore();
  // interaction overlays
  if (drag && drag.mode === 'box') { c.save(); c.strokeStyle = '#1e88ff'; c.setLineDash([4 * dpr, 3 * dpr]); c.fillStyle = 'rgba(30,136,255,0.06)'; var r = normRect(drag.x0, drag.y0, drag.x1, drag.y1); c.fillRect(X(r.x), Y(r.y + r.h), r.w * s, r.h * s); c.strokeRect(X(r.x), Y(r.y + r.h), r.w * s, r.h * s); c.restore(); }
  if (drag && drag.mode === 'rect') { var rr = normRect(drag.x0, drag.y0, drag.x1, drag.y1); var ghost = { kind: drag.kind, type: drag.type, x: rr.x, y: rr.y, w: rr.w, h: rr.h };
    c.save(); c.globalAlpha = 0.7; if (drag.kind === 'cladding') drawCladding(c, ghost, X, Y, s, dpr); else if (drag.kind === 'balcony') drawBalcony(c, ghost, X, Y, s, dpr);
    else { c.setLineDash([8 * dpr, 5 * dpr]); c.strokeStyle = '#e8960c'; c.lineWidth = 2 * dpr; c.strokeRect(X(rr.x), Y(rr.y + rr.h), rr.w * s, rr.h * s); }
    c.restore(); dimLabel(c, rr, X, Y, dpr); }
  if (ghostWin) { c.save(); c.globalAlpha = 0.55; drawWindow(c, ghostWin, X, Y, s, dpr); c.restore(); dimLabel(c, ghostWin, X, Y, dpr, true); }
  if (hoverSnap && hoverSnap.kind && hoverSnap.kind !== 'גריד') { var hx = X(hoverSnap.x), hy = Y(hoverSnap.y); c.save(); c.strokeStyle = '#00a86b'; c.lineWidth = 2 * dpr; c.beginPath();
    if (hoverSnap.kind === 'נקודת קצה' || hoverSnap.kind === 'פינת אלמנט') c.rect(hx - 6 * dpr, hy - 6 * dpr, 12 * dpr, 12 * dpr); else { c.moveTo(hx - 7 * dpr, hy - 7 * dpr); c.lineTo(hx + 7 * dpr, hy + 7 * dpr); c.moveTo(hx + 7 * dpr, hy - 7 * dpr); c.lineTo(hx - 7 * dpr, hy + 7 * dpr); }
    c.stroke(); c.restore(); }
}
function dimLabel(c, r, X, Y, dpr, withSill) {
  var t = cm(r.w) + ' × ' + cm(r.h);
  if (withSill) { var lb = levelBelow(r.y); if (lb != null) t += '  אדן ' + cm(r.y - lb); }
  c.save(); c.font = (12 * dpr) + 'px Heebo, Arial'; var tw = c.measureText(t).width; var x = X(r.x), y = Y(r.y + r.h) - 8 * dpr;
  c.fillStyle = 'rgba(44,42,39,.85)'; c.fillRect(x - 3 * dpr, y - 13 * dpr, tw + 6 * dpr, 17 * dpr); c.fillStyle = '#fff'; c.fillText(t, x, y); c.restore();
}
function drawWindow(c, e, X, Y, s, dpr) {
  var col = elColor(e), x = X(e.x), y = Y(e.y + e.h), w = e.w * s, h = e.h * s;
  c.fillStyle = 'rgba(255,255,255,0.92)'; c.fillRect(x, y, w, h);
  c.fillStyle = hexA(col, 0.12); c.fillRect(x, y, w, h);
  c.strokeStyle = col; c.lineWidth = Math.max(1, Math.min(2.2 * dpr, 0.05 * s)); c.strokeRect(x, y, w, h);
  if (w > 18 * dpr) { var f = 0.05 * s; c.lineWidth = Math.max(0.5, dpr * 0.8); c.strokeRect(x + f, y + f, w - 2 * f, h - 2 * f); }
  if (w > 22 * dpr && h > 16 * dpr) { var t = typeById(e.type); c.fillStyle = col; c.font = Math.min(14 * dpr, h * 0.3) + 'px Heebo, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e.type + (e.gen ? '' : ''), x + w / 2, y + h / 2); c.textAlign = 'start'; c.textBaseline = 'alphabetic'; }
}
function drawBalcony(c, e, X, Y, s, dpr) {
  var t = typeById(e.type) || {}, col = elColor(e), x = X(e.x), y = Y(e.y + e.h), w = e.w * s, h = e.h * s, slab = Math.min(e.h * 0.4, t.slab || 0.2) * s;
  c.fillStyle = t.style === 'glass' ? 'rgba(160,200,225,0.35)' : 'rgba(255,255,255,0.6)'; c.fillRect(x, y, w, h - slab);
  c.fillStyle = hexA(col, 0.85); c.fillRect(x, y + h - slab, w, slab);
  c.strokeStyle = col; c.lineWidth = Math.max(1, 1.6 * dpr); c.strokeRect(x, y, w, h);
  c.beginPath(); c.moveTo(x, y + 0.05 * s); c.lineTo(x + w, y + 0.05 * s);
  if (t.style !== 'glass') { var step = 0.12 * s; if (step > 2 * dpr) for (var bx = x + step; bx < x + w - 1; bx += step) { c.moveTo(bx, y); c.lineTo(bx, y + h - slab); } }
  else { var st = 1.0 * s; for (var gx = x + st; gx < x + w - 1; gx += st) { c.moveTo(gx, y); c.lineTo(gx, y + h - slab); } }
  c.lineWidth = Math.max(0.5, 0.8 * dpr); c.stroke();
}
function drawCladding(c, e, X, Y, s, dpr) {
  var m = matById(e.type), col = e.color || m.color, x = X(e.x), y = Y(e.y + e.h), w = e.w * s, h = e.h * s;
  c.fillStyle = hexA(col, 0.55); c.fillRect(x, y, w, h);
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.strokeStyle = shade(col, -0.35); c.lineWidth = Math.max(0.5, 0.7 * dpr); c.beginPath();
  if (m.ph > 0 && m.ph * s > 3 * dpr) {
    var rows = Math.ceil(e.h / m.ph);
    for (var r = 0; r < rows; r++) { var yy = Y(e.y + r * m.ph); if (r > 0) { c.moveTo(x, yy); c.lineTo(x + w, yy); }
      if (m.pw > 0 && m.pw * s > 3 * dpr) { var off = (r % 2) * m.pw / 2 * (m.id === 'stone' ? 1 : 0); for (var xx = off; xx < e.w; xx += m.pw) { if (xx <= 0) continue; var px = X(e.x + xx); c.moveTo(px, yy); c.lineTo(px, Y(e.y + Math.min(e.h, (r + 1) * m.ph))); } } }
  }
  c.stroke(); c.restore();
  c.strokeStyle = shade(col, -0.45); c.lineWidth = 1.2 * dpr; c.strokeRect(x, y, w, h);
}
function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
function shade(hex, f) { var n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; var k = f < 0 ? 0 : 255, t = Math.abs(f); return 'rgb(' + Math.round(r + (k - r) * t) + ',' + Math.round(g + (k - g) * t) + ',' + Math.round(b + (k - b) * t) + ')'; }
function normRect(x0, y0, x1, y1) { return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }; }
function handles(e) { var xs = [e.x, e.x + e.w / 2, e.x + e.w], ys = [e.y, e.y + e.h / 2, e.y + e.h], out = [];
  for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) { if (i === 1 && j === 1) continue; out.push({ x: xs[i], y: ys[j], hx: i - 1, hy: j - 1 }); } return out; }

// ------------------------------------------------------------------ interaction
var drag = null, ghostWin = null, hoverSnap = null, spaceDown = false, lastMouse = [0, 0];
function evPos(ev) { var r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
function hitTest(x, y) {
  var tol = 4 / S.view.s, order = ['window', 'balcony', 'cladding'];
  for (var k = 0; k < order.length; k++) for (var i = S.elements.length - 1; i >= 0; i--) { var e = S.elements[i]; if (e.kind !== order[k]) continue;
    if (x >= e.x - tol && x <= e.x + e.w + tol && y >= e.y - tol && y <= e.y + e.h + tol) return e; }
  return null;
}
function hitHandle(px, py) {
  var sel = selected(); if (sel.length !== 1) return null; var e = sel[0], hs = handles(e);
  for (var i = 0; i < hs.length; i++) { var p = w2s(hs[i].x, hs[i].y); if (Math.abs(p[0] - px) <= 6 && Math.abs(p[1] - py) <= 6) return hs[i]; }
  return null;
}
function setTool(t) {
  S.tool = t; ghostWin = null;
  document.querySelectorAll('#toolbar [data-tool]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tool') === t); });
  cv.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : 'crosshair';
  renderTypes(); draw();
}
function placeGhost(wx, wy) {
  var t = typeById(S.placeType); if (!t) return null;
  var x = wx - t.w / 2, y = wy;
  var lb = levelBelow(wy);
  var g;
  if (lb != null && S.snap.lev && !window.__altDown) { y = lb + t.sill; g = snapRect(x, y, t.w, t.h); x = g.x; if (g.kind === 'גריד' || g.kind === 'מפלס') x = gridV(wx - t.w / 2); /* keep sill */ y = (g.kind === 'נקודת קצה' || g.kind === 'פינת אלמנט' || g.kind === 'על קו') && Math.abs(g.y - y) < 10 / S.view.s ? g.y : y; }
  else { g = snapRect(x, y, t.w, t.h); x = g.x; y = g.y; }
  hoverSnap = g && g.kind && g.kind !== 'גריד' ? { x: x, y: y, kind: g.kind } : null;
  return { kind: t.kind, type: t.id, x: x, y: y, w: t.w, h: t.h };
}
cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
cv.addEventListener('mousedown', function (ev) {
  cv.focus(); var p = evPos(ev), w = s2w(p[0], p[1]);
  if (ev.button === 1 || ev.button === 2 || spaceDown || S.tool === 'pan') { drag = { mode: 'pan', px: p[0], py: p[1], ox: S.view.ox, oy: S.view.oy }; cv.style.cursor = 'grabbing'; ev.preventDefault(); return; }
  if (ev.button !== 0) return;
  if (S.tool === 'window') {
    var gw = placeGhost(w[0], w[1]); if (!gw) return;
    if (gw.kind === 'balcony') { drag = { mode: 'rect', kind: 'balcony', type: gw.type, x0: snapPoint(w[0], w[1]).x, y0: snapPoint(w[0], w[1]).y, x1: w[0], y1: w[1], click: gw }; return; }
    pushUndo(); var ne = { id: uid(), kind: 'window', type: gw.type, x: gw.x, y: gw.y, w: gw.w, h: gw.h }; S.elements.push(ne); S.sel = new Set([ne.id]); refreshAll(); return;
  }
  if (S.tool === 'balcony' || S.tool === 'cladding' || S.tool === 'zone') {
    var sp = snapPoint(w[0], w[1]);
    var tp = S.tool === 'balcony' ? (typeById(S.placeType) && typeById(S.placeType).kind === 'balcony' ? S.placeType : firstType('balcony')) : S.tool === 'cladding' ? S.curMat : null;
    drag = { mode: 'rect', kind: S.tool, type: tp, x0: sp.x, y0: sp.y, x1: sp.x, y1: sp.y }; return;
  }
  if (S.tool === 'level') { var sl = snapPoint(w[0], w[1]); pushUndo(); S.levels.push({ y: Math.round(sl.y * 1000) / 1000, name: '' }); S.levels.sort(function (a, b) { return a.y - b.y; }); refreshAll(); return; }
  // select tool
  var h = hitHandle(p[0], p[1]);
  if (h) { var e0 = selected()[0]; pushUndo(); drag = { mode: 'resize', h: h, el: e0, orig: { x: e0.x, y: e0.y, w: e0.w, h: e0.h } }; return; }
  var hit = hitTest(w[0], w[1]);
  if (hit) {
    if (ev.shiftKey || ev.ctrlKey) { if (S.sel.has(hit.id)) S.sel.delete(hit.id); else S.sel.add(hit.id); refreshProps(); draw(); return; }
    if (!S.sel.has(hit.id)) S.sel = new Set([hit.id]);
    var sel = selected(); pushUndo();
    drag = { mode: 'move', wx: w[0], wy: w[1], els: sel.map(function (e) { return { e: e, x: e.x, y: e.y }; }), anchor: hit, moved: false };
    refreshProps(); draw(); return;
  }
  if (!ev.shiftKey) S.sel.clear();
  drag = { mode: 'box', x0: w[0], y0: w[1], x1: w[0], y1: w[1], add: ev.shiftKey }; refreshProps(); draw();
});
window.addEventListener('mousemove', function (ev) {
  var p = evPos(ev); lastMouse = p; var w = s2w(p[0], p[1]);
  window.__altDown = ev.altKey;
  $('stXY').textContent = 'X: ' + w[0].toFixed(2) + '  Y: ' + w[1].toFixed(2) + ' מ׳';
  if (!drag) {
    if (ev.target !== cv) return;
    if (S.tool === 'window') { ghostWin = placeGhost(w[0], w[1]); draw(); return; }
    if (S.tool === 'balcony' || S.tool === 'cladding' || S.tool === 'zone' || S.tool === 'level') { var sp0 = snapPoint(w[0], w[1]); hoverSnap = sp0; draw(); return; }
    if (S.tool === 'select') { var hh = hitHandle(p[0], p[1]); cv.style.cursor = hh ? (hh.hx && hh.hy ? (hh.hx * hh.hy > 0 ? 'nesw-resize' : 'nwse-resize') : hh.hx ? 'ew-resize' : 'ns-resize') : hitTest(w[0], w[1]) ? 'move' : 'default'; }
    return;
  }
  if (drag.mode === 'pan') { S.view.ox = drag.ox + p[0] - drag.px; S.view.oy = drag.oy + p[1] - drag.py; draw(); return; }
  if (drag.mode === 'box') { drag.x1 = w[0]; drag.y1 = w[1]; draw(); return; }
  if (drag.mode === 'rect') { var sp = snapPoint(w[0], w[1]); hoverSnap = sp; drag.x1 = sp.x; drag.y1 = sp.y; draw(); return; }
  if (drag.mode === 'move') {
    var dx = w[0] - drag.wx, dy = w[1] - drag.wy; if (Math.abs(dx) + Math.abs(dy) > 0) drag.moved = true;
    var a = drag.els.filter(function (o) { return o.e === drag.anchor; })[0] || drag.els[0];
    var ex = new Set(drag.els.map(function (o) { return o.e.id; }));
    var g = snapRect(a.x + dx, a.y + dy, a.e.w, a.e.h, ex);
    if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) g.y = a.y; else g.x = a.x; }
    var ddx = g.x - a.x, ddy = g.y - a.y;
    drag.els.forEach(function (o) { o.e.x = o.x + ddx; o.e.y = o.y + ddy; });
    hoverSnap = g.kind && g.kind !== 'גריד' ? { x: g.x, y: g.y, kind: g.kind } : null; $('stSnap').textContent = g.kind ? 'הצמדה: ' + g.kind : '';
    refreshProps(true); draw(); return;
  }
  if (drag.mode === 'resize') {
    var e = drag.el, o = drag.orig, h = drag.h, sp2 = snapPoint(w[0], w[1], { exclude: new Set([e.id]) }); hoverSnap = sp2;
    var x0 = o.x, x1 = o.x + o.w, y0 = o.y, y1 = o.y + o.h, mn = 0.05;
    if (h.hx < 0) x0 = Math.min(sp2.x, x1 - mn); if (h.hx > 0) x1 = Math.max(sp2.x, x0 + mn);
    if (h.hy < 0) y0 = Math.min(sp2.y, y1 - mn); if (h.hy > 0) y1 = Math.max(sp2.y, y0 + mn);
    e.x = x0; e.y = y0; e.w = x1 - x0; e.h = y1 - y0; refreshProps(true); draw(); return;
  }
});
window.addEventListener('mouseup', function (ev) {
  if (!drag) return; var d = drag; drag = null;
  if (d.mode === 'pan') { cv.style.cursor = S.tool === 'pan' ? 'grab' : 'default'; return; }
  if (d.mode === 'box') {
    var r = normRect(d.x0, d.y0, d.x1, d.y1);
    if (r.w * S.view.s > 3) S.elements.forEach(function (e) { if (e.x >= r.x && e.y >= r.y && e.x + e.w <= r.x + r.w && e.y + e.h <= r.y + r.h) S.sel.add(e.id); });
    refreshProps(); draw(); return;
  }
  if (d.mode === 'rect') {
    var rr = normRect(d.x0, d.y0, d.x1, d.y1);
    if (rr.w * S.view.s < 4 || rr.h * S.view.s < 4) {
      if (d.kind === 'balcony') { // click: place default-size balcony
        var t = typeById(d.type); if (t) { pushUndo(); var gx = d.click ? d.click : placeGhost(d.x0, d.y0); var nb = { id: uid(), kind: 'balcony', type: t.id, x: gx.x, y: gx.y, w: t.w, h: t.h }; S.elements.push(nb); S.sel = new Set([nb.id]); refreshAll(); }
      }
      draw(); return;
    }
    if (d.kind === 'zone') { pushUndo(); S.gen.zone = rr; refreshGenPanel(); draw(); toast('אזור הפריסה הוגדר – לחץ "צור פריסה"'); return; }
    pushUndo(); var ne = { id: uid(), kind: d.kind, type: d.type, x: rr.x, y: rr.y, w: rr.w, h: rr.h }; S.elements.push(ne); S.sel = new Set([ne.id]); refreshAll(); return;
  }
  if (d.mode === 'move' && !d.moved) undoStack.pop();
  refreshAll();
});
cv.addEventListener('wheel', function (ev) {
  ev.preventDefault(); var p = evPos(ev), w = s2w(p[0], p[1]);
  var f = Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0015));
  S.view.s = Math.max(1e-4, Math.min(1e5, S.view.s * f)); S.view.ox = p[0] - w[0] * S.view.s; S.view.oy = p[1] + w[1] * S.view.s;
  if (S.tool === 'window') ghostWin = placeGhost(w[0], w[1]); draw();
}, { passive: false });
cv.addEventListener('mouseleave', function () { ghostWin = null; hoverSnap = null; draw(); });
window.addEventListener('keydown', function (ev) {
  if (ev.key === 'Alt') { window.__altDown = true; ev.preventDefault(); }
  var tag = (ev.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  var k = ev.key.toLowerCase();
  if (ev.key === ' ') { spaceDown = true; ev.preventDefault(); return; }
  if ((ev.ctrlKey || ev.metaKey) && k === 'z') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); return; }
  if ((ev.ctrlKey || ev.metaKey) && k === 'y') { ev.preventDefault(); redo(); return; }
  if ((ev.ctrlKey || ev.metaKey) && k === 'd') { ev.preventDefault(); duplicateSel(); return; }
  if ((ev.ctrlKey || ev.metaKey) && k === 'a') { ev.preventDefault(); S.sel = new Set(S.elements.map(function (e) { return e.id; })); refreshProps(); draw(); return; }
  if ((ev.ctrlKey || ev.metaKey) && k === 's') { ev.preventDefault(); saveProject(); return; }
  if (ev.ctrlKey || ev.metaKey) return;
  if (ev.key === 'Delete' || ev.key === 'Backspace') { deleteSel(); return; }
  if (ev.key === 'Escape') { S.sel.clear(); drag = null; setTool('select'); refreshProps(); return; }
  if (ev.key.indexOf('Arrow') === 0 && S.sel.size) { ev.preventDefault(); var st = (ev.shiftKey ? 0.1 : 0.01); var dx = ev.key === 'ArrowLeft' ? -st : ev.key === 'ArrowRight' ? st : 0, dy = ev.key === 'ArrowUp' ? st : ev.key === 'ArrowDown' ? -st : 0;
    pushUndo(); selected().forEach(function (e) { e.x += dx; e.y += dy; }); refreshProps(true); draw(); return; }
  var map = { v: 'select', w: 'window', b: 'balcony', c: 'cladding', g: 'zone', l: 'level', h: 'pan' };
  if (map[k]) { if (k === 'b') { var bt = firstType('balcony'); if (bt) S.placeType = bt; } if (k === 'w' && typeById(S.placeType) && typeById(S.placeType).kind !== 'window') S.placeType = firstType('window'); setTool(map[k]); return; }
  if (k === 'f') fit();
});
window.addEventListener('keyup', function (ev) { if (ev.key === ' ') spaceDown = false; if (ev.key === 'Alt') window.__altDown = false; });
function firstType(kind) { for (var i = 0; i < S.types.length; i++) if (S.types[i].kind === kind) return S.types[i].id; return null; }
function deleteSel() { if (!S.sel.size) return; pushUndo(); S.elements = S.elements.filter(function (e) { return !S.sel.has(e.id); }); S.sel.clear(); refreshAll(); }
function duplicateSel() {
  var sel = selected(); if (!sel.length) return; pushUndo();
  var bx = Math.min.apply(null, sel.map(function (e) { return e.x; })), bx1 = Math.max.apply(null, sel.map(function (e) { return e.x + e.w; })), off = (bx1 - bx) + S.gen.gap;
  var ns = new Set(); sel.forEach(function (e) { var n = JSON.parse(JSON.stringify(e)); n.id = uid(); delete n.gen; n.x += off; S.elements.push(n); ns.add(n.id); });
  S.sel = ns; refreshAll();
}

// ------------------------------------------------------------------ panels
function refreshAll() { renderTypes(); refreshProps(); renderLevels(); refreshGenPanel(); renderQty(); draw(); }
function updateStatus() {
  $('stZoom').textContent = 'זום: ' + (S.view.s).toFixed(S.view.s < 1 ? 3 : 1) + ' px/מ׳';
  var tn = { select: 'בחירה', window: 'הצבת ' + ((typeById(S.placeType) || {}).name || ''), balcony: 'מרפסת', cladding: 'חיפוי: ' + matById(S.curMat).name, zone: 'אזור פריסה', level: 'מפלס', pan: 'הזזה' }[S.tool];
  $('stTool').textContent = 'כלי: ' + tn; $('stSel').textContent = S.sel.size ? 'נבחרו ' + S.sel.size : '';
}
function renderTypes() {
  var rows = '<tr><th></th><th>שם</th><th>רוחב</th><th>גובה</th><th>אדן</th><th></th><th></th></tr>';
  S.types.forEach(function (t, i) {
    var on = (S.tool === 'window' || S.tool === 'balcony') && S.placeType === t.id;
    rows += '<tr data-i="' + i + '"><td><input type="color" data-f="color" value="' + t.color + '"></td>' +
      '<td><button class="typebtn' + (on ? ' on' : '') + '" data-place="' + esc(t.id) + '" title="לחץ להצבה"><span class="sw" style="background:' + t.color + '"></span>' + esc(t.id) + '</button> <input type="text" data-f="name" value="' + esc(t.name) + '"></td>' +
      '<td><input type="number" data-f="w" value="' + cm(t.w) + '"></td><td><input type="number" data-f="h" value="' + cm(t.h) + '"></td><td><input type="number" data-f="sill" value="' + cm(t.sill) + '"></td>' +
      '<td>' + (t.kind === 'balcony' ? '<select data-f="style"><option value="glass"' + (t.style === 'glass' ? ' selected' : '') + '>זכוכית</option><option value="bars"' + (t.style === 'bars' ? ' selected' : '') + '>מוטות</option></select>' : '') + '</td>' +
      '<td><button class="x" data-del="' + i + '" title="מחיקת סוג">✕</button></td></tr>';
  });
  $('typesTbl').innerHTML = rows;
  var mr = '<tr><th></th><th>חומר</th><th>לוח רוחב</th><th>לוח גובה</th><th></th></tr>';
  S.materials.forEach(function (m, i) {
    mr += '<tr data-m="' + i + '"><td><input type="color" data-f="color" value="' + m.color + '"></td><td><button class="typebtn' + (S.tool === 'cladding' && S.curMat === m.id ? ' on' : '') + '" data-mat="' + esc(m.id) + '"><span class="sw" style="background:' + m.color + '"></span></button><input type="text" data-f="name" value="' + esc(m.name) + '"></td>' +
      '<td><input type="number" data-f="pw" value="' + cm(m.pw) + '"></td><td><input type="number" data-f="ph" value="' + cm(m.ph) + '"></td><td><button class="x" data-mdel="' + i + '">✕</button></td></tr>';
  });
  $('matTbl').innerHTML = mr;
}
$('typesTbl').addEventListener('change', function (ev) {
  var tr = ev.target.closest('tr'), f = ev.target.getAttribute('data-f'); if (!tr || !f) return; var t = S.types[+tr.getAttribute('data-i')]; pushUndo();
  var v = ev.target.value; if (f === 'w' || f === 'h' || f === 'sill') {
    var nv = (+v) / 100, old = t[f]; t[f] = nv;
    // propagate to elements of this type that still have the old default size
    S.elements.forEach(function (e) { if (e.type !== t.id) return; if (f === 'w' && Math.abs(e.w - old) < 1e-6) e.w = nv; if (f === 'h' && Math.abs(e.h - old) < 1e-6) e.h = nv;
      if (f === 'sill') { var lb = levelBelow(e.y + 1e-6); if (lb != null && Math.abs(e.y - lb - old) < 1e-6) e.y = lb + nv; } });
  } else t[f] = v;
  refreshAll();
});
$('typesTbl').addEventListener('click', function (ev) {
  var b = ev.target.closest('[data-place]'); if (b) { S.placeType = b.getAttribute('data-place'); var t = typeById(S.placeType); setTool(t.kind === 'balcony' ? 'balcony' : 'window'); return; }
  var d = ev.target.closest('[data-del]'); if (d) { var t2 = S.types[+d.getAttribute('data-del')]; if (S.elements.some(function (e) { return e.type === t2.id; }) && !confirm('יש אלמנטים מסוג זה. למחוק גם אותם?')) return; pushUndo(); S.elements = S.elements.filter(function (e) { return e.type !== t2.id; }); S.types.splice(+d.getAttribute('data-del'), 1); refreshAll(); }
});
$('matTbl').addEventListener('change', function (ev) {
  var tr = ev.target.closest('tr'), f = ev.target.getAttribute('data-f'); if (!tr || !f) return; var m = S.materials[+tr.getAttribute('data-m')]; pushUndo();
  m[f] = (f === 'pw' || f === 'ph') ? (+ev.target.value) / 100 : ev.target.value; refreshAll();
});
$('matTbl').addEventListener('click', function (ev) {
  var b = ev.target.closest('[data-mat]'); if (b) { S.curMat = b.getAttribute('data-mat'); setTool('cladding'); return; }
  var d = ev.target.closest('[data-mdel]'); if (d && S.materials.length > 1) { pushUndo(); var m = S.materials.splice(+d.getAttribute('data-mdel'), 1)[0]; S.elements.forEach(function (e) { if (e.kind === 'cladding' && e.type === m.id) e.type = S.materials[0].id; }); refreshAll(); }
});
var PALETTE = ['#d43c3c', '#2e9e44', '#2f5fd6', '#9b3fb0', '#e07b00', '#0f9aa8', '#b8860b', '#c2185b', '#5d4037', '#455a64'];
$('addWin').onclick = function () { pushUndo(); var n = S.types.filter(function (t) { return t.kind === 'window'; }).length; var id = String.fromCharCode(65 + n); while (typeById(id)) id += "'"; S.types.splice(n, 0, { id: id, kind: 'window', name: 'חלון ' + id, w: 1.2, h: 1.4, sill: 0.9, color: PALETTE[n % PALETTE.length] }); S.gen.pct[id] = 0; refreshAll(); };
$('addBal').onclick = function () { pushUndo(); var n = S.types.filter(function (t) { return t.kind === 'balcony'; }).length + 1; var id = 'M' + n; while (typeById(id)) id += "'"; S.types.push({ id: id, kind: 'balcony', name: 'מרפסת ' + n, w: 4.0, h: 1.1, sill: -0.2, color: '#7a5a3a', slab: 0.2, style: 'bars' }); refreshAll(); };
$('addMat').onclick = function () { pushUndo(); var id = 'mat' + (S.materials.length + 1); S.materials.push({ id: id, name: 'חומר ' + (S.materials.length + 1), color: PALETTE[(S.materials.length + 4) % PALETTE.length], pw: 1.0, ph: 0.5 }); refreshAll(); };

function refreshProps(light) {
  var sel = selected(), el = $('props');
  if (light && document.activeElement && el.contains(document.activeElement)) return;
  if (!sel.length) { el.innerHTML = '<span class="mut">לא נבחר אלמנט. לחץ על אלמנט או גרור מלבן בחירה.</span>'; return; }
  if (sel.length > 1) {
    var kinds = {}; sel.forEach(function (e) { kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
    var opts = S.types.filter(function (t) { return t.kind === 'window'; }).map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('');
    el.innerHTML = '<div>נבחרו ' + sel.length + ' אלמנטים (' + Object.keys(kinds).map(function (k) { return kindName(k) + ' ' + kinds[k]; }).join(', ') + ')</div>' +
      '<div class="row"><label>שינוי סוג חלון</label><select id="mType"><option value="">—</option>' + opts + '</select></div>' +
      '<div class="row"><label>רוחב (ס״מ)</label><input type="number" id="mW" placeholder="—"><label style="min-width:auto">גובה</label><input type="number" id="mH" placeholder="—"></div>' +
      '<div class="row"><button class="b" data-al="bottom">יישור תחתון</button><button class="b" data-al="top">יישור עליון</button><button class="b" data-al="left">יישור שמאל</button></div>' +
      '<div class="row"><button class="b" data-al="distx">פיזור אופקי שווה</button><button class="b" data-al="disty">פיזור אנכי שווה</button></div>' +
      '<div class="row"><button class="b" id="pDup">שכפול</button><button class="b" id="pDel">מחיקה</button></div>';
    $('mType').onchange = function () { var t = typeById(this.value); if (!t) return; pushUndo(); sel.forEach(function (e) { if (e.kind !== 'window') return; var lb = levelBelow(e.y + 1e-6); e.type = t.id; e.w = t.w; e.h = t.h; if (lb != null) e.y = lb + t.sill; delete e.gen; }); refreshAll(); };
    $('mW').onchange = function () { pushUndo(); var v = +this.value / 100; sel.forEach(function (e) { var cx = e.x + e.w / 2; e.w = v; e.x = cx - v / 2; }); refreshAll(); };
    $('mH').onchange = function () { pushUndo(); var v = +this.value / 100; sel.forEach(function (e) { e.h = v; }); refreshAll(); };
    el.querySelectorAll('[data-al]').forEach(function (b) { b.onclick = function () { align(b.getAttribute('data-al')); }; });
    $('pDup').onclick = duplicateSel; $('pDel').onclick = deleteSel; return;
  }
  var e = sel[0], lb = levelBelow(e.y + 1e-6), h = '';
  h += '<div class="row"><b>' + kindName(e.kind) + '</b>' + (e.gen ? ' <span class="mut">(נוצר בפריסה)</span>' : '') + '</div>';
  if (e.kind === 'cladding') h += '<div class="row"><label>חומר</label><select data-p="type">' + S.materials.map(function (m) { return '<option value="' + m.id + '"' + (m.id === e.type ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('') + '</select></div>';
  else h += '<div class="row"><label>סוג</label><select data-p="type">' + S.types.filter(function (t) { return t.kind === e.kind; }).map(function (t) { return '<option value="' + t.id + '"' + (t.id === e.type ? ' selected' : '') + '>' + esc(t.id + ' – ' + t.name) + '</option>'; }).join('') + '</select></div>';
  h += '<div class="row"><label>רוחב (ס״מ)</label><input type="number" data-p="w" value="' + cm(e.w) + '"><label style="min-width:auto">גובה</label><input type="number" data-p="h" value="' + cm(e.h) + '"></div>';
  h += '<div class="row"><label>X שמאל (מ׳)</label><input type="number" step="0.01" data-p="x" value="' + e.x.toFixed(3) + '"><label style="min-width:auto">Y</label><input type="number" step="0.01" data-p="y" value="' + e.y.toFixed(3) + '"></div>';
  if (e.kind !== 'cladding') h += '<div class="row"><label>' + (e.kind === 'balcony' ? 'מעל מפלס (ס״מ)' : 'גובה אדן (ס״מ)') + '</label>' + (lb != null ? '<input type="number" data-p="sill" value="' + cm(e.y - lb) + '"> <span class="mut">ממפלס ' + fmtM(lb) + '</span>' : '<span class="mut">הגדר מפלסים כדי לעבוד עם גובה אדן</span>') + '</div>';
  h += '<div class="row"><label>צבע</label><input type="color" data-p="color" value="' + elColor(e) + '">' + (e.color ? '<button class="b" id="pClr">ברירת מחדל של הסוג</button>' : '<span class="mut">לפי הסוג</span>') + '</div>';
  if (e.kind === 'cladding') { var q = claddingNet(e); h += '<div class="row mut">שטח ברוטו ' + (e.w * e.h).toFixed(2) + ' מ״ר · פתחים ' + q.open.toFixed(2) + ' · נטו ' + q.net.toFixed(2) + ' מ״ר</div>'; }
  if (e.kind === 'window') h += '<div class="row mut">שטח: ' + (e.w * e.h).toFixed(2) + ' מ״ר</div>';
  h += '<div class="row"><button class="b" id="pDup">שכפול (Ctrl+D)</button><button class="b" id="pDel">מחיקה</button>' + (e.kind === 'cladding' ? '<button class="b" id="pZone">השתמש כאזור פריסה</button>' : '') + '</div>';
  el.innerHTML = h;
  el.querySelectorAll('[data-p]').forEach(function (inp) { inp.onchange = function () { setProp(e, inp.getAttribute('data-p'), inp.value); }; });
  $('pDup').onclick = duplicateSel; $('pDel').onclick = deleteSel;
  if ($('pClr')) $('pClr').onclick = function () { pushUndo(); delete e.color; refreshAll(); };
  if ($('pZone')) $('pZone').onclick = function () { pushUndo(); S.gen.zone = { x: e.x, y: e.y, w: e.w, h: e.h }; refreshGenPanel(); draw(); };
}
function kindName(k) { return { window: 'חלון', balcony: 'מרפסת', cladding: 'חיפוי' }[k] || k; }
function setProp(e, p, v) {
  pushUndo(); var lb = levelBelow(e.y + 1e-6);
  if (p === 'type') { if (e.kind === 'cladding') e.type = v; else { var t = typeById(v); var cx = e.x + e.w / 2; e.type = v; e.w = t.w; e.h = t.h; e.x = cx - t.w / 2; if (lb != null) e.y = lb + t.sill; } delete e.gen; }
  else if (p === 'w') { e.w = Math.max(0.01, +v / 100); } else if (p === 'h') { e.h = Math.max(0.01, +v / 100); }
  else if (p === 'x') e.x = +v; else if (p === 'y') e.y = +v;
  else if (p === 'sill') { if (lb != null) e.y = lb + (+v) / 100; }
  else if (p === 'color') e.color = v;
  refreshAll();
}
function align(mode) {
  var sel = selected(); if (sel.length < 2) return; pushUndo();
  if (mode === 'bottom') { var y = Math.min.apply(null, sel.map(function (e) { return e.y; })); sel.forEach(function (e) { e.y = y; }); }
  if (mode === 'top') { var t = Math.max.apply(null, sel.map(function (e) { return e.y + e.h; })); sel.forEach(function (e) { e.y = t - e.h; }); }
  if (mode === 'left') { var x = Math.min.apply(null, sel.map(function (e) { return e.x; })); sel.forEach(function (e) { e.x = x; }); }
  if (mode === 'distx' || mode === 'disty') {
    var k = mode === 'distx' ? 'x' : 'y', d = mode === 'distx' ? 'w' : 'h'; sel.sort(function (a, b) { return a[k] - b[k]; });
    var a0 = sel[0][k], a1 = sel[sel.length - 1][k] + sel[sel.length - 1][d], tot = sel.reduce(function (s, e) { return s + e[d]; }, 0), gap = (a1 - a0 - tot) / (sel.length - 1), c = a0;
    sel.forEach(function (e) { e[k] = c; c += e[d] + gap; });
  }
  refreshAll();
}

// ------------------------------------------------------------------ levels
function renderLevels() {
  var L = sortedLevels();
  $('levTbl').innerHTML = L.length ? '<tr><th>קומה</th><th>מפלס (מ׳)</th><th>שם</th><th></th></tr>' + L.map(function (l, i) {
    return '<tr data-y="' + l.y + '"><td>' + i + '</td><td><input type="number" step="0.01" data-lf="y" value="' + l.y.toFixed(2) + '"></td><td><input type="text" data-lf="name" value="' + esc(l.name || '') + '"></td><td><button class="x" data-ldel="1">✕</button></td></tr>'; }).reverse().join('') : '<tr><td class="mut">אין מפלסים</td></tr>';
}
$('levTbl').addEventListener('change', function (ev) {
  var tr = ev.target.closest('tr'); var y = +tr.getAttribute('data-y'); var l = S.levels.filter(function (q) { return q.y === y; })[0]; if (!l) return; pushUndo();
  var f = ev.target.getAttribute('data-lf');
  if (f === 'y') { var ny = +ev.target.value, dy = ny - l.y; // move elements sitting on this floor with it
    S.elements.forEach(function (e) { if (e.kind !== 'cladding' && levelBelow(e.y + 1e-6) === l.y) e.y += dy; }); l.y = ny; }
  else l.name = ev.target.value;
  refreshAll();
});
$('levTbl').addEventListener('click', function (ev) { if (!ev.target.closest('[data-ldel]')) return; var y = +ev.target.closest('tr').getAttribute('data-y'); pushUndo(); S.levels = S.levels.filter(function (l) { return l.y !== y; }); refreshAll(); });
$('levGen').onclick = function () { var b = +$('levBase').value, h = +$('levH').value, n = +$('levN').value; if (!(h > 0) || !(n > 0)) return; pushUndo(); S.levels = []; for (var i = 0; i <= n; i++) S.levels.push({ y: Math.round((b + i * h) * 1000) / 1000, name: i === n ? 'גג' : (i === 0 ? 'קרקע' : 'קומה ' + i) }); refreshAll(); };
$('levClear').onclick = function () { pushUndo(); S.levels = []; refreshAll(); };
$('levDetect').onclick = function () {
  if (!S.bg) { toast('אין שרטוט'); return; }
  var z = S.gen.zone, b = z ? { x0: z.x, x1: z.x + z.w, y0: z.y, y1: z.y + z.h } : S.bg.robust, W = b.x1 - b.x0, x0 = b.x0, x1 = b.x1, yMin = b.y0 - 0.05, yMax = b.y1 + 0.05;
  var ys = [];
  Object.keys(S.bg.layers).forEach(function (k) { var L = S.bg.layers[k]; if (!L.visible || /dim|txt|text|anno|title|symbol|grid|zirim|axis/i.test(k)) return; L.polys.forEach(function (a) {
    for (var i = 0; i + 3 < a.length; i += 2) { var dx = a[i + 2] - a[i], dy = a[i + 3] - a[i + 1], len = Math.abs(dx);
      if (len > 0.45 * W && Math.abs(dy) < 1e-3 * len && Math.max(a[i], a[i + 2]) > x0 && Math.min(a[i], a[i + 2]) < x1 && a[i + 1] >= yMin && a[i + 1] <= yMax) ys.push(a[i + 1]); } }); });
  ys.sort(function (p, q) { return p - q; });
  var groups = []; ys.forEach(function (y) { var g = groups[groups.length - 1]; if (g && y - g[g.length - 1] < 0.4) g.push(y); else groups.push([y]); });
  var found = groups.map(function (g) { return Math.max.apply(null, g); });
  if (!found.length) { toast('לא נמצאו קווים אופקיים ארוכים. אפשר להגדיר מפלסים ידנית.'); return; }
  pushUndo(); S.levels = found.map(function (y, i) { return { y: Math.round(y * 1000) / 1000, name: '' }; }); refreshAll(); toast('זוהו ' + found.length + ' מפלסים' + (z ? ' בתחום אזור הפריסה' : '') + ' – בדוק ותקן בטבלה');
};
$('repBtn').onclick = function () {
  var sel = selected().filter(function (e) { return e.kind !== 'cladding'; }); var L = sortedLevels();
  if (!sel.length) { toast('בחר חלונות/מרפסות'); return; } if (L.length < 2) { toast('צריך לפחות 2 מפלסים'); return; }
  var from = +$('repFrom').value, to = +$('repTo').value, n = 0; pushUndo();
  sel.forEach(function (e) {
    var lb = levelBelow(e.y + 1e-6); if (lb == null) return; var off = e.y - lb;
    L.forEach(function (l, i) { if (i < from || i > to || l.y === lb) return; if (i === L.length - 1) return; // roof: no floor above
      var ny = l.y + off; if (e.kind === 'window' && ny + e.h > L[i + 1].y + 0.01) return; // must fit under the next level var clash = S.elements.some(function (o) { return o.kind === e.kind && Math.abs(o.x - e.x) < 0.01 && Math.abs(o.y - ny) < 0.01; }); if (clash) return;
      var c = JSON.parse(JSON.stringify(e)); c.id = uid(); c.y = ny; delete c.gen; S.elements.push(c); n++; });
  });
  refreshAll(); toast('נוספו ' + n + ' אלמנטים בקומות');
};

// ------------------------------------------------------------------ array
$('arrBtn').onclick = function () {
  var sel = selected(); if (!sel.length) { toast('בחר אלמנט'); return; }
  var n = Math.max(2, +$('arrN').value | 0), d = +$('arrD').value / 100, dir = $('arrDir').value, to = $('arrTo').value;
  if (to !== '' && sel.length) { // distribute: n copies so that last element's left edge lands at X=to
    var e0 = sel[0], target = +to / 100; d = (target - e0.x) / (n - 1); dir = 'r'; }
  var vx = dir === 'r' ? d : dir === 'l' ? -d : 0, vy = dir === 'u' ? d : dir === 'd' ? -d : 0; pushUndo();
  sel.forEach(function (e) { for (var i = 1; i < n; i++) { var c = JSON.parse(JSON.stringify(e)); c.id = uid(); delete c.gen; c.x += vx * i; c.y += vy * i; S.elements.push(c); } });
  refreshAll();
};

// ------------------------------------------------------------------ dynamic layout generator
function rng(seed) { var a = seed >>> 0 || 1; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function refreshGenPanel() {
  var z = S.gen.zone;
  $('zoneInfo').textContent = z ? 'אזור: ' + z.w.toFixed(2) + ' × ' + z.h.toFixed(2) + ' מ׳ (X ' + z.x.toFixed(2) + ', Y ' + z.y.toFixed(2) + ')' : 'אין אזור. צייר עם "אזור פריסה" או בחר אזור חיפוי.';
  var wins = S.types.filter(function (t) { return t.kind === 'window'; });
  var cnt = {}; S.elements.forEach(function (e) { if (e.gen) cnt[e.type] = (cnt[e.type] || 0) + 1; }); var tot = 0; Object.keys(cnt).forEach(function (k) { tot += cnt[k]; });
  $('mixTbl').innerHTML = '<tr><th>סוג</th><th>% יעד</th><th>בפועל</th></tr>' + wins.map(function (t) {
    return '<tr><td><span class="sw" style="background:' + t.color + '"></span> ' + esc(t.id) + ' <span class="mut">' + cm(t.w) + '×' + cm(t.h) + '</span></td><td><input type="number" min="0" step="5" data-pct="' + esc(t.id) + '" value="' + (S.gen.pct[t.id] || 0) + '"></td><td class="mut">' + (tot ? (cnt[t.id] || 0) + ' (' + Math.round(100 * (cnt[t.id] || 0) / tot) + '%)' : '–') + '</td></tr>'; }).join('');
  [['genMode', 'mode'], ['genCols', 'cols'], ['genEmpty', 'empty'], ['genMax', 'max'], ['genSeed', 'seed']].forEach(function (p) { if (document.activeElement !== $(p[0])) $(p[0]).value = S.gen[p[1]]; });
  [['genGap', 'gap'], ['genMargin', 'margin'], ['genTop', 'top']].forEach(function (p) { if (document.activeElement !== $(p[0])) $(p[0]).value = cm(S.gen[p[1]]); });
  $('genAvoid').checked = S.gen.avoid; $('genCols').disabled = S.gen.mode !== 'columns'; $('genEmpty').disabled = S.gen.mode !== 'columns';
}
$('mixTbl').addEventListener('change', function (ev) { var id = ev.target.getAttribute('data-pct'); if (id) S.gen.pct[id] = Math.max(0, +ev.target.value); });
function readGen() {
  S.gen.mode = $('genMode').value; S.gen.cols = Math.max(1, +$('genCols').value | 0); S.gen.empty = Math.max(0, Math.min(95, +$('genEmpty').value)); S.gen.max = Math.max(0, +$('genMax').value | 0);
  S.gen.seed = +$('genSeed').value | 0; S.gen.gap = +$('genGap').value / 100; S.gen.margin = +$('genMargin').value / 100; S.gen.top = +$('genTop').value / 100; S.gen.avoid = $('genAvoid').checked;
}
['genMode', 'genCols', 'genEmpty', 'genMax', 'genSeed', 'genGap', 'genMargin', 'genTop', 'genAvoid'].forEach(function (id) { $(id).addEventListener('change', function () { readGen(); refreshGenPanel(); }); });
function generate() {
  readGen(); var z = S.gen.zone; if (!z) { toast('הגדר קודם אזור פריסה'); return null; }
  var R = rng(S.gen.seed), G = S.gen;
  var types = S.types.filter(function (t) { return t.kind === 'window' && (G.pct[t.id] || 0) > 0; });
  if (!types.length) { toast('הגדר אחוזים לסוגי החלונות'); return null; }
  var sumP = types.reduce(function (s, t) { return s + G.pct[t.id]; }, 0);
  // floor bands inside zone
  var L = sortedLevels().map(function (l) { return l.y; }), bands = [];
  if (L.length >= 2) { for (var i = 0; i < L.length; i++) { var y0 = L[i], y1 = i + 1 < L.length ? L[i + 1] : z.y + z.h; if (y1 <= z.y + 1e-6 || y0 >= z.y + z.h - 1e-6) continue; var a = Math.max(y0, z.y), b = Math.min(y1, z.y + z.h); if (b - a > 0.5) bands.push({ base: y0, y0: a, y1: b }); } }
  else { var fh = +$('levH').value || 3.2; for (var yb = z.y; yb + 1 < z.y + z.h; yb += fh) bands.push({ base: yb, y0: yb, y1: Math.min(z.y + z.h, yb + fh) }); }
  pushUndo();
  S.elements = S.elements.filter(function (e) { return !(e.gen && e.x >= z.x - 1e-6 && e.x + e.w <= z.x + z.w + 1e-6 && e.y >= z.y - 1e-6 && e.y + e.h <= z.y + z.h + 1e-6); });
  var obstacles = G.avoid ? S.elements.filter(function (e) { return e.kind !== 'cladding'; }) : [];
  var count = {}, total = 0, placed = [], skippedFit = 0, colsReduced = 0;
  types.forEach(function (t) { count[t.id] = 0; });
  function pickType(eligible) { // deficit-weighted random pick -> mix converges to target %
    var ws = eligible.map(function (t) { var target = G.pct[t.id] / sumP * (total + 1); return Math.max(0.02, target - count[t.id] + 0.5) * (0.6 + 0.8 * R()); });
    var s = ws.reduce(function (p, q) { return p + q; }, 0), r = R() * s; for (var i = 0; i < eligible.length; i++) { r -= ws[i]; if (r <= 0) return eligible[i]; } return eligible[eligible.length - 1];
  }
  function collides(x, y, w, h) { var g = G.gap; for (var i = 0; i < obstacles.length; i++) { var o = obstacles[i]; if (x < o.x + o.w + g && x + w + g > o.x && y < o.y + o.h + g * 0.25 && y + h + g * 0.25 > o.y) return true; } return false; }
  function add(t, x, band) { var y = band.base + t.sill; var e = { id: uid(), kind: 'window', type: t.id, x: x, y: y, w: t.w, h: t.h, gen: true }; S.elements.push(e); obstacles.push(e); placed.push(e); count[t.id]++; total++; }
  function fitsBand(t, band) { var y = band.base + t.sill; return y >= band.y0 - 1e-6 && y + t.h <= band.y1 - G.top + 1e-6 && y >= z.y - 1e-6; }
  var x0 = z.x + G.margin, x1 = z.x + z.w - G.margin;
  outer: for (var bi = 0; bi < bands.length; bi++) {
    var band = bands[bi], elig = types.filter(function (t) { return fitsBand(t, band); }); if (!elig.length) { skippedFit++; continue; }
    if (G.mode === 'columns') {
      var minW = Math.max.apply(null, elig.map(function (t) { return t.w; })); // widest eligible type must fit a slot
      var ncols = Math.max(1, Math.min(G.cols, Math.floor((x1 - x0 + G.gap) / (minW + G.gap))));
      if (ncols < G.cols) colsReduced = ncols;
      var slot = (x1 - x0) / ncols;
      for (var c = 0; c < ncols; c++) {
        if (G.max && total >= G.max) break outer;
        if (R() * 100 < G.empty) continue;
        var el2 = elig.filter(function (t) { return t.w <= slot - G.gap + 1e-6; }); if (!el2.length) continue;
        var t = pickType(el2), cx = x0 + slot * (c + 0.5), x = gridV(cx - t.w / 2);
        if (collides(x, band.base + t.sill, t.w, t.h)) continue;
        add(t, x, band);
      }
    } else {
      var x = x0 + R() * G.gap;
      var guard = 0;
      while (x < x1 && guard++ < 500) {
        if (G.max && total >= G.max) break outer;
        var el3 = elig.filter(function (t) { return x + t.w <= x1 + 1e-6; }); if (!el3.length) break;
        var t2 = pickType(el3), xx = gridV(x);
        if (collides(xx, band.base + t2.sill, t2.w, t2.h)) { x += 0.1; continue; }
        add(t2, xx, band);
        x = xx + t2.w + G.gap * (1 + R() * 1.5);
      }
    }
  }
  refreshAll();
  var res = 'נוצרו ' + total + ' חלונות ב-' + bands.length + ' קומות' + (L.length < 2 ? ' (ללא מפלסים מוגדרים – חלוקה לפי גובה קומה ' + ($('levH').value) + ' מ׳)' : '') + (skippedFit ? ' · ' + skippedFit + ' קומות בלי סוג שנכנס' : '') + (colsReduced ? ' · מספר העמודות הוקטן ל-' + colsReduced + ' כדי שהחלונות ייכנסו' : '') + '<br>' + types.map(function (t) { return t.id + ': ' + count[t.id] + ' (' + (total ? Math.round(100 * count[t.id] / total) : 0) + '% / יעד ' + Math.round(100 * G.pct[t.id] / sumP) + '%)'; }).join(' · ');
  $('genRes').innerHTML = res;
  return { total: total, count: count, bands: bands.length };
}
$('genBtn').onclick = generate;
$('reseed').onclick = function () { $('genSeed').value = (Math.random() * 1e6) | 0; generate(); };
$('genClear').onclick = function () { pushUndo(); S.elements = S.elements.filter(function (e) { return !e.gen; }); $('genRes').innerHTML = ''; refreshAll(); };
$('genFreeze').onclick = function () { pushUndo(); S.elements.forEach(function (e) { delete e.gen; }); refreshAll(); toast('החלונות נקבעו – "הגרלה מחדש" לא תמחק אותם'); };
$('zoneFromSel').onclick = function () { var s = selected(); if (!s.length) { toast('בחר אלמנט (למשל אזור חיפוי)'); return; } var x0 = Math.min.apply(null, s.map(function (e) { return e.x; })), y0 = Math.min.apply(null, s.map(function (e) { return e.y; })), x1 = Math.max.apply(null, s.map(function (e) { return e.x + e.w; })), y1 = Math.max.apply(null, s.map(function (e) { return e.y + e.h; })); pushUndo(); S.gen.zone = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; refreshGenPanel(); draw(); };
$('zoneFromBg').onclick = function () { if (!S.bg) return; var b = S.bg.robust; pushUndo(); S.gen.zone = { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 }; refreshGenPanel(); draw(); };

// ------------------------------------------------------------------ quantities
function overlapArea(a, b) { var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; }
function claddingNet(c) { var open = 0; S.elements.forEach(function (e) { if (e.kind === 'window' || e.kind === 'balcony') open += overlapArea(c, e); }); return { open: open, net: c.w * c.h - open }; }
function quantities() {
  var rows = [], byType = {};
  S.elements.forEach(function (e) {
    var key = e.kind === 'cladding' ? 'mat:' + e.type : e.type + '|' + cm(e.w) + 'x' + cm(e.h);
    var r = byType[key]; if (!r) { r = byType[key] = { kind: e.kind, type: e.type, w: e.w, h: e.h, n: 0, area: 0, len: 0, gross: 0, net: 0 }; rows.push(r); }
    r.n++; r.area += e.w * e.h; r.len += e.w; if (e.kind === 'cladding') { var q = claddingNet(e); r.gross += e.w * e.h; r.net += q.net; }
  });
  rows.sort(function (a, b) { return (a.kind + a.type).localeCompare(b.kind + b.type); });
  return rows;
}
function renderQty() {
  var rows = quantities(); if (!rows.length) { $('qty').innerHTML = '<span class="mut">אין אלמנטים עדיין</span>'; return; }
  var h = '<table class="t"><tr><th>סוג</th><th>מידה (ס״מ)</th><th>כמות</th><th>שטח (מ״ר)</th></tr>', winA = 0, winN = 0;
  rows.forEach(function (r) {
    if (r.kind === 'cladding') { var m = matById(r.type); h += '<tr><td><span class="sw" style="background:' + m.color + '"></span> חיפוי ' + esc(m.name) + '</td><td class="mut">ברוטו ' + r.gross.toFixed(1) + '</td><td>' + r.n + ' אזורים</td><td><b>' + r.net.toFixed(2) + '</b> נטו</td></tr>'; return; }
    var t = typeById(r.type) || { color: '#999', name: r.type };
    if (r.kind === 'window') { winA += r.area; winN += r.n; }
    h += '<tr><td><span class="sw" style="background:' + t.color + '"></span> ' + esc(r.type) + ' ' + (r.kind === 'balcony' ? 'מרפסת' : '') + '</td><td>' + cm(r.w) + '×' + cm(r.h) + '</td><td>' + r.n + '</td><td>' + (r.kind === 'balcony' ? r.len.toFixed(1) + ' מ״א' : r.area.toFixed(2)) + '</td></tr>';
  });
  h += '<tr><th>סה״כ חלונות</th><th></th><th>' + winN + '</th><th>' + winA.toFixed(2) + '</th></tr></table>';
  if (S.gen.zone) { var za = S.gen.zone.w * S.gen.zone.h; h += '<div class="mut">אחוז פתחים מאזור הפריסה: ' + (100 * winA / za).toFixed(1) + '% (' + za.toFixed(1) + ' מ״ר)</div>'; }
  h += '<div class="row"><button class="b" id="qCsv">ייצוא CSV</button></div>';
  $('qty').innerHTML = h; $('qCsv').onclick = exportCsv;
}
function exportCsv() {
  var lines = ['kind,type,width_cm,height_cm,count,area_m2,net_area_m2'];
  quantities().forEach(function (r) { lines.push([r.kind, r.type, cm(r.w), cm(r.h), r.n, r.area.toFixed(3), r.kind === 'cladding' ? r.net.toFixed(3) : ''].join(',')); });
  download(baseName() + '_quantities.csv', '\ufeff' + lines.join('\r\n'), 'text/csv');
}

// ------------------------------------------------------------------ export
function baseName() { return (S.fileName || 'facade').replace(/\.[^.]+$/, '') + '_facade'; }
function download(name, data, mime) { var b = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' }); var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); window.__lastDownload = { name: name, blob: b }; }
// ACI palette for nearest-colour mapping
var ACI_RGB = (function () { var t = { 1: [255, 0, 0], 2: [255, 255, 0], 3: [0, 255, 0], 4: [0, 255, 255], 5: [0, 0, 255], 6: [255, 0, 255], 7: [255, 255, 255], 8: [128, 128, 128], 9: [192, 192, 192] };
  var lv = [1, 0.65, 0.5, 0.3, 0.15];
  for (var hI = 0; hI < 24; hI++) for (var v = 0; v < 10; v++) { var hue = hI * 15, val = lv[v >> 1], sat = (v & 1) ? 0.5 : 1;
    var c = val, x = c * (1 - Math.abs((hue / 60) % 2 - 1)), r, g, b; var seg = Math.floor(hue / 60);
    if (seg === 0) { r = c; g = x; b = 0; } else if (seg === 1) { r = x; g = c; b = 0; } else if (seg === 2) { r = 0; g = c; b = x; } else if (seg === 3) { r = 0; g = x; b = c; } else if (seg === 4) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
    var mn = val * (1 - sat); t[10 + hI * 10 + v] = [Math.round((r * sat + mn) * 255), Math.round((g * sat + mn) * 255), Math.round((b * sat + mn) * 255)]; }
  return t; })();
function hexToAci(hex) { var n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255, best = 7, bd = 1e9;
  Object.keys(ACI_RGB).forEach(function (k) { if (k == 7) return; var c = ACI_RGB[k], d = (c[0] - r) * (c[0] - r) + (c[1] - g) * (c[1] - g) + (c[2] - b) * (c[2] - b); if (d < bd) { bd = d; best = +k; } }); return best; }
function dxfStr(s) { return String(s).replace(/[^\x20-\x7e]/g, function (ch) { var c = ch.charCodeAt(0); return '\\U+' + ('0000' + c.toString(16).toUpperCase()).slice(-4); }); }
function dxfLayerName(s) { var n = dxfStr(String(s).replace(/[<>\/\\":;?*|=`]/g, '_')); return n || '0'; }
function buildDxf(opts) {
  var u = 1 / S.unitScale, out = [], layers = {}, blocks = {};
  function g(code, v) { out.push(String(code), String(v)); }
  function L(name, color) { if (!layers[name]) layers[name] = color || 7; return name; }
  function n(v) { return (Math.round(v * u * 1e6) / 1e6).toString(); }
  var ent = [];
  function E() { for (var i = 0; i < arguments.length; i += 2) ent.push(String(arguments[i]), String(arguments[i + 1])); }
  function poly(layer, pts, closed, raw) { E(0, 'POLYLINE', 8, layer, 66, 1, 10, 0, 20, 0, 30, 0, 70, closed ? 1 : 0);
    for (var i = 0; i < pts.length; i += 2) E(0, 'VERTEX', 8, layer, 10, raw ? pts[i] : n(pts[i]), 20, raw ? pts[i + 1] : n(pts[i + 1]), 30, 0); E(0, 'SEQEND', 8, layer); }
  function line(layer, x0, y0, x1, y1) { E(0, 'LINE', 8, layer, 10, n(x0), 20, n(y0), 30, 0, 11, n(x1), 21, n(y1), 31, 0); }
  function text(layer, x, y, h, s, center) { E(0, 'TEXT', 8, layer, 10, n(x), 20, n(y), 30, 0, 40, n(h), 1, dxfStr(s)); if (center) E(72, 1, 73, 2, 11, n(x), 21, n(y), 31, 0); }
  function rect(layer, e) { poly(layer, [e.x, e.y, e.x + e.w, e.y, e.x + e.w, e.y + e.h, e.x, e.y + e.h], true); }
  // original drawing (exploded, arcs tessellated), in original units
  if (opts.merge && S.bg) {
    Object.keys(S.bg.layers).forEach(function (k) { var Ly = S.bg.layers[k]; if (!Ly.polys.length) return; var ln = L(dxfLayerName(k), Math.abs(Ly.colorIndex || 7) % 256 || 7);
      Ly.polys.forEach(function (a) { if (a.length === 4) line(ln, a[0], a[1], a[2], a[3]); else { var pts = []; for (var i = 0; i < a.length; i++) pts.push(a[i]); poly(ln, pts, false); } }); });
    S.bg.texts.forEach(function (t) { if (!t.s) return; E(0, 'TEXT', 8, L(dxfLayerName(t.layer), 7), 10, n(t.x), 20, n(t.y), 30, 0, 40, n(t.h), 1, dxfStr(t.s), 50, (t.rot * 180 / Math.PI).toFixed(4)); });
  }
  // cladding
  S.elements.forEach(function (e) { if (e.kind !== 'cladding') return; var m = matById(e.type), ln = L(dxfLayerName('FE_CLAD_' + m.id.toUpperCase()), hexToAci(e.color || m.color)); rect(ln, e);
    if (opts.joints && m.ph > 0) { var jl = L(dxfLayerName('FE_CLAD_JOINT_' + m.id.toUpperCase()), 8), rows = Math.ceil(e.h / m.ph - 1e-9);
      for (var r = 0; r < rows; r++) { var y0 = e.y + r * m.ph, y1 = Math.min(e.y + e.h, y0 + m.ph); if (r > 0) line(jl, e.x, y0, e.x + e.w, y0);
        if (m.pw > 0) { var off = (r % 2) * m.pw / 2 * (m.id === 'stone' ? 1 : 0); for (var xx = off; xx < e.w - 1e-9; xx += m.pw) if (xx > 1e-9) line(jl, e.x + xx, y0, e.x + xx, y1); } } }
  });
  // windows as blocks per type+size, balconies as geometry
  S.elements.forEach(function (e) {
    if (e.kind === 'window') {
      var t = typeById(e.type) || { color: '#888' }, bn = dxfLayerName('FE_W_' + e.type + '_' + Math.round(cm(e.w)) + 'x' + Math.round(cm(e.h)));
      if (!blocks[bn]) blocks[bn] = { w: e.w, h: e.h, type: e.type };
      var ln2 = L(dxfLayerName('FE_WIN_' + e.type), hexToAci(e.color || t.color));
      E(0, 'INSERT', 8, ln2, 2, bn, 10, n(e.x), 20, n(e.y), 30, 0);
    } else if (e.kind === 'balcony') {
      var bt = typeById(e.type) || { color: '#7a5a3a', slab: 0.2 }, lb = L('FE_BALCONY', hexToAci(e.color || bt.color)), slab = Math.min(e.h * 0.4, bt.slab || 0.2);
      rect(lb, e); line(lb, e.x, e.y + slab, e.x + e.w, e.y + slab); line(lb, e.x, e.y + e.h - 0.05, e.x + e.w, e.y + e.h - 0.05);
    }
  });
  if (opts.levels && S.levels.length) { var bx = contentBox(), ll = L('FE_LEVELS', 8);
    S.levels.forEach(function (lv) { line(ll, bx.x0 - 0.5, lv.y, bx.x1 + 0.5, lv.y); text(ll, bx.x1 + 0.8, lv.y + 0.05, 0.25, fmtM(lv.y) + (lv.name ? ' ' + lv.name : '')); }); }
  // assemble
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSBASE'); g(10, 0); g(20, 0); g(30, 0);
  var cb = contentBox(); g(9, '$EXTMIN'); g(10, n(cb.x0)); g(20, n(cb.y0)); g(30, 0); g(9, '$EXTMAX'); g(10, n(cb.x1)); g(20, n(cb.y1)); g(30, 0); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1); g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0); g(0, 'ENDTAB');
  var lk = Object.keys(layers); if (lk.indexOf('0') < 0) lk.unshift('0');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, lk.length); lk.forEach(function (k) { g(0, 'LAYER'); g(2, k); g(70, 0); g(62, layers[k] || 7); g(6, 'CONTINUOUS'); }); g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1); g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 0.2 * u); g(3, 'txt'); g(4, ''); g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'BLOCKS');
  Object.keys(blocks).forEach(function (bn) { var b = blocks[bn], f = Math.min(0.05, b.w / 6, b.h / 6);
    g(0, 'BLOCK'); g(8, '0'); g(2, bn); g(70, 0); g(10, 0); g(20, 0); g(30, 0); g(3, bn);
    var save = ent; ent = [];
    poly('0', [0, 0, b.w, 0, b.w, b.h, 0, b.h], true); poly('0', [f, f, b.w - f, f, b.w - f, b.h - f, f, b.h - f], true);
    text('0', b.w / 2, b.h / 2, Math.min(0.2, b.h / 4), b.type, true);
    for (var q = 0; q < ent.length; q++) out.push(ent[q]); ent = save; g(0, 'ENDBLK'); g(8, '0'); });
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  var head = out.join('\r\n') + '\r\n', body = ent.join('\r\n') + (ent.length ? '\r\n' : '');
  return head + body + '0\r\nENDSEC\r\n0\r\nEOF\r\n';
}
function exportDxf() { var d = buildDxf({ merge: $('expMerge').checked, joints: $('expJoints').checked, levels: $('expLevels').checked }); download(baseName() + '.dxf', d, 'application/dxf'); toast('DXF נשמר (יחידות: ' + (FEGeom.UNIT_NAME[S.srcUnits] || S.unitScale + ' מ׳') + ')'); return d; }
function exportBox() { var b = contentBox(), p = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.03; if (S.levels.length) p = Math.max(p, 1.5); return { x0: b.x0 - p, y0: b.y0 - p, x1: b.x1 + p * 2, y1: b.y1 + p }; }
function exportPng() {
  var b = exportBox(), maxPx = 4000, s = maxPx / Math.max(b.x1 - b.x0, b.y1 - b.y0), W = Math.ceil((b.x1 - b.x0) * s), H = Math.ceil((b.y1 - b.y0) * s);
  var c = document.createElement('canvas'); c.width = W; c.height = H;
  var bo = S.bgOpacity; render(c.getContext('2d'), W, H, 1, { s: s, ox: -b.x0 * s, oy: b.y1 * s }, true);
  c.toBlob(function (bl) { download(baseName() + '.png', bl, 'image/png'); });
  return c;
}
function exportSvg() {
  var b = exportBox(), W = b.x1 - b.x0, H = b.y1 - b.y0, k = 1000 / Math.max(W, H);
  function X(x) { return ((x - b.x0) * k).toFixed(2); } function Y(y) { return ((b.y1 - y) * k).toFixed(2); }
  var o = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (W * k).toFixed(1) + ' ' + (H * k).toFixed(1) + '" width="' + (W * k * 2).toFixed(0) + '" height="' + (H * k * 2).toFixed(0) + '"><rect width="100%" height="100%" fill="#fff"/>'];
  if (S.bg) { o.push('<g fill="none" stroke="#3a3a3a" stroke-width="0.4" opacity="' + S.bgOpacity + '" stroke-linejoin="round">');
    Object.keys(S.bg.layers).forEach(function (kk) { var L = S.bg.layers[kk]; if (!L.visible || !L.polys.length) return; var d = [];
      L.polys.forEach(function (a) { var s = 'M' + X(a[0]) + ' ' + Y(a[1]); for (var i = 2; i < a.length; i += 2) s += 'L' + X(a[i]) + ' ' + Y(a[i + 1]); d.push(s); });
      o.push('<path data-layer="' + esc(kk) + '" d="' + d.join('') + '"/>'); });
    o.push('</g>'); }
  S.elements.forEach(function (e) { if (e.kind !== 'cladding') return; var col = elColor(e); o.push('<rect x="' + X(e.x) + '" y="' + Y(e.y + e.h) + '" width="' + (e.w * k).toFixed(2) + '" height="' + (e.h * k).toFixed(2) + '" fill="' + col + '" fill-opacity="0.55" stroke="' + shade(col, -0.45) + '" stroke-width="0.6"/>'); });
  if (S.levels.length) { var cb = contentBox(); S.levels.forEach(function (l) { o.push('<line x1="' + X(cb.x0 - 0.5) + '" x2="' + X(cb.x1 + 0.5) + '" y1="' + Y(l.y) + '" y2="' + Y(l.y) + '" stroke="#777" stroke-dasharray="4 3" stroke-width="0.5"/><text x="' + X(cb.x1 + 0.7) + '" y="' + Y(l.y) + '" font-size="' + (0.3 * k).toFixed(1) + '" fill="#666" font-family="Arial">' + fmtM(l.y) + '</text>'); }); }
  S.elements.forEach(function (e) { if (e.kind === 'cladding') return; var col = elColor(e);
    o.push('<rect x="' + X(e.x) + '" y="' + Y(e.y + e.h) + '" width="' + (e.w * k).toFixed(2) + '" height="' + (e.h * k).toFixed(2) + '" fill="' + (e.kind === 'balcony' ? 'rgba(160,200,225,0.4)' : '#fff') + '" stroke="' + col + '" stroke-width="' + (e.kind === 'balcony' ? 1 : 1.2) + '"/>');
    if (e.kind === 'window') o.push('<text x="' + X(e.x + e.w / 2) + '" y="' + Y(e.y + e.h / 2) + '" font-size="' + Math.min(0.25 * k, e.h * k * 0.3).toFixed(1) + '" fill="' + col + '" text-anchor="middle" dominant-baseline="middle" font-family="Arial">' + esc(e.type) + '</text>'); });
  o.push('</svg>'); var svg = o.join('\n'); download(baseName() + '.svg', svg, 'image/svg+xml'); return svg;
}
function projectData(includeBg) {
  var d = { app: 'facade-editor', version: 1, fileName: S.fileName, srcUnits: S.srcUnits, unitScale: S.unitScale, unitMode: S.unitMode, types: S.types, materials: S.materials, elements: S.elements, levels: S.levels, gen: S.gen, view: S.view, bgOpacity: S.bgOpacity };
  if (includeBg && S.bg) { var L = {}; Object.keys(S.bg.layers).forEach(function (k) { var l = S.bg.layers[k]; L[k] = { colorIndex: l.colorIndex, visible: l.visible, polys: l.polys.map(function (a) { return Array.prototype.map.call(a, function (v) { return Math.round(v * 1000) / 1000; }); }) }; });
    d.background = { layers: L, texts: S.bg.texts.map(function (t) { return { layer: t.layer, x: +t.x.toFixed(3), y: +t.y.toFixed(3), h: +t.h.toFixed(3), rot: +t.rot.toFixed(4), s: t.s }; }) }; }
  return d;
}
function saveProject() { download(baseName() + '.facade.json', JSON.stringify(projectData(true)), 'application/json'); }
function loadProject(d) {
  if (d.app !== 'facade-editor') throw new Error('זה לא קובץ פרויקט של עורך החזיתות');
  S.types = d.types; S.materials = d.materials; S.elements = d.elements; S.levels = d.levels || []; S.gen = Object.assign(S.gen, d.gen || {}); S.fileName = d.fileName || ''; S.srcUnits = d.srcUnits || 0; S.unitScale = d.unitScale || 1; S.bgOpacity = d.bgOpacity || 0.35; $('bgOp').value = S.bgOpacity;
  nextId = 1; S.elements.forEach(function (e) { var n = +String(e.id).slice(1); if (n >= nextId) nextId = n + 1; });
  if (d.background) { var layers = {}; Object.keys(d.background.layers).forEach(function (k) { var l = d.background.layers[k]; layers[k] = { colorIndex: l.colorIndex, visible: l.visible, count: l.polys.length, polys: l.polys.map(function (a) { return new Float64Array(a); }) }; });
    var bb = FEGeom.bboxOf(layers); S.bg = { layers: layers, texts: d.background.texts || [], bbox: bb.full, robust: bb.robust, stats: { inserts: 0 } }; S.model = null; buildBgPaths(); buildSnapIndex(); renderLayers(); $('empty').style.display = 'none';
    setStatusInfo('פרויקט נטען: <b>' + esc(S.fileName) + '</b> (' + S.elements.length + ' אלמנטים)'); }
  undoStack = []; redoStack = []; S.sel.clear(); refreshAll(); if (d.view) { S.view = d.view; draw(); } else fit();
}

// ------------------------------------------------------------------ wiring
$('fileIn').addEventListener('change', function () { loadFile(this.files[0]); this.value = ''; });
$('openBtn').onclick = function () { $('fileIn').click(); };
document.querySelectorAll('#toolbar [data-tool]').forEach(function (b) { b.onclick = function () { var t = b.getAttribute('data-tool');
  if (t === 'window' && (!typeById(S.placeType) || typeById(S.placeType).kind !== 'window')) S.placeType = firstType('window');
  if (t === 'balcony') { var bt = firstType('balcony'); if (bt && (!typeById(S.placeType) || typeById(S.placeType).kind !== 'balcony')) S.placeType = bt; }
  setTool(t); }; });
$('fitBtn').onclick = fit; $('undoBtn').onclick = undo; $('redoBtn').onclick = redo;
[['snEnd', 'end'], ['snLine', 'line'], ['snLev', 'lev'], ['snGrid', 'grid']].forEach(function (p) { $(p[0]).onclick = function () { S.snap[p[1]] = !S.snap[p[1]]; this.classList.toggle('on', S.snap[p[1]]); draw(); }; });
$('gridSize').onchange = function () { S.snap.grid_cm = Math.max(0.1, +this.value || 5); draw(); };
$('bgOp').oninput = function () { S.bgOpacity = +this.value; draw(); };
$('bgText').onchange = function () { S.bgText = this.checked; draw(); };
$('bgColor').onchange = function () { S.bgColor = this.checked; draw(); };
$('unitSel').onchange = function () { var old = S.unitScale; S.unitMode = this.value; rebuildBg(true); };
$('layers').addEventListener('change', function (ev) { var k = ev.target.getAttribute('data-layer'); if (k != null && S.bg.layers[k]) { S.bg.layers[k].visible = ev.target.checked; draw(); } });
$('layAll').onclick = function () { if (!S.bg) return; Object.keys(S.bg.layers).forEach(function (k) { S.bg.layers[k].visible = true; }); renderLayers(); draw(); };
$('layNone').onclick = function () { if (!S.bg) return; Object.keys(S.bg.layers).forEach(function (k) { S.bg.layers[k].visible = false; }); renderLayers(); draw(); };
$('expDxf').onclick = exportDxf; $('expPng').onclick = exportPng; $('expSvg').onclick = exportSvg; $('saveJson').onclick = saveProject;
var stage = $('stage');
['dragenter', 'dragover'].forEach(function (n) { stage.addEventListener(n, function (e) { e.preventDefault(); $('drop').style.display = 'flex'; }); });
['dragleave', 'drop'].forEach(function (n) { stage.addEventListener(n, function (e) { e.preventDefault(); $('drop').style.display = 'none'; }); });
stage.addEventListener('drop', function (e) { var f = e.dataTransfer.files[0]; if (f) loadFile(f); });
window.addEventListener('resize', resize);
window.addEventListener('beforeunload', function (e) { if (S.elements.length) { e.preventDefault(); e.returnValue = ''; } });

// test / automation hooks
window.FE = { S: S, loadFile: loadFile, generate: generate, buildDxf: buildDxf, exportSvg: exportSvg, exportPng: exportPng, projectData: projectData, loadProject: loadProject, fit: fit, fitBox: fitBox, draw: draw, refreshAll: refreshAll, setTool: setTool, pushUndo: pushUndo, undo: undo, uid: uid, quantities: quantities, getDwgLib: getDwgLib, w2s: w2s, s2w: s2w };
resize(); refreshAll(); setTool('select');
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('sw', e); });
if ('launchQueue' in window) window.launchQueue.setConsumer(function (lp) { if (lp.files && lp.files.length) lp.files[0].getFile().then(loadFile); });
})();
