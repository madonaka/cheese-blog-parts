// 근현대 세계지도 발행 데이터 생성 — historical-basemaps(GPL-3.0) 국경 → data/world-modern-map.json
// 나라 이름은 learn_characters DB의 faction 표기와 일치시킨다(연표·DB 자동 결합용).
const fs = require("fs");
const { CFG, W, H, geom2path } = require("./world-common.js");
const SRC = process.argv[2]; // world-src 디렉터리
if (!SRC) { console.error("usage: node gen-world-map.js <world-src dir>"); process.exit(1); }

const NAT = [
  { id: "usa", name: "미국", color: "#3f6fb0" },
  { id: "rus-emp", name: "러시아 제국", color: "#9a5f43" },
  { id: "ussr", name: "소련", color: "#c0453f" },
  { id: "russia", name: "러시아", color: "#c0453f" },      // 소련과 같은 붉은 계열(공존 없음)
  { id: "roc", name: "중화민국", color: "#23808d" },
  { id: "prc", name: "중국", color: "#e07b39" },
  { id: "japan", name: "일본", color: "#c06a8a" },
  { id: "uk", name: "영국", color: "#7d5fa8" },
  { id: "france", name: "프랑스", color: "#8f9e4f" },
  { id: "de-emp", name: "독일제국", color: "#6e6e6e" },
  { id: "weimar", name: "바이마르 공화국", color: "#8a8a72" },
  { id: "nazi", name: "나치 독일", color: "#3f3f3f" },
  { id: "de-occ", name: "연합군 점령하 독일", color: "#9a9a9a" },
  { id: "frg", name: "서독", color: "#708238" },
  { id: "gdr", name: "동독", color: "#5f5f8f" },
  { id: "germany", name: "독일", color: "#708238" },        // 서독 색 승계(연속감)
  { id: "korea", name: "한국", color: "#2f8f7f" },
  { id: "nkorea", name: "북한", color: "#8f3f4f" },
  { id: "ukraine", name: "우크라이나", color: "#d4b83f" },
  { id: "cuba", name: "쿠바", color: "#a85555" },
  { id: "italy", name: "이탈리아", color: "#2f6f5f" },
  { id: "a-h", name: "오스트리아-헝가리", color: "#b8863d" },
];

// 연도별 GeoJSON NAME(정확 일치) → nation id. 여러 feature가 같은 id로 합쳐질 수 있음.
const YEAR_MAP = {
  "1914": { "United States": "usa", "Russian Empire": "rus-emp", "Manchu Empire": "roc", "Empire of Japan": "japan", "United Kingdom of Great Britain and Ireland": "uk", "France": "france", "German Empire": "de-emp", "Austro-Hungarian Empire": "a-h" },
  "1920": { "United States": "usa", "USSR": "ussr", "Chinese Warlords": "roc", "Manchuria": "roc", "Empire of Japan": "japan", "United Kingdom of Great Britain and Ireland": "uk", "France": "france", "Germany": "weimar" },
  "1938": { "United States": "usa", "USSR": "ussr", "Chinese warlords": "roc", "Empire of Japan": "japan", "United Kingdom": "uk", "France": "france", "Germany": "nazi", "Italy": "italy" },
  "1945": { "United States": "usa", "USSR": "ussr", "China": "roc", "Taiwan": "roc", "Japan (USA)": "japan", "United Kingdom": "uk", "France": "france", "Germany (Soviet)": "de-occ", "Germany (UK)": "de-occ", "Germany (USA)": "de-occ", "Germany (France)": "de-occ" },
  "1960": { "United States": "usa", "USSR": "ussr", "China": "prc", "Taiwan": "roc", "Japan": "japan", "United Kingdom": "uk", "France": "france", "West Germany": "frg", "East Germany": "gdr", "Korea, Republic of": "korea", "Korea, Democratic People's Republic of": "nkorea", "Cuba": "cuba" },
  "1994": { "United States": "usa", "Russia": "russia", "China": "prc", "Taiwan": "roc", "Japan": "japan", "United Kingdom": "uk", "France": "france", "Germany": "germany", "Korea, Republic of": "korea", "Korea, Democratic People's Republic of": "nkorea", "Ukraine": "ukraine", "Cuba": "cuba" },
  "2010": { "United States": "usa", "Russia": "russia", "China": "prc", "Taiwan": "roc", "Japan": "japan", "United Kingdom": "uk", "France": "france", "Germany": "germany", "Korea, Republic of": "korea", "Korea, Democratic People's Republic of": "nkorea", "Ukraine": "ukraine", "Cuba": "cuba" },
};

const YEARS = [
  { y: "1914", nm: "1차 대전 직전" },
  { y: "1920", nm: "베르사유 체제" },
  { y: "1938", nm: "2차 대전 전야" },
  { y: "1945", nm: "2차 대전 종전" },
  { y: "1960", nm: "냉전" },
  { y: "1994", nm: "탈냉전·소련 해체 이후" },
  { y: "2010", nm: "현대" },
];

