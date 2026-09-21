# -*- coding: utf-8 -*-
"""anchor_cache 의 후보를 전부 펼쳐 본다.  python cands.py [이름...]

이름 하나에 후보가 여럿이면 첫 번째가 정답이라는 보장이 없다.
(광화문 → 지하철역 stop_area 가 먼저 나오는 식)
눈으로 골라 PICKED 에 못 박는 것이 이 파이프라인에서 사람이 할 일이다.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = json.load(open(os.path.join(HERE, "..", "data", "anchor_cache.json"), encoding="utf-8"))

names = sys.argv[1:] or [n for n, v in CACHE.items() if len(v) > 1]
for n in names:
    v = CACHE.get(n)
    if v is None:
        print("%s  << 캐시에 없음" % n); continue
    print("\n=== %s  (후보 %d) ===" % (n, len(v)))
    for i, r in enumerate(v):
        tags = " ".join("%s=%s" % kv for kv in r["tags"].items())
        print("  [%d] %.5f,%.5f  %-8s/%-11s %s" % (i, r["lat"], r["lon"], r["type"], r["id"], tags[:88]))
