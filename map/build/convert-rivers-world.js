// 세계 주요 하천 — NE 50m rivers_lake_centerlines → assets/rivers-world.json (호수 포함)
// 유량 등급(scalerank)별 3단계 굵기. 호수 중심선(featurecla에 Lake 포함)은 제외.
const fs = require("fs");
const { geom2path, lines2path } = require("./world-common.js");
const SRC = process.argv[2];
if (!SRC) { console.error("usage: node convert-rivers-world.js <world-src dir>"); process.exit(1); }

const rivers = JSON.parse(fs.readFileSync(SRC + "/ne_50m_rivers.geojson", "utf8"));
const CLS = [
  { max: 3, w: 1.6, d: "" },   // 아마존·나일·양쯔 급
  { max: 6, w: 1.0, d: "" },
  { max: 99, w: 0.6, d: "" },
];
let skipped = 0;
rivers.features.forEach(f => {
  if (/lake/i.test(f.properties.featurecla || "")) { skipped++; return; }
  const sr = f.properties.scalerank ?? 9;
  const cls = CLS.find(c => sr <= c.max);
  cls.d += lines2path(f.geometry, { eps: 0.5, prec: 1 });
});

const lakes = JSON.parse(fs.readFileSync(SRC + "/ne_50m_lakes.geojson", "utf8"));
let lakesD = "";
lakes.features.forEach(f => {
  const sr = f.properties.scalerank;
  if (sr !== 0 && sr !== 1) return;
  lakesD += geom2path(f.geometry, { eps: 0.6, minArea: 2, prec: 0 });
});

const out = "C:/Users/ckdwn/OneDrive/바탕 화면/cheese-blog-parts/cheese-blog-parts/map/assets/rivers-world.json";
fs.writeFileSync(out, JSON.stringify({ classes: CLS.map(c => ({ w: c.w, d: c.d })), lakes: lakesD }));
console.log("rivers-world.json", Math.round(fs.statSync(out).size / 1024) + "KB",
  "| classes:", CLS.map(c => "w" + c.w + "=" + Math.round(c.d.length / 1024) + "KB").join(" "),
  "| lakes:", Math.round(lakesD.length / 1024) + "KB | 호수중심선 제외:", skipped);
