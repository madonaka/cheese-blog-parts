// 세계 지형 — terrarium z6 타일 + 벡터 land 알파 마스크 → assets/relief-world.webp
// 해안선 단일화: 바다/육지 판정을 DEM(고도≤0)이 아니라 '벡터 land(NE 50m, convert-land-world와
// 동일 eps)'의 래스터 마스크로 결정 → 지형 래스터·land clipPath·영토 해안이 한 해안선으로 일치.
// usage: node build-relief-world.js <tiles6 dir> <world-src dir>
const fs = require("fs"); const { PNG } = require("pngjs");
const { CFG, kx, W: VW, H: VH, unproj, geom2rings } = require("./world-common.js");
const TDIR = process.argv[2], SRC = process.argv[3];
if (!TDIR || !SRC) { console.error("usage: node build-relief-world.js <tiles6 dir> <world-src dir>"); process.exit(1); }

const Z = 6, N = 1 << Z, WORLD = N * 256;
function latToY(lat) { return (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * N; }
const YT0 = Math.floor(latToY(CFG.WIN[3])), YT1 = Math.floor(latToY(CFG.WIN[1]));

// 타일은 출력 행 진행(위→아래)에 맞춰 필요할 때 디코딩, 지나간 행은 해제(메모리 절약)
const TILES = new Map();
function san(b) { const i = b.indexOf("IEND"); return i < 0 ? b : b.slice(0, i + 8); }
let decoded = 0;
function tileAt(xt, yt) {
  const k = xt + "_" + yt;
  let t = TILES.get(k);
  if (t === undefined) {
    t = null;
    const p = TDIR + "/" + xt + "_" + yt + ".png";
    if (fs.existsSync(p)) {
      try {
        const g = PNG.sync.read(san(fs.readFileSync(p)));
        const e = new Int16Array(65536);
        for (let i = 0; i < 65536; i++) e[i] = Math.max(-32768, Math.min(32767, Math.round(g.data[i * 4] * 256 + g.data[i * 4 + 1] + g.data[i * 4 + 2] / 256 - 32768)));
        t = e; decoded++;
      } catch (err) { t = null; }
    }
    TILES.set(k, t);
    if (TILES.size > 220) { for (const key of TILES.keys()) { if (+key.split("_")[1] < yt - 1) TILES.delete(key); if (TILES.size <= 150) break; } }
  }
  return t;
}
function getE(ix, iy) {
  if (iy < 0 || iy >= WORLD) return 0;
  ix = ((ix % WORLD) + WORLD) % WORLD;
  const t = tileAt(ix >> 8, iy >> 8);
  if (!t) return 0;
  return t[(iy & 255) * 256 + (ix & 255)];
}

const OW = 8192, OH = Math.round(OW * VH / VW);
console.log("output", OW + "x" + OH, "| z6 tile rows", YT0, "-", YT1);

// 표고 그리드 — z6 그리드(출력의 2배 밀도)를 2x2 박스 평균으로 다운샘플
const E = new Float32Array(OW * OH);
for (let oy = 0; oy < OH; oy++) {
  for (let ox = 0; ox < OW; ox++) {
    const ll = unproj((ox + 0.5) / OW * VW, (oy + 0.5) / OH * VH);
    const gx = (ll[0] + 180) / 360 * WORLD, gy = (1 - Math.asinh(Math.tan(ll[1] * Math.PI / 180)) / Math.PI) / 2 * WORLD;
    const x0 = Math.floor(gx - 0.5), y0 = Math.floor(gy - 0.5);
    E[oy * OW + ox] = (getE(x0, y0) + getE(x0 + 1, y0) + getE(x0, y0 + 1) + getE(x0 + 1, y0 + 1)) / 4;
  }
  if (oy % 500 === 0) console.log("elev row", oy, "/", OH, "(decoded tiles:", decoded + ")");
}
TILES.clear();

// ── 벡터 land 마스크(2×2 슈퍼샘플 커버리지 → 알파 5단계) ──
const land = JSON.parse(fs.readFileSync(SRC + "/ne_50m_land.geojson", "utf8"));
let rings = [];
land.features.forEach(f => { rings = rings.concat(geom2rings(f.geometry, { eps: 0.2, minArea: 1.5 })); }); // convert-land-world와 동일 파라미터
console.log("mask rings:", rings.length);
const SS = 2, MH = OH * SS, sx = OW / VW * SS, sy = OH / VH * SS;
const rows = new Array(MH); for (let i = 0; i < MH; i++) rows[i] = null;
rings.forEach(r => {
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const ax = a[0] * sx, ay = a[1] * sy, bx = b[0] * sx, by = b[1] * sy;
    if (ay === by) continue;
    const yA = Math.min(ay, by), yB = Math.max(ay, by);
    let ys = Math.max(0, Math.ceil(yA - 0.5));
    const ye = Math.min(MH - 1, Math.ceil(yB - 0.5) - 1);
    for (; ys <= ye; ys++) {
      const yc = ys + 0.5;
      const x = ax + (bx - ax) * (yc - ay) / (by - ay);
      (rows[ys] || (rows[ys] = [])).push(x);
    }
  }
});
const cov = new Uint8Array(OW * OH);
for (let ys = 0; ys < MH; ys++) {
  const xs = rows[ys]; if (!xs) continue;
  xs.sort((a, b) => a - b);
  const oy = ys >> 1;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    let k = Math.max(0, Math.ceil(xs[i] - 0.5));
    const ke = Math.min(OW * SS - 1, Math.ceil(xs[i + 1] - 0.5) - 1);
    for (; k <= ke; k++) cov[oy * OW + (k >> 1)]++;
  }
}

