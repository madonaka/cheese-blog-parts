// 세계 육지·호수 변환 — NE 50m land/lakes → assets/land-world.json, rivers-world.json
// 소스: scratchpad/world-src/ne_50m_land.geojson, ne_50m_lakes.geojson (Natural Earth, PD)
const fs = require("fs");
const { geom2path, W, H } = require("./world-common.js");
const SRC = process.argv[2]; // world-src 디렉터리 경로
if (!SRC) { console.error("usage: node convert-land-world.js <world-src dir>"); process.exit(1); }

const land = JSON.parse(fs.readFileSync(SRC + "/ne_50m_land.geojson", "utf8"));
let landD = "";
land.features.forEach(f => { landD += geom2path(f.geometry, { eps: 0.35, minArea: 1.5, prec: 1 }); });

const lakes = JSON.parse(fs.readFileSync(SRC + "/ne_50m_lakes.geojson", "utf8"));
let lakesD = "";
lakes.features.forEach(f => {
  const sr = f.properties.scalerank;
  if (sr !== 0 && sr !== 1) return; // 카스피해·오대호·바이칼 등 대형 호수만
  lakesD += geom2path(f.geometry, { eps: 0.6, minArea: 2, prec: 0 });
});

const out = "C:/Users/ckdwn/OneDrive/바탕 화면/cheese-blog-parts/cheese-blog-parts/map/assets/";
fs.writeFileSync(out + "land-world.json", JSON.stringify({ land: landD }));
fs.writeFileSync(out + "rivers-world.json", JSON.stringify({ lakes: lakesD, classes: [] }));
console.log("viewBox 0 0 " + W + " " + H,
  "| land-world.json", Math.round(landD.length / 1024) + "KB",
  "| rivers-world.json(lakes)", Math.round(lakesD.length / 1024) + "KB");
