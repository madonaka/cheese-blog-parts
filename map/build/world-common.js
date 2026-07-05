// 세계지도(근현대) 빌드 공용 — 창(WIN)·투영·단순화·날짜변경선 분할
// 사용처: convert-land-world.js / build-relief-world.js / gen-world-map.js
const CFG = { WIN: [-180, -56, 180, 78], SCALE: 8, pad: 6, ocean: "rgb(95,131,137)" };
const kx = Math.cos((CFG.WIN[1] + CFG.WIN[3]) / 2 * Math.PI / 180);
const W = Math.round((CFG.WIN[2] - CFG.WIN[0]) * kx * CFG.SCALE + CFG.pad * 2);
const H = Math.round((CFG.WIN[3] - CFG.WIN[1]) * CFG.SCALE + CFG.pad * 2);
function proj(lon, lat) { return [(lon - CFG.WIN[0]) * kx * CFG.SCALE + CFG.pad, (CFG.WIN[3] - lat) * CFG.SCALE + CFG.pad]; }
function unproj(x, y) { return [(x - CFG.pad) / (kx * CFG.SCALE) + CFG.WIN[0], CFG.WIN[3] - (y - CFG.pad) / CFG.SCALE]; }

// RDP 단순화 (SVG 단위 eps)
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let dmax = 0, idx = 0; const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) { const d = perp(pts[i], a, b); if (d > dmax) { dmax = d; idx = i; } }
  if (dmax > eps) return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
  return [a, b];
}
function perp(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1e-9; return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L; }
function simplifyRing(pts, eps) {
  if (pts.length > 1) { const a = pts[0], b = pts[pts.length - 1]; if (a[0] === b[0] && a[1] === b[1]) pts = pts.slice(0, -1); }
  if (pts.length < 4) return pts;
  let far = 1, fd = -1;
  for (let i = 1; i < pts.length; i++) { const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2; if (d > fd) { fd = d; far = i; } }
  return rdp(pts.slice(0, far + 1), eps).slice(0, -1).concat(rdp(pts.slice(far).concat([pts[0]]), eps).slice(0, -1));
}

// 날짜변경선(±180) 걸친 링을 경도 분할 — 러시아 추코트카 등이 지도를 가로지르는 선 방지
function splitAntimeridian(ring) {
  const jumps = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (Math.abs(b[0] - a[0]) > 180) jumps.push(i);
  }
  if (!jumps.length) return [ring];
  // 각 점을 동/서 반구로 나눠 두 링으로 재구성 (경계에 절단점 삽입)
  const east = [], west = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    (a[0] >= 0 ? east : west).push(a);
    if (Math.abs(b[0] - a[0]) > 180) {
      const aE = a[0] >= 0, lonA = aE ? a[0] : a[0] + 360, lonB = aE ? b[0] + 360 : b[0];
      const t = (180 - (aE ? lonA : lonB)) / Math.abs(lonB - lonA) || 0;
      const lat = a[1] + (b[1] - a[1]) * (aE ? t : 1 - t);
      east.push([180, lat]); west.push([-180, lat]);
    }
  }
  return [east, west].filter(r => r.length > 2);
}

function ringBox(ring) { let b = [999, 999, -999, -999]; ring.forEach(([x, y]) => { if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y < b[1]) b[1] = y; if (y > b[3]) b[3] = y; }); return b; }
function ringOutWin(ring, m) { const b = ringBox(ring); return b[2] < CFG.WIN[0] - m || b[0] > CFG.WIN[2] + m || b[3] < CFG.WIN[1] - m || b[1] > CFG.WIN[3] + m; }

// GeoJSON geometry → SVG path d (링 분할·창 밖 제거·단순화·최소면적 필터)
// opts: { eps(SVG단위), minArea(SVG단위² — 투영 후 bbox 면적), prec(좌표 반올림 자릿수: 0=정수, 1=0.1) }
function geom2path(geometry, opts) {
  const eps = opts.eps, minArea = opts.minArea || 0, prec = opts.prec || 0;
  const mul = Math.pow(10, prec), r = n => Math.round(n * mul) / mul;
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : (geometry.type === "MultiPolygon" ? geometry.coordinates : []);
  let d = "";
  polys.forEach(poly => poly.forEach(ring => {
    splitAntimeridian(ring).forEach(part => {
      if (ringOutWin(part, 3)) return;
      let pts = simplifyRing(part.map(([lon, lat]) => proj(lon, lat)), eps);
      if (pts.length < 3) return;
      const b = ringBox(pts);
      if ((b[2] - b[0]) * (b[3] - b[1]) < minArea) return;
      const out = []; let px = null, py = null;
      for (const p of pts) { const x = r(p[0]), y = r(p[1]); if (x !== px || y !== py) { out.push(x + "," + y); px = x; py = y; } }
      if (out.length >= 3) d += "M" + out.join("L") + "Z";
    });
  }));
  return d;
}

module.exports = { CFG, kx, W, H, proj, unproj, geom2path, simplifyRing, ringBox };
