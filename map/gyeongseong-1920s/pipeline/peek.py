# -*- coding: utf-8 -*-
"""받아 온 OSM JSON 을 훑어보는 도구.  python peek.py <파일> [검색어]"""
import json, os, sys, io

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")


def center(e):
    if e["type"] == "node":
        return e.get("lat"), e.get("lon")
    c = e.get("center")
    if c:
        return c.get("lat"), c.get("lon")
    g = e.get("geometry")
    if not g:
        gs = [m["geometry"] for m in e.get("members", []) if m.get("geometry")]
        g = [p for x in gs for p in x] if gs else None
    if not g:
        return None, None
    return (sum(p["lat"] for p in g) / len(g), sum(p["lon"] for p in g) / len(g))


def main():
    name = sys.argv[1]
    needle = sys.argv[2] if len(sys.argv) > 2 else None
    els = json.load(open(os.path.join(DATA, name + ".json"), encoding="utf-8"))["elements"]
    rows = []
    for e in els:
        t = e.get("tags", {})
        n = t.get("name") or ""
        if needle and needle not in n and needle not in json.dumps(t, ensure_ascii=False):
            continue
        la, lo = center(e)
        keys = " ".join("%s=%s" % (k, v) for k, v in t.items()
                        if k in ("historic", "heritage", "tourism", "amenity", "building",
                                 "barrier", "man_made", "natural", "wall", "ruins",
                                 "start_date", "heritage:operator", "ref:nhc"))
        npts = len(e.get("geometry") or []) or sum(len(m.get("geometry") or []) for m in e.get("members", []))
        rows.append((n, e["type"], e["id"], la, lo, npts, keys))
    rows.sort(key=lambda r: (-r[5], r[0]))
    for r in rows[:120]:
        print("%-26s %-9s %-12s %s,%s  pts=%-5d %s"
              % (r[0][:26], r[1], r[2], ("%.5f" % r[3]) if r[3] else "-",
                 ("%.5f" % r[4]) if r[4] else "-", r[5], r[6][:70]))
    print("--- %d / %d ---" % (len(rows), len(els)))


main()
