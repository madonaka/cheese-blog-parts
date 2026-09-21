# -*- coding: utf-8 -*-
"""시설의 **실제 건물 외곽선**을 받아 온다 (평양판 prep.py 의 q_shapes.ql 과 같은 일).

점만 찍으면 지도가 밋밋하다. 평양판이 또렷했던 건 이름 실은 시설을 실제 외곽선으로
칠했기 때문이다(HANDOFF §4-6: 모든 건물을 그리면 범용 지도가 된다. 이름 실은 것만 칠한다).

anchor_cache.json 에 이미 (type, id) 가 들어 있으니 그걸로 질의를 만든다.
  python shapes.py
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from resolve import _post
import gs_data as D

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")

# 지도에 오른 시설이 쓰는 앵커만 모은다 (dong: 은 점이라 외곽선이 없다)
want = {}
for f in D.FEATURES:
    a = f.get("anchor", "")
    if a.startswith("dong:") or f.get("lat") is None:
        continue
    c = D.CACHE.get(a) or []
    if not c:
        continue
    wt = D.OVERRIDE.get(a)
    pick = c[0]
    if wt:
        for r in c:
            if r["tags"].get(wt[0]) == wt[1]:
                pick = r
                break
    if pick["type"] in ("way", "relation"):
        want[(pick["type"], pick["id"])] = a

ways = sorted(i for t, i in want if t == "way")
rels = sorted(i for t, i in want if t == "relation")
print("외곽선을 받을 것: way %d, relation %d (시설 %d)" % (len(ways), len(rels), len(want)))

q = "[out:json][timeout:300];(\n"
if ways:
    q += "  way(id:%s);\n" % ",".join(str(i) for i in ways)
if rels:
    q += "  relation(id:%s);\n" % ",".join(str(i) for i in rels)
q += ");\nout geom;\n"

out = os.path.join(DATA, "shapes.json")
for attempt in range(4):
    try:
        els = _post(q)
        json.dump({"elements": els}, open(out, "w", encoding="utf-8"), ensure_ascii=False)
        print("받음 %d개 → shapes.json (%.0f KB)"
              % (len(els), os.path.getsize(out) / 1024))
        break
    except Exception as e:
        print("실패 %d: %s" % (attempt + 1, str(e)[:140]))
        time.sleep(45)