// ── 채색: hypsometric 램프 + hillshade (build-relief-world v1 램프 유지) ──
const RAMP = [[1, [243, 238, 226]], [150, [233, 223, 196]], [400, [219, 190, 135]], [800, [192, 144, 90]], [1400, [158, 104, 60]], [2200, [122, 76, 46]], [3200, [95, 60, 40]], [4200, [170, 162, 155]], [5000, [252, 252, 252]]];
function ramp(e) {
  if (e <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) { if (e <= RAMP[i][0]) { const a = RAMP[i - 1], b = RAMP[i], t = (e - a[0]) / (b[0] - a[0]); return [a[1][0] + (b[1][0] - a[1][0]) * t, a[1][1] + (b[1][1] - a[1][1]) * t, a[1][2] + (b[1][2] - a[1][2]) * t]; } }
  return RAMP[RAMP.length - 1][1];
}
const cellx = (CFG.WIN[2] - CFG.WIN[0]) * 111320 * kx / OW, celly = (CFG.WIN[3] - CFG.WIN[1]) * 110570 / OH;
const ZF = 6.5, az = 315 * Math.PI / 180, zen = (90 - 45) * Math.PI / 180, cz = Math.cos(zen), sz = Math.sin(zen); // z6 셀(≈4.8km) 기준 재조정
function E_(x, y) { x = x < 0 ? 0 : x >= OW ? OW - 1 : x; y = y < 0 ? 0 : y >= OH ? OH - 1 : y; return E[y * OW + x]; }
const raw = Buffer.alloc(OW * OH * 4);
const A = [0, 64, 128, 191, 255];
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
  const i = y * OW + x, o = i * 4, cv = cov[i] > 4 ? 4 : cov[i];
  if (!cv) { raw[o + 3] = 0; continue; }
  const e = E[i];
  const dzdx = (E_(x + 1, y) - E_(x - 1, y)) / (2 * cellx) * ZF, dzdy = (E_(x, y + 1) - E_(x, y - 1)) / (2 * celly) * ZF;
  const slope = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)), aspect = Math.atan2(dzdy, -dzdx);
  let hs = cz * Math.cos(slope) + sz * Math.sin(slope) * Math.cos(az - aspect); hs = Math.max(0, hs);
  const sh = 0.36 + 0.88 * hs, c = ramp(e > 1 ? e : 1);
  raw[o] = Math.max(0, Math.min(255, c[0] * sh)); raw[o + 1] = Math.max(0, Math.min(255, c[1] * sh)); raw[o + 2] = Math.max(0, Math.min(255, c[2] * sh));
  raw[o + 3] = A[cv];
}

const OUT = "C:/Users/ckdwn/OneDrive/바탕 화면/cheese-blog-parts/cheese-blog-parts/map/assets/relief-world";
let sharp = null; try { sharp = require("sharp"); } catch (e) { }
if (sharp) {
  sharp(raw, { raw: { width: OW, height: OH, channels: 4 } })
    .webp({ quality: 82, alphaQuality: 90, effort: 5 })
    .toFile(OUT + ".webp")
    .then(info => console.log("relief-world.webp", OW + "x" + OH, "|", Math.round(info.size / 1024) + "KB"));
} else {
  const png = new PNG({ width: OW, height: OH });
  raw.copy(png.data);
  const buf = PNG.sync.write(png, { colorType: 6 });
  fs.writeFileSync(OUT + ".png", buf);
  console.log("sharp 없음 → relief-world.png", OW + "x" + OH, "| PNG", Math.round(buf.length / 1024) + "KB");
}
