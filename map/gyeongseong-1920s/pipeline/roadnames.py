# -*- coding: utf-8 -*-
"""현재 도로 이름 목록 — 1920년대 가로망 화이트리스트를 짤 재료.

1920년대 지도에 현재 도로를 통째로 깔면 그건 '현대 지도에 옛 이름만 얹은 것'(A안)이다.
B안은 그 반대다: 1920년대에 있었다고 **문헌으로 확인되는 길만** 골라 그린다.
그러려면 먼저 지금 무엇이 있는지 알아야 한다.
"""
import json, math, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")


def plen(pts):
    s = 0.0
    for a, b in zip(pts, pts[1:]):
        la = math.radians((a[0] + b[0]) / 2)
        s += math.hypot((b[1] - a[1]) * 111320.0 * math.cos(la), (b[0] - a[0]) * 110574.0)
    return s


f = sys.argv[1] if len(sys.argv) > 1 else "roads_core"
minlen = float(sys.argv[2]) if len(sys.argv) > 2 else 200.0

els = json.load(open(os.path.join(DATA, f + ".json"), encoding="utf-8"))["elements"]
agg = defaultdict(lambda: dict(L=0.0, cls=set(), lat=0.0, lon=0.0, n=0))
for e in els:
    t = e.get("tags", {})
    n = t.get("name")
    g = e.get("geometry") or []
    if not n or len(g) < 2:
        continue
    pts = [(p["lat"], p["lon"]) for p in g]
    a = agg[n]
    a["L"] += plen(pts)
    a["cls"].add(t.get("highway"))
    for p in pts:
        a["lat"] += p[0]; a["lon"] += p[1]; a["n"] += 1

rows = [(v["L"], k, v) for k, v in agg.items() if v["L"] >= minlen]
rows.sort(reverse=True)
CLSORD = ["motorway", "trunk", "primary", "secondary", "tertiary",
          "residential", "unclassified", "living_street"]
print("%-22s %8s  %-12s %s" % ("이름", "연장(m)", "등급", "중심"))
for L, k, v in rows:
    cls = sorted(v["cls"], key=lambda c: CLSORD.index(c) if c in CLSORD else 99)
    print("%-22s %8.0f  %-12s %.5f,%.5f"
          % (k[:22], L, cls[0] if cls else "-", v["lat"] / v["n"], v["lon"] / v["n"]))
print("--- %d개 (%.0f m 이상) / 전체 %d개 ---" % (len(rows), minlen, len(agg)))
