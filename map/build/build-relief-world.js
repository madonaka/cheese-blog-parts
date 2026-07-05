// 세계 지형 PNG — terrarium z5 타일 → assets/relief-world.png (build-relief7.js의 세계 창 변형)
const fs = require("fs"); const { PNG } = require("pngjs");
const { CFG, kx, W: VW, H: VH, unproj } = require("./world-common.js");
const TDIR = process.argv[2]; // tiles5 디렉터리
if (!TDIR) { console.error("usage: node build-relief-world.js <tiles5 dir>"); process.exit(1); }

const Z = 5, N = 1 << Z, WORLD = N * 256, TILES = {};
function san(b) { const i = b.indexOf("IEND"); return i < 0 ? b : b.slice(0, i + 8); }
let bad = 0;
for (let x = 0; x < N; x++) for (let y = 4; y <= 22; y++) {
  const p = TDIR + "/" + x + "_" + y + ".png";
  if (fs.existsSync(p)) { try { const g = PNG.sync.read(san(fs.readFileSync(p))); TILES[x + "_" + y] = { d: g.data, w: g.width }; } catch (e) { bad++; } }
}
console.log("tiles:", Object.keys(TILES).length, "bad:", bad);
function getE(ix, iy) {
  if (iy < 0) return NaN;
  ix = ((ix % WORLD) + WORLD) % WORLD; // 경도 래핑
  const xt = ix >> 8, yt = iy >> 8, t = TILES[xt + "_" + yt]; if (!t) return NaN;
  const px = ix - (xt << 8), py = iy - (yt << 8), i = (py * t.w + px) * 4;
  return (t.d[i] * 256 + t.d[i + 1] + t.d[i + 2] / 256) - 32768;
}
function vv(e) { return isNaN(e) ? 0 : e; }
function elevBil(lon, lat) {
  const gx = (lon + 180) / 360 * WORLD, gy = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * WORLD;
  const x0 = Math.floor(gx - 0.5), y0 = Math.floor(gy - 0.5), fx = gx - 0.5 - x0, fy = gy - 0.5 - y0;
  const a = vv(getE(x0, y0)), b = vv(getE(x0 + 1, y0)), c = vv(getE(x0, y0 + 1)), d = vv(getE(x0 + 1, y0 + 1));
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

const OW = 4096, OH = Math.round(OW * VH / VW);
const E = new Float32Array(OW * OH);
for (let oy = 0; oy < OH; oy++) for (let ox = 0; ox < OW; ox++) {
  const ll = unproj((ox + 0.5) / OW * VW, (oy + 0.5) / OH * VH); E[oy * OW + ox] = elevBil(ll[0], ll[1]);
}

// 세계 표고 램프 — 히말라야·안데스(>4200m 설선)까지 확장
const RAMP = [[1, [249, 248, 243]], [150, [236, 228, 202]], [400, [219, 190, 135]], [800, [192, 144, 90]], [1400, [158, 104, 60]], [2200, [122, 76, 46]], [3200, [95, 60, 40]], [4200, [170, 162, 155]], [5000, [252, 252, 252]]];
function ramp(e) {
  if (e <= RAMP[0][0]) return RAMP[0][1];
  for (let i = 1; i < RAMP.length; i++) { if (e <= RAMP[i][0]) { const a = RAMP[i - 1], b = RAMP[i], t = (e - a[0]) / (b[0] - a[0]); return [a[1][0] + (b[1][0] - a[1][0]) * t, a[1][1] + (b[1][1] - a[1][1]) * t, a[1][2] + (b[1][2] - a[1][2]) * t]; } }
  return RAMP[RAMP.length - 1][1];
}

const cellx = (CFG.WIN[2] - CFG.WIN[0]) * 111320 * kx / OW, celly = (CFG.WIN[3] - CFG.WIN[1]) * 110570 / OH;
const ZF = 9, az = 315 * Math.PI / 180, zen = (90 - 45) * Math.PI / 180, cz = Math.cos(zen), sz = Math.sin(zen); // 셀이 커서(≈9.6km) 음영 과장 상향
function E_(x, y) { x = x < 0 ? 0 : x >= OW ? OW - 1 : x; y = y < 0 ? 0 : y >= OH ? OH - 1 : y; return E[y * OW + x]; }
const png = new PNG({ width: OW, height: OH });
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
  const e = E[y * OW + x], o = (y * OW + x) * 4;
  if (e <= 0.5) { png.data[o + 3] = 0; continue; }
  const dzdx = (E_(x + 1, y) - E_(x - 1, y)) / (2 * cellx) * ZF, dzdy = (E_(x, y + 1) - E_(x, y - 1)) / (2 * celly) * ZF;
  const slope = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)), aspect = Math.atan2(dzdy, -dzdx);
  let hs = cz * Math.cos(slope) + sz * Math.sin(slope) * Math.cos(az - aspect); hs = Math.max(0, hs);
  const sh = 0.36 + 0.88 * hs, c = ramp(e);
  png.data[o] = Math.max(0, Math.min(255, c[0] * sh)); png.data[o + 1] = Math.max(0, Math.min(255, c[1] * sh)); png.data[o + 2] = Math.max(0, Math.min(255, c[2] * sh));
  png.data[o + 3] = 255;
}
const buf = PNG.sync.write(png, { colorType: 6 });
const OUT = "C:/Users/ckdwn/OneDrive/바탕 화면/cheese-blog-parts/cheese-blog-parts/map/assets/relief-world.png";
fs.writeFileSync(OUT, buf);
console.log("relief-world", OW + "x" + OH, "| PNG", Math.round(buf.length / 1024) + "KB");
