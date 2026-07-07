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

// 날짜변경선(±180) 걸친 링을 경도 분할 — 러시아 추코트카 등이 지도를 가로지르는 선 방지.
// 교차 지점마다 세그먼트를 절단하고, 각 세그먼트를 ±180 경계선을 따라 닫는다.
// (반구 부호로 나누면 경도 0°와 180°를 동시에 걸치는 유라시아 대륙 링이 망가진다)
function splitAntimeridian(ring) {
  let crossing = false;
  for (let i = 0; i < ring.length; i++) {
    if (Math.abs(ring[(i + 1) % ring.length][0] - ring[i][0]) > 180) { crossing = true; break; }
  }
  if (!crossing) return [ring];
  const segs = []; let cur = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    cur.push(a);
    if (Math.abs(b[0] - a[0]) > 180) {
      // a쪽 경계는 a와 같은 부호의 180, b쪽은 반대
      const aBound = a[0] >= 0 ? 180 : -180, bBound = -aBound;
      const lonA = a[0], lonB = b[0] + (a[0] >= 0 ? 360 : -360); // b를 a쪽 좌표계로 언랩
      const t = (aBound - lonA) / ((lonB - lonA) || 1e-9);
      const lat = a[1] + (b[1] - a[1]) * t;
      cur.push([aBound, lat]);
      segs.push(cur);
      cur = [[bBound, lat]];
    }
  }
  // 링 순회가 절단점에서 시작하지 않았으므로 마지막 세그먼트는 첫 세그먼트의 앞부분
  if (segs.length) { segs[0] = cur.concat(segs[0]); } else segs.push(cur);
  return segs.filter(r => r.length > 2); // 각 세그먼트는 경계선을 따라 직선으로 닫힘(Z)
}

function ringBox(ring) { let b = [999, 999, -999, -999]; ring.forEach(([x, y]) => { if (x < b[0]) b[0] = x; if (x > b[2]) b[2] = x; if (y < b[1]) b[1] = y; if (y > b[3]) b[3] = y; }); return b; }
function ringOutWin(ring, m) { const b = ringBox(ring); return b[2] < CFG.WIN[0] - m || b[0] > CFG.WIN[2] + m || b[3] < CFG.WIN[1] - m || b[1] > CFG.WIN[3] + m; }

// lon/lat 링 하나 → 투영·단순화된 링 파트들(날짜변경선 분할·창 밖 제거·최소면적 필터)
function ring2parts(ring, opts) {
  const out = [];
  splitAntimeridian(ring).forEach(part => {
    if (ringOutWin(part, 3)) return;
    let pts = simplifyRing(part.map(([lon, lat]) => proj(lon, lat)), opts.eps);
    if (pts.length < 3) return;
    const b = ringBox(pts);
    if ((b[2] - b[0]) * (b[3] - b[1]) < (opts.minArea || 0)) return;
    out.push(pts);
  });
  return out;
}
function geomPolys(geometry) { return geometry ? (geometry.type === "Polygon" ? [geometry.coordinates] : (geometry.type === "MultiPolygon" ? geometry.coordinates : [])) : []; }

// GeoJSON geometry → 투영 링 평면 목록 (evenodd 채움용 — 래스터 마스크·path 직렬화 공용)
function geom2rings(geometry, opts) {
  const rs = [];
  geomPolys(geometry).forEach(poly => poly.forEach(ring => { ring2parts(ring, opts).forEach(r => rs.push(r)); }));
  return rs;
}

// GeoJSON geometry → polygon-clipping용 멀티폴리곤 [[outer,hole...],...]
// 외곽 링이 날짜변경선으로 분할되면 구멍 연결이 불가 → 파트별 개별 폴리곤(구멍 소실, 국가 폴리곤엔 구멍이 사실상 없음)
function geom2polys(geometry, opts) {
  const out = [];
  geomPolys(geometry).forEach(poly => {
    const outer = ring2parts(poly[0], opts);
    if (!outer.length) return;
    const holes = [];
    for (let i = 1; i < poly.length; i++) holes.push(...ring2parts(poly[i], opts));
    if (outer.length === 1) out.push([outer[0]].concat(holes));
    else outer.forEach(o => out.push([o]));
  });
  return out;
}

// GeoJSON geometry → SVG path d (링 분할·창 밖 제거·단순화·최소면적 필터)
// opts: { eps(SVG단위), minArea(SVG단위² — 투영 후 bbox 면적), prec(좌표 반올림 자릿수: 0=정수, 1=0.1) }
function geom2path(geometry, opts) {
  const prec = opts.prec || 0;
  const mul = Math.pow(10, prec), r = n => Math.round(n * mul) / mul;
  let d = "";
  geom2rings(geometry, opts).forEach(pts => {
    const out = []; let px = null, py = null;
    for (const p of pts) { const x = r(p[0]), y = r(p[1]); if (x !== px || y !== py) { out.push(x + "," + y); px = x; py = y; } }
    if (out.length >= 3) d += "M" + out.join("L") + "Z";
  });
  return d;
}

// LineString/MultiLineString → SVG path d (강 등 폴리라인 — 닫지 않음)
function lines2path(geometry, opts) {
  const eps = opts.eps, prec = opts.prec || 0;
  const mul = Math.pow(10, prec), r = n => Math.round(n * mul) / mul;
  const lines = geometry.type === "LineString" ? [geometry.coordinates] : (geometry.type === "MultiLineString" ? geometry.coordinates : []);
  let d = "";
  lines.forEach(line => {
    // 날짜변경선 교차 시 그 지점에서 선을 자른다
    const parts = []; let cur = [];
    for (let i = 0; i < line.length; i++) {
      cur.push(line[i]);
      const b = line[i + 1];
      if (b && Math.abs(b[0] - line[i][0]) > 180) { parts.push(cur); cur = []; }
    }
    if (cur.length) parts.push(cur);
    parts.forEach(part => {
      if (part.length < 2) return;
      let pts = rdp(part.map(([lon, lat]) => proj(lon, lat)), eps);
      if (pts.length < 2) return;
      const out = []; let px = null, py = null;
      for (const p of pts) { const x = r(p[0]), y = r(p[1]); if (x !== px || y !== py) { out.push(x + "," + y); px = x; py = y; } }
      if (out.length >= 2) d += "M" + out.join("L");
    });
  });
  return d;
}

module.exports = { CFG, kx, W, H, proj, unproj, geom2path, geom2rings, geom2polys, lines2path, simplifyRing, ringBox };
