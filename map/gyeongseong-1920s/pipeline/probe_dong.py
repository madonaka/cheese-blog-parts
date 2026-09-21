# -*- coding: utf-8 -*-
"""'종로1가' 같은 법정동 이름이 OSM 어디에 붙어 있는지 찾는다."""
import sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from resolve import _post

BB = "37.520,126.930,37.610,127.030"

TESTS = {
    "admin 8": '[out:json][timeout:200];relation["boundary"="administrative"]["admin_level"="8"](%s);out tags;' % BB,
    "admin 9": '[out:json][timeout:200];relation["boundary"="administrative"]["admin_level"="9"](%s);out tags;' % BB,
    "place quarter/neigh": '[out:json][timeout:200];(nwr["place"~"^(quarter|neighbourhood|suburb)$"](%s););out tags;' % BB,
    "이름으로 직접": '[out:json][timeout:200];(nwr["name"~"^(종로1가|충무로1가|을지로2가|명동1가|소공동)$"](%s););out tags center;' % BB,
}

for k, q in TESTS.items():
    try:
        els = _post(q)
    except Exception as e:
        print("%-22s 실패 %s" % (k, str(e)[:90])); time.sleep(30); continue
    print("\n=== %s : %d ===" % (k, len(els)))
    for e in els[:26]:
        t = e.get("tags", {})
        print("  %-9s %-12s %-14s %s"
              % (e["type"], e["id"],
                 t.get("name", "")[:14],
                 " ".join("%s=%s" % kv for kv in t.items()
                          if kv[0] in ("admin_level", "boundary", "place", "border_type"))[:60]))
    time.sleep(4)
