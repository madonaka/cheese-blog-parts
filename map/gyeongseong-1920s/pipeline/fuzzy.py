# -*- coding: utf-8 -*-
"""이름을 정확히 몰라 못 찾은 것들을 부분일치로 다시 찾는다.

  python fuzzy.py 청량리역 정동제일 배재 원각사지 ...

정확일치(resolve.py)가 우선이다. 부분일치는 엉뚱한 걸 물어 오기 쉬워
반드시 눈으로 확인하고 골라야 한다.
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import resolve
from resolve import _post, _esc, BB, score

# 찾은 것은 **그 실제 OSM 이름으로** 캐시에 넣는다.
# (처음엔 화면에만 뿌리고 캐시에 안 넣어, 부분일치로 찾아낸 돈의문터·소의문터·
#  화폐박물관이 정작 지도에는 좌표 없음으로 빠졌다. audit 가 잡아냈다.)
SAVE = "--nosave" not in sys.argv

for needle in [a for a in sys.argv[1:] if not a.startswith("--")]:
    q = ('[out:json][timeout:180];\n( nwr["name"~"%s"](%s); );\nout center tags;'
         % (_esc(needle), BB))
    try:
        els = _post(q)
    except Exception as e:
        print("%s  질의 실패: %s" % (needle, str(e)[:100]))
        time.sleep(45)
        continue
    rows = []
    for e in els:
        t = e.get("tags", {})
        n = t.get("name")
        if not n:
            continue
        if e["type"] == "node":
            la, lo = e.get("lat"), e.get("lon")
        else:
            c = e.get("center")
            if c:
                la, lo = c.get("lat"), c.get("lon")
            else:
                g = e.get("geometry") or [p for m in e.get("members", [])
                                          for p in (m.get("geometry") or [])]
                if not g:
                    continue
                la = sum(p["lat"] for p in g) / len(g)
                lo = sum(p["lon"] for p in g) / len(g)
        if la is None:
            continue
        r = dict(type=e["type"], id=e["id"], lat=la, lon=lo,
                 tags={k: v for k, v in t.items()
                       if k in ("historic", "heritage", "tourism", "amenity", "building",
                                "railway", "public_transport", "man_made", "natural",
                                "place", "landuse", "leisure", "office", "shop", "start_date")})
        rows.append((score(r), n, r))
    rows.sort(key=lambda x: -x[0])
    print("\n=== %s  (%d) ===" % (needle, len(rows)))
    for s, n, r in rows[:10]:
        tg = " ".join("%s=%s" % kv for kv in r["tags"].items())
        print("  %4d  %-30s %.5f,%.5f  %s/%s  %s"
              % (s, n[:30], r["lat"], r["lon"], r["type"], r["id"], tg[:60]))
    if SAVE:
        by = {}
        for s, n, r in rows:
            r = dict(r); r["rank"] = s
            r["lat"] = round(r["lat"], 6); r["lon"] = round(r["lon"], 6)
            by.setdefault(n, []).append(r)
        added = 0
        for n, v in by.items():
            if n not in resolve.CACHE or not resolve.CACHE[n]:
                resolve.CACHE[n] = sorted(v, key=lambda r: -r["rank"])
                added += 1
        if added:
            json.dump(resolve.CACHE, open(resolve.CACHE_PATH, "w", encoding="utf-8"),
                      ensure_ascii=False, indent=1)
            print("  → 캐시에 %d개 이름 추가" % added)
    time.sleep(4)
