# -*- coding: utf-8 -*-
"""한양도성 선형이 OSM 에 얼마나 남아 있는지 실측한다.

관계 17548771 의 멤버 way 들을 이어 붙여, 전체 둘레(약 18.6 km)의 몇 %가
좌표로 존재하는지, 어느 구간이 비어 있는지 본다.
1920년대 지도에 성벽선을 그으려면 이 실측 결과가 근거가 된다.
"""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
sys.path.insert(0, HERE)

els = json.load(open(os.path.join(DATA, "walls.json"), encoding="utf-8"))["elements"]

R = 6371000.0


def m(a, b):
    la = math.radians((a[0] + b[0]) / 2)
    return math.hypot((b[1] - a[1]) * 111320.0 * math.cos(la), (b[0] - a[0]) * 110574.0)


def plen(pts):
    return sum(m(a, b) for a, b in zip(pts, pts[1:]))


# --- 성벽으로 인정할 way 만 고른다 ---
WALLKEY = lambda t: (t.get("historic") == "citywalls" or t.get("barrier") == "city_wall")
NOTWALL = ("순성길", "코스", "계단", "탐방로", "안내소")

ways, rejected = [], []
for e in els:
    if e["type"] != "way":
        continue
    t = e.get("tags", {})
    n = t.get("name", "")
    g = e.get("geometry") or []
    if len(g) < 2:
        continue
    pts = [(p["lat"], p["lon"]) for p in g]
    if not WALLKEY(t):
        rejected.append((n, t, plen(pts)))
        continue
    if any(k in n for k in NOTWALL):
        rejected.append((n, t, plen(pts)))
        continue
    ways.append(dict(id=e["id"], name=n, tags=t, pts=pts, L=plen(pts)))

print("성벽 way  %d개  총연장 %.0f m" % (len(ways), sum(w["L"] for w in ways)))
print("제외 %d개 (순성길·계단 등)  총 %.0f m" % (len(rejected), sum(r[2] for r in rejected)))

# 관계 멤버도 확인
for e in els:
    if e["type"] == "relation" and e.get("tags", {}).get("historic") == "citywalls":
        ms = [x for x in e.get("members", []) if x.get("geometry")]
        L = sum(plen([(p["lat"], p["lon"]) for p in x["geometry"]]) for x in ms)
        print("관계 %d '%s'  멤버 %d  연장 %.0f m  tags=%s"
              % (e["id"], e["tags"].get("name", ""), len(ms), L,
                 {k: v for k, v in e["tags"].items() if k in ("start_date", "historic", "barrier")}))

# --- 방위각별 분포로 '어느 구간이 비었나' 본다 ---
CX, CY = 37.5735, 126.9880          # 종로 네거리 부근을 중심으로
buckets = [0.0] * 36
for w in ways:
    for a, b in zip(w["pts"], w["pts"][1:]):
        la = (a[0] + b[0]) / 2
        lo = (a[1] + b[1]) / 2
        ang = math.degrees(math.atan2(la - CY if False else la - CX, lo - CY)) % 360
        buckets[int(ang // 10)] += m(a, b)

print("\n중심에서 본 방위 10도 구간별 성벽 연장 (m)")
NAMES = {0: "동", 9: "북", 18: "서", 27: "남"}
for i, v in enumerate(buckets):
    bar = "#" * int(v / 60)
    print("%3d~%3d도 %6.0f %s %s" % (i * 10, i * 10 + 10, v, NAMES.get(i, "  "), bar))

gaps = [i for i, v in enumerate(buckets) if v < 150]
print("\n비어 있는 방위 구간:", ", ".join("%d~%d도" % (i * 10, i * 10 + 10) for i in gaps))
