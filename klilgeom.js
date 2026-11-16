/* Klil Bauhaus 5600 elevation geometry (outside view). All numbers in mm, origin = bottom-left of the outer frame.
   Sightlines come from window.KLIL5600.pv (measured in Klil's DWG sections). */
(function () {
'use strict';
var K = window.KLIL5600, P = K.pv;
function byId(id) { for (var i = 0; i < K.types.length; i++) if (K.types[i].id === id) return K.types[i]; return null; }
function fam(kt) {
  if (kt.kind === 'door') return { F: P.frame_face_std, so: P.sash_offset_from_frame_edge_std, dl: P.door_daylight_from_frame_edge, meet: P.door_meeting_daylight_from_center,
    thrSo: P.door_sash_bottom_gap, thrDl: P.door_sash_bottom_gap + P.door_bottom_rail, mullSo: P.sash_offset_from_mullion_center, mullDl: P.sash_offset_from_mullion_center + P.door_sash_face };
  if (kt.narrow) return { F: P.narrow_frame_face, so: P.narrow_sash_offset, dl: P.narrow_daylight_from_frame_edge, meet: P.narrow_meeting_daylight_from_center,
    mullSo: P.sash_offset_from_mullion_center, mullDl: P.sash_offset_from_mullion_center + P.narrow_sash_face };
  return { F: P.frame_face_std, so: P.sash_offset_from_frame_edge_std, dl: P.window_daylight_from_frame_edge, meet: P.window_meeting_daylight_from_center,
    mullSo: P.sash_offset_from_mullion_center, mullDl: P.sash_offset_from_mullion_center + P.window_sash_face };
}
// geometry for one window: W,H mm; o = {split (mm), mir (bool), glass (mm)}
function geom(id, W, H, o) {
  var kt = byId(id); if (!kt) return null; o = o || {};
  var f = fam(kt), half = P.mullion_face / 2, g = { W: W, H: H, kt: kt, frame: [0, 0, W, H], F: f.F, bars: [], sashes: [], fixed: [], warn: [] };
  function ins(e, kind, isSash) { // inset of a region edge
    if (e === 'frame') return isSash ? (kind === 'so' ? f.so : f.dl) : (kind === 'so' ? 0 : P.fixed_daylight_from_frame_edge);
    if (e === 'thr') return kind === 'so' ? f.thrSo : f.thrDl;
    if (e === 'mull') return isSash ? (kind === 'so' ? f.mullSo : f.mullDl) : (kind === 'so' ? 0 : P.fixed_daylight_from_mullion_center);
    if (e === 'meet') return kind === 'so' ? 0 : f.meet;
    return 0;
  }
  function cell(r, op, hinge) {
    var sash = op !== 'fixed', E = r.e;
    var dl = [r.x0 + ins(E.l, 'dl', sash), r.y0 + ins(E.b, 'dl', sash), r.x1 - ins(E.r, 'dl', sash), r.y1 - ins(E.t, 'dl', sash)];
    if (!sash) { g.fixed.push({ dl: dl, r: r }); return; }
    var sr = [r.x0 + ins(E.l, 'so', true), r.y0 + ins(E.b, 'so', true), r.x1 - ins(E.r, 'so', true), r.y1 - ins(E.t, 'so', true)];
    g.sashes.push({ sr: sr, dl: dl, op: op, hinge: hinge });
  }
  function fill(spec, r, side) {
    if (spec.k === 'single') return cell(r, spec.op, side || 'L');
    if (spec.k === 'pair') { var xm = (r.x0 + r.x1) / 2;
      cell({ x0: r.x0, x1: xm, y0: r.y0, y1: r.y1, e: { l: r.e.l, r: 'meet', b: r.e.b, t: r.e.t } }, spec.ops[0], 'L');
      cell({ x0: xm, x1: r.x1, y0: r.y0, y1: r.y1, e: { l: 'meet', r: r.e.r, b: r.e.b, t: r.e.t } }, spec.ops[1], 'R'); return; }
    if (spec.k === 'hsplit') { var ys = r.y0 + o.split; g.bars.push([r.x0 + f.F, ys - half, r.x1 - f.F, ys + half]);
      fill(spec.bottom, { x0: r.x0, x1: r.x1, y0: r.y0, y1: ys, e: { l: r.e.l, r: r.e.r, b: r.e.b, t: 'mull' } });
      fill(spec.top, { x0: r.x0, x1: r.x1, y0: ys, y1: r.y1, e: { l: r.e.l, r: r.e.r, b: 'mull', t: r.e.t } }); return; }
    if (spec.k === 'vsplit') { var xs = r.x0 + o.split; g.bars.push([xs - half, r.y0 + f.F, xs + half, r.y1 - f.F]);
      fill(spec.left, { x0: r.x0, x1: xs, y0: r.y0, y1: r.y1, e: { l: r.e.l, r: 'mull', b: r.e.b, t: r.e.t } }, 'L');
      fill(spec.right, { x0: xs, x1: r.x1, y0: r.y0, y1: r.y1, e: { l: 'mull', r: r.e.r, b: r.e.b, t: r.e.t } }, 'R'); return; }
  }
  if (o.split == null) o.split = kt.defaults.split || 0;
  fill(kt.layout, { x0: 0, x1: W, y0: 0, y1: H, e: { l: 'frame', r: 'frame', b: kt.kind === 'door' ? 'thr' : 'frame', t: 'frame' } });
  // checks
  var lim = K.lim[kt.lim], t = o.glass || kt.glass;
  function okSize(w, h, list) { return list.some(function (m) { return w <= m[0] + 0.5 && h <= m[1] + 0.5; }); }
  g.sashes.forEach(function (s, i) {
    var sw = s.sr[2] - s.sr[0], sh = s.sr[3] - s.sr[1], dw = s.dl[2] - s.dl[0], dh = s.dl[3] - s.dl[1];
    s.w = sw; s.h = sh;
    if (dw <= 0 || dh <= 0) g.warn.push('כנף ' + (i + 1) + ': קטנה מדי – אין פתח אור');
    var L = kt.kind === 'door' ? K.lim.door : K.lim.win;
    if (!okSize(sw, sh, L.max)) g.warn.push('כנף ' + (i + 1) + ' ' + Math.round(sw / 10) + '×' + Math.round(sh / 10) + ' ס״מ חורגת מהמקסימום של קליל (' + L.max.map(function (m) { return m[0] / 10 + '×' + m[1] / 10; }).join(' או ') + ')');
    var kg = Math.max(0, dw) * Math.max(0, dh) / 1e6 * 2.5 * t; s.kg = kg;
    if (kg > L.kg) g.warn.push('כנף ' + (i + 1) + ': משקל זכוכית משוער ' + Math.round(kg) + ' ק״ג > ' + L.kg + ' ק״ג');
  });
  g.fixed.forEach(function (fx) { var dw = fx.dl[2] - fx.dl[0], dh = fx.dl[3] - fx.dl[1];
    if (dw <= 0 || dh <= 0) g.warn.push('קבוע: קטן מדי');
    else if (!okSize(dw, dh, K.lim.fixed.max)) g.warn.push('קבוע ' + Math.round(dw / 10) + '×' + Math.round(dh / 10) + ' ס״מ מעל 150×150 (המלצת קליל)'); });
  if (kt.layout.k === 'hsplit' || kt.layout.k === 'vsplit') { var tot = kt.layout.k === 'hsplit' ? H : W; if (o.split <= f.F + half || o.split >= tot - f.F - half) g.warn.push('מיקום החציץ מחוץ לחלון'); }
  // mirror (swap left/right)
  if (o.mir) { var mx = function (a) { return [W - a[2], a[1], W - a[0], a[3]]; };
    g.bars = g.bars.map(mx); g.sashes.forEach(function (s) { s.sr = mx(s.sr); s.dl = mx(s.dl); s.hinge = s.hinge === 'L' ? 'R' : 'L'; }); g.fixed.forEach(function (fx) { fx.dl = mx(fx.dl); }); }
  // opening symbols: apex at the hinge side; dashed = opens inward (away from the outside viewer)
  g.sym = [];
  g.sashes.forEach(function (s) { var a = s.sr, x0 = a[0], y0 = a[1], x1 = a[2], y1 = a[3], ym = (y0 + y1) / 2, xm = (x0 + x1) / 2, dash = s.op !== 'door_out';
    if (s.op === 'turn' || s.op === 'dk' || s.op === 'door_in' || s.op === 'door_out') {
      if (s.hinge === 'L') g.sym.push({ p: [x1, y1, x0, ym, x1, y0], d: dash }); else g.sym.push({ p: [x0, y1, x1, ym, x0, y0], d: dash }); }
    if (s.op === 'kipp' || s.op === 'dk') g.sym.push({ p: [x0, y1, xm, y0, x1, y1], d: dash });
  });
  return g;
}
window.KlilGeom = { geom: geom, type: byId, data: K };
})();
