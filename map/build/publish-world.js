// data/world-modern-map.json → Firestore historyMaps/modern-world 발행 (REST PATCH)
// historyMaps 컬렉션은 룰에서 read/write 허용 상태(편집기 발행과 동일 경로).
const fs = require("fs");
const DATA = "C:/Users/ckdwn/OneDrive/바탕 화면/cheese-blog-parts/cheese-blog-parts/map/data/world-modern-map.json";
const API_KEY = "AIzaSyBgLF7lEKQxdsUked-i_Pf0FJEdP_d1Ab4";
const URL = "https://firestore.googleapis.com/v1/projects/cheese-history-platform/databases/(default)/documents/historyMaps/modern-world?key=" + API_KEY;

// JS 값 → Firestore REST Value 인코딩
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === "object") { const f = {}; for (const k in v) f[k] = enc(v[k]); return { mapValue: { fields: f } }; }
  throw new Error("unsupported: " + typeof v);
}

const published = JSON.parse(fs.readFileSync(DATA, "utf8"));
const body = JSON.stringify({ fields: { published: enc(published), updatedAt: { timestampValue: new Date().toISOString() } } });
console.log("payload:", Math.round(body.length / 1024) + "KB");

fetch(URL, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
  .then(async r => { console.log("HTTP", r.status); if (!r.ok) console.error(await r.text()); else console.log("발행 완료: historyMaps/modern-world"); })
  .catch(e => { console.error("실패:", e.message); process.exit(1); });