const CITIES = [
  { name: "워싱턴", lon: -77.04, lat: 38.90, y: { "1914": ["usa", "cap"], "1920": ["usa", "cap"], "1938": ["usa", "cap"], "1945": ["usa", "cap"], "1960": ["usa", "cap"], "1994": ["usa", "cap"], "2010": ["usa", "cap"] } },
  { name: "런던", lon: -0.13, lat: 51.51, y: { "1914": ["uk", "cap"], "1920": ["uk", "cap"], "1938": ["uk", "cap"], "1945": ["uk", "cap"], "1960": ["uk", "cap"], "1994": ["uk", "cap"], "2010": ["uk", "cap"] } },
  { name: "파리", lon: 2.35, lat: 48.86, y: { "1914": ["france", "cap"], "1920": ["france", "cap"], "1938": ["france", "cap"], "1945": ["france", "cap"], "1960": ["france", "cap"], "1994": ["france", "cap"], "2010": ["france", "cap"] } },
  { name: "베를린", lon: 13.40, lat: 52.52, y: { "1914": ["de-emp", "cap"], "1920": ["weimar", "cap"], "1938": ["nazi", "cap"], "1945": ["de-occ", "cap"], "1960": ["gdr", "cap"], "1994": ["germany", "cap"], "2010": ["germany", "cap"] } },
  { name: "본", lon: 7.10, lat: 50.73, y: { "1960": ["frg", "cap"] } },
  { name: "모스크바", lon: 37.62, lat: 55.76, y: { "1914": ["rus-emp", "city"], "1920": ["ussr", "cap"], "1938": ["ussr", "cap"], "1945": ["ussr", "cap"], "1960": ["ussr", "cap"], "1994": ["russia", "cap"], "2010": ["russia", "cap"] } },
  { name: "상트페테르부르크", lon: 30.32, lat: 59.94, y: { "1914": ["rus-emp", "cap"], "1920": ["ussr", "city", "페트로그라드"], "1938": ["ussr", "city", "레닌그라드"], "1945": ["ussr", "city", "레닌그라드"], "1960": ["ussr", "city", "레닌그라드"], "1994": ["russia", "city"], "2010": ["russia", "city"] } },
  { name: "베이징", lon: 116.40, lat: 39.90, y: { "1914": ["roc", "cap"], "1920": ["roc", "cap"], "1960": ["prc", "cap"], "1994": ["prc", "cap"], "2010": ["prc", "cap"] } },
  { name: "충칭", lon: 106.55, lat: 29.56, y: { "1938": ["roc", "cap"], "1945": ["roc", "cap"] } },
  { name: "타이베이", lon: 121.56, lat: 25.03, y: { "1960": ["roc", "cap"], "1994": ["roc", "cap"], "2010": ["roc", "cap"] } },
  { name: "도쿄", lon: 139.69, lat: 35.68, y: { "1914": ["japan", "cap"], "1920": ["japan", "cap"], "1938": ["japan", "cap"], "1945": ["japan", "cap"], "1960": ["japan", "cap"], "1994": ["japan", "cap"], "2010": ["japan", "cap"] } },
  { name: "서울", lon: 126.98, lat: 37.57, y: { "1960": ["korea", "cap"], "1994": ["korea", "cap"], "2010": ["korea", "cap"] } },
  { name: "평양", lon: 125.75, lat: 39.03, y: { "1960": ["nkorea", "cap"], "1994": ["nkorea", "cap"], "2010": ["nkorea", "cap"] } },
  { name: "키이우", lon: 30.52, lat: 50.45, y: { "1994": ["ukraine", "cap"], "2010": ["ukraine", "cap"] } },
  { name: "아바나", lon: -82.36, lat: 23.13, y: { "1960": ["cuba", "cap"], "1994": ["cuba", "cap"], "2010": ["cuba", "cap"] } },
  { name: "얄타", lon: 34.16, lat: 44.50, y: { "1945": ["ussr", "city"] } },
  { name: "뮌헨", lon: 11.58, lat: 48.14, y: { "1938": ["nazi", "city"] } },
  { name: "사라예보", lon: 18.41, lat: 43.86, y: { "1914": ["a-h", "city"] } },
  { name: "빈", lon: 16.37, lat: 48.21, y: { "1914": ["a-h", "cap"] } },
  { name: "로마", lon: 12.48, lat: 41.90, y: { "1938": ["italy", "cap"] } },
];

const territories = {};
YEARS.forEach(Y => {
  const g = JSON.parse(fs.readFileSync(SRC + "/world_" + Y.y + ".geojson", "utf8"));
  const byId = {};
  const wanted = YEAR_MAP[Y.y];
  const found = new Set();
  g.features.forEach(f => {
    const id = wanted[(f.properties.NAME || "").trim()];
    if (!id) return;
    found.add((f.properties.NAME || "").trim());
    byId[id] = (byId[id] || "") + geom2path(f.geometry, { eps: 1.2, minArea: 4, prec: 1 });
  });
  const missing = Object.keys(wanted).filter(n => !found.has(n));
  if (missing.length) console.warn(Y.y + " 미발견:", missing.join(", "));
  territories[Y.y] = Object.keys(byId).filter(id => byId[id]).map(id => ({ id, d: byId[id] }));
});

// 연표·DB 자동 결합용 메타 — 이 지도가 커버하는 연도 범위·나라명(별칭 포함)
const meta = {
  range: [1914, 2026],
  nations: NAT.map(n => n.name).concat(["러시아제국 (로마노프 왕조)"]), // DB nation 표기 별칭
  source: "historical-basemaps(GPL-3.0) · Natural Earth · AWS Terrain Tiles",
};

const out = {
  viewBox: `0 0 ${W} ${H}`,
  cfg: { WIN: CFG.WIN, SCALE: CFG.SCALE, pad: CFG.pad, ocean: CFG.ocean },
  nations: NAT, years: YEARS, territories, cities: CITIES, regions: [], meta,
};
const P = "C:/Users/ckdwn/OneDrive/바탕 화면/cheese-blog-parts/cheese-blog-parts/map/data/world-modern-map.json";
fs.writeFileSync(P, JSON.stringify(out));
const sz = fs.statSync(P).size;
console.log("data/world-modern-map.json", Math.round(sz / 1024) + "KB", sz > 950000 ? "⚠ Firestore 1MB 임박!" : "OK");
YEARS.forEach(Y => console.log(" ", Y.y, territories[Y.y].map(t => t.id + "(" + Math.round(t.d.length / 1024) + "KB)").join(" ")));
