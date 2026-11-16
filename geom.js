/* Facade Editor - CAD import normalisation + flattening (shared by browser and node tests) */
(function (root) {
  'use strict';
  // $INSUNITS -> metres per drawing unit
  var UNIT_TO_M = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 7: 1000, 8: 0.0000254, 9: 0.0000254, 10: 0.9144, 14: 0.1, 15: 10, 16: 100 };
  var UNIT_NAME = { 0: 'ללא', 1: 'אינץ׳', 2: 'רגל', 4: 'מ״מ', 5: 'ס״מ', 6: 'מטר', 14: 'דצ״מ' };

  function txt(t) { if (t == null) return ''; if (typeof t === 'string') return t; if (typeof t === 'object') return txt(t.text || t.value || t.string || ''); return String(t); }
  function P(p) { return p ? { x: +p.x || 0, y: +p.y || 0 } : { x: 0, y: 0 }; }
  function mirrored(e) { var ex = e.extrusionDirection; return ex && ex.z < -0.5; }

  // ---------- dxf-parser -> normalised model ----------
  function normDxf(e) {
    var L = e.layer || '0', m = mirrored(e), out = null;
    switch (e.type) {
      case 'LINE': out = { t: 'line', a: P(e.vertices[0]), b: P(e.vertices[1]) }; break;
      case 'LWPOLYLINE': case 'POLYLINE':
        if (!e.vertices || e.vertices.length < 2) return null;
        if (e.is3dPolygonMesh || e.isPolyfaceMesh) return null;
        out = { t: 'poly', pts: e.vertices.map(function (v) { return { x: +v.x || 0, y: +v.y || 0, bulge: +v.bulge || 0 }; }), closed: !!e.shape };
        break;
      case 'ARC': out = { t: 'arc', c: P(e.center), r: e.radius, sa: e.startAngle, ea: e.endAngle }; break;
      case 'CIRCLE': out = { t: 'circle', c: P(e.center), r: e.radius }; break;
      case 'ELLIPSE': out = { t: 'ellipse', c: P(e.center), major: P(e.majorAxisEndPoint), ratio: e.axisRatio, sa: e.startAngle, ea: e.endAngle }; break;
      case 'SPLINE':
        out = { t: 'spline', ctrl: (e.controlPoints || []).map(P), fit: (e.fitPoints || []).map(P), knots: e.knotValues || [], degree: e.degreeOfSplineCurve || 3 }; break;
      case 'TEXT': out = { t: 'text', p: P(e.startPoint), h: e.textHeight || 1, rot: (e.rotation || 0) * Math.PI / 180, s: txt(e.text), style: e.styleName }; break;
      case 'MTEXT': out = { t: 'text', p: P(e.position), h: e.height || 1, rot: (e.rotation || 0) * Math.PI / 180, s: txt(e.text), mtext: true, style: e.styleName }; break;
      case 'INSERT':
        out = { t: 'insert', name: e.name, p: P(e.position), sx: e.xScale == null ? 1 : e.xScale, sy: e.yScale == null ? 1 : e.yScale,
          rot: (e.rotation || 0) * Math.PI / 180, cols: e.columnCount || 1, rows: e.rowCount || 1, cs: e.columnSpacing || 0, rs: e.rowSpacing || 0 };
        break;
      case 'DIMENSION': if (e.block) out = { t: 'block', name: e.block }; break;
      case 'SOLID': case '3DFACE':
        if (e.points && e.points.length >= 3) { var q = e.points.map(P); if (e.type === 'SOLID' && q.length === 4) q = [q[0], q[1], q[3], q[2]]; out = { t: 'poly', pts: q, closed: true }; }
        break;
      default: return null;
    }
    if (out) { out.layer = L; if (m) out.mirror = true; }
    return out;
  }
  function fromDxfParser(dxf) {
    var model = { units: (dxf.header && dxf.header.$INSUNITS) || 0, layers: [], entities: [], blocks: {}, styles: {} };
    var lt = dxf.tables && dxf.tables.layer && dxf.tables.layer.layers;
    if (lt) Object.keys(lt).forEach(function (k) { var l = lt[k]; model.layers.push({ name: l.name, colorIndex: l.colorIndex, color: l.color, visible: l.visible !== false && !l.frozen }); });
    (dxf.entities || []).forEach(function (e) { if (e.inPaperSpace) { model.paperSkipped = (model.paperSkipped || 0) + 1; return; } var n = normDxf(e); if (n) model.entities.push(n); });
    var bl = dxf.blocks || {};
    Object.keys(bl).forEach(function (k) {
      var b = bl[k]; if (/^\*(model|paper)_space/i.test(k)) return;
      model.blocks[k] = { base: P(b.position), entities: (b.entities || []).map(normDxf).filter(Boolean) };
    });
    return model;
  }

  // ---------- libredwg-web DwgDatabase -> normalised model ----------
  function normDwg(e) {
    var L = e.layer || '0', m = mirrored(e), out = null;
    switch (e.type) {
      case 'LINE': out = { t: 'line', a: P(e.startPoint), b: P(e.endPoint) }; break;
      case 'LWPOLYLINE':
        if (!e.vertices || e.vertices.length < 2) return null;
        out = { t: 'poly', pts: e.vertices.map(function (v) { return { x: v.x, y: v.y, bulge: v.bulge || 0 }; }), closed: !!((e.flag & 1) || (e.flag & 512)) }; break;
      case 'POLYLINE2D': case 'POLYLINE3D': case 'POLYLINE':
        if (!e.vertices || e.vertices.length < 2) return null;
        out = { t: 'poly', pts: e.vertices.map(function (v) { return { x: v.x, y: v.y, bulge: v.bulge || 0 }; }), closed: !!(e.flag & 1) }; break;
      case 'ARC': out = { t: 'arc', c: P(e.center), r: e.radius, sa: e.startAngle, ea: e.endAngle }; break;
      case 'CIRCLE': out = { t: 'circle', c: P(e.center), r: e.radius }; break;
      case 'ELLIPSE': out = { t: 'ellipse', c: P(e.center), major: P(e.majorAxisEndPoint), ratio: e.axisRatio, sa: e.startAngle, ea: e.endAngle }; break;
      case 'SPLINE': out = { t: 'spline', ctrl: (e.controlPoints || []).map(P), fit: (e.fitPoints || []).map(P), knots: e.knots || [], degree: e.degree || 3 }; break;
      case 'TEXT': case 'ATTRIB': out = { t: 'text', p: P(e.startPoint), h: e.textHeight || 1, rot: e.rotation || 0, s: txt(e.text), style: e.styleName }; break;
      case 'MTEXT': out = { t: 'text', p: P(e.insertionPoint), h: e.textHeight || 1, rot: e.rotation || 0, s: txt(e.text), mtext: true, style: e.styleName }; break;
      case 'INSERT':
        out = { t: 'insert', name: e.name, p: P(e.insertionPoint), sx: e.xScale == null ? 1 : e.xScale, sy: e.yScale == null ? 1 : e.yScale,
          rot: e.rotation || 0, cols: e.columnCount || 1, rows: e.rowCount || 1, cs: e.columnSpacing || 0, rs: e.rowSpacing || 0 };
        break;
      case 'DIMENSION': if (e.name) out = { t: 'block', name: e.name }; break;
      case 'SOLID': case 'TRACE': case '3DFACE':
        var c = [e.corner1, e.corner2, e.corner4, e.corner3].filter(Boolean).map(P);
        if (c.length >= 3) out = { t: 'poly', pts: c, closed: true }; break;
      default: return null;
    }
    if (out) { out.layer = L; if (m) out.mirror = true; }
    return out;
  }
  function fromLibreDwg(db) {
    var model = { units: (db.header && db.header.INSUNITS) || 0, layers: [], entities: [], blocks: {}, styles: {} };
    ((db.tables && db.tables.STYLE && db.tables.STYLE.entries) || []).forEach(function (s) { model.styles[s.name] = s.font || ''; });
    ((db.tables && db.tables.LAYER && db.tables.LAYER.entries) || []).forEach(function (l) {
      model.layers.push({ name: l.name, colorIndex: l.colorIndex, visible: !l.off && !l.frozen });
    });
    // db.entities holds model space AND paper-space layouts (+ ATTRIBs owned by INSERTs): keep model space only
    var ms = null, recs = (db.tables && db.tables.BLOCK_RECORD && db.tables.BLOCK_RECORD.entries) || [];
    recs.forEach(function (b) { if (/^\*model_space$/i.test(b.name)) ms = b.handle; });
    var ents = db.entities || [], keep = {};
    if (ms != null) { ents.forEach(function (e) { if (e.ownerBlockRecordSoftId === ms && e.type !== 'ATTRIB') keep[e.handle] = 1; });
      ents = ents.filter(function (e) { return e.type === 'ATTRIB' ? keep[e.ownerBlockRecordSoftId] : e.ownerBlockRecordSoftId === ms; }); }
    model.paperSkipped = (db.entities || []).length - ents.length;
    ents.forEach(function (e) { var n = normDwg(e); if (n) model.entities.push(n); });
    ((db.tables && db.tables.BLOCK_RECORD && db.tables.BLOCK_RECORD.entries) || []).forEach(function (b) {
      if (/^\*(model|paper)_space/i.test(b.name)) return;
      model.blocks[b.name] = { base: P(b.basePoint), entities: (b.entities || []).map(normDwg).filter(Boolean) };
    });
    return model;
  }

  // ---------- flattening ----------
  // matrix [a,b,c,d,e,f]: x' = a*x + c*y + e ; y' = b*x + d*y + f
  function mul(m, n) { return [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]]; }
  function arcPts(cx, cy, r, sa, ea, out) {
    while (ea <= sa) ea += Math.PI * 2;
    var sweep = ea - sa, n = Math.max(4, Math.ceil(sweep / (Math.PI / 24)));
    for (var i = 0; i <= n; i++) { var a = sa + sweep * i / n; out.push(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
    return out;
  }
  function bulgeSegSafe(x1, y1, x2, y2, b, out) {
    // robust version: compute centre via geometry, sweep th (signed, ccw positive)
    var th = 4 * Math.atan(b), dx = x2 - x1, dy = y2 - y1, ch = Math.hypot(dx, dy);
    if (ch < 1e-12) return;
    var r = ch / (2 * Math.sin(Math.abs(th) / 2));
    var d = Math.sqrt(Math.max(0, r * r - ch * ch / 4)), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    var ux = -dy / ch, uy = dx / ch, s = (Math.abs(th) > Math.PI ? -1 : 1) * (th > 0 ? 1 : -1);
    var cx = mx + ux * d * s, cy = my + uy * d * s, sa = Math.atan2(y1 - cy, x1 - cx);
    var n = Math.max(2, Math.ceil(Math.abs(th) / (Math.PI / 24)));
    for (var i = 1; i < n; i++) { var a = sa + th * i / n; out.push(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
    out.push(x2, y2);
  }
  function bspline(ctrl, degree, knots, segs) {
    var n = ctrl.length; if (n < 2) return ctrl;
    var p = Math.min(degree, n - 1), k = knots && knots.length === n + p + 1 ? knots : null;
    if (!k) { k = []; for (var i = 0; i < n + p + 1; i++) k.push(i <= p ? 0 : i >= n ? 1 : (i - p) / (n - p)); }
    var out = [], t0 = k[p], t1 = k[n];
    for (var s = 0; s <= segs; s++) {
      var t = t0 + (t1 - t0) * s / segs; if (s === segs) t -= 1e-9;
      var kk = p; while (kk < n - 1 && t >= k[kk + 1]) kk++;
      var d = []; for (var j = 0; j <= p; j++) d.push({ x: ctrl[kk - p + j].x, y: ctrl[kk - p + j].y });
      for (var r = 1; r <= p; r++) for (var j2 = p; j2 >= r; j2--) {
        var i2 = kk - p + j2, den = k[i2 + p - r + 1] - k[i2], al = den ? (t - k[i2]) / den : 0;
        d[j2] = { x: (1 - al) * d[j2 - 1].x + al * d[j2].x, y: (1 - al) * d[j2 - 1].y + al * d[j2].y };
      }
      out.push(d[p]);
    }
    return out;
  }
  function catmull(pts, segs) {
    if (pts.length < 3) return pts; var out = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (var s = 0; s < segs; s++) { var t = s / segs, t2 = t * t, t3 = t2 * t;
        out.push({ x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                   y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3) }); }
    }
    out.push(pts[pts.length - 1]); return out;
  }
  function stripMText(s) {
    return String(s).replace(/\\P/g, ' ').replace(/\\[ACFHQTWfhqtwacp][^;\\]*;/g, '').replace(/\\[LlOoKk]/g, '').replace(/[{}]/g, '')
      .replace(/\\U\+([0-9A-Fa-f]{4})/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±');
  }

  // Israeli SHX fonts (sivan, oron, mgil, miriam...) store Hebrew as Latin keyboard keys
  var KB = { t:'א',c:'ב',d:'ג',s:'ד',v:'ה',u:'ו',z:'ז',j:'ח',y:'ט',h:'י',l:'ך',f:'כ',k:'ל',o:'ם',n:'מ',i:'ן',b:'נ',x:'ס',g:'ע',';':'ף',p:'פ','.':'ץ',m:'צ',e:'ק',r:'ר',a:'ש',',':'ת',w:'׳' };
  var HEB_FONT = /(sivan|oron|mgil|miry|mirim|bigh|full|hebr|heb|narkis|david|hshx|ktav|ofer|aharoni|guttman|caes|haim|yael|shalom)/i;
  function hebShx(model, style, s) {
    if (!model.hebShx || !style || !s || /[\u0590-\u05FF]/.test(s)) return s;
    var font = (model.styles || {})[style] || '';
    if (!/\.shx$/i.test(font) && font) return s;
    if (!HEB_FONT.test(font) || /english|\ben\b/i.test(style)) return s;
    if (/[A-Z]/.test(s)) return s;
    return s.replace(/[a-z;,.w]/g, function (c) { return KB[c] || c; });
  }
  /** flatten(model, scale) -> { layers: {name:{polys:[Float64Array], colorIndex, visible}}, texts:[], bbox, robust } ; coords multiplied by scale */
  function flatten(model, scale) {
    scale = scale || 1;
    var layers = {}, texts = [], stats = { entities: 0, inserts: 0, skipped: 0 };
    model.layers.forEach(function (l) { layers[l.name] = { polys: [], colorIndex: l.colorIndex, visible: l.visible, count: 0 }; });
    function lay(name) { if (!layers[name]) layers[name] = { polys: [], colorIndex: 7, visible: true, count: 0 }; return layers[name]; }
    function emit(layerName, flat, M, closed) {
      if (flat.length < 4) return;
      if (closed) flat.push(flat[0], flat[1]);
      var o = new Float64Array(flat.length);
      for (var i = 0; i < flat.length; i += 2) { var x = flat[i], y = flat[i + 1]; o[i] = (M[0] * x + M[2] * y + M[4]) * scale; o[i + 1] = (M[1] * x + M[3] * y + M[5]) * scale; }
      var L = lay(layerName); L.polys.push(o); L.count++;
    }
    function walk(ents, M, parentLayer, depth) {
      if (depth > 12) return;
      for (var i = 0; i < ents.length; i++) {
        var e = ents[i], ln = (e.layer === '0' && parentLayer) ? parentLayer : e.layer, MM = M;
        stats.entities++;
        if (e.mirror) MM = mul(M, [-1, 0, 0, 1, 0, 0]);
        switch (e.t) {
          case 'line': emit(ln, [e.a.x, e.a.y, e.b.x, e.b.y], MM); break;
          case 'poly': {
            var f = [], pts = e.pts, n = pts.length;
            f.push(pts[0].x, pts[0].y);
            for (var j = 0; j < n - 1 + (e.closed ? 1 : 0); j++) {
              var a = pts[j], b = pts[(j + 1) % n];
              if (a.bulge) bulgeSegSafe(a.x, a.y, b.x, b.y, a.bulge, f); else f.push(b.x, b.y);
            }
            emit(ln, f, MM); break;
          }
          case 'arc': emit(ln, arcPts(e.c.x, e.c.y, e.r, e.sa, e.ea, []), MM); break;
          case 'circle': emit(ln, arcPts(e.c.x, e.c.y, e.r, 0, Math.PI * 2, []), MM); break;
          case 'ellipse': {
            var mx = e.major.x, my = e.major.y, nx = -my * e.ratio, ny = mx * e.ratio, sa = e.sa || 0, ea = e.ea == null ? Math.PI * 2 : e.ea;
            while (ea <= sa) ea += Math.PI * 2;
            var ff = [], nn = Math.max(8, Math.ceil((ea - sa) / (Math.PI / 32)));
            for (var k = 0; k <= nn; k++) { var t = sa + (ea - sa) * k / nn; ff.push(e.c.x + mx * Math.cos(t) + nx * Math.sin(t), e.c.y + my * Math.cos(t) + ny * Math.sin(t)); }
            emit(ln, ff, MM); break;
          }
          case 'spline': {
            var sp = e.ctrl.length >= 2 ? bspline(e.ctrl, e.degree, e.knots, Math.max(16, e.ctrl.length * 8)) : catmull(e.fit, 8);
            var fs = []; sp.forEach(function (p) { fs.push(p.x, p.y); }); emit(ln, fs, MM); break;
          }
          case 'text': {
            var x = e.p.x, y = e.p.y;
            texts.push({ layer: ln, x: (MM[0] * x + MM[2] * y + MM[4]) * scale, y: (MM[1] * x + MM[3] * y + MM[5]) * scale,
              h: e.h * Math.hypot(MM[1], MM[3]) * scale, rot: e.rot + Math.atan2(MM[1], MM[0]), s: hebShx(model, e.style, stripMText(e.s)) });
            lay(ln); break;
          }
          case 'insert': case 'block': {
            var blk = model.blocks[e.name]; if (!blk) { stats.skipped++; break; }
            stats.inserts++;
            if (e.t === 'block') { walk(blk.entities, MM, ln, depth + 1); break; }
            var c = Math.cos(e.rot), s = Math.sin(e.rot);
            for (var ci = 0; ci < Math.max(1, e.cols); ci++) for (var ri = 0; ri < Math.max(1, e.rows); ri++) {
              var ox = ci * e.cs, oy = ri * e.rs;
              var T = [e.sx * c, e.sx * s, -e.sy * s, e.sy * c, e.p.x + c * ox - s * oy, e.p.y + s * ox + c * oy];
              T = mul(T, [1, 0, 0, 1, -blk.base.x, -blk.base.y]);
              walk(blk.entities, mul(MM, T), ln, depth + 1);
            }
            break;
          }
        }
      }
    }
    walk(model.entities, [1, 0, 0, 1, 0, 0], null, 0);
    var bb = bboxOf(layers);
    return { layers: layers, texts: texts, bbox: bb.full, robust: bb.robust, stats: stats };
  }
  function bboxOf(layers) {
    var xs = [], ys = [], full = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    Object.keys(layers).forEach(function (k) { layers[k].polys.forEach(function (p) {
      for (var i = 0; i < p.length; i += 2) { var x = p[i], y = p[i + 1]; if (!isFinite(x) || !isFinite(y)) continue;
        if (x < full.x0) full.x0 = x; if (x > full.x1) full.x1 = x; if (y < full.y0) full.y0 = y; if (y > full.y1) full.y1 = y;
        if ((i & 7) === 0) { xs.push(x); ys.push(y); } }
    }); });
    if (!xs.length) return { full: null, robust: null };
    xs.sort(function (a, b) { return a - b; }); ys.sort(function (a, b) { return a - b; });
    var q = function (a, f) { return a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * f)))]; };
    var r = { x0: q(xs, 0.01), x1: q(xs, 0.99), y0: q(ys, 0.01), y1: q(ys, 0.99) };
    var w = r.x1 - r.x0, h = r.y1 - r.y0;
    r = { x0: Math.max(full.x0, r.x0 - w * 0.15), x1: Math.min(full.x1, r.x1 + w * 0.15), y0: Math.max(full.y0, r.y0 - h * 0.15), y1: Math.min(full.y1, r.y1 + h * 0.15) };
    return { full: full, robust: r };
  }
  // AutoCAD Color Index -> hex (basic + greys; others approximated)
  var ACI = { 1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: '#000000', 8: '#808080', 9: '#c0c0c0', 250: '#333333', 251: '#505050', 252: '#696969', 253: '#828282', 254: '#bebebe', 255: '#ffffff' };
  function aciHex(i) { return ACI[Math.abs(i)] || '#777777'; }
  var api = { fromDxfParser: fromDxfParser, fromLibreDwg: fromLibreDwg, flatten: flatten, UNIT_TO_M: UNIT_TO_M, UNIT_NAME: UNIT_NAME, aciHex: aciHex, stripMText: stripMText, bboxOf: bboxOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FEGeom = api;
})(typeof self !== 'undefined' ? self : this);
